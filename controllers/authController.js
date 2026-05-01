/**
 * controllers/authController.js — v2.1
 * Fix: todas as buscas por email usam normalizarEmail()
 */

const bcrypt                          = require('bcryptjs');
const { gerarToken }                  = require('../middleware/auth');
const { enviarConfirmacao, enviarRecuperacao } = require('../config/email');
const supabase                        = require('../config/db');

function gerarCodigo() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function expiracaoMin(min) {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

function normalizarEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const lower = email.toLowerCase().trim();
  const at = lower.lastIndexOf('@');
  if (at === -1) return lower;
  let local  = lower.slice(0, at);
  const dominio = lower.slice(at + 1);
  local = local.split('+')[0];
  if (dominio === 'gmail.com' || dominio === 'googlemail.com') {
    local = local.replace(/\./g, '');
  }
  return `${local}@${dominio}`;
}

async function cadastro(req, res) {
  try {
    const { nome, email, senha } = req.body;
    if (!nome || !email || !senha)
      return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
    if (senha.length < 8)
      return res.status(400).json({ erro: 'Senha precisa ter pelo menos 8 caracteres.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ erro: 'E-mail inválido.' });

    const emailNorm        = normalizarEmail(email);
    const emailNormalizado = emailNorm;

    const { data: existente } = await supabase
      .from('usuarios').select('id, email_verificado').eq('email', emailNorm).single();

    if (existente) {
      if (!existente.email_verificado)
        return res.status(409).json({ erro: 'E-mail já cadastrado mas não confirmado. Verifique sua caixa de entrada.', acao: 'confirmar' });
      return res.status(409).json({ erro: 'E-mail já cadastrado. Faça login.' });
    }

    const { data: existenteNorm } = await supabase
      .from('usuarios').select('id').eq('email_normalizado', emailNormalizado).maybeSingle();

    if (existenteNorm)
      return res.status(409).json({ erro: 'Este e-mail já está associado a uma conta existente.' });

    const senhaHash = await bcrypt.hash(senha, 12);
    const codigo    = gerarCodigo();

    const { data: usuario, error } = await supabase
      .from('usuarios')
      .insert({
        nome:               nome.trim(),
        email:              emailNorm,
        email_normalizado:  emailNormalizado,
        senha_hash:         senhaHash,
        plano:              'free',
        email_verificado:   false,
        salas_criadas:      0,
        codigo_verificacao: codigo,
        codigo_expira_em:   expiracaoMin(15),
        codigo_tipo:        'confirmacao',
      })
      .select().single();

    if (error) throw error;

    await enviarConfirmacao(emailNorm, nome.trim(), codigo);

    return res.status(201).json({
      mensagem: 'Conta criada! Verifique seu e-mail para confirmar o cadastro.',
      email:    emailNorm,
      etapa:    'confirmar',
    });
  } catch (err) {
    console.error('[cadastro]', err);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }
}

async function confirmarEmail(req, res) {
  try {
    const { email, codigo } = req.body;
    if (!email || !codigo)
      return res.status(400).json({ erro: 'E-mail e código são obrigatórios.' });

    const emailNorm = normalizarEmail(email); // ← corrigido
    const { data: usuario } = await supabase
      .from('usuarios').select('*').eq('email', emailNorm).single();

    if (!usuario)
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (usuario.email_verificado)
      return res.status(400).json({ erro: 'E-mail já confirmado. Faça login.' });
    if (usuario.codigo_tipo !== 'confirmacao' || usuario.codigo_verificacao !== codigo)
      return res.status(400).json({ erro: 'Código inválido.' });
    if (new Date() > new Date(usuario.codigo_expira_em))
      return res.status(400).json({ erro: 'Código expirado. Solicite um novo.' });

    await supabase.from('usuarios').update({
      email_verificado:   true,
      codigo_verificacao: null,
      codigo_expira_em:   null,
      codigo_tipo:        null,
    }).eq('id', usuario.id);

    const token = gerarToken(usuario);
    return res.json({
      mensagem: 'E-mail confirmado! Bem-vindo ao Pontua.',
      token,
      usuario: {
        id:           usuario.id,
        nome:         usuario.nome,
        email:        usuario.email,
        plano:        usuario.plano,
        salasCriadas: usuario.salas_criadas ?? 0,
      },
      redirect: '/',
    });
  } catch (err) {
    console.error('[confirmarEmail]', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function reenviarCodigo(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'E-mail obrigatório.' });

    const emailNorm = normalizarEmail(email); // ← corrigido
    const { data: usuario } = await supabase
      .from('usuarios').select('*').eq('email', emailNorm).single();

    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    if (usuario.email_verificado) return res.status(400).json({ erro: 'E-mail já confirmado.' });

    const codigo = gerarCodigo();
    await supabase.from('usuarios').update({
      codigo_verificacao: codigo,
      codigo_expira_em:   expiracaoMin(15),
      codigo_tipo:        'confirmacao',
    }).eq('id', usuario.id);

    await enviarConfirmacao(emailNorm, usuario.nome, codigo);
    return res.json({ mensagem: 'Novo código enviado para seu e-mail.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function login(req, res) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha)
      return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });

    const emailNorm = normalizarEmail(email);
    const { data: usuario } = await supabase
      .from('usuarios').select('*').eq('email', emailNorm).single();

    if (!usuario)
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    if (!usuario.email_verificado)
      return res.status(403).json({
        erro:  'Confirme seu e-mail antes de entrar.',
        acao:  'confirmar',
        email: emailNorm,
      });

    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaOk)
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    await supabase.from('usuarios').update({ ultimo_login: new Date().toISOString() }).eq('id', usuario.id);

    const token = gerarToken(usuario);
    return res.json({
      mensagem: 'Login realizado!',
      token,
      usuario: {
        id:           usuario.id,
        nome:         usuario.nome,
        email:        usuario.email,
        plano:        usuario.plano,
        salasCriadas: usuario.salas_criadas ?? 0,
      },
      redirect: '/',
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function esqueciSenha(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'E-mail obrigatório.' });

    const emailNorm = normalizarEmail(email); // ← corrigido
    const { data: usuario } = await supabase
      .from('usuarios').select('id, nome, email_verificado').eq('email', emailNorm).single();

    if (!usuario || !usuario.email_verificado)
      return res.json({ mensagem: 'Se esse e-mail estiver cadastrado, você receberá um código.' });

    const codigo = gerarCodigo();
    await supabase.from('usuarios').update({
      codigo_verificacao: codigo,
      codigo_expira_em:   expiracaoMin(15),
      codigo_tipo:        'recuperacao',
    }).eq('id', usuario.id);

    await enviarRecuperacao(emailNorm, usuario.nome, codigo);
    return res.json({ mensagem: 'Se esse e-mail estiver cadastrado, você receberá um código.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function redefinirSenha(req, res) {
  try {
    const { email, codigo, novaSenha } = req.body;
    if (!email || !codigo || !novaSenha)
      return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
    if (novaSenha.length < 8)
      return res.status(400).json({ erro: 'Senha precisa ter pelo menos 8 caracteres.' });

    const emailNorm = normalizarEmail(email); // ← corrigido
    const { data: usuario } = await supabase
      .from('usuarios').select('*').eq('email', emailNorm).single();

    if (!usuario || usuario.codigo_tipo !== 'recuperacao' || usuario.codigo_verificacao !== codigo)
      return res.status(400).json({ erro: 'Código inválido.' });
    if (new Date() > new Date(usuario.codigo_expira_em))
      return res.status(400).json({ erro: 'Código expirado. Solicite um novo.' });

    const senhaHash = await bcrypt.hash(novaSenha, 12);
    await supabase.from('usuarios').update({
      senha_hash:         senhaHash,
      codigo_verificacao: null,
      codigo_expira_em:   null,
      codigo_tipo:        null,
    }).eq('id', usuario.id);

    return res.json({ mensagem: 'Senha redefinida com sucesso! Faça login.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function perfil(req, res) {
  try {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, nome, email, plano, salas_criadas, criado_em')
      .eq('id', req.usuario.id).single();
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    return res.json(usuario);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = {
  cadastro, confirmarEmail, reenviarCodigo,
  login, esqueciSenha, redefinirSenha, perfil,
};
