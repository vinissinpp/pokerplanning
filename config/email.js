const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const APP    = process.env.APP_URL    || 'http://localhost:3000';

// ── E-mail de confirmação de cadastro ──
async function enviarConfirmacao(email, nome, codigo) {
  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: '🃏 Pontua — Confirme seu cadastro',
    html: `
      <div style="font-family:'DM Sans',sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f0f2eb;border-radius:12px;">
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:4px;">
          <span style="color:#ff4242;">●</span> Pontua
          <span style="font-size:13px;font-weight:400;color:#888;margin-left:4px;">planning</span>
        </div>
        <h2 style="font-size:20px;margin:1.5rem 0 .5rem;">Olá, ${nome}! 👋</h2>
        <p style="color:#555;line-height:1.6;">Use o código abaixo para confirmar seu cadastro. Ele expira em <strong>15 minutos</strong>.</p>
        <div style="background:#fff;border:2px solid #d4ee5e;border-radius:12px;padding:1.5rem;text-align:center;margin:1.5rem 0;">
          <div style="font-size:42px;font-weight:800;letter-spacing:10px;color:#1a1a1a;">${codigo}</div>
        </div>
        <p style="font-size:12px;color:#888;">Se você não se cadastrou no Pontua, ignore este e-mail.</p>
      </div>
    `,
  });
}

// ── E-mail de recuperação de senha ──
async function enviarRecuperacao(email, nome, codigo) {
  await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: '🔑 Pontua — Recuperação de senha',
    html: `
      <div style="font-family:'DM Sans',sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#f0f2eb;border-radius:12px;">
        <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:4px;">
          <span style="color:#ff4242;">●</span> Pontua
          <span style="font-size:13px;font-weight:400;color:#888;margin-left:4px;">planning</span>
        </div>
        <h2 style="font-size:20px;margin:1.5rem 0 .5rem;">Redefinir senha</h2>
        <p style="color:#555;line-height:1.6;">Use o código abaixo para redefinir sua senha. Ele expira em <strong>15 minutos</strong>.</p>
        <div style="background:#fff;border:2px solid #ff4242;border-radius:12px;padding:1.5rem;text-align:center;margin:1.5rem 0;">
          <div style="font-size:42px;font-weight:800;letter-spacing:10px;color:#ff4242;">${codigo}</div>
        </div>
        <p style="font-size:12px;color:#888;">Se você não solicitou a recuperação, ignore este e-mail.</p>
      </div>
    `,
  });
}

module.exports = { enviarConfirmacao, enviarRecuperacao };
