/**
 * routes/auth.js
 * Rotas de autenticação com validação e rate limiting
 */

const express = require('express');
const router  = express.Router();

const { auth, reenvio }        = require('../middleware/rateLimit');
const { requireAuth }          = require('../middleware/auth');
const {
  validarCadastro, validarLogin, validarCodigo,
  validarRedefinirSenha, checarValidacao,
} = require('../middleware/seguranca');

const {
  cadastro, confirmarEmail, reenviarCodigo,
  login, esqueciSenha, redefinirSenha, perfil,
} = require('../controllers/authController');

router.post('/cadastro',        auth,    validarCadastro,        checarValidacao, cadastro);
router.post('/confirmar',       auth,    validarCodigo,          checarValidacao, confirmarEmail);
router.post('/reenviar-codigo', reenvio,                                          reenviarCodigo);
router.post('/login',           auth,    validarLogin,           checarValidacao, login);
router.post('/esqueci-senha',   auth,                                             esqueciSenha);
router.post('/redefinir-senha', auth,    validarRedefinirSenha,  checarValidacao, redefinirSenha);
router.get('/perfil',           requireAuth,                                      perfil);
router.post('/logout',          (req, res) => res.json({ mensagem: 'Logout realizado.' }));

module.exports = router;
