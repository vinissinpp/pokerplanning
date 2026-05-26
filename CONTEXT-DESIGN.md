# CONTEXT-DESIGN.md — Design System

## Visão Geral
Design system próprio em CSS puro com variáveis CSS. Identidade verde-limão + vermelho coral. Tipografia Goldman (títulos/números) + Syne (logo) + DM Sans (corpo).

## Tokens (CSS Variables)
```css
--c1: #ff4242;    /* vermelho coral — CTA, erros, destaque */
--c1d: #cc2e2e;   /* vermelho escuro — hover do CTA */
--c2: #f4fad2;    /* verde claro — backgrounds de sucesso/hover */
--c3: #d4ee5e;    /* verde-limão — badges, destaques positivos */
--c4: #e1edb9;    /* verde pálido — bordas, separadores */
--c5: #f0f2eb;    /* cinza-verde — background geral */
--text: #1a1a1a;  /* texto principal */
--textm: #555;    /* texto secundário */
--texts: #888;    /* texto terciário/labels */
--white: #ffffff;
--radius: 14px;   /* cards, modais */
--radius-sm: 9px; /* inputs, botões, badges */
```

## Tipografia
- **Logo/Marca:** Syne 800 — usado EXCLUSIVAMENTE em .nav-logo, .modal-logo, .footer-logo, .logo
- **Títulos/Números/Cartas:** Goldman 400/700 — h1, h2, .hero-title, .section-title, .feature-title, .step-title, .step-num, .stat-num, .carta-valor, .media-num, .mr-valor, .plano-preco, .plano-free-txt
- **Corpo/UI:** DM Sans 300/400/500 — todo o resto
- Todas carregadas via Google Fonts

## Import Google Fonts
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Goldman:wght@400;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet" />
```

## Componentes Padrão
- **Cards:** `background:white`, `border:1px solid var(--c4)`, `border-radius:var(--radius)`
- **Botão primário:** `background:var(--c1)`, hover `var(--c1d)` + `translateY(-1px)`
- **Botão secundário:** `background:var(--c5)`, `border:1.5px solid var(--c4)`
- **Inputs:** `background:var(--c5)`, focus `border-color:var(--c1)` + box-shadow vermelho 8%
- **Badges:** `background:var(--c3)`, `color:#2a3a00` (verde escuro para contraste)
- **Toast:** `position:fixed bottom-right`, desaparece após 3s

## Animações
- `fadeUp`: entrada de cards/modais (`opacity:0 + translateY(18px)` → normal)
- `dropIn`: dropdowns (`translateY(-6px)` → normal)
- Cartas: `cubic-bezier(.34,1.56,.64,1)` para efeito elástico no hover/ativa

## Padrões Visuais
- Logo: `● Pontua planning` (dot vermelho + Syne bold + sub cinza) — SEMPRE Syne
- Títulos e números: Goldman — impacto visual forte
- Gradiente de importância: vermelho (ação) > verde-limão (positivo) > cinza (neutro)
- Sem sombras pesadas — apenas `box-shadow` sutil nos cards e CTA

## O que NÃO fazer
- Não usar Goldman na logo — logo usa Syne exclusivamente
- Não usar Syne fora da logo — títulos usam Goldman
- Não usar cores fora do sistema de variáveis
- Não misturar `px` hardcoded para radius — usar `var(--radius)` ou `var(--radius-sm)`
- Não usar outra fonte além de Goldman, Syne e DM Sans
