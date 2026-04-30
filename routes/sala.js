/**
 * routes/sala.js — v2.0
 * buscar() e ping() são públicas — visitante sem conta precisa acessar
 * criar() exige auth + verificação de limite de plano
 */

const express  = require('express');
const router   = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { verificarLimiteSalas }      = require('../middleware/plano');
const { validarCriarSala, checarValidacao } = require('../middleware/seguranca');
const { criar, buscar, metricas, ping }     = require('../controllers/salaController');

// Pública — visitante sem conta precisa verificar se a sala existe
router.get('/ping', ping);
router.get('/:id',  buscar);

// Protegida — exige login + verifica limite de plano
router.post('/', requireAuth, verificarLimiteSalas, validarCriarSala, checarValidacao, criar);

module.exports = router;
