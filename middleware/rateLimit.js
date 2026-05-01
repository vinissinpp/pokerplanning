/**
 * middleware/rateLimit.js — v2.0
 * Rate limit APENAS em rotas de auth (anti brute-force)
 * Rotas de sala NÃO têm rate limit por IP (times corporativos saem pelo mesmo IP)
 */

const rateLimit = require('express-rate-limit');

const msg = (texto) => ({ erro: texto });

// Geral — proteção básica da API (bem permissivo)
const geral = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  standardHeaders: true, legacyHeaders: false,
  validate: { trustProxy: false },
  message: msg('Muitas requisições. Tente novamente em alguns minutos.'),
  skip: (req) => req.path === '/health',
});

// Auth — 10 tentativas/15min (não conta requests bem-sucedidos)
const auth = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  validate: { trustProxy: false },
  message: msg('Muitas tentativas. Aguarde 15 minutos e tente novamente.'),
  skipSuccessfulRequests: true,
});

// Reenvio de código — 3/hora (evita spam de email)
const reenvio = rateLimit({
  windowMs: 60 * 60 * 1000, max: 3,
  standardHeaders: true, legacyHeaders: false,
  validate: { trustProxy: false },
  message: msg('Limite de reenvio atingido. Tente em 1 hora.'),
});

// Pagamento — 10/hora
const pagamento = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  validate: { trustProxy: false },
  message: msg('Muitas tentativas de pagamento. Aguarde 1 hora.'),
});

// REMOVIDO: criaSala — não faz sentido limitar por IP em rotas de sala

module.exports = { geral, auth, reenvio, pagamento };
