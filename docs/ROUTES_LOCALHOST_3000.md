# Phoenix Zero — Árvore de Rotas (localhost:3000)

Este documento lista e explica **todas as rotas relevantes** servidas pelo app em desenvolvimento via `http://localhost:3000`.

A ideia é você conseguir olhar para a árvore e entender:

- **Produto/negócio:** o que cada página entrega (ex.: demo, onboarding, compartilhamento, verificação).
- **Contrato público:** quais URLs você divulga para terceiros (ex.: embeds/SDK/API proxy).
- **Parte técnica:** como cada rota funciona (App Router, `route.ts`, runtime, parâmetros, cache/CORS, dependências).
- **Status:** se está **pronta**, **pendente**, ou **iniciada**.

> Convenção de status usada aqui:
>
>- **Pronta:** já tem UI/endpoint funcional e integrado com o resto do sistema.
>- **Iniciada:** funciona parcialmente, ou existe PoC/UI mas não está “produto pronto”.
>- **Pendente:** placeholder/planejado, ou faltando integração/contrato.

---

## 1) Rotas públicas “produto” (Pages)

### `/` (Home — Landing principal do produto)
- **O que é (produto):** **landing page profissional** focada em venda/posicionamento do produto (não deve ser ferramenta de dev).
- **Parte técnica:** `apps/web/src/app/page.tsx`.
  - Hoje ainda contém UI de *stamp/verify* por upload (uso interno).
  - Direção de produto: mover ferramentas internas para uma rota separada (ex.: `/tools`), e manter `/` como landing.
- **Status:** **Pendente** (precisa de redesign + copy + estrutura de landing).

### `/global` (Landing pública — Escala Global)
- **O que é (produto):** landing pública do conceito **“Escala Global (sem plataformas)”** com snippets oficiais (Embed/SDK/API estável).
- **Parte técnica:** `apps/web/src/app/global/page.tsx`.
  - Carrega `Script` com `/phoenix-zero-embed.v1.js`.
  - Mostra blocos copy/paste e links oficiais.
- **Status:** **Pronta**.

### `/global/doc` (Documento dentro do produto)
- **O que é (produto):** página pública que renderiza o documento de arquitetura/integração no navegador.
- **Parte técnica:** `apps/web/src/app/global/doc/page.tsx` (Node runtime).
  - Lê `docs/ESCALA_GLOBAL_SEM_PLATAFORMAS.md` via `fs/promises`.
  - Renderiza em `<pre>`.
- **Status:** **Pronta**.

### `/demo` (Demo básica para extensão / prova estática)
- **O que é (produto):** página de demo simples que serve um `watermarked.mp4` + `proof.json` e um embed não-versionado.
- **Parte técnica:** `apps/web/src/app/demo/page.tsx`.
  - Usa `/demo/assets/v1/watermarked.mp4` e `/demo/assets/v1/proof.json`.
  - Carrega `/phoenix-zero-embed.js` (não versionado).
- **Status:** **Pronta** (mas é “legacy demo”; a demo principal do produto é a V1).

### `/demo/v1` (Demo V1 — oficial para integração global)
- **O que é (produto):** demo técnica com **copy/paste** de integrações (Embed V1 + SDK V1 + curl), cobrindo **vídeo, imagem e live**.
- **Parte técnica:** `apps/web/src/app/demo/v1/page.tsx`.
  - Exercita **assets versionados**:
    - `/phoenix-zero-embed.v1.js`
    - `/phoenix-zero-image-embed.v1.js`
    - `/phoenix-zero-live-embed.v1.js`
    - `/phoenix-zero-sdk.v1.js`
  - Faz chamadas para a API estável `/api/auth-proxy`.
- **Status:** **Pronta**.

### `/verify` (UI de verificação por URL — vídeo)
- **O que é (produto):** UI para colar `videoUrl` e `proofUrl`, rodar verificação, gerar link compartilhável e mostrar “decision/identity”.
- **Parte técnica:** `apps/web/src/app/verify/page.tsx` + `verify-client`.
  - Usa query params:
    - `videoUrl`
    - `proofUrl`
    - `pageUrl` (opcional, contexto)
- **Status:** **Pronta**.

### `/verify-image` (UI de verificação por URL — imagem)
- **O que é (produto):** UI equivalente ao `/verify`, mas para imagens.
- **Parte técnica:** `apps/web/src/app/verify-image/page.tsx` + `verify-image-client`.
  - Query params:
    - `imageUrl`
    - `proofUrl`
    - `pageUrl`
- **Status:** **Pronta**.

### `/verify-image-wm` (UI de verificação por URL — imagem watermarked)
- **O que é (produto):** UI de verificação de imagens *watermarked* (usa endpoint diferente para tolerância/variação).
- **Parte técnica:** `apps/web/src/app/verify-image-wm/page.tsx`.
  - Reusa `verify-image-client` mas aponta:
    - `verifyApiPath="/api/phoenix-zero/verify-image-watermarked-by-url"`
  - Share path ajustado para `/verify-image-wm`.
- **Status:** **Pronta**.

### `/image-demo` (Demo de imagem)
- **O que é (produto):** demo simples que serve imagem + proof e abre `/verify-image` pré-preenchido.
- **Parte técnica:** `apps/web/src/app/image-demo/page.tsx`.
  - Usa assets de `/demo/assets/v1/image.png` + `/demo/assets/v1/image-proof.json`.
  - Carrega embed não-versionado `/phoenix-zero-image-embed.js`.
- **Status:** **Pronta**.

### `/image-demo-wm` (Demo de imagem watermarked)
- **O que é (produto):** demo para imagem *watermarked* (v2 assets) e fluxo `/verify-image-wm`.
- **Parte técnica:** `apps/web/src/app/image-demo-wm/page.tsx`.
  - Usa `/demo/assets/v2/image-wm.png` + `/demo/assets/v2/image-wm-proof.json`.
  - Carrega `/phoenix-zero-image-embed.js`.
- **Status:** **Pronta**.

### `/live-stream` (Console de live / sessão / segmentos)
- **O que é (produto):** console para criar/rodar sessão de live (segmentação, proofs por segmento, resumo e sinais de Q-STEP).
- **Parte técnica:** `apps/web/src/app/live-stream/page.tsx` (client).
  - Orquestra gravação (MediaRecorder), upload/requests para APIs de live.
  - Exibe `jobId`, status, segments, verificação por segmento.
- **Status:** **Iniciada** (considerado **MVP do produto**, ainda precisa “polimento produto”).

### `/live-embed-demo` (Demo do embed de live)
- **O que é (produto):** página para testar o embed de live colando um `jobId`.
- **Parte técnica:** `apps/web/src/app/live-embed-demo/page.tsx`.
  - Renderiza `<div data-phoenix-zero-live-embed ... data-job-id="...">`.
  - Carrega `/phoenix-zero-live-embed.js` (não versionado).
- **Status:** **Pronta** como demo.

### `/live-challenge` (Página de desafio — desativada)
- **O que é (produto):** era uma tela de “challenge” para live; hoje está explicitamente desativada para modo Q-STEP puro.
- **Parte técnica:** `apps/web/src/app/live-challenge/page.tsx`.
  - Apenas lê `jobId` via query e mostra mensagem.
- **Status:** **Pendente** (mantida como fallback/legado; atualmente desativada).

### `/compatibility` (Inspector de social preview / OG tags)
- **O que é (produto):** ferramenta interna para validar como bots de redes sociais enxergam a página (OG tags, og:image, headers).
- **Parte técnica:** `apps/web/src/app/compatibility/page.tsx`.
  - Chama `/api/compatibility?action=platforms` e `/api/compatibility?action=inspect`.
- **Status:** **Pronta** (ferramenta interna).

### `/s/[id]` (Share link público — página de compartilhamento)
- **O que é (produto):** URL curta compartilhável (ex.: em redes sociais) que serve metadata OG + CTA para abrir detalhes.
- **Parte técnica:** `apps/web/src/app/s/[id]/page.tsx`.
  - Implementa `generateMetadata()`:
    - Usa `/api/share-card-jpg?id=...` (OG image)
  - Exibe título/hint e link para `/verify?...`.
- **Status:** **Pronta**.

---

## 2) Assets públicos (contrato de embed/SDK)

Esses arquivos são servidos diretamente do `public/` e ficam disponíveis em `http://localhost:3000/<arquivo>`.

### Embeds não-versionados (**deprecated**)
- **`/phoenix-zero-embed.js`**
  - **Produto:** embed universal (vídeo).
  - **Técnico:** JS que encontra `[data-phoenix-zero-embed]` e chama `/api/global-auth`.
  - **Status:** **Pronta** (**deprecated**; não recomendado para terceiros).

- **`/phoenix-zero-image-embed.js`**
  - **Produto:** embed universal (imagem).
  - **Status:** **Pronta** (**deprecated**).

- **`/phoenix-zero-live-embed.js`**
  - **Produto:** embed de live por `jobId`.
  - **Status:** **Pronta** (**deprecated**).

### Embeds versionados (contrato recomendado para CDN)
- **`/phoenix-zero-embed.v1.js`**
- **`/phoenix-zero-image-embed.v1.js`**
- **`/phoenix-zero-live-embed.v1.js`**
  - **Produto:** contrato público estável para terceiros (cacheável em CDN).
  - **Técnico:** chamam `/api/auth-proxy` e aplicam CORS + cache headers imutáveis (via `next.config.js`).
  - **Status:** **Pronta**.

### SDK versionado
- **`/phoenix-zero-sdk.v1.js`**
  - **Produto:** integração programática (sites/apps) sem depender do embed.
  - **Técnico:** expõe `PhoenixZeroSDK.createClient({ apiBase })` com métodos `verifyVideoByUrl`, `verifyImageByUrl`, `verifyLiveByJobId`.
  - **Status:** **Pronta**.

---

## 3) API pública (contrato “Global Scale Authentication”)

### `GET /api/auth-proxy`
- **Produto:** endpoint estável único para verificação por URL (vídeo/imagem/live), pronto para ser colocado atrás de CDN.
- **Parte técnica:** `apps/web/src/app/api/auth-proxy/route.ts`.
  - **CORS:** `Access-Control-Allow-Origin: *`.
  - **Rate limit (por IP):** default 120 RPM (`PHOENIX_ZERO_AUTH_PROXY_RPM`).
  - **Cache TTL em memória:** default 30s (`PHOENIX_ZERO_AUTH_PROXY_TTL_SECONDS`).
  - **Inputs (query):**
    - `type=video|image|live` (default `video`)
    - `videoUrl` + `proofUrl` (video)
    - `imageUrl` + `proofUrl` (image)
    - `jobId` (live)
    - `includeUpstream=1` (debug)
  - **Output (normalizado):** `{ ok, type, verified, decision, title, hint, shareUrl, creatorId, attestationOk }`.
- **Status:** **Pronta**.

### `GET /api/global-auth`
- **Produto:** verificação “global” de vídeo por URL (gera `shareUrl`).
- **Técnico:** forward interno para `/api/phoenix-zero/verify-by-url`, mapeia decisão, cria share em `/s/[id]`.
- **Status:** **Pronta** (mas o **contrato recomendado** é `/api/auth-proxy`).

### `GET /api/global-image-auth`
- **Produto:** verificação “global” de imagem por URL.
- **Técnico:** tenta `/api/phoenix-zero/verify-image-by-url` e tem fallback para watermarked (gera `shareUrl` em `/verify-image` ou `/verify-image-wm`).
- **Status:** **Pronta** (mas o recomendado é `/api/auth-proxy`).

### `GET /api/global-live-auth`
- **Produto:** verificação “global” de live por `jobId`.
- **Técnico:** consulta `/api/live-stream` e mapeia para card (`verified/decision/title/hint`).
- **Status:** **Pronta** (mas o recomendado é `/api/auth-proxy`).

---

## 4) API Phoenix Zero (núcleo: stamp/verify)

### `POST /api/phoenix-zero/stamp`
- **Produto:** gera `proof.json` e `proofCompact` para um vídeo enviado por upload.
- **Técnico:** usa `@phoenix-zero/core` para criar proof e assinar.
  - Entrada multipart: `video`, opcional `creatorId`, opcional `privateKeyB64Url`.
- **Status:** **Pronta**.

### `POST /api/phoenix-zero/stamp-watermarked`
- **Produto:** gera watermark invisível em vídeo + `proof.json` (híbrido) e retorna um ZIP.
- **Técnico:** `apps/web/src/app/api/phoenix-zero/stamp-watermarked/route.ts`.
  - Entrada multipart:
    - `video` (mp4)
    - `mode=compat|strict`
    - `creatorId` (opcional)
    - `platform` (opcional) e/ou `presetId` (opcional)
    - `privateKeyB64Url` (opcional; fallback via env/arquivo)
  - Saída: `application/zip` com:
    - `watermarked.mp4`
    - `proof.json`
  - Internamente usa:
    - `selectWatermarkedPreset()`
    - `embedInvisibleWatermark()`
    - `extractTemporalFingerprintFromVideoPath()`
    - `createHybridSignature()`
- **Status:** **Pronta**.

### `POST /api/phoenix-zero/verify`
- **Produto:** valida um vídeo enviado por upload contra uma proof (`proof` ou `proofCompact`).
- **Técnico:** valida assinatura e vínculos via `verifyPhoenixZeroProof()`.
- **Status:** **Pronta**.

### `POST /api/phoenix-zero/verify-watermarked`
- **Produto:** verifica vídeo *watermarked* por upload, usando `proof.json` (v3) e retornando detalhes de watermark/temporal.
- **Técnico:** `apps/web/src/app/api/phoenix-zero/verify-watermarked/route.ts`.
  - Entrada multipart:
    - `video`
    - `proof` (string/file) ou `proofCompact`
    - `platform` (opcional)
    - `wmThreshold` / `wmSearchWindow` (opcional)
  - Verifica:
    - assinatura híbrida (`verifyHybridSignature`)
    - watermark (com janela de busca)
    - fingerprint temporal (MAD threshold)
- **Status:** **Pronta**.

### `GET /api/phoenix-zero/verify-by-url`
- **Produto:** verificação completa por URL (vídeo + proof), incluindo watermark invisível, fingerprint temporal, identidade/registro e auditoria antifraude.
- **Técnico:** baixa recursos por URL com proteções anti-SSRF; extrai watermark e fingerprint; calcula decisão e retorna JSON detalhado.
- **Status:** **Pronta** (é o “motor” de vídeo por URL).

### `POST /api/phoenix-zero/stamp-image`
- **Produto:** gera proof para imagem enviada por upload.
- **Técnico:** reutiliza `createPhoenixZeroProof` tratando bytes da imagem como `videoBytes` (modelo unificado).
- **Status:** **Pronta**.

### `POST /api/phoenix-zero/stamp-image-watermarked`
- **Produto:** gera imagem watermarked + `proof.json` (v4) e retorna um ZIP.
- **Técnico:** `apps/web/src/app/api/phoenix-zero/stamp-image-watermarked/route.ts`.
  - Entrada multipart:
    - `image`
    - `mode=compat|strict`
    - `creatorId` (opcional)
    - `privateKeyB64Url` (opcional; fallback via env/arquivo)
  - Saída: `application/zip` com:
    - `watermarked.png` ou `watermarked.jpg`
    - `proof.json`
  - Internamente usa watermark em grid (`grid_luma_delta_v1`) + `dhash_v1`.
- **Status:** **Pronta**.

### `GET /api/phoenix-zero/verify-image-by-url`
- **Produto:** verifica imagem por URL + proof.
- **Técnico:** proteções anti-SSRF + valida proof + identidade.
- **Status:** **Pronta**.

### `POST /api/phoenix-zero/verify-image-watermarked`
- **Produto:** verifica imagem watermarked por upload (com tolerância a bit errors e fingerprint opcional).
- **Técnico:** `apps/web/src/app/api/phoenix-zero/verify-image-watermarked/route.ts`.
  - Entrada multipart:
    - `image`
    - `proof` (string/file) ou `proofCompact`
  - Checa:
    - assinatura híbrida
    - watermark (aceita `bestBitErrors <= maxBitErrors`)
    - fingerprint `dhash` (se presente na proof)
- **Status:** **Pronta**.

### `POST /api/phoenix-zero/verify-image-watermarked-by-url`
- **Produto:** verifica imagem watermarked por URL com identidade/registro/attestation.
- **Técnico:** `apps/web/src/app/api/phoenix-zero/verify-image-watermarked-by-url/route.ts`.
  - Entrada JSON: `{ imageUrl, proofUrl }`
  - Proteções anti-SSRF (sem redirects, bloqueio de rede privada em prod).
  - Retorna `decision`, `identity`, `fraud`, `attestation`, `registry`, e detalhes de watermark/fingerprint.
- **Status:** **Pronta**.

> Existem também rotas `*-watermarked` e outras variantes; elas entram na árvore, mas são mais “técnicas internas” do que contrato público.

---

## 5) API de compartilhamento / OG image / social

### `POST /api/share-link`
- **Produto:** cria link compartilhável curto (`/s/[id]`) a partir de `videoUrl` + `proofUrl`.
- **Técnico:** cria registro + tenta atualizar cache com resultado de verificação para gerar card consistente.
- **Status:** **Pronta**.

### `GET /api/share-card?id=...` (SVG)
- **Produto:** gera OG image em SVG para o link `/s/[id]`.
- **Técnico:** constrói SVG com título/hint/creator e cache forte (1 dia + SWR).
- **Status:** **Pronta**.

### `GET /api/share-card-data?id=...` (JSON)
- **Produto:** endpoint auxiliar (dados) usado pelos renderizadores de OG image.
- **Técnico:** `apps/web/src/app/api/share-card-data/route.ts`.
  - Retorna `{ title, hint, creator, bg, decision, verified }`.
- **Status:** **Pronta**.

### `GET /api/share-card-jpg?id=...` (JPEG)
- **Produto:** OG image JPG para plataformas que preferem imagem raster.
- **Técnico:** renderiza SVG -> JPG via `sharp`.
- **Status:** **Pronta**.

### `GET /api/share-card-png?id=...` (PNG)
- **Produto:** OG image PNG (via `next/og`) para compatibilidade.
- **Técnico:** `apps/web/src/app/api/share-card-png/route.ts` (runtime `edge`).
  - Busca dados via `/api/share-card-data`.
  - Gera imagem com `ImageResponse`.
- **Status:** **Pronta**.

---

## 5.1) API de compatibilidade (ferramentas)

### `GET /api/compatibility`
- **Produto:** backend da página `/compatibility`.
- **Técnico:** `apps/web/src/app/api/compatibility/route.ts`.
  - Ações via query:
    - `action=platforms` → lista UAs de bots/plataformas
    - `action=makeShare` → cria um share link do demo (retorna `id`, `shareUrl`, `ogImageJpg`, `ogImagePng`)
    - `action=inspect&id=...&ua=...` → faz fetch do HTML de `/s/[id]` e extrai OG tags + HEAD dos `og:image`
- **Status:** **Pronta**.

---

## 5.2) API de Live (sessões / ingest / Q-STEP)

### `GET /api/live-stream`
- **Produto:** consulta status de uma sessão de live (para UI e para `/api/global-live-auth`).
- **Técnico:** `apps/web/src/app/api/live-stream/route.ts`.
  - Query params principais:
    - `jobId` (opcional; sem ele lista jobs em memória)
    - `tail=N` (default 6) → retorna resumo + últimos segmentos
    - `full=1` → retorna job completo
    - `qstep=1` → retorna relatório de cadeia Q-STEP
    - `download=job|video|proof&index=N` → baixa JSON/MP4/proof de um segmento
- **Status:** **Pronta** (backend funcional, mas a “experiência produto” de live é **Iniciada**).

### `POST /api/live-stream`
- **Produto:** cria sessão e/ou ingere segmentos (fluxo de live).
- **Técnico:** `apps/web/src/app/api/live-stream/route.ts`.
  - Suporta JSON (`Content-Type: application/json`) com ações:
    - `action=start-webcam` → cria job + retorna `jobId` + `ingestToken`
    - `action=segment-telemetry` → telemetria de upload por segmento
    - `action=finish` → sinaliza finalização (requer `ingestToken`)
    - `action=cancel` → cancela job (requer `ingestToken`)
  - Suporta multipart (`multipart/form-data`) com ações:
    - `action=start` + `video` → inicia sessão a partir de arquivo e segmenta no servidor
    - `action=append` + `segment` → envia segmento gravado no cliente (requer `ingestToken`)
- **Status:** **Pronta** (API), **Iniciada** (produto/UX).

---

## 5.3) APIs admin (somente dev)

### `GET|POST /api/admin/registry`
- **Produto:** manutenção/inspeção da assinatura do creator registry (dev-only).
- **Técnico:** `apps/web/src/app/api/admin/registry/route.ts`.
  - Bloqueia em produção.
  - Pode exigir header `x-admin-token` se `PHOENIX_ZERO_ADMIN_TOKEN` estiver setado.
  - Query:
    - `what=status|signature|verify|log`
    - `action=publish` (POST)
- **Status:** **Pronta** (ferramenta interna).

### `GET|POST /api/admin/fraud`
- **Produto:** inspeção de eventos de fraude e manutenção de watchlist (dev-only).
- **Técnico:** `apps/web/src/app/api/admin/fraud/route.ts`.
  - Bloqueia em produção.
  - Pode exigir header `x-admin-token`.
  - Query:
    - `what=events|watchlist`
    - `limit=N`
- **Status:** **Pronta** (ferramenta interna).

---

## 6) Rotas de assets de demo (arquivos servidos como endpoints)

Essas rotas existem para você ter URLs estáveis em demo sem precisar de storage externo.

### Assets “legacy”
- **`/demo/watermarked.mp4`**
- **`/demo/proof.json`**

### Assets V1
- **`/demo/assets/v1/watermarked.mp4`**
- **`/demo/assets/v1/proof.json`**
- **`/demo/assets/v1/image.png`**
- **`/demo/assets/v1/image-proof.json`**

### Assets V2 (imagem watermarked)
- **`/demo/assets/v2/watermarked.mp4`**
- **`/demo/assets/v2/proof.json`**
- **`/demo/assets/v2/image-wm.png`**
- **`/demo/assets/v2/image-wm-proof.json`**

**Status:** **Pronta**.

---

## 7) Árvores (visão rápida)

### Produto (externo)
- `/` (Home — landing principal)
- `/global`
- `/global/doc`
- `/demo/v1`
- `/s/[id]`
- `/phoenix-zero-*.v1.js`
- `/phoenix-zero-sdk.v1.js`
- `/api/auth-proxy`

### Produto (interno / ferramentas)
- (futuro) `/tools` (stamp/verify por upload)
- `/verify`, `/verify-image`, `/verify-image-wm`
- `/demo`, `/image-demo`, `/image-demo-wm`
- `/compatibility`
- `/live-stream`, `/live-embed-demo`, `/live-challenge`

---

## 8) Decisões de produto (confirmadas)

1) **Home `/`**: vira landing profissional do produto.
2) **Embeds não-versionados**: **deprecated** (manter apenas para compatibilidade interna; recomendar somente `*.v1.js`).
3) **Live**: faz parte do produto (**MVP**).
