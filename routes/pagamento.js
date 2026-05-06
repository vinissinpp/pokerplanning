/**
 * routes/pagamento.js
 */

const express  = require('express');
const router   = express.Router();
const { requireAuth }  = require('../middleware/auth');
const { pagamento }    = require('../middleware/rateLimit');
const {
  listarPlanos, assinar, cancelar, status, webhook,
} = require('../controllers/pagamentoController');

// Webhook — sem auth (chamado pelo Stripe)
router.post('/webhook', webhook);

// Planos públicos
router.get('/planos', listarPlanos);

// Rotas protegidas
router.post('/assinar',  requireAuth, pagamento, assinar);
router.post('/cancelar', requireAuth, cancelar);
router.get('/status',    requireAuth, status);

module.exports = router;
