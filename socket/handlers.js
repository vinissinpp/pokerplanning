/**
 * socket/handlers.js — v2.0
 * Mudanças:
 *  - Remove limite de votos por IP (15/dia) — prejudicava times corporativos
 *  - Admin continua por donoSocketId (compatível com front atual)
 *    mas agora reconecta corretamente via usuarioId quando logado
 *  - Adiciona evento 'mudarSequencia' para trocar as cartas em tempo real
 *  - SEQUENCIAS importadas do middleware/plano.js
 */

const { v4: uuidv4 }        = require('uuid');
const supabase               = require('../config/db');
const { SEQUENCIAS, LIMITES } = require('../middleware/plano');

function estadoPublico(sala) {
  return {
    id:           sala.id,
    nome:         sala.nome,
    donoSocketId: sala.donoSocketId,
    sequencia:    sala.sequencia || 'fibonacci',
    cartas:       SEQUENCIAS[sala.sequencia || 'fibonacci']?.valores || SEQUENCIAS.fibonacci.valores,
    participantes: Object.values(sala.participantes),
    tarefas:      sala.tarefas,
    tarefaAtiva:  sala.tarefaAtiva,
    votos: sala.revelado
      ? sala.votos
      : Object.fromEntries(
          Object.entries(sala.votos).map(([k, v]) => [k, v !== null ? '?' : null])
        ),
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
    .from('salas').select('id, nome, dono_id, sequencia').eq('id', salaId).single();

  if (!sala) return false;

  // Cache do plano do dono para verificar limites durante a sessão
  let planoOwner = 'free';
  if (sala.dono_id) {
    const { data: dono } = await supabase
      .from('usuarios').select('plano').eq('id', sala.dono_id).single();
    planoOwner = dono?.plano || 'free';
  }

  const { data: tarefas }   = await supabase.from('tarefas').select('*').eq('sala_id', salaId).order('ordem');
  const { data: historico } = await supabase.from('historico').select('*').eq('sala_id', salaId).order('votado_em');

  salas[salaId] = {
    id:           sala.id,
    nome:         sala.nome,
    donoId:       sala.dono_id,
    donoSocketId: null,
    sequencia:    sala.sequencia || 'fibonacci',
    planoOwner,
    participantes: {},
    tarefas:      tarefas || [],
    tarefaAtiva:  tarefas?.find(t => t.pontos === null)?.id || null,
    votos:        {},
    revelado:     false,
    historico:    (historico || []).map(h => ({
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

function isAdmin(sala, socketId) {
  return sala.donoSocketId === socketId;
}

function registrar(io, salas) {
  io.on('connection', (socket) => {

    socket.on('entrar', async ({ salaId, nome, usuarioId }) => {
      if (!salaId || !nome) return;

      let existe = await garantirSala(salas, salaId);
      if (!existe) {
        salas[salaId] = {
          id: salaId, nome: `Sala ${salaId}`,
          donoId: usuarioId || null, donoSocketId: null,
          sequencia: 'fibonacci', planoOwner: 'free',
          participantes: {}, tarefas: [], tarefaAtiva: null,
          votos: {}, revelado: false, historico: [],
        };
        await supabase.from('salas').insert({
          id: salaId, nome: `Sala ${salaId}`, dono_id: usuarioId || null,
        });
      }

      const sala = salas[salaId];

      // Verifica limite de participantes do plano do dono
      const limites = LIMITES[sala.planoOwner || 'free'];
      if (Object.keys(sala.participantes).length >= limites.participantes) {
        socket.emit('erro', { msg: `Sala cheia. Limite de ${limites.participantes} participantes (plano ${sala.planoOwner || 'free'}).` });
        return;
      }

      socket.join(salaId);
      socket.data = { salaId, nome: nome.trim(), usuarioId: usuarioId || null };
      sala.participantes[socket.id] = { id: socket.id, nome: nome.trim() };

      // Reconecta admin: dono logado reconecta pelo usuarioId
      if (usuarioId && sala.donoId && String(usuarioId) === String(sala.donoId)) {
        sala.donoSocketId = socket.id;
      }
      // Sala sem dono: primeiro a entrar vira admin
      if (!sala.donoSocketId && !sala.donoId) {
        sala.donoSocketId = socket.id;
      }

      if (sala.tarefaAtiva) sala.votos[socket.id] = null;

      emit(io, salas, salaId);
    });

    socket.on('votar', ({ valor }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || sala.revelado || !sala.tarefaAtiva) return;
      // Valida que o valor é uma carta válida da sequência atual
      const cartasValidas = SEQUENCIAS[sala.sequencia || 'fibonacci']?.valores || SEQUENCIAS.fibonacci.valores;
      if (!cartasValidas.includes(valor) && valor !== '?') return;
      sala.votos[socket.id] = valor;
      emit(io, salas, salaId);
    });

    socket.on('revelar', () => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !isAdmin(sala, socket.id)) return;
      sala.revelado = true;
      const nums  = Object.values(sala.votos).filter(v => typeof v === 'number');
      const media = nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
        : null;
      io.to(socket.data.salaId).emit('revelado', { votos: sala.votos, media });
      emit(io, salas, socket.data.salaId);
    });

    socket.on('resetar', () => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !isAdmin(sala, socket.id)) return;
      sala.revelado = false;
      Object.keys(sala.participantes).forEach(id => { sala.votos[id] = null; });
      emit(io, salas, socket.data.salaId);
    });

    socket.on('selecionarTarefa', ({ tarefaId }) => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !isAdmin(sala, socket.id)) return;
      sala.tarefaAtiva = tarefaId;
      sala.revelado    = false;
      Object.keys(sala.participantes).forEach(id => { sala.votos[id] = null; });
      emit(io, salas, socket.data.salaId);
    });

    // NOVO: troca de sequência em tempo real (só admin)
    socket.on('mudarSequencia', async ({ sequencia }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !isAdmin(sala, socket.id)) return;
      if (!SEQUENCIAS[sequencia]) return; // sequência inválida

      sala.sequencia = sequencia;
      sala.revelado  = false;
      Object.keys(sala.participantes).forEach(id => { sala.votos[id] = null; });

      // Persiste no banco
      await supabase.from('salas').update({ sequencia }).eq('id', salaId);

      emit(io, salas, salaId);
    });

    socket.on('adicionarTarefa', async ({ nome, descricao, responsavel }) => {
      const { salaId } = socket.data || {};
      const sala = salas[salaId];
      if (!sala || !isAdmin(sala, socket.id) || !nome?.trim()) return;

      // Verifica limite de tarefas do plano do dono
      const limites = LIMITES[sala.planoOwner || 'free'];
      if (sala.tarefas.length >= limites.tarefas) {
        socket.emit('erroTarefa', { msg: `Limite de ${limites.tarefas} tarefas atingido. Faça upgrade para o plano Pro.` });
        return;
      }

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
        Object.keys(sala.participantes).forEach(id => { sala.votos[id] = null; });
      }

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
      if (!sala || !isAdmin(sala, socket.id) || !nome?.trim()) return;

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
        const media = nums.length
          ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
          : null;

        const entrada = {
          tarefaId, tarefaNome: tarefa.nome, responsavel: tarefa.responsavel,
          pontos, votos: votosNominais, media, timestamp: new Date().toISOString(),
        };
        sala.historico.push(entrada);

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
        Object.keys(sala.participantes).forEach(id => { sala.votos[id] = null; });
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
