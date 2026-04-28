const { v4: uuidv4 } = require('uuid');

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
    tarefas: sala.tarefas,
    tarefaAtiva: sala.tarefaAtiva,
    votos: sala.revelado
      ? sala.votos
      : Object.fromEntries(Object.entries(sala.votos).map(([k, v]) => [k, v !== null ? '?' : null])),
    revelado: sala.revelado,
    historico: sala.historico,
  };
}

function emit(io, salas, salaId) {
  const sala = salas[salaId];
  if (sala) io.to(salaId).emit('estado', estadoPublico(sala));
}

function novaSala(id, nome) {
  return { id, nome: nome || `Sala ${id}`, participantes: {}, tarefas: [], tarefaAtiva: null, votos: {}, revelado: false, historico: [] };
}

function registrar(io, salas) {
  io.on('connection', (socket) => {
    const ip = getIp(socket);

    socket.on('entrar', ({ salaId, nome }) => {
      if (!salaId || !nome) return;
      if (!salas[salaId]) salas[salaId] = novaSala(salaId);
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

    socket.on('adicionarTarefa', ({ nome, descricao, responsavel }) => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !nome?.trim()) return;
      const tarefa = {
        id: uuidv4().slice(0, 8), nome: nome.trim(),
        descricao: descricao?.trim() || '', responsavel: responsavel?.trim() || '',
        pontos: null, criada_em: new Date().toISOString(),
      };
      sala.tarefas.push(tarefa);
      if (sala.tarefas.length === 1) {
        sala.tarefaAtiva = tarefa.id;
        Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      }
      emit(io, salas, socket.data.salaId);
    });

    socket.on('editarTarefa', ({ tarefaId, nome, descricao, responsavel }) => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !nome?.trim()) return;
      const tarefa = sala.tarefas.find(t => t.id === tarefaId);
      if (tarefa) {
        tarefa.nome = nome.trim();
        tarefa.descricao   = descricao?.trim() || '';
        tarefa.responsavel = responsavel?.trim() || '';
      }
      emit(io, salas, socket.data.salaId);
    });

    socket.on('salvarResultado', ({ tarefaId, pontos }) => {
      const sala = salas[socket.data?.salaId];
      if (!sala || !Number.isInteger(pontos)) return;
      const tarefa = sala.tarefas.find(t => t.id === tarefaId);
      if (tarefa) {
        tarefa.pontos = pontos;
        const votosNominais = {};
        Object.entries(sala.votos).forEach(([sid, val]) => {
          const p = sala.participantes[sid];
          if (p && val !== null) votosNominais[p.nome] = val;
        });
        const nums = Object.values(sala.votos).filter(v => typeof v === 'number');
        sala.historico.push({
          tarefaId, tarefaNome: tarefa.nome, responsavel: tarefa.responsavel,
          pontos, votos: votosNominais,
          media: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null,
          timestamp: new Date().toISOString(),
        });
      }
      const proxima = sala.tarefas.find(t => t.pontos === null && t.id !== tarefaId);
      if (proxima) {
        sala.tarefaAtiva = proxima.id;
        sala.revelado    = false;
        Object.keys(sala.participantes).forEach(id => sala.votos[id] = null);
      }
      emit(io, salas, socket.data.salaId);
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
