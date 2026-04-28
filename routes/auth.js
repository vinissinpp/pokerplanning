const express    = require('express');
const router     = express.Router();
const { auth }   = require('../middleware/rateLimit');
const { requireAuth }             = require('../middleware/auth');
const { cadastro, login, perfil } = require('../controllers/authController');

router.post('/cadastro', auth, cadastro);
router.post('/login',    auth, login);
router.get('/perfil',    requireAuth, perfil);
router.post('/logout',   (req, res) => res.json({ mensagem: 'Logout realizado.' }));

module.exports = router;
