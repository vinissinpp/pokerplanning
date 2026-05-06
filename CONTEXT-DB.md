# CONTEXT-DB.md — Banco de Dados

## Visão Geral
PostgreSQL via Supabase. Schema simples com 5 tabelas. Dados de salas em memória (Node.js) são espelhados no banco para persistência. Supabase free tier: 500MB.

## Schema

### usuarios
```sql
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
nome             text NOT NULL
email            text UNIQUE NOT NULL
email_normalizado text UNIQUE NOT NULL  -- sem pontos Gmail, sem +alias
senha_hash       text NOT NULL          -- bcrypt rounds=12
plano            text DEFAULT 'free'    -- 'free' | 'pro'
email_verificado boolean DEFAULT false
salas_criadas    int DEFAULT 0          -- contador permanente, nunca decrementa
codigo_verificacao text                 -- 6 dígitos numéricos
codigo_expira_em  timestamptz
codigo_tipo       text                  -- 'confirmacao' | 'recuperacao'
ultimo_login      timestamptz
criado_em        timestamptz DEFAULT now()
```

### salas
```sql
id        text PRIMARY KEY    -- uuid slice(0,11)
nome      text NOT NULL
dono_id   uuid REFERENCES usuarios(id)
dono_nome text
ativa     boolean DEFAULT true
sequencia text DEFAULT 'fibonacci'
criada_em timestamptz DEFAULT now()
```

### tarefas
```sql
id          text PRIMARY KEY
sala_id     text REFERENCES salas(id)
nome        text NOT NULL
descricao   text
responsavel text
pontos      int                  -- null = não votada
ordem       int
criada_em   timestamptz DEFAULT now()
```

### historico
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
sala_id     text REFERENCES salas(id)
tarefa_id   text
tarefa_nome text
responsavel text
pontos      int NOT NULL
media       numeric
votos       jsonb               -- { "Nome": valor, ... }
votado_em   timestamptz DEFAULT now()
```

### assinaturas
```sql
id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
usuario_id         uuid REFERENCES usuarios(id)
mp_subscription_id text            -- preference_id do Mercado Pago
plano              text DEFAULT 'pro'
status             text            -- 'pending' | 'approved' | 'cancelled'
valor_mensal       numeric
mp_payer_id        text
proxima_cobranca   timestamptz
criada_em          timestamptz DEFAULT now()
atualizada_em      timestamptz
cancelada_em       timestamptz
```

## Queries Críticas
```sql
-- Verificar duplicata de email no cadastro
SELECT id FROM usuarios WHERE email = $1;
SELECT id FROM usuarios WHERE email_normalizado = $1;

-- Incrementar salas criadas (via RPC atômica)
SELECT incrementar_salas_criadas(uid := $1);

-- Limpeza de salas antigas
UPDATE salas SET ativa = false WHERE criada_em < $1 AND ativa = true;

-- Limpeza de códigos expirados
UPDATE usuarios SET codigo_verificacao = null, codigo_expira_em = null, codigo_tipo = null
WHERE codigo_expira_em < now() AND codigo_verificacao IS NOT NULL;
```

## Convenções
- IDs de sala: `uuidv4().slice(0,11)` — string curta, URL-friendly
- IDs de tarefa: `uuidv4().slice(0,8)` — string curta
- Timestamps: sempre em UTC via `.toISOString()`
- `email_normalizado`: sempre salvo junto com `email` original
- Plano do usuário: fonte da verdade é `usuarios.plano`, não o JWT

## O que NÃO fazer
- Não deletar salas/histórico — apenas marcar `ativa = false`
- Não confiar no `salas_criadas` do JWT — buscar do banco para verificar limite
- Não usar o Supabase auth nativo — sistema usa auth próprio com JWT
- Não salvar senhas em texto — sempre bcrypt

## Estado Atual
- ✅ Schema estável em produção
- ✅ RPC `incrementar_salas_criadas` configurada
- ⚠️ ~500MB free no Supabase — monitorar crescimento do histórico
- ⏳ Falta índice em `salas.criada_em` para limpeza mais eficiente
