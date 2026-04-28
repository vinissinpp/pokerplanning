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

// Carrega sala do Supabase para memória se ainda não estiver
async function garantirSala(salas, salaId) {
  if (salas[salaId]) return true;

  const { data: sala } = await supabase
    .from('salas')
    .select('id, nome')
    .eq('id', salaId)
    .single();

  if (!sala) return false;

  const { data: tarefas }  = await supabase.from('tarefas').select('*').eq('sala_id', salaId).order('ordem');
  const { data: historico } = await supabase.from('historico').select('*').eq('sala_id', salaId).order('votado_em');

  salas[salaId] = {
    id: sala.id, nome: sala.nome,
    participantes: {}, tarefas: tarefas || [],
    tarefaAtiva: tarefas?.find(t => t.pontos === null)?.id || null,
    votos: {}, revelado: false,
    historico: (historico || []).map(h => ({
      tarefaId:   h.tarefa_id,
      tarefaNome: h.tarefa_nome,
      responsavel: h.responsavel,
      pontos:     h.pontos,
      media:      h.media,
      votos:      h.votos,
      timestamp:  h.votado_em,
    })),
  };

  return true;
}

function registrar(io, salas) {
  io.on('connection', (socket) => {
    const ip = getIp(socket);

    socket.on('entrar', async ({ salaId, nome }) => {
      if (!salaId || !nome) return;

      const existe = await garantirSala(salas, salaId);
      if (!existe) {
        // Sala não existe no banco, cria em memória (acesso direto por link)
        salas[salaId] = {
          id: salaId, nome: `Sala ${salaId}`,
          participantes: {}, tarefas: [], tarefaAtiva: null,
          votos: {}, revelado: false, historico: [],
        };
        // Salva no banco
        await supabase.from('salas').insert({ id: salaId, nome: `Sala ${salaId}` }).single();
      }

      socket.join(salaId);
      socket.data = { salaId, nome: nome.trim(), ip };
      salas[salaId].participantes[socket.id] = { id: socket.id, nome: nome.trim() };
      if (salas[salaId].tarefaAtiva) salas[salaId].votos[socket.id] = null;

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

    socket.on('revelar', () => {
      const sala = salas[socket.data?.salaId];
      if (!sala) return;
      sala.revelado = true;
      const nums  = Object.values(sala.votos).filter(v => typeof v === 'number');
      const media = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
      io.to(socket.data.salaId).emit('revelado', { votos: sala.votos, media });
      emit(io, salas, socket.data.salaId);
    });

    socket.on('resetar', () => {
      const sala = salas[socket.data?.salaId];
      if (!sala) return;
      sala.revelado = false;
      Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      emit(io, salas, socket.data.salaId);
    });

    socket.on('selecionarTarefa', ({ tarefaId }) => {
      const sala = salas[socket.data?.salaId];
      if (!sala) return;
      sala.tarefaAtiva = tarefaId;
      sala.revelado    = false;
      Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      emit(io, salas, socket.data.salaId);
    });

    socket.on('adicionarTarefa', async ({ nome, descricao, responsavel }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !nome?.trim()) return;

      const tarefa = {
        id:          uuidv4().slice(0, 8),
        nome:        nome.trim(),
        descricao:   descricao?.trim() || '',
        responsavel: responsavel?.trim() || '',
        pontos:      null,
        criada_em:   new Date().toISOString(),
        ordem:       sala.tarefas.length,
      };

      sala.tarefas.push(tarefa);
      if (sala.tarefas.length === 1) {
        sala.tarefaAtiva = tarefa.id;
        Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      }

      // Persiste no banco
      await supabase.from('tarefas').insert({
        id:          tarefa.id,
        sala_id:     salaId,
        nome:        tarefa.nome,
        descricao:   tarefa.descricao,
        responsavel: tarefa.responsavel,
        ordem:       tarefa.ordem,
      });

      emit(io, salas, salaId);
    });

    socket.on('editarTarefa', async ({ tarefaId, nome, descricao, responsavel }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !nome?.trim()) return;

      const tarefa = sala.tarefas.find(t => t.id === tarefaId);
      if (tarefa) {
        tarefa.nome        = nome.trim();
        tarefa.descricao   = descricao?.trim() || '';
        tarefa.responsavel = responsavel?.trim() || '';

        await supabase.from('tarefas')
          .update({ nome: tarefa.nome, descricao: tarefa.descricao, responsavel: tarefa.responsavel })
          .eq('id', tarefaId);
      }

      emit(io, salas, salaId);
    });

    socket.on('salvarResultado', async ({ tarefaId, pontos }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !Number.isInteger(pontos)) return;

      const tarefa = sala.tarefas.find(t => t.id === tarefaId);
      if (tarefa) {
        tarefa.pontos = pontos;

        // Atualiza pontos no banco
        await supabase.from('tarefas').update({ pontos }).eq('id', tarefaId);

        // Monta histórico
        const votosNominais = {};
        Object.entries(sala.votos).forEach(([sid, val]) => {
          const p = sala.participantes[sid];
          if (p && val !== null) votosNominais[p.nome] = val;
        });
        const nums = Object.values(sala.votos).filter(v => typeof v === 'number');
        const media = nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;

        const entrada = {
          tarefaId,
          tarefaNome:  tarefa.nome,
          responsavel: tarefa.responsavel,
          pontos, votos: votosNominais, media,
          timestamp: new Date().toISOString(),
        };
        sala.historico.push(entrada);

        // Persiste histórico no banco
        await supabase.from('historico').insert({
          sala_id:     salaId,
          tarefa_id:   tarefaId,
          tarefa_nome: tarefa.nome,
          responsavel: tarefa.responsavel,
          pontos, media, votos: votosNominais,
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
        emit(io, salas, salaId);
      }
    });
  });
}

module.exports = { registrar };
