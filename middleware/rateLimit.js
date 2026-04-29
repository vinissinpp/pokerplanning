/**
 * middleware/rateLimit.js
 * Rate limiting granular por tipo de rota
 */

const rateLimit = require('express-rate-limit');

const msg = (texto) => ({ erro: texto });

// Geral — 300 req/15min por IP
const geral = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Muitas requisições. Tente novamente em alguns minutos.'),
  skip: (req) => req.path === '/health', // health check não conta
});

// Auth — 10 tentativas/15min (não conta requests bem-sucedidos)
const auth = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Muitas tentativas. Aguarde 15 minutos e tente novamente.'),
  skipSuccessfulRequests: true,
});

// Criação de sala — 20/hora
const criaSala = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Limite de criação de salas atingido. Tente em 1 hora.'),
});

// Reenvio de código — 3/hora (evita spam de email)
const reenvio = rateLimit({
  windowMs: 60 * 60 * 1000, max: 3,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Limite de reenvio de código atingido. Tente em 1 hora.'),
});

// Pagamento — 10/hora
const pagamento = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Muitas tentativas de pagamento. Aguarde 1 hora.'),
});

module.exports = { geral, auth, criaSala, reenvio, pagamento };
