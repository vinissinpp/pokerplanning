const { v4: uuidv4 } = require('uuid');
const supabase       = require('../config/db');

const LIMITE_VOTOS_DIA = 15;
const ipUsage = {};

function hojeStr() { return new Date().toISOString().slice(0, 10); }
function getIp(socket) {
  return socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
    || socket.handshake.address || 'unknown';
}
function verificarLimite(ip) {
  const hoje = hojeStr();
  if (!ipUsage[ip] || ipUsage[ip].data !== hoje) ipUsage[ip] = { votos: 0, data: hoje };
  return ipUsage[ip].votos < LIMITE_VOTOS_DIA;
}
function incrementar(ip) {
  const hoje = hojeStr();
  if (!ipUsage[ip] || ipUsage[ip].data !== hoje) ipUsage[ip] = { votos: 0, data: hoje };
  ipUsage[ip].votos++;
}
function restantes(ip) {
  const hoje = hojeStr();
  if (!ipUsage[ip] || ipUsage[ip].data !== hoje) return LIMITE_VOTOS_DIA;
  return Math.max(0, LIMITE_VOTOS_DIA - ipUsage[ip].votos);
}

function estadoPublico(sala) {
  return {
    id: sala.id, nome: sala.nome,
    donoSocketId: sala.donoSocketId, // front usa para saber quem é admin
    participantes: Object.values(sala.participantes),
    tarefas:    sala.tarefas,
    tarefaAtiva: sala.tarefaAtiva,
    votos: sala.revelado
      ? sala.votos
      : Object.fromEntries(Object.entries(sala.votos).map(([k, v]) => [k, v !== null ? '?' : null])),
    revelado:  sala.revelado,
    historico: sala.historico,
  };
}

function emit(io, salas, salaId) {
  const sala = salas[salaId];
  if (sala) io.to(salaId).emit('estado', estadoPublico(sala));
}

async function garantirSala(salas, salaId) {
  if (salas[salaId]) return true;

  const { data: sala } = await supabase
    .from('salas').select('id, nome, dono_id').eq('id', salaId).single();

  if (!sala) return false;

  const { data: tarefas }   = await supabase.from('tarefas').select('*').eq('sala_id', salaId).order('ordem');
  const { data: historico } = await supabase.from('historico').select('*').eq('sala_id', salaId).order('votado_em');

  salas[salaId] = {
    id: sala.id, nome: sala.nome,
    donoId: sala.dono_id, donoSocketId: null,
    participantes: {}, tarefas: tarefas || [],
    tarefaAtiva: tarefas?.find(t => t.pontos === null)?.id || null,
    votos: {}, revelado: false,
    historico: (historico || []).map(h => ({
      tarefaId: h.tarefa_id, tarefaNome: h.tarefa_nome,
      responsavel: h.responsavel, pontos: h.pontos,
      media: h.media, votos: h.votos, timestamp: h.votado_em,
    })),
  };
  return true;
}

// Verifica se socket é o admin da sala
function isAdmin(sala, socketId) {
  return sala.donoSocketId === socketId;
}

function registrar(io, salas) {
  io.on('connection', (socket) => {
    const ip = getIp(socket);

    socket.on('entrar', async ({ salaId, nome, usuarioId }) => {
      if (!salaId || !nome) return;

      let existe = await garantirSala(salas, salaId);
      if (!existe) {
        // Cria sala em memória e no banco
        salas[salaId] = {
          id: salaId, nome: `Sala ${salaId}`,
          donoId: usuarioId || null, donoSocketId: null,
          participantes: {}, tarefas: [], tarefaAtiva: null,
          votos: {}, revelado: false, historico: [],
        };
        await supabase.from('salas').insert({ id: salaId, nome: `Sala ${salaId}`, dono_id: usuarioId || null });
      }

      const sala = salas[salaId];
      socket.join(salaId);
      socket.data = { salaId, nome: nome.trim(), ip, usuarioId: usuarioId || null };
      sala.participantes[socket.id] = { id: socket.id, nome: nome.trim() };

      // Se é o dono da sala, registra como admin
      if (usuarioId && sala.donoId && usuarioId === sala.donoId) {
        sala.donoSocketId = socket.id;
      }
      // Se sala não tem dono definido, primeiro a entrar vira admin
      if (!sala.donoSocketId && !sala.donoId) {
        sala.donoSocketId = socket.id;
      }

      if (sala.tarefaAtiva) sala.votos[socket.id] = null;

      socket.emit('limiteIp', { restantes: restantes(ip), limite: LIMITE_VOTOS_DIA });
      emit(io, salas, salaId);
    });

    socket.on('votar', ({ valor }) => {
      const { salaId, ip: sIp } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || sala.revelado || !sala.tarefaAtiva) return;
      if (!verificarLimite(sIp)) {
        socket.emit('erroVoto', { msg: `Limite de ${LIMITE_VOTOS_DIA} votos/dia atingido.` });
        return;
      }
      incrementar(sIp);
      sala.votos[socket.id] = valor;
      socket.emit('limiteIp', { restantes: restantes(sIp), limite: LIMITE_VOTOS_DIA });
      emit(io, salas, salaId);
    });

    // Apenas admin pode revelar
    socket.on('revelar', () => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !isAdmin(sala, socket.id)) return;
      sala.revelado = true;
      const nums  = Object.values(sala.votos).filter(v => typeof v === 'number');
      const media = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
      io.to(socket.data.salaId).emit('revelado', { votos: sala.votos, media });
      emit(io, salas, socket.data.salaId);
    });

    // Apenas admin pode resetar
    socket.on('resetar', () => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !isAdmin(sala, socket.id)) return;
      sala.revelado = false;
      Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      emit(io, salas, socket.data.salaId);
    });

    // Apenas admin pode selecionar tarefa
    socket.on('selecionarTarefa', ({ tarefaId }) => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !isAdmin(sala, socket.id)) return;
      sala.tarefaAtiva = tarefaId;
      sala.revelado    = false;
      Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      emit(io, salas, socket.data.salaId);
    });

    // Apenas admin pode adicionar tarefa
    socket.on('adicionarTarefa', async ({ nome, descricao, responsavel }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !isAdmin(sala, socket.id) || !nome?.trim()) return;

      const tarefa = {
        id: uuidv4().slice(0, 8), nome: nome.trim(),
        descricao: descricao?.trim() || '', responsavel: responsavel?.trim() || '',
        pontos: null, criada_em: new Date().toISOString(), ordem: sala.tarefas.length,
      };
      sala.tarefas.push(tarefa);
      if (sala.tarefas.length === 1) {
        sala.tarefaAtiva = tarefa.id;
        Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      }

      await supabase.from('tarefas').insert({
        id: tarefa.id, sala_id: salaId, nome: tarefa.nome,
        descricao: tarefa.descricao, responsavel: tarefa.responsavel, ordem: tarefa.ordem,
      });

      emit(io, salas, salaId);
    });

    // Apenas admin pode editar tarefa
    socket.on('editarTarefa', async ({ tarefaId, nome, descricao, responsavel }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !isAdmin(sala, socket.id) || !nome?.trim()) return;

      const tarefa = sala.tarefas.find(t => t.id === tarefaId);
      if (tarefa) {
        tarefa.nome = nome.trim();
        tarefa.descricao   = descricao?.trim() || '';
        tarefa.responsavel = responsavel?.trim() || '';
        await supabase.from('tarefas')
          .update({ nome: tarefa.nome, descricao: tarefa.descricao, responsavel: tarefa.responsavel })
          .eq('id', tarefaId);
      }
      emit(io, salas, salaId);
    });

    // Apenas admin pode salvar resultado
    socket.on('salvarResultado', async ({ tarefaId, pontos }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !isAdmin(sala, socket.id) || !Number.isInteger(pontos)) return;

      const tarefa = sala.tarefas.find(t => t.id === tarefaId);
      if (tarefa) {
        tarefa.pontos = pontos;
        await supabase.from('tarefas').update({ pontos }).eq('id', tarefaId);

        const votosNominais = {};
        Object.entries(sala.votos).forEach(([sid, val]) => {
          const p = sala.participantes[sid];
          if (p && val !== null) votosNominais[p.nome] = val;
        });
        const nums  = Object.values(sala.votos).filter(v => typeof v === 'number');
        const media = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;

        const entrada = {
          tarefaId, tarefaNome: tarefa.nome, responsavel: tarefa.responsavel,
          pontos, votos: votosNominais, media, timestamp: new Date().toISOString(),
        };
        sala.historico.push(entrada);

        await supabase.from('historico').insert({
          sala_id: salaId, tarefa_id: tarefaId, tarefa_nome: tarefa.nome,
          responsavel: tarefa.responsavel, pontos, media, votos: votosNominais,
        });
      }

      const proxima = sala.tarefas.find(t => t.pontos === null && t.id !== tarefaId);
      if (proxima) {
        sala.tarefaAtiva = proxima.id;
        sala.revelado    = false;
        Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      }
      emit(io, salas, salaId);
    });

    socket.on('disconnect', () => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (sala) {
        delete sala.participantes[socket.id];
        delete sala.votos[socket.id];
        // Se o admin saiu, promove próximo participante
        if (sala.donoSocketId === socket.id) {
          const proximo = Object.keys(sala.participantes)[0];
          sala.donoSocketId = proximo || null;
        }
        emit(io, salas, salaId);
      }
    });
  });
}

module.exports = { registrar };
