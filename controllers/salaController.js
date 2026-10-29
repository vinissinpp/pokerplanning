/**
 * controllers/salaController.js — v2.1
 * Fix: busca planoOwner do banco ao criar sala em memória
 */

const { v4: uuidv4 } = require('uuid');
const supabase       = require('../config/db');

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

// Teto de salas em memória — protege o servidor mesmo se o rate limit for burlado
const MAX_SALAS = parseInt(process.env.MAX_SALAS || '500');

// POST /api/sala — criar sala
async function criar(req, res) {
  try {
    if (Object.keys(_salas).length >= MAX_SALAS) {
      return res.status(503).json({ erro: 'Muitas salas abertas no momento. Tente novamente em alguns minutos.' });
    }

    const { nome }  = req.body;
    const donoId    = req.usuario?.id   || null;
    const donoNome  = req.usuario?.nome || null;
    const id        = uuidv4().slice(0, 11);
    const nomeSala  = nome?.trim() || `Sala ${id}`;

    const { error } = await supabase
      .from('salas')
      .insert({ id, nome: nomeSala, dono_id: donoId, dono_nome: donoNome });

    if (error) throw error;

    // Busca plano do dono para aplicar limites corretos desde o início
    let planoOwner = 'free';
    if (donoId) {
      const { data: dono } = await supabase
        .from('usuarios').select('plano').eq('id', donoId).single();
      planoOwner = dono?.plano || 'free';
    }

    // Inicializa sala em memória com planoOwner correto
    _salas[id] = {
      id, nome: nomeSala,
      donoId, donoSocketId: null,
      planoOwner,
      participantes: {}, tarefas: [], tarefaAtiva: null,
      votos: {}, revelado: false, historico: [],
    };

    return res.status(201).json({ id, nome: nomeSala });
  } catch (err) {
    console.error('[sala:criar]', err);
    return res.status(500).json({ erro: 'Erro ao criar sala.' });
  }
}

// GET /api/sala/:id — buscar sala (PÚBLICA)
async function buscar(req, res) {
  try {
    const { data: sala } = await supabase
      .from('salas').select('id, nome').eq('id', req.params.id).single();

    if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });

    return res.json({
      id:           sala.id,
      nome:         sala.nome,
      participantes: Object.values(_salas[sala.id]?.participantes || {}).length,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao buscar sala.' });
  }
}

// GET /api/metricas/:salaId
async function metricas(req, res) {
  try {
    const salaId = req.params.salaId;

    const { data: sala } = await supabase
      .from('salas').select('id, nome').eq('id', salaId).single();
    if (!sala) return res.status(404).json({ erro: 'Sala não encontrada.' });

    const { data: tarefas }   = await supabase.from('tarefas').select('*').eq('sala_id', salaId).order('ordem');
    const { data: historico } = await supabase.from('historico').select('*').eq('sala_id', salaId).order('votado_em');

    const salaObj = { ...sala, tarefas: tarefas || [], historico: historico || [] };

    return res.json({
      sala:     { id: sala.id, nome: sala.nome },
      metricas: calcularMetricas(salaObj),
      historico: historico || [],
      tarefas:   tarefas   || [],
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro ao carregar métricas.' });
  }
}

// GET /api/sala/ping — mantém o Render acordado
function ping(req, res) {
  res.json({ ok: true, ts: Date.now() });
}

module.exports = { init, criar, buscar, metricas, ping, calcularMetricas };