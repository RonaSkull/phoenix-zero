# Playwright + Social Platforms + Zero-Action (Phoenix Zero)

Este documento explica **o que é Playwright**, como ele é usado neste repositório para testes E2E, quais são as **limitações** (especialmente para redes sociais) e como isso se conecta com o objetivo de **autenticidade “zero-action”**: o usuário perceber a autenticidade de imagem/vídeo/áudio/live **sem mudar o hábito de navegação** e **sem interferir no conteúdo**.

---

## 1) O que é Playwright e para que serve

Playwright é um framework de automação e testes **end-to-end (E2E)** que controla navegadores reais (Chromium/Firefox/WebKit) de forma programática.

Ele serve para:

- **Testar UX real** (DOM, navegação, scripts, requests, cookies).
- Validar que o app funciona de ponta a ponta (rotas, API, páginas, assets, embeds).
- Simular **agentes de usuário** (User-Agent) e fluxos comuns de navegação.
- Capturar **evidências** quando falha (trace, screenshot, vídeo), facilitando debug.

No contexto Phoenix Zero, Playwright é usado como “rede de segurança” para:

- Garantir que os **embeds/badges** renderizam no navegador.
- Validar que a página de compartilhamento (**/s/[id]**) publica metadados OG/Twitter consistentes para preview.
- Detectar regressões em rotas críticas que alimentam redes sociais (ex.: **og:image**).

---

## 2) Conceitos centrais do Playwright (modelo mental)

- **Browser / BrowserType**
  - Motor do navegador (ex.: Chromium).

- **BrowserContext**
  - Um “perfil isolado”: cookies/storage/cache isolados.
  - Útil para simular usuários diferentes sem interferência.

- **Page**
  - Uma aba. A maior parte da automação ocorre aqui.

- **Locator**
  - Forma robusta de localizar elementos no DOM.
  - O Playwright “re-tenta” automaticamente até o elemento existir/ficar visível, reduzindo flakiness.

- **Expect / Assertions**
  - `expect(locator).toBeVisible()` etc.
  - Assertions com timeout e retry integrados.

- **APIRequestContext (`request`)**
  - Permite fazer GET/POST/HEAD sem abrir uma página.
  - Ideal para testar **crawlers** (que normalmente fazem HTTP, não “clicam na UI”).

- **Projects/Devices**
  - Permite rodar o mesmo teste em perfis diferentes.
  - Aqui usamos só **Chromium** por custo/velocidade.

- **Artifacts (trace/screenshot/video)**
  - `trace: 'retain-on-failure'` ajuda muito a depurar falhas em CI.

- **`webServer`**
  - Playwright pode subir o servidor (ex.: `npm run dev:web`) antes dos testes.

---

## 3) Como o repositório está usando Playwright hoje

Arquivos relevantes:

- `playwright.config.ts`
  - Define `testDir: ./e2e`.
  - Roda apenas `chromium`.
  - Sobe o Next com `webServer.command = 'npm run dev:web'`.

- `e2e/embeds.spec.ts`
  - Smoke tests para garantir que **badges de embed** aparecem.

- `e2e/social-preview.spec.ts`
  - Smoke test de preview social: gera um share link via `/api/share-link` e valida `og:title`/`og:image` para vários UAs.

- `scripts/social/platforms.json`
  - Catálogo de plataformas + user agents (simulação básica de crawlers).

---

## 4) Relação com plataformas de rede social (como previews funcionam)

A maioria das redes sociais/mensageiros não “executa seu site” como um usuário.

O comportamento típico é:

1. O usuário compartilha um **link** (ex.: `https://seu-site/s/abc123`).
2. A plataforma envia um **crawler** (bot) para baixar o HTML.
3. O crawler lê tags como:
   - `og:title`, `og:description`, `og:image`, `og:type`
   - `twitter:card`, `twitter:image` (principalmente Twitter/X)
4. A plataforma cacheia o resultado (às vezes por horas/dias) e mostra o card.

### Por que isso é “zero-action”

- O usuário não precisa instalar nada e não precisa abrir uma UI extra.
- O preview do link já “carrega” o status de autenticidade.

### A regra de ouro

Para plataformas, **o canal mais realista** de zero-action é:

- **Link preview (OG/Twitter tags)** + uma `og:image` (share card) que comunica a verificação.

Embeds dentro de páginas (badges) funcionam quando você controla o site/DOM, mas não dentro do app nativo do Instagram/WhatsApp, por exemplo.

---

## 5) Ajustes especiais por plataforma (tabela)

Baseado em `scripts/social/platforms.json`.

| Plataforma | Como o preview acontece | Tags críticas | Ajustes especiais comuns | Principais armadilhas |
|---|---|---|---|---|
| WhatsApp | Bot busca HTML + og:image; cache agressivo | `og:title`, `og:image` | **HTTPS público** em produção; cache headers bem definidos; og:image rápida | Cache forte dificulta “atualizar”; se og:image falha 1x pode ficar ruim por muito tempo |
| Telegram | Bot lê OG e às vezes Twitter tags | OG + opcional Twitter | HTML simples e rápido; redirects ok | Pode pegar imagem “errada” se múltiplas `og:image` sem ordem |
| Instagram | Geralmente via stack Facebook | OG | HTTPS público; og:image com tamanho “card-friendly” | Cache + heurísticas; nem sempre revalida fácil |
| Facebook | `facebookexternalhit` lê OG | OG | Use Sharing Debugger para “re-scrape”; og:image 1200x630 (recomendado) | Cache persistente; bloqueios por robots/firewall |
| LinkedIn | `LinkedInBot` | OG | `og:image` acessível publicamente; evitar 403/302 em cadeia | LinkedIn costuma ser sensível a timeouts |
| X/Twitter | `Twitterbot` lê Twitter tags e OG | `twitter:card`, `twitter:image`, OG | Definir `twitter:card=summary_large_image`; garantir `og:image`/`twitter:image` compatíveis | Pode ignorar OG se Twitter tags estiverem incompletas |
| Discord | `Discordbot` | OG | Respostas rápidas; imagem com content-type correto | Faz unfurl agressivo; se og:image demora, falha |
| Slack | `Slackbot-LinkExpanding` | OG | Suportar HEAD/GET; imagens com `Content-Type` correto | Slack pode tentar múltiplas requisições em paralelo |
| TikTok | Varia; mas OG ainda ajuda | OG | Manter OG consistente; evitar imagens grandes demais | Pipeline imprevisível; cache/heurística |
| YouTube/Googlebot | Não é “preview do YouTube”, é validação crawler | OG/SEO | SEO básico e performance | Googlebot não representa todos os previews sociais |

### Recomendação prática (que cobre quase todas)

- **Sempre** servir:
  - `og:title`, `og:description`
  - `og:image` (JPG e/ou PNG)
  - `twitter:card` + `twitter:image`
- `og:image`:
  - HTTPS público
  - `Content-Type` correto
  - baixa latência
  - tamanho “card” (ex.: 1200x630)

---

## 6) Limitações do Playwright (especialmente para redes sociais)

Playwright é excelente para **testar o seu app**, mas não “vira” Instagram/WhatsApp:

- **Não emula o app nativo** (iOS/Android) de forma realista.
- Não reproduz fielmente o **crawler real** (cache, IPs, timeouts, follow-redirect policy específica).
- Não consegue validar a **pipeline de reencode** do upload (isso acontece no backend das plataformas).
- Fluxos com **login, 2FA, CAPTCHA** são instáveis e geralmente precisam modo semi-automático.
- Mudanças de UI nas redes sociais quebram automação com frequência.

### Maiores problemas (na prática)

- **Cache de preview**: você muda o HTML e o preview continua velho.
- **Ambiente local**: crawlers reais não acessam `localhost`.
- **Heurísticas variáveis**: cada plataforma muda regras sem avisar.
- **Reencode**: é o principal inimigo de watermark invisível.

---

## 7) Re-encode/recompartilhamento e como manter watermark + autenticidade

Aqui está o ponto-chave: você quer que o usuário **não mude hábito**, e que a autenticidade “viaje” junto com o conteúdo.

Isso se divide em dois “canais” complementares:

### Canal A — Autenticidade via link preview (zero-action puro)

- Você compartilha **um link** (ex.: `/s/[id]`).
- A plataforma mostra um card com “Verified / Not verified / Suspected…”
- Isso é 100% compatível com o comportamento de redes sociais.

Limitação: se alguém salva o vídeo/imagem e repostar **sem link**, o preview não carrega o status.

### Canal B — Autenticidade embutida no media (watermark invisível)

- Você embute uma watermark invisível no arquivo.
- Mesmo após recompressão/resizing (dentro de limites), o verificador consegue extrair.

Limitação: o usuário ainda precisa de algum “verificador”:

- extensão,
- integração no player,
- ou um fluxo automático em plataformas (depende de parceria/integração).

### O que normalmente acontece por tipo de mídia

- **Imagem**
  - Plataformas costumam:
    - redimensionar (ex.: 1080px),
    - recomprimir (JPEG),
    - remover metadata,
    - aplicar leve sharpening/denoise.
  - Para robustez:
    - usar redundância (`repeatPerBit`),
    - usar ROI longe das bordas (evitar crop),
    - tolerância a erro na extração,
    - fingerprint perceptual (dHash) para binding do conteúdo.

- **Vídeo**
  - Reencode quase sempre (bitrate, GOP, resolução).
  - Estratégia típica:
    - watermark em ROI luminance + redundância temporal,
    - fingerprint temporal,
    - verificação tolerante.

- **Áudio**
  - (Se/Quando você implementar) o reencode/transcode (AAC/Opus/MP3) é muito agressivo.
  - Estratégias comuns:
    - watermark espectral/phase,
    - redundância em blocos,
    - tolerância a equalização e compressão.

- **Live**
  - Segmentação + reencode em HLS/DASH.
  - Estratégia:
    - watermark por segmento + cadeia (hash chain) + verificação por janela.

### Meta realista

- **Zero-action imediato**: via link preview (OG image/título) + embeds em páginas web.
- **Autenticidade “viaja com o arquivo”**: watermark invisível para verificação posterior/automatizada.

---

## 8) Explicação dos testes atuais (o que cada um garante)

### `e2e/embeds.spec.ts`

- **Teste: “video embed badge renders on /demo”**
  - Garante:
    - a página carrega,
    - o elemento `[data-phoenix-zero-embed] a` aparece,
    - o texto não fica preso em “verificando…”,
    - existe um `href`.

- **Teste: “image embed badge renders on /image-demo and /image-demo-wm”**
  - Garante:
    - badge de imagem aparece nas duas páginas,
    - e (importante) que `/demo/assets/v2/image-wm.png` retorna **HTTP 200**.
  - Esse check é crítico porque detecta regressão do `sharp`/watermark.

- **Teste: “live embed badge renders on /live-embed-demo (missing jobId)”**
  - Garante:
    - badge renderiza mesmo quando falta `jobId`.

### `e2e/social-preview.spec.ts`

- **Teste: “share link page exposes og tags for multiple social user agents”**
  - Garante:
    - `/api/share-link` gera `shareUrl`,
    - `shareUrl` retorna HTML com `og:title` e `og:image`,
    - `og:image` aponta para `share-card-jpg` ou `share-card-png`,
    - `HEAD` nas imagens responde 200 e `Content-Type` correto.

---

## 9) Tabela comparativa: o que passou vs. próximos testes recomendados

### Status atual (smoke)

| Área | Teste | O que cobre | Status |
|---|---|---|---|
| Embed vídeo | `embeds.spec.ts` /demo | Render básico do badge | Passa |
| Embed imagem | `embeds.spec.ts` /image-demo + /image-demo-wm | Render + asset watermark 200 | Passa (deve falhar se sharp quebrar) |
| Embed live | `embeds.spec.ts` /live-embed-demo | Estado “missing jobId” | Passa |
| Social preview | `social-preview.spec.ts` | OG tags + og:image HEAD | Passa |

### Próximos testes (alto valor)

| Categoria | Novo teste | Por que importa |
|---|---|---|
| Estados do badge | Verificar `verified`, `not_verified`, `suspected_impersonation`, `unregistered_creator` | Garante UX e decisões corretas |
| CORS/Global endpoints | Testar `GET /api/global-auth`, `/api/global-image-auth`, `/api/global-live-auth` com CORS | Garantir embed cross-site |
| Robustez watermark imagem | Pipeline local: resize + recompressão + crop leve e tentar extrair | Simula “reencode” de plataformas |
| Robustez watermark vídeo | Reencode via ffmpeg (bitrates/resoluções) e verificar | Simula upload/download |
| Preview completo por plataforma | Rodar o mesmo teste com **todas** UAs do `platforms.json` (não só 6) | Cobertura mais real |
| Performance | Garantir tempo de resposta de `og:image` abaixo de N ms | Crawlers têm timeout curto |
| Cache behavior | Testar headers `Cache-Control` e consistência de ETag | Reduz inconsistência nos cards |

### Testes fora do Playwright (necessários)

Playwright não consegue reproduzir o reencode real das plataformas. Para isso:

- **Semi-automático**: upload manual → download → `verify-*`.
- **Automatizado com scripts**: onde a plataforma permitir APIs (muitas não permitem).

---

## 10) Interpretação do seu log (`npm run test:e2e`)

Você reportou:

- Os 4 testes “passaram”, porém o servidor logou:
  - `watermark-image: sharp unavailable: require is not defined`

Isso indica que **o smoke test não estava garantindo que o asset watermark realmente gerou 200** (agora ele garante), e que o loader do `sharp` estava errado no contexto do Next bundler.

Correções aplicadas no código:

- Ajuste no `next.config.js`:
  - assinatura de externals no formato novo,
  - `IgnorePlugin` para ignorar `@img/*`,
  - aliases para `@img/sharp-*` como `false`.

- Loader do `sharp`:
  - voltou para `import('sharp')` (compatível com ambiente bundle).

Próximo passo recomendado: rodar novamente `npm run test:e2e` para confirmar que:

- o warning de externals some,
- o erro do `sharp` não aparece,
- e o teste de imagem valida `200` em `/demo/assets/v2/image-wm.png`.

---

## 11) Conclusão (como isso atende “zero-action”)

- **Playwright** valida que:
  - seus cards sociais (OG) existem e são servidos corretamente;
  - seus embeds funcionam no navegador.

- Para “zero-action” em redes sociais:
  - o caminho mais confiável é o **link preview** (OG tags + og:image que comunica autenticidade).

- Para recompartilhamento sem link:
  - watermark invisível permite verificação posterior/automatizada,
  - mas requer um verificador (extensão/player/parceria).
