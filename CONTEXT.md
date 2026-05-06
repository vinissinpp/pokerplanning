# CONTEXT.md — Pontua Planning

## Visão Geral
SaaS de Planning Poker em tempo real para times ágeis. Permite criar salas, importar tarefas, votar em story points e ver métricas da sprint. Modelo freemium com AdSense para Free e pagamento recorrente para Pro.

## Stack
- **Runtime:** Node.js (Express 4)
- **Realtime:** Socket.io 4
- **Banco:** Supabase (PostgreSQL)
- **Auth:** JWT (jsonwebtoken) + bcryptjs
- **Email:** Resend
- **Pagamento:** Mercado Pago (Checkout Pro)
- **Deploy:** Render (free tier)
- **Domínio:** pontuaplanning.com (Hostinger)
- **Frontend:** HTML/CSS/JS vanilla (sem framework)
- **Uptime:** UptimeRobot (free, ping a cada 5min)

## Arquitetura
```
server.js → routes/ → middleware/ → controllers/ → config/
                                 ↓
                           socket/handlers.js (WebSocket)
                                 ↓
                           salas{} em memória + Supabase
```

## Decisões Importantes
- **Estado das salas em memória:** Mais rápido para WebSocket, persistido no Supabase para recuperação após restart
- **JWT stateless:** Sem sessões server-side, plano do usuário embutido no token (atualizado a cada login)
- **Sem framework frontend:** HTML puro para simplicidade e zero build step
- **Render free tier:** Aceita spin-down de 50s; mitigado com UptimeRobot

## O que NÃO fazer
- Não guardar estado crítico só na memória (salas perdem dados em restart)
- Não usar o endereço `pokerplanning-sbmc.onrender.com` — domínio oficial é `pontuaplanning.com`
- Não commitar `.env` — variáveis estão no Render Environment

## Estado Atual
- ✅ MVP funcional em produção
- ✅ Pagamento Mercado Pago operacional
- ✅ Domínio próprio configurado
- ⚠️ CORS ainda bloqueia `www.pontuaplanning.com` (bug pendente)
- ⚠️ AdSense aguardando aprovação Google
- ⏳ Bloqueio de features por plano (upload/exportar) não implementado

## Próximos Passos
1. Corrigir CORS para `www.pontuaplanning.com`
2. Bloquear upload CSV/XLS para Free
3. Bloquear exportar para Free
4. Voltar rate limit auth para `max: 10`
5. Configurar email Zoho para suporte
