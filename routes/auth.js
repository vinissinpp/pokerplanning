const express      = require('express');
const router       = express.Router();
const { auth }     = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const {
  cadastro, confirmarEmail, reenviarCodigo,
  login, esqueciSenha, redefinirSenha, perfil,
} = require('../controllers/authController');

router.post('/cadastro',         auth, cadastro);
router.post('/confirmar',        auth, confirmarEmail);
router.post('/reenviar-codigo',  auth, reenviarCodigo);
router.post('/login',            auth, login);
router.post('/esqueci-senha',    auth, esqueciSenha);
router.post('/redefinir-senha',  auth, redefinirSenha);
router.get('/perfil',            requireAuth, perfil);
router.post('/logout',           (req, res) => res.json({ mensagem: 'Logout realizado.' }));

module.exports = router;
