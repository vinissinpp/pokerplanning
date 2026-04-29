/**
 * routes/sala.js
 */

const express  = require('express');
const router   = express.Router();
const { criaSala }         = require('../middleware/rateLimit');
const { optionalAuth }     = require('../middleware/auth');
const { validarCriarSala, checarValidacao } = require('../middleware/seguranca');
const { criar, buscar }    = require('../controllers/salaController');

router.post('/',   optionalAuth, criaSala, validarCriarSala, checarValidacao, criar);
router.get('/:id', buscar);

module.exports = router;
