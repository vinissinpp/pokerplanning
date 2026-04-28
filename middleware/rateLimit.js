const rateLimit = require('express-rate-limit');

const geral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { erro: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

const auth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { erro: 'Muitas tentativas. Aguarde 15 minutos.' },
  skipSuccessfulRequests: true,
});

const criaSala = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { erro: 'Limite de criação de salas atingido.' },
});

module.exports = { geral, auth, criaSala };
