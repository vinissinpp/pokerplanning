const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'pokerplanning-dev-secret';

function requireAuth(req, res, next) {
  const token = extrairToken(req);
  if (!token) return res.status(401).json({ erro: 'Token não encontrado.' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

function optionalAuth(req, res, next) {
  const token = extrairToken(req);
  if (token) {
    try { req.usuario = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, nome: usuario.nome, plano: usuario.plano || 'free' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function extrairToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

module.exports = { requireAuth, optionalAuth, gerarToken };
