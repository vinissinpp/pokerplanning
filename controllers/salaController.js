const { v4: uuidv4 } = require('uuid');

let _salas = null;
function init(salasRef) { _salas = salasRef; }

function criarSalaObj(id, nome, donoId = null) {
  return {
    id, nome: nome || `Sala ${id}`, dono_id: donoId,
    criada_em: new Date().toISOString(),
    participantes: {}, tarefas: [], tarefaAtiva: null,
    votos: {}, revelado: false, historico: [],
  };
}

function calcularMetricas(sala) {
  const porColaborador = {};
  let totalSprint = 0, totalTarefas = 0;
  sala.tarefas.forEach(t => {
    if (t.pontos !== null) {
      totalSprint += t.pontos; totalTarefas++;
      const resp = t.responsavel || 'Sem responsável';
      if (!porColaborador[resp]) porColaborador[resp] = { nome: resp, pontos: 0, tarefas: 0 };
      porColaborador[resp].pontos  += t.pontos;
      porColaborador[resp].tarefas += 1;
    }
  });
  return {
    colaboradores: Object.values(porColaborador).sort((a, b) => b.pontos - a.pontos),
    totalSprint, totalTarefas,
    media: totalTarefas > 0 ? Math.round((totalSprint / totalTarefas) * 10) / 10 : 0,
  };
}

async function criar(req, res) {
  try {
    const { nome } = req.body;
    const donoId   = req.usuario?.id || null;
    const id       = uuidv4().slice(0, 11);
    _salas[id]     = criarSalaObj(id, nome?.trim(), donoId);
    return res.status(201).json({ id, nome: _salas[id].nome });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao criar sala.' });
  }
}

async function buscar(req, res) {
  const sala = _salas[req.params.id];
  if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });
  return res.json({
    id: sala.id, nome: sala.nome,
    participantes: Object.values(sala.participantes).length,
  });
}

async function metricas(req, res) {
  const sala = _salas[req.params.salaId];
  if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });
  return res.json({
    sala:      { id: sala.id, nome: sala.nome },
    metricas:  calcularMetricas(sala),
    historico: sala.historico,
    tarefas:   sala.tarefas,
  });
}

module.exports = { init, criar, buscar, metricas, calcularMetricas };
