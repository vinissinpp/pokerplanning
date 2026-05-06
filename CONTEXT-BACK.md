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
POST /api/sala                   — cria sala (requer auth + limite plano)

GET  /api/pagamento/planos       — lista planos
POST /api/pagamento/assinar      — cria preferência Mercado Pago
POST /api/pagamento/cancelar     — cancela assinatura
GET  /api/pagamento/status       — status do plano do usuário
POST /api/pagamento/webhook      — recebe notificações do MP

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
  estado    — estado completo da sala (sempre que algo muda)
  revelado  { votos, media }
  erro      { msg }
  erroVoto  { msg }
```

## Regras de Negócio
- **Admin da sala:** primeiro a entrar com `usuarioId === sala.donoId` vira admin; se desconectar, próximo participante assume
- **Votos ocultos:** antes de revelar, votos são mascarados como `'?'` para outros participantes
- **Salas criadas:** contador `salas_criadas` nunca decrementa — Free tem limite de 3 salas vitalícias
- **Email normalizado:** Gmail remove pontos e `+alias` para detectar duplicatas (`vinicius.dc@gmail.com === viniciusdc@gmail.com`)
- **Limpeza:** salas inativas após `HORAS_SALA_ATIVA` (padrão 24h) são marcadas como `ativa: false` no banco

## Variáveis de Ambiente (Render)
```
APP_URL              https://pontuaplanning.com
CORS_ORIGIN          https://pontuaplanning.com
EMAIL_FROM           noreply@pontuaplanning.com
JWT_SECRET           [secret]
MP_ACCESS_TOKEN      [prod token]
MP_PUBLIC_KEY        [prod key]
RESEND_API_KEY       [key]
SUPABASE_URL         [url]
SUPABASE_SERVICE_KEY [key]
HORAS_SALA_ATIVA     24
INTERVALO_LIMPEZA    60
```

## O que NÃO fazer
- Não usar `optionalAuth` em rotas que precisam de plano verificado
- Não confiar no plano do JWT para decisões críticas — sempre buscar do banco
- Não remover o `validate: { xForwardedForHeader: false }` do rate limiter — causa erro no Render
- Não usar `app.set('trust proxy', 1)` — não funciona no Render free tier com esse rate limiter

## Estado Atual
- ✅ Auth completo funcionando com domínio próprio
- ✅ WebSocket estável
- ⚠️ CORS não inclui `www.pontuaplanning.com` — cadastro falha via www
- ⚠️ Rate limit auth em `max: 100` (deve voltar para 10)
- ⏳ Middleware de plano para upload/exportar não implementado
