# CONTEXT-PAYMENT.md — Pagamento

## Visão Geral
Integração com Mercado Pago via Checkout Pro. Usuário é redirecionado para página do MP, paga, e webhook atualiza o plano automaticamente. Não há cobrança recorrente automática — cada upgrade é um pagamento único que ativa o plano Pro.

## Stack
- Mercado Pago API REST (fetch nativo)
- Supabase tabela `assinaturas`
- Webhook para confirmação automática

## Fluxo Completo
```
1. Usuário clica "Assinar Pro" em /planos
2. POST /api/pagamento/assinar (requer auth)
3. Backend cria preferência no MP (/checkout/preferences)
4. Retorna { url_pagamento, preferencia_id }
5. Frontend redireciona para url_pagamento (MP)
6. Usuário paga no ambiente do MP
7. MP chama POST /api/pagamento/webhook
8. Backend verifica payment status no MP
9. Se approved → atualiza assinatura + plano do usuário no banco
10. Usuário redirecionado para /planos?status=sucesso
```

## Configuração
```
MP_ACCESS_TOKEN  APP_USR-... (produção)
MP_PUBLIC_KEY    APP_USR-... (produção)
back_urls:
  success: https://pontuaplanning.com/planos?status=sucesso
  failure: https://pontuaplanning.com/planos?status=erro
  pending: https://pontuaplanning.com/planos?status=pendente
notification_url: https://pontuaplanning.com/api/pagamento/webhook
```

## Preços
```javascript
// config/planos.js
pro: {
  preco: 990,           // centavos = R$9,90
  precoExibicao: 9.90,
}
```

## Tabela assinaturas
```sql
usuario_id, mp_subscription_id (preference_id), plano, status, valor_mensal, criada_em, atualizada_em, cancelada_em
status: 'pending' | 'approved' | 'cancelled'
```

## Webhook
- Responde 200 imediatamente (MP retenta se não receber)
- Processa apenas eventos `type === 'payment'`
- Busca detalhes do pagamento em `/v1/payments/:id`
- Usa `metadata.usuario_id` para identificar usuário
- Só atualiza plano se `status === 'approved'`

## Cancelamento
- Endpoint POST `/api/pagamento/cancelar`
- Atualiza status para `cancelled` no banco
- Volta plano para `free` imediatamente

## O que NÃO fazer
- Não usar API de assinaturas recorrentes do MP (`/preapproval`) — exige `card_token_id` que não temos
- Não confiar no redirect de sucesso para ativar plano — usar apenas webhook
- Não usar token de teste em produção e vice-versa
- Não tentar pagar com a mesma conta que recebe (MP bloqueia)

## Estado Atual
- ✅ Checkout Pro funcionando em produção
- ✅ Webhook configurado
- ⚠️ Não há cobrança recorrente — usuário paga uma vez e vira Pro permanentemente
- ⏳ Implementar renovação mensal ou expiração do plano Pro
