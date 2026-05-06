# CONTEXT-BACK.md — Backend

## Visão Geral
API REST + WebSocket em Node.js/Express. Estado das salas em memória (objeto `salas{}`), persistido no Supabase. Limpeza automática de salas inativas a cada hora.

## Stack
- Express 4, Socket.io 4, Node.js
- Supabase JS SDK v2 (PostgreSQL)
- JWT (jsonwebtoken), bcryptjs
- Resend (email), uuid, dotenv

## Rotas API
```
POST /api/auth/cadastro          — cria conta (envia email de confirmação)
POST /api/auth/confirmar         — confirma email com código 6 dígitos
POST /api/auth/login             — retorna JWT + dados do usuário
POST /api/auth/esqueci-senha     — envia código de recuperação
POST /api/auth/redefinir-senha   — redefine senha com código
POST /api/auth/reenviar-codigo   — reenvia código (limite: 3/hora)
GET  /api/auth/perfil            — dados do usuário autenticado

GET  /api/sala/ping              — anti cold-start (UptimeRobot)
GET  /api/sala/:id               — verifica se sala existe (pública)
POST /api/sala                   — cria sala (requer auth)

GET  /api/pagamento/planos       — lista planos
POST /api/pagamento/assinar      — cria Stripe Checkout Session
POST /api/pagamento/cancelar     — cancela assinatura no Stripe
GET  /api/pagamento/status       — status do plano do usuário
POST /api/pagamento/webhook      — recebe eventos do Stripe

GET  /health                     — status do servidor (uptime)
```

## WebSocket Events (Socket.io)
```
Cliente → Servidor:
  entrar           { salaId, nome, usuarioId }
  votar            { valor }
  revelar          —
  resetar          —
  selecionarTarefa { tarefaId }
  mudarSequencia   { sequencia }
  adicionarTarefa  { nome, descricao, responsavel }
  editarTarefa     { tarefaId, nome, descricao, responsavel }
  salvarResultado  { tarefaId, pontos }

Servidor → Cliente:
  estado     — estado completo da sala (sempre que algo muda)
  revelado   { votos, media }
  erro       { msg } — ex: sala cheia (limite de participantes)
  erroVoto   { msg }
  erroTarefa { msg } — ex: limite de tarefas atingido
```

## Regras de Negócio
- **Admin da sala:** primeiro a entrar com `usuarioId === sala.donoId` vira admin; se desconectar, próximo participante assume
- **Votos ocultos:** antes de revelar, votos são mascarados como `'?'` para outros participantes
- **Limites por plano:** Free = 10 participantes / 20 tarefas por sala; Pro = 30 participantes / 40 tarefas. Verificados no WebSocket (`entrar` e `adicionarTarefa`). Plano do dono é cacheado em `sala.planoOwner` ao carregar do banco.
- **Upload/Download:** bloqueados no front para Free (`meuPlano !== 'pro'`). Upload = import XLSX de tarefas; Download = export XLSX com pontuação e responsável (só admin Pro).
- **Salas:** ilimitadas para todos os planos. Rota `POST /api/sala` não verifica limite.
- **Email normalizado:** Gmail remove pontos e `+alias` para detectar duplicatas (`vinicius.dc@gmail.com === viniciusdc@gmail.com`)
- **Limpeza:** salas inativas após `HORAS_SALA_ATIVA` (padrão 24h) são marcadas como `ativa: false` no banco

## Variáveis de Ambiente (Render)
```
APP_URL                https://pontuaplanning.com
CORS_ORIGIN            https://pontuaplanning.com
EMAIL_FROM             noreply@pontuaplanning.com
JWT_SECRET             [secret]
STRIPE_SECRET_KEY      [sk_live_...]
STRIPE_WEBHOOK_SECRET  [whsec_...]
STRIPE_PRICE_BRL       price_1TTx2vHtRGs5mwXpsykQKQmU
STRIPE_PRICE_USD       price_1TTx2vHtRGs5mwXpskWnGpXQ
RESEND_API_KEY         [key]
SUPABASE_URL           [url]
SUPABASE_SERVICE_KEY   [key]
HORAS_SALA_ATIVA       24
INTERVALO_LIMPEZA      60
```

## O que NÃO fazer
- Não usar `optionalAuth` em rotas que precisam de plano verificado
- Não confiar no plano do JWT para decisões críticas — sempre buscar do banco
- Não remover o `validate: { xForwardedForHeader: false }` do rate limiter — causa erro no Render
- Não usar `app.set('trust proxy', 1)` — não funciona no Render free tier com esse rate limiter
- Não mover `app.use('/api/pagamento/webhook', express.raw(...))` para depois do `express.json()` — o Stripe precisa do body cru para verificar a assinatura do webhook

## Estado Atual
- ✅ Auth completo funcionando com domínio próprio
- ✅ WebSocket estável
- ✅ Pagamento Stripe com assinatura recorrente operacional
- ✅ Suporte a BRL e USD
- ⚠️ CORS não inclui `www.pontuaplanning.com` — cadastro falha via www
- ⚠️ Rate limit auth em `max: 100` (deve voltar para 10)
