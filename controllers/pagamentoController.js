/**
 * controllers/pagamentoController.js
 * Integração com Mercado Pago — Assinaturas recorrentes
 * Dados mínimos: só o necessário para processar e confirmar pagamento
 */

const supabase = require('../config/db');
const PLANOS   = require('../config/planos');

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_BASE_URL     = 'https://api.mercadopago.com';
const APP_URL         = process.env.APP_URL || 'http://localhost:3000';

// ─────────────────────────────────────────────
// HELPER — chama a API do Mercado Pago
// ─────────────────────────────────────────────
async function mpFetch(endpoint, method = 'GET', body = null) {
  const res = await fetch(`${MP_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type':  'application/json',
      'X-Idempotency-Key': `pontua-${Date.now()}-${Math.random()}`,
    },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

// ─────────────────────────────────────────────
// GET /api/pagamento/planos — retorna os planos
// ─────────────────────────────────────────────
function listarPlanos(req, res) {
  res.json({
    free: {
      nome:        PLANOS.free.nome,
      preco:       PLANOS.free.preco,
      descricao:   PLANOS.free.descricao,
      limites:     PLANOS.free.limites,
    },
    pro: {
      nome:        PLANOS.pro.nome,
      preco:       PLANOS.pro.precoExibicao,
      descricao:   PLANOS.pro.descricao,
      limites:     PLANOS.pro.limites,
    },
  });
}

// ─────────────────────────────────────────────
// POST /api/pagamento/assinar — cria assinatura
// ─────────────────────────────────────────────
async function assinar(req, res) {
  try {
    const usuario = req.usuario; // vem do middleware requireAuth

    // Verifica se já tem assinatura ativa
    const { data: assinaturaExistente } = await supabase
      .from('assinaturas')
      .select('id, status')
      .eq('usuario_id', usuario.id)
      .eq('status', 'authorized')
      .single();

    if (assinaturaExistente) {
      return res.status(409).json({ erro: 'Você já tem uma assinatura Pro ativa.' });
    }

    // Cria plano de assinatura no Mercado Pago (se não existir)
    const planoMP = await mpFetch('/preapproval_plan', 'POST', {
      reason:           'Pontua Planning Pro — Mensal',
      auto_recurring: {
        frequency:      1,
        frequency_type: 'months',
        transaction_amount: PLANOS.pro.precoExibicao,
        currency_id:    'BRL',
      },
      back_url: `${APP_URL}/planos?status=sucesso`,
    });

    if (!planoMP.id) {
      console.error('[pagamento:assinar] Erro MP:', planoMP);
      return res.status(500).json({ erro: 'Erro ao criar plano. Tente novamente.' });
    }

    // Cria assinatura para o usuário
    const assinaturaMP = await mpFetch('/preapproval', 'POST', {
      preapproval_plan_id: planoMP.id,
      reason:              'Pontua Planning Pro — Mensal',
      payer_email:         usuario.email,
      auto_recurring: {
        frequency:      1,
        frequency_type: 'months',
        transaction_amount: PLANOS.pro.precoExibicao,
        currency_id:    'BRL',
      },
      back_url:       `${APP_URL}/planos?status=sucesso`,
      notification_url: `${APP_URL}/api/pagamento/webhook`,
    });

    if (!assinaturaMP.id || !assinaturaMP.init_point) {
      console.error('[pagamento:assinar] Erro MP:', assinaturaMP);
      return res.status(500).json({ erro: 'Erro ao criar assinatura. Tente novamente.' });
    }

    // Salva assinatura pendente no banco (mínimo de dados)
    await supabase.from('assinaturas').insert({
      usuario_id:         usuario.id,
      mp_subscription_id: assinaturaMP.id,
      plano:              'pro',
      status:             'pending',
      valor_mensal:       PLANOS.pro.precoExibicao,
    });

    // Retorna link de pagamento — usuário é redirecionado para o MP
    return res.json({
      url_pagamento: assinaturaMP.init_point, // link do Mercado Pago
      assinatura_id: assinaturaMP.id,
    });
  } catch (err) {
    console.error('[pagamento:assinar]', err);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }
}

// ─────────────────────────────────────────────
// POST /api/pagamento/webhook — recebe notificações do MP
// ─────────────────────────────────────────────
async function webhook(req, res) {
  try {
    const { type, data } = req.body;

    // Responde 200 imediatamente para o MP não retentar
    res.sendStatus(200);

    // Só processa eventos de assinatura
    if (type !== 'subscription_preapproval') return;

    const mpId = data?.id;
    if (!mpId) return;

    // Busca detalhes da assinatura no MP
    const assinaturaMP = await mpFetch(`/preapproval/${mpId}`);
    if (!assinaturaMP?.id) return;

    const statusMP = assinaturaMP.status; // authorized | paused | cancelled

    // Busca assinatura no banco
    const { data: assinatura } = await supabase
      .from('assinaturas')
      .select('id, usuario_id, status')
      .eq('mp_subscription_id', mpId)
      .single();

    if (!assinatura) return;

    // Atualiza status da assinatura
    await supabase.from('assinaturas').update({
      status:           statusMP,
      mp_payer_id:      assinaturaMP.payer_id?.toString() || null,
      proxima_cobranca: assinaturaMP.next_payment_date || null,
      atualizada_em:    new Date().toISOString(),
      cancelada_em:     statusMP === 'cancelled' ? new Date().toISOString() : null,
    }).eq('id', assinatura.id);

    // Atualiza plano do usuário
    const novoPlano = statusMP === 'authorized' ? 'pro' : 'free';
    await supabase.from('usuarios')
      .update({ plano: novoPlano })
      .eq('id', assinatura.usuario_id);

    console.log(`[webhook] Assinatura ${mpId} → ${statusMP} → usuário ${assinatura.usuario_id} → plano ${novoPlano}`);
  } catch (err) {
    console.error('[pagamento:webhook]', err);
  }
}

// ─────────────────────────────────────────────
// POST /api/pagamento/cancelar — cancela assinatura
// ─────────────────────────────────────────────
async function cancelar(req, res) {
  try {
    const usuario = req.usuario;

    const { data: assinatura } = await supabase
      .from('assinaturas')
      .select('id, mp_subscription_id, status')
      .eq('usuario_id', usuario.id)
      .eq('status', 'authorized')
      .single();

    if (!assinatura) {
      return res.status(404).json({ erro: 'Nenhuma assinatura ativa encontrada.' });
    }

    // Cancela no Mercado Pago
    await mpFetch(`/preapproval/${assinatura.mp_subscription_id}`, 'PUT', {
      status: 'cancelled',
    });

    // Atualiza no banco
    await supabase.from('assinaturas').update({
      status:        'cancelled',
      cancelada_em:  new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
    }).eq('id', assinatura.id);

    // Volta para free
    await supabase.from('usuarios')
      .update({ plano: 'free' })
      .eq('id', usuario.id);

    return res.json({ mensagem: 'Assinatura cancelada. Seu plano voltou para Free.' });
  } catch (err) {
    console.error('[pagamento:cancelar]', err);
    return res.status(500).json({ erro: 'Erro ao cancelar. Tente novamente.' });
  }
}

// ─────────────────────────────────────────────
// GET /api/pagamento/status — status da assinatura
// ─────────────────────────────────────────────
async function status(req, res) {
  try {
    const { data: assinatura } = await supabase
      .from('assinaturas')
      .select('status, valor_mensal, proxima_cobranca, criada_em')
      .eq('usuario_id', req.usuario.id)
      .order('criada_em', { ascending: false })
      .limit(1)
      .single();

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('plano')
      .eq('id', req.usuario.id)
      .single();

    return res.json({
      plano:      usuario?.plano || 'free',
      assinatura: assinatura || null,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listarPlanos, assinar, cancelar, status, webhook };
