/**
 * controllers/pagamentoController.js
 * Integração com Mercado Pago — Checkout Pro
 */

const supabase = require('../config/db');
const PLANOS   = require('../config/planos');

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const APP_URL         = process.env.APP_URL || 'http://localhost:3000';

async function mpFetch(endpoint, method = 'GET', body = null) {
  const res = await fetch(`https://api.mercadopago.com${endpoint}`, {
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

function listarPlanos(req, res) {
  res.json({
    free: {
      nome:      PLANOS.free.nome,
      preco:     PLANOS.free.preco,
      descricao: PLANOS.free.descricao,
      limites:   PLANOS.free.limites,
    },
    pro: {
      nome:      PLANOS.pro.nome,
      preco:     PLANOS.pro.precoExibicao,
      descricao: PLANOS.pro.descricao,
      limites:   PLANOS.pro.limites,
    },
  });
}

async function assinar(req, res) {
  try {
    const usuario = req.usuario;

    // Verifica se já tem assinatura ativa
    const { data: assinaturaExistente } = await supabase
      .from('assinaturas')
      .select('id, status')
      .eq('usuario_id', usuario.id)
      .eq('status', 'approved')
      .single();

    if (assinaturaExistente) {
      return res.status(409).json({ erro: 'Você já tem uma assinatura Pro ativa.' });
    }

    // Cria preferência no Mercado Pago (Checkout Pro)
    const preferencia = await mpFetch('/checkout/preferences', 'POST', {
      items: [{
        title:      'Pontua Planning Pro — Mensal',
        quantity:   1,
        currency_id: 'BRL',
        unit_price: PLANOS.pro.precoExibicao,
      }],
      payer: {
        email: usuario.email,
      },
      back_urls: {
        success: `${APP_URL}/planos?status=sucesso`,
        failure: `${APP_URL}/planos?status=erro`,
        pending: `${APP_URL}/planos?status=pendente`,
      },
      auto_return:      'approved',
      notification_url: `${APP_URL}/api/pagamento/webhook`,
      metadata: {
        usuario_id: usuario.id,
        plano:      'pro',
      },
    });

    if (!preferencia.id || !preferencia.init_point) {
      console.error('[pagamento:assinar] Erro MP:', preferencia);
      return res.status(500).json({ erro: 'Erro ao criar preferência. Tente novamente.' });
    }

    // Salva preferência pendente no banco
    await supabase.from('assinaturas').insert({
      usuario_id:         usuario.id,
      mp_subscription_id: preferencia.id,
      plano:              'pro',
      status:             'pending',
      valor_mensal:       PLANOS.pro.precoExibicao,
    });

    return res.json({
      url_pagamento: preferencia.init_point,
      preferencia_id: preferencia.id,
    });
  } catch (err) {
    console.error('[pagamento:assinar]', err);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }
}

async function webhook(req, res) {
  try {
    const { type, data } = req.body;
    res.sendStatus(200);

    if (type !== 'payment') return;

    const paymentId = data?.id;
    if (!paymentId) return;

    // Busca detalhes do pagamento no MP
    const pagamento = await mpFetch(`/v1/payments/${paymentId}`);
    if (!pagamento?.id) return;

    const status      = pagamento.status;
    const usuarioId   = pagamento.metadata?.usuario_id;
    const preferenceId = pagamento.preference_id;

    if (!usuarioId) return;

    if (status === 'approved') {
      // Atualiza assinatura no banco
      await supabase.from('assinaturas')
        .update({
          status:        'approved',
          atualizada_em: new Date().toISOString(),
        })
        .eq('mp_subscription_id', preferenceId);

      // Atualiza plano do usuário
      await supabase.from('usuarios')
        .update({ plano: 'pro' })
        .eq('id', usuarioId);

      console.log(`[webhook] Pagamento ${paymentId} aprovado → usuário ${usuarioId} → Pro`);
    }
  } catch (err) {
    console.error('[pagamento:webhook]', err);
  }
}

async function cancelar(req, res) {
  try {
    const usuario = req.usuario;

    await supabase.from('assinaturas')
      .update({
        status:        'cancelled',
        cancelada_em:  new Date().toISOString(),
        atualizada_em: new Date().toISOString(),
      })
      .eq('usuario_id', usuario.id)
      .eq('status', 'approved');

    await supabase.from('usuarios')
      .update({ plano: 'free' })
      .eq('id', usuario.id);

    return res.json({ mensagem: 'Assinatura cancelada. Seu plano voltou para Free.' });
  } catch (err) {
    console.error('[pagamento:cancelar]', err);
    return res.status(500).json({ erro: 'Erro ao cancelar. Tente novamente.' });
  }
}

async function status(req, res) {
  try {
    const { data: assinatura } = await supabase
      .from('assinaturas')
      .select('status, valor_mensal, criada_em')
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
