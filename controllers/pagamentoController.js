/**
 * controllers/pagamentoController.js
 * Integração com Stripe — Checkout + Subscriptions
 */

const Stripe  = require('stripe');
const supabase = require('../config/db');
const PLANOS   = require('../config/planos');

const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY);
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const PRICE_IDS = {
  BRL: process.env.STRIPE_PRICE_BRL,
  USD: process.env.STRIPE_PRICE_USD,
};

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
      precoUSD:  PLANOS.pro.precoUSD,
      descricao: PLANOS.pro.descricao,
      limites:   PLANOS.pro.limites,
    },
  });
}

async function assinar(req, res) {
  try {
    const usuario = req.usuario;
    const moeda   = req.body.moeda === 'USD' ? 'USD' : 'BRL';
    const priceId = PRICE_IDS[moeda];

    if (!priceId) {
      return res.status(500).json({ erro: 'Plano não configurado para esta moeda.' });
    }

    const { data: existente } = await supabase
      .from('assinaturas')
      .select('id')
      .eq('usuario_id', usuario.id)
      .eq('status', 'approved')
      .single();

    if (existente) {
      return res.status(409).json({ erro: 'Você já tem uma assinatura Pro ativa.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode:           'subscription',
      line_items:     [{ price: priceId, quantity: 1 }],
      customer_email: usuario.email,
      metadata:       { usuario_id: usuario.id, moeda },
      subscription_data: { metadata: { usuario_id: usuario.id } },
      success_url: `${APP_URL}/planos?status=sucesso`,
      cancel_url:  `${APP_URL}/planos`,
      locale:      moeda === 'USD' ? 'en' : 'pt-BR',
    });

    await supabase.from('assinaturas').insert({
      usuario_id:              usuario.id,
      stripe_subscription_id:  session.id, // atualizado para o subscription ID real no webhook
      plano:                   'pro',
      status:                  'pending',
      moeda,
      valor_mensal: moeda === 'BRL' ? PLANOS.pro.precoExibicao : PLANOS.pro.precoUSD,
    });

    return res.json({ url_pagamento: session.url });
  } catch (err) {
    console.error('[pagamento:assinar]', err);
    return res.status(500).json({ erro: 'Erro ao criar checkout. Tente novamente.' });
  }
}

async function webhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('[webhook] Assinatura inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  res.sendStatus(200);

  try {
    const obj = event.data.object;

    switch (event.type) {

      case 'checkout.session.completed': {
        const usuarioId      = obj.metadata?.usuario_id;
        const subscriptionId = obj.subscription;
        const customerId     = obj.customer;
        if (!usuarioId || !subscriptionId) break;

        await supabase.from('assinaturas')
          .update({
            stripe_subscription_id: subscriptionId,
            stripe_customer_id:     customerId,
            status:                 'approved',
            atualizada_em:          new Date().toISOString(),
          })
          .eq('usuario_id', usuarioId)
          .eq('status', 'pending');

        await supabase.from('usuarios')
          .update({ plano: 'pro' })
          .eq('id', usuarioId);

        console.log(`[webhook] checkout.session.completed → usuário ${usuarioId} → Pro`);
        break;
      }

      case 'invoice.payment_succeeded': {
        console.log(`[webhook] Renovação paga → subscription ${obj.subscription}`);
        break;
      }

      case 'invoice.payment_failed': {
        const { data: ass } = await supabase
          .from('assinaturas')
          .select('usuario_id')
          .eq('stripe_subscription_id', obj.subscription)
          .single();

        if (ass?.usuario_id) {
          await supabase.from('usuarios')
            .update({ plano: 'free' })
            .eq('id', ass.usuario_id);
          console.log(`[webhook] Pagamento falhou → usuário ${ass.usuario_id} → Free`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const { data: ass } = await supabase
          .from('assinaturas')
          .select('usuario_id')
          .eq('stripe_subscription_id', obj.id)
          .single();

        if (ass?.usuario_id) {
          await supabase.from('assinaturas')
            .update({ status: 'cancelled', cancelada_em: new Date().toISOString(), atualizada_em: new Date().toISOString() })
            .eq('stripe_subscription_id', obj.id);

          await supabase.from('usuarios')
            .update({ plano: 'free' })
            .eq('id', ass.usuario_id);

          console.log(`[webhook] Assinatura encerrada → usuário ${ass.usuario_id} → Free`);
        }
        break;
      }
    }
  } catch (err) {
    console.error('[webhook]', err);
  }
}

async function cancelar(req, res) {
  try {
    const usuario = req.usuario;

    const { data: ass } = await supabase
      .from('assinaturas')
      .select('stripe_subscription_id')
      .eq('usuario_id', usuario.id)
      .eq('status', 'approved')
      .single();

    if (!ass?.stripe_subscription_id) {
      return res.status(404).json({ erro: 'Nenhuma assinatura ativa encontrada.' });
    }

    await stripe.subscriptions.cancel(ass.stripe_subscription_id);

    await supabase.from('assinaturas')
      .update({ status: 'cancelled', cancelada_em: new Date().toISOString(), atualizada_em: new Date().toISOString() })
      .eq('stripe_subscription_id', ass.stripe_subscription_id);

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
    const { data: ass } = await supabase
      .from('assinaturas')
      .select('status, valor_mensal, criada_em, moeda')
      .eq('usuario_id', req.usuario.id)
      .order('criada_em', { ascending: false })
      .limit(1)
      .single();

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('plano')
      .eq('id', req.usuario.id)
      .single();

    return res.json({ plano: usuario?.plano || 'free', assinatura: ass || null });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listarPlanos, assinar, cancelar, status, webhook };
