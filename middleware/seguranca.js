/**
 * middleware/seguranca.js
 * Headers de segurança, CORS e sanitização de inputs
 */

const helmet = require('helmet');
const cors   = require('cors');
const { body, param, validationResult } = require('express-validator');

// ─────────────────────────────────────────────
// CORS — apenas origens autorizadas
// ─────────────────────────────────────────────
const origensPermitidas = [
  process.env.APP_URL,
  process.env.CORS_ORIGIN,
  'https://www.pontuaplanning.com',
  'https://pontuaplanning.com',
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

const corsConfig = cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (origensPermitidas.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origem não autorizada — ${origin}`));
  },
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge:      86400, // cache do preflight por 24h
});

// ─────────────────────────────────────────────
// HELMET — headers de segurança HTTP
// ─────────────────────────────────────────────
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'cdnjs.cloudflare.com',
        'fonts.googleapis.com',
        'pagead2.googlesyndication.com',
        'googleads.g.doubleclick.net',
        'https://*.googlesyndication.com',
        'https://*.doubleclick.net',
        'https://*.google.com',
        'https://*.adtrafficquality.google',
        'https://adservice.google.com',
      ],
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      fontSrc:     ["'self'", 'fonts.gstatic.com'],
      connectSrc:  [
        "'self'",
        'wss:',
        'ws:',
        process.env.SUPABASE_URL,
        'https://ipinfo.io',
        'https://*.googlesyndication.com',
        'https://*.doubleclick.net',
        'https://*.google.com',
        'https://*.adtrafficquality.google',
        'https://adservice.google.com',
      ].filter(Boolean),
      imgSrc:      [
        "'self'",
        'data:',
        'https://*.googlesyndication.com',
        'https://*.doubleclick.net',
        'https://*.google.com',
        'https://*.adtrafficquality.google',
        'https://adservice.google.com',
        'https://googleads.g.doubleclick.net',
        'https://pagead2.googlesyndication.com',
      ],
      frameSrc:    [
        "'self'",
        'https://*.googlesyndication.com',
        'https://*.doubleclick.net',
        'https://*.google.com',
        'https://*.adtrafficquality.google',
        'googleads.g.doubleclick.net',
        'tpc.googlesyndication.com',
      ],
      objectSrc:   ["'none'"],
    },
  },
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true,
  },
  referrerPolicy:          { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
});

// ─────────────────────────────────────────────
// SANITIZAÇÃO — limpa inputs antes de processar
// ─────────────────────────────────────────────
function sanitizar(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, maxLen)
    .replace(/[<>]/g, '') // remove < > para evitar XSS básico
    .replace(/[\x00-\x1F\x7F]/g, ''); // remove caracteres de controle
}

// Middleware que sanitiza body automaticamente
function sanitizarBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizar(req.body[key]);
      }
    }
  }
  next();
}

// ─────────────────────────────────────────────
// VALIDADORES — express-validator por rota
// ─────────────────────────────────────────────
const validarCadastro = [
  body('nome')
    .trim().notEmpty().withMessage('Nome é obrigatório.')
    .isLength({ min: 2, max: 60 }).withMessage('Nome deve ter entre 2 e 60 caracteres.')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/).withMessage('Nome contém caracteres inválidos.'),
  body('email')
    .trim().notEmpty().withMessage('E-mail é obrigatório.')
    .isEmail().withMessage('E-mail inválido.')
    .isLength({ max: 150 }).withMessage('E-mail muito longo.')
    .normalizeEmail(),
  body('senha')
    .notEmpty().withMessage('Senha é obrigatória.')
    .isLength({ min: 8, max: 100 }).withMessage('Senha deve ter entre 8 e 100 caracteres.'),
];

const validarLogin = [
  body('email').trim().notEmpty().isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('senha').notEmpty().withMessage('Senha é obrigatória.').isLength({ max: 100 }),
];

const validarCodigo = [
  body('email').trim().isEmail().normalizeEmail(),
  body('codigo').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Código inválido.'),
];

const validarRedefinirSenha = [
  body('email').trim().isEmail().normalizeEmail(),
  body('codigo').trim().isLength({ min: 6, max: 6 }).isNumeric(),
  body('novaSenha').isLength({ min: 8, max: 100 }).withMessage('Senha deve ter entre 8 e 100 caracteres.'),
];

const validarCriarSala = [
  body('nome').optional().trim().isLength({ max: 80 }).withMessage('Nome da sala muito longo.'),
];

// Middleware que verifica resultado da validação
function checarValidacao(req, res, next) {
  const erros = validationResult(req);
  if (!erros.isEmpty()) {
    const primeiro = erros.array()[0];
    return res.status(400).json({ erro: primeiro.msg });
  }
  next();
}

// ─────────────────────────────────────────────
// PROTEÇÃO EXTRA — bloqueia payloads grandes
// ─────────────────────────────────────────────
function bloquearPayloadGrande(req, res, next) {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 50 * 1024) { // 50KB max
    return res.status(413).json({ erro: 'Payload muito grande.' });
  }
  next();
}

module.exports = {
  corsConfig,
  helmetConfig,
  sanitizarBody,
  bloquearPayloadGrande,
  validarCadastro,
  validarLogin,
  validarCodigo,
  validarRedefinirSenha,
  validarCriarSala,
  checarValidacao,
};
