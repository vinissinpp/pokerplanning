const express      = require('express');
const router       = express.Router();
const { criaSala } = require('../middleware/rateLimit');
const { optionalAuth }      = require('../middleware/auth');
const { criar, buscar }     = require('../controllers/salaController');

router.post('/',    optionalAuth, criaSala, criar);
router.get('/:id',  buscar);

module.exports = router;
