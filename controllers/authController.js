const bcrypt      = require('bcryptjs');
const { gerarToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Usuários em memória — será substituído pelo Supabase
const usuariosDB = new Map();

async function cadastro(req, res) {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha)
      return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
    if (senha.length < 8)
      return res.status(400).json({ erro: 'Senha precisa ter pelo menos 8 caracteres.' });

    const emailNorm = email.toLowerCase().trim();
    if (usuariosDB.has(emailNorm))
      return res.status(409).json({ erro: 'E-mail já cadastrado. Faça login.' });

    const senhaHash = await bcrypt.hash(senha, 12);
    const usuario = {
      id: uuidv4(), nome: nome.trim(), email: emailNorm,
      senha_hash: senhaHash, plano: 'free', criado_em: new Date().toISOString(),
    };
    usuariosDB.set(emailNorm, usuario);

    const token = gerarToken(usuario);
    return res.status(201).json({
      mensagem: 'Conta criada com sucesso!',
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, plano: usuario.plano },
      redirect: '/',
    });
  } catch (err) {
    console.error('[cadastro]', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function login(req, res) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha)
      return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });

    const emailNorm = email.toLowerCase().trim();
    const usuario   = usuariosDB.get(emailNorm);
    if (!usuario)
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk)
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const token = gerarToken(usuario);
    return res.json({
      mensagem: 'Login realizado!',
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, plano: usuario.plano },
      redirect: '/',
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function perfil(req, res) {
  try {
    const usuario = usuariosDB.get(req.usuario.email);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    return res.json({
      id: usuario.id, nome: usuario.nome,
      email: usuario.email, plano: usuario.plano,
    });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { cadastro, login, perfil };
