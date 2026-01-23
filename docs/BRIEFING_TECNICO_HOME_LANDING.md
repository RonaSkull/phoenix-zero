# Briefing Técnico — Home (`/`) e Landings (multi-landing)

Objetivo: definir a arquitetura, componentes, estado e fluxos para a nova Home e landings específicas, garantindo:

- Home como hub (venda + direcionamento)
- Landings por produto/caso de uso (conteúdo focado)
- Multi-idioma
- Integração com APIs existentes (`/api/auth-proxy`, OG, embeds)
- Não expor ferramentas dev na home

---

## 1) Estrutura de rotas (Next.js App Router)

### 1.1) Home principal

```
apps/web/src/app/
├── page.tsx                 # ← nova Home (landing hub)
├── layout.tsx               # ← pode ser o mesmo global
└── ...
```

### 1.2) Landings específicas (sugestão de nomenclatura)

```
apps/web/src/app/
├── for-creators/
│   └── page.tsx
├── for-news/
│   └── page.tsx
├── for-brands/
│   └── page.tsx
├── live/
│   └── page.tsx
└── ... (outras que você definir)
```

> **Decisão técnica:** você define os nomes das rotas. O briefing usa exemplos (`for-creators`, `for-news`, `for-brands`, `live`).

---

## 2) Componentes e reúso

### 2.1) Componentes globais (reutilizáveis)

- `HeroSection` (headline + subheadline + CTAs)
- `ProblemSolutionSection` (2 colunas)
- `UseCaseCard` (card com título, público, bullets, CTA)
- `HowItWorksSection` (3 passos)
- `DemoSection` (links para `/demo/v1`, `/live-stream`, etc.)
- `IntegrationSection` (tabs: Embed / SDK / Curl)
- `SecuritySection` (bullets de confiança)
- `FaqSection` (acordeão)
- `CtaSection` (final)

> Cada landing pode usar um subconjunto desses componentes, com conteúdo (copy) injetado por idioma/caso de uso.

### 2.2) Componentes específicos da Home

- `HubGrid` (grid de cards de landings)
- `HubHero` (hero mais genérico)

### 2.3) Componentes específicos de landing

- `LandingHero` (hero focado no caso de uso)
- `LandingDemo` (demo dedicada, ex: só vídeo ou só live)
- `LandingIntegration` (snippet mínimo para aquele caso de uso)

---

## 3) Estado e dados (conteúdo)

### 3.1) Multi-idioma (i18n)

Sugestão técnica (sem depender de libs externas):

- Criar `content/` com arquivos JSON por idioma:
  ```
  apps/web/src/content/
  ├── pt.json
  ├── en.json
  └── es.json
  ```

- Estrutura de chaves (exemplo):
  ```json
  {
    "home": {
      "hero": {
        "headline": "...",
        "subheadline": "...",
        "ctaPrimary": "Ver Demo",
        "ctaSecondary": "Integrar"
      },
      "problemSolution": {
        "title": "...",
        "problems": [...],
        "solutions": [...]
      },
      "useCases": [
        {
          "route": "/for-creators",
          "title": "...",
          "audience": "...",
          "benefits": ["...", "..."]
        }
      ]
    },
    "for-creators": {
      "hero": { ... },
      "demo": { ... }
    },
    "for-news": { ... },
    "for-brands": { ... },
    "live": { ... }
  }
  ```

- Hook `useContent(lang, page)` que carrega o JSON e retorna o objeto.

### 3.2) Casos de uso (landings)

Cada landing precisa de:

- `hero` (headline/subheadline/CTA)
- `demo` (link direto para a demo relevante)
- `integration` (snippet mínimo)
- `faq` (perguntas específicas daquele caso de uso)

> A Home só precisa de `useCases` (array de cards com `route` e `title`).

---

## 4) Integrações com APIs existentes

### 4.1) Demo links

- Vídeo: `/demo/v1`
- Imagem: `/demo/v1#image` (ou criar rota dedicada se preferir)
- Live: `/live-stream` e `/live-embed-demo`

> A Home deve linkar para essas rotas. As landings podem linkar diretamente para a demo específica.

### 4.2) Snippets de integração

- **Embed (recomendado):** sempre usar `.v1.js`
- **SDK:** sempre usar `phoenix-zero-sdk.v1.js`
- **API:** sempre usar `/api/auth-proxy`

> Os snippets devem ser **copiáveis** e **funcionais** (com `https://SEU_DOMINIO` placeholder).

### 4.3) OG image e share links

- A Home e landings devem ter `generateMetadata()` com:
  - `title`, `description`
  - `og:image` (pode usar `/api/share-card-png` ou imagem estática)
  - `twitter:card`

> Se quiser OG dinâmico, pode criar um endpoint `/api/home-card` ou reusar `share-card-png` com `id` fixo.

---

## 5) O que NÃO deve ser exposto

- Ferramentas de upload/stamp/verify (hoje em `/`)
- Scripts legados (`/phoenix-zero-embed.js` etc.) como recomendados
- Endpoints internos (`/api/global-*`) em snippets
- UI de “console” ou “admin”

> A Home e landings são **públicas e comerciais**. Ferramentas internas devem ir para uma rota separada (ex.: `/tools`).

---

## 6) Pontos de decisão técnica (para você definir)

### 6.1) Nomes das rotas de landing

- Exemplos: `/for-creators`, `/for-news`, `/for-brands`, `/live`
- Você define o nome e a ordem.

### 6.2) Estratégia de i18n

- Opção A: JSON em `content/` (sugerido)
- Opção B: `next-intl` ou outra lib
- Opção C: arquivos `.md` com frontmatter

### 6.3) Componentização

- Opção A: pasta `components/` com arquivos individuais
- Opção B: pasta `ui/` (shadcn/ui) + `sections/`
- Opção C: tudo dentro de `page.tsx` (não recomendado para reúso)

### 6.4) Estado de idioma

- Opção A: URL param (`/pt/...`, `/en/...`)
- Opção B: cookie/session
- Opção C: subdomínio (`pt.domain.com`)

> Se usar URL param, a estrutura fica: `apps/web/src/app/[lang]/page.tsx`.

---

## 7) Exemplo de implementação mínima (scaffold)

### 7.1) `apps/web/src/app/page.tsx` (Home)

```tsx
import { HeroSection, HubGrid, ProblemSolutionSection, HowItWorksSection, DemoSection, IntegrationSection, SecuritySection, FaqSection, CtaSection } from '@/components/sections'
import { useContent } from '@/hooks/useContent'

export default function HomePage() {
  const content = useContent('pt', 'home')
  return (
    <>
      <HeroSection {...content.hero} />
      <ProblemSolutionSection {...content.problemSolution} />
      <HubGrid useCases={content.useCases} />
      <HowItWorksSection {...content.howItWorks} />
      <DemoSection {...content.demo} />
      <IntegrationSection {...content.integration} />
      <SecuritySection {...content.security} />
      <FaqSection items={content.faq} />
      <CtaSection {...content.cta} />
    </>
  )
}
```

### 7.2) `apps/web/src/app/[lang]/for-creators/page.tsx` (Landing)

```tsx
import { LandingHero, LandingDemo, LandingIntegration, FaqSection, CtaSection } from '@/components/sections'
import { useContent } from '@/hooks/useContent'

export default function ForCreatorsPage({ params }) {
  const content = useContent(params.lang, 'for-creators')
  return (
    <>
      <LandingHero {...content.hero} />
      <LandingDemo {...content.demo} />
      <LandingIntegration {...content.integration} />
      <FaqSection items={content.faq} />
      <CtaSection {...content.cta} />
    </>
  )
}
```

---

## 8) Checklist de implementação

- [ ] Definir nomes das rotas de landing
- [ ] Escolher estratégia de i18n
- [ ] Criar estrutura de conteúdo JSON por idioma
- [ ] Implementar hook `useContent`
- [ ] Criar componentes reutilizáveis (seções)
- [ ] Implementar Home com `HubGrid`
- [ ] Implementar cada landing (pode começar com 1)
- [ ] Adicionar `generateMetadata()` para OG
- [ ] Testar snippets de integração (copiar/colar)
- [ ] Remover ferramentas dev da home (mover para `/tools`)

---

## 9) Próximos passos (se você quiser)

Você me diz:

1) **Quais rotas de landing** (nomes) e em que ordem
2) **Qual estratégia de i18n** (JSON, lib, URL param)
3) **Se quer que eu gere o scaffold inicial** (arquivos e estrutura de conteúdo)

E eu atualizo a árvore de rotas e, se quiser, crio os arquivos base para você começar.
