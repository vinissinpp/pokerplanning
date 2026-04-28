const { v4: uuidv4 } = require('uuid');
const supabase       = require('../config/db');

// Referência ao estado em memória (ainda usado para WebSocket em tempo real)
let _salas = null;
function init(salasRef) { _salas = salasRef; }

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
    const { nome }  = req.body;
    const donoId    = req.usuario?.id || null;
    const id        = uuidv4().slice(0, 11);
    const nomeSala  = nome?.trim() || `Sala ${id}`;

    // Salva no Supabase
    const { error } = await supabase
      .from('salas')
      .insert({ id, nome: nomeSala, dono_id: donoId });

    if (error) throw error;

    // Cria também em memória para o WebSocket funcionar
    _salas[id] = {
      id, nome: nomeSala, dono_id: donoId,
      participantes: {}, tarefas: [], tarefaAtiva: null,
      votos: {}, revelado: false, historico: [],
    };

    return res.status(201).json({ id, nome: nomeSala });
  } catch (err) {
    console.error('[sala:criar]', err);
    return res.status(500).json({ erro: 'Erro ao criar sala.' });
  }
}

async function buscar(req, res) {
  try {
    const { data: sala } = await supabase
      .from('salas')
      .select('id, nome')
      .eq('id', req.params.id)
      .single();

    if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });

    return res.json({
      id: sala.id,
      nome: sala.nome,
      participantes: Object.values(_salas[sala.id]?.participantes || {}).length,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao buscar sala.' });
  }
}

async function metricas(req, res) {
  try {
    const salaId = req.params.salaId;

    // Busca sala
    const { data: sala } = await supabase
      .from('salas')
      .select('id, nome')
      .eq('id', salaId)
      .single();

    if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });

    // Busca tarefas
    const { data: tarefas } = await supabase
      .from('tarefas')
      .select('*')
      .eq('sala_id', salaId)
      .order('ordem', { ascending: true });

    // Busca histórico
    const { data: historico } = await supabase
      .from('historico')
      .select('*')
      .eq('sala_id', salaId)
      .order('votado_em', { ascending: true });

    const salaObj = { ...sala, tarefas: tarefas || [], historico: historico || [] };

    return res.json({
      sala:      { id: sala.id, nome: sala.nome },
      metricas:  calcularMetricas(salaObj),
      historico: historico || [],
      tarefas:   tarefas   || [],
    });
  } catch (err) {
    console.error('[sala:metricas]', err);
    return res.status(500).json({ erro: 'Erro ao carregar métricas.' });
  }
}

module.exports = { init, criar, buscar, metricas, calcularMetricas };
