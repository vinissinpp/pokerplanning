const bcrypt         = require('bcryptjs');
const { gerarToken } = require('../middleware/auth');
const supabase       = require('../config/db');

async function cadastro(req, res) {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha)
      return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
    if (senha.length < 8)
      return res.status(400).json({ erro: 'Senha precisa ter pelo menos 8 caracteres.' });

    const emailNorm = email.toLowerCase().trim();

    // Verifica se já existe
    const { data: existente } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', emailNorm)
      .single();

    if (existente)
      return res.status(409).json({ erro: 'E-mail já cadastrado. Faça login.' });

    const senhaHash = await bcrypt.hash(senha, 12);

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .insert({ nome: nome.trim(), email: emailNorm, senha_hash: senhaHash, plano: 'free' })
      .select()
      .single();

    if (error) throw error;

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

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', emailNorm)
      .single();

    if (!usuario)
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk)
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    // Atualiza último login
    await supabase
      .from('usuarios')
      .update({ ultimo_login: new Date().toISOString() })
      .eq('id', usuario.id);

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
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, nome, email, plano, criado_em')
      .eq('id', req.usuario.id)
      .single();

    if (!usuario)
      return res.status(404).json({ erro: 'Usuário não encontrado.' });

    return res.json(usuario);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { cadastro, login, perfil };
