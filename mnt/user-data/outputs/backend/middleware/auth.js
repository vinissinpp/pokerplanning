/**
 * middleware/auth.js
 * Verifica JWT em rotas protegidas
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pokerplanning-dev-secret-troque-em-producao';

/**
 * requireAuth — bloqueia rotas sem token válido
 * Uso: router.get('/rota', requireAuth, handler)
 */
function requireAuth(req, res, next) {
  const token = extrairToken(req);
  if (!token) {
    return res.status(401).json({ erro: 'Token de autenticação não encontrado.' });
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    return res.status(401).json({ erro: 'Token inválido.' });
  }
}

/**
 * optionalAuth — não bloqueia, mas anexa o usuário se houver token
 * Uso: router.get('/rota', optionalAuth, handler)
 */
function optionalAuth(req, res, next) {
  const token = extrairToken(req);
  if (token) {
    try { req.usuario = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

/**
 * gerarToken — cria JWT com payload do usuário
 */
function gerarToken(usuario) {
  return jwt.sign(
    {
      id:    usuario.id,
      email: usuario.email,
      nome:  usuario.nome,
      plano: usuario.plano || 'free',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function extrairToken(req) {
  // Aceita header Authorization: Bearer <token> OU cookie jwt
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies?.jwt) return req.cookies.jwt;
  return null;
}

module.exports = { requireAuth, optionalAuth, gerarToken };
