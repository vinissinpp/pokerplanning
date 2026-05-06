# CONTEXT-FRONT.md — Frontend

## Visão Geral
Frontend em HTML/CSS/JS vanilla, sem framework ou build step. Três páginas principais servidas como arquivos estáticos pelo Express.

## Páginas
| Arquivo | Rota | Descrição |
|---|---|---|
| `public/index.html` | `/` | Landing page + modal criar/entrar sala |
| `public/cadastro.html` | `/cadastro` `/login` | Auth (login, cadastro, recuperação) |
| `public/sala.html` | `/sala/:id` | Sala de votação em tempo real |
| `public/planos.html` | `/planos` | Página de planos e pagamento |

## Padrões de Estado
- **Sessão:** `localStorage` com chaves `pontua_token` (JWT) e `pontua_usuario` (JSON)
- **Plano atualizado dinamicamente:** `renderNav()` e `renderNavSala()` fazem fetch em `/api/pagamento/status` a cada carregamento para garantir plano atualizado
- **Socket.io:** Estado da sala 100% via eventos WebSocket (`estado`, `revelado`, `erroVoto`)

## Convenções JS
- Funções globais no `window` (chamadas via `onclick` no HTML)
- Sem módulos ES6 — tudo inline no `<script>` da página
- `esc()` para sanitizar HTML antes de inserir no DOM
- `getToken()` / `getUsuario()` são helpers globais em todas as páginas

## AdSense
- Script carregado no `<head>` de `index.html` e `sala.html`
- Container `#ads-container` / `#ads-container-sala` com `display:none` por padrão
- Mostrado apenas para Free via JS após verificar plano
- `adsbygoogle.push({})` chamado com `setTimeout(300ms)` após mostrar container (evita slot size 0)
- `min-height` removido dos containers para não ocupar espaço quando vazio

## O que NÃO fazer
- Não usar `localStorage` diretamente para verificar plano em decisões de segurança (apenas UI)
- Não confiar no plano do `localStorage` para bloquear features — validar sempre no backend
- Não adicionar `min-height` nos containers de AdSense
- Não remover o `setTimeout` ao inicializar AdSense — causa erro de slot size

## Estado Atual
- ✅ Login/cadastro/recuperação funcionando
- ✅ Sala em tempo real funcional
- ✅ AdSense configurado (aguardando aprovação)
- ⚠️ Upload e exportar não bloqueados para Free ainda
- ⚠️ Rate limiter auth ainda em `max: 100` (era teste, deve voltar para 10)
