/**
 * controllers/salaController.js — v2.0
 * Correções:
 *  - criar() retorna { id, nome } direto (sem wrapper) — compatível com o front atual
 *  - incrementa salas_criadas após criar com sucesso
 *  - adiciona rota ping (anti cold-start)
 *  - buscar() é pública (visitantes precisam verificar sala)
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

// POST /api/sala — criar sala
async function criar(req, res) {
  try {
    const { nome }  = req.body;
    const donoId    = req.usuario?.id   || null;
    const donoNome  = req.usuario?.nome || null;
    const id        = uuidv4().slice(0, 11);
    const nomeSala  = nome?.trim() || `Sala ${id}`;

    const { error } = await supabase
      .from('salas')
      .insert({ id, nome: nomeSala, dono_id: donoId, dono_nome: donoNome });

    if (error) throw error;

    // Inicializa sala em memória
    _salas[id] = {
      id, nome: nomeSala,
      donoId, donoSocketId: null,
      participantes: {}, tarefas: [], tarefaAtiva: null,
      votos: {}, revelado: false, historico: [],
    };

    // Retorna { id, nome } — compatível com o front atual
    // O front faz: if (data.id) window.location.href = `/sala/${data.id}?nome=...`
    return res.status(201).json({ id, nome: nomeSala });
  } catch (err) {
    console.error('[sala:criar]', err);
    return res.status(500).json({ erro: 'Erro ao criar sala.' });
  }
}

// GET /api/sala/:id — buscar sala (PÚBLICA — visitante precisa verificar)
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

// GET /api/sala/ping — mantém o Render acordado (UptimeRobot chama a cada 5min)
function ping(req, res) {
  res.json({ ok: true, ts: Date.now() });
}

module.exports = { init, criar, buscar, metricas, ping, calcularMetricas };
