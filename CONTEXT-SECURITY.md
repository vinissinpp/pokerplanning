# CONTEXT-SECURITY.md — Segurança

## Visão Geral
Segurança implementada em camadas: Helmet (headers HTTP), CORS restritivo, rate limiting, sanitização de inputs, JWT stateless e bcrypt para senhas.

## Autenticação
- **JWT:** Expira em 7 dias, contém `{ id, email, nome, plano }`
- **Senha:** bcrypt com `saltRounds: 12`
- **Token extraído:** apenas do header `Authorization: Bearer <token>`
- **Dois middlewares:** `requireAuth` (bloqueia) e `optionalAuth` (passa sem token)
- **Email verificado:** login bloqueado até confirmar email com código 6 dígitos (expira em 15min)

## Rate Limiting (express-rate-limit v7)
```
geral:    300 req / 15min (skip: /health)
auth:     100 req / 15min (skipSuccessfulRequests: true) ⚠️ deve voltar para 10
reenvio:  3 req / hora
pagamento: 10 req / hora
```
**Configuração crítica:** todos usam `validate: { xForwardedForHeader: false }` — obrigatório no Render.

## Headers de Segurança (Helmet)
- CSP configurado para permitir AdSense (`*.googlesyndication.com`, `*.doubleclick.net`, `*.adtrafficquality.google`)
- HSTS ativo (1 ano, preload)
- `crossOriginEmbedderPolicy: false` — necessário para Socket.io
- `x-powered-by` desabilitado

## CORS
- Origens permitidas: `APP_URL`, `CORS_ORIGIN`, `localhost:3000/3001`
- **Bug ativo:** `www.pontuaplanning.com` não está na lista → cadastro falha via www
- **Fix:** adicionar `'https://www.pontuaplanning.com'` hardcoded em `seguranca.js`

## Sanitização
- `sanitizarBody`: remove `<>` e caracteres de controle de todos os campos do body
- `bloquearPayloadGrande`: rejeita requests > 50KB
- `express-validator`: validações específicas por rota (email, senha min 8 chars, nome charset)
- `express.json({ limit: '100kb' })`: limite global

## Email Normalizado (Anti-duplicata)
- Remove `+alias` de qualquer domínio
- Remove pontos do Gmail/GoogleMail
- Salvo em `email_normalizado` (unique index no banco)

## O que NÃO fazer
- Não remover `validate: { xForwardedForHeader: false }` do rate limiter
- Não usar `trust proxy: 1` no server.js — não funciona no Render free
- Não expor mensagens de erro detalhadas em produção (já tratado)
- Não logar senhas ou tokens nos console.log
- Não confiar no plano do JWT para bloquear acesso a recursos — sempre verificar no banco

## Estado Atual
- ✅ Auth seguro com bcrypt + JWT
- ✅ Rate limiting funcional
- ✅ Helmet + CSP configurados
- ⚠️ CORS faltando `www.pontuaplanning.com`
- ⚠️ Rate limit auth em 100 (temporário para testes)
