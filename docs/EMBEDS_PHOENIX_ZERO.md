# Phoenix Zero — Embeds e SDK (legado vs v1)

Este documento descreve **todos os arquivos públicos de integração** servidos em `http://localhost:3000/` (pasta `apps/web/public/`), explicando:

- O que cada um é (produto/uso)
- Como integrar (HTML mínimo e atributos)
- Qual endpoint cada um chama
- Status e recomendação oficial
- Riscos do legado e como migrar

---

## 1) Inventário completo (arquivos públicos)

Local: `apps/web/public/`

### 1.1) Legado (não-versionado) — **DEPRECATED**

- `/phoenix-zero-embed.js`
- `/phoenix-zero-image-embed.js`
- `/phoenix-zero-live-embed.js`

### 1.2) Contrato público (versionado) — **RECOMENDADO**

- `/phoenix-zero-embed.v1.js`
- `/phoenix-zero-image-embed.v1.js`
- `/phoenix-zero-live-embed.v1.js`
- `/phoenix-zero-sdk.v1.js`

---

## 2) Decisão de produto (recomendação oficial)

- **Use somente `.v1.js` em integrações externas**.
- Os scripts **não-versionados** existem apenas para compatibilidade interna/legada e devem ser tratados como **deprecated**.

Motivos (do ponto de vista produto/segurança/clareza):

- **Clareza de contrato:** `.v1.js` define um “ponto estável” (API única via `/api/auth-proxy`).
- **Menos superfície de risco:** legado chama endpoints antigos (`/api/global-*`) e facilita drift de comportamento.
- **Cache/CDN e auditoria:** versões permitem cache imutável e rollouts controlados.

---

## 3) Como os Embeds funcionam (conceito)

Todos os embeds funcionam assim:

- Você coloca um `div` com atributos `data-*` com as URLs (vídeo/imagem/proof) ou `jobId` (live).
- Você inclui um `<script src="...">` que:
  - Encontra os elementos no DOM por seletor
  - Chama a API
  - Renderiza um “badge” (`<a>`) dentro do `div`
  - Linka o badge para um `shareUrl` quando disponível

---

## 4) Embed de Vídeo

### 4.1) **RECOMENDADO** — `/phoenix-zero-embed.v1.js`

- **Seletor do DOM:** `[data-phoenix-zero-embed]`
- **Atributos suportados:**
  - `data-video-url` (obrigatório)
  - `data-proof-url` (obrigatório)
  - `data-api-base` (opcional; default `window.location.origin`)
- **API chamada:**
  - `GET {apiBase}/api/auth-proxy?type=video&videoUrl=...&proofUrl=...`
- **Render:** badge com estado visual (verificado / suspeito / não verificado)
- **Link:** quando o backend retorna `shareUrl`, o badge vira link
- **Status:** **Pronto (contrato público)**

HTML mínimo:

```html
<div
  data-phoenix-zero-embed
  data-api-base="https://SEU_DOMINIO"
  data-video-url="https://cdn.exemplo.com/video.mp4"
  data-proof-url="https://cdn.exemplo.com/proof.json"
></div>
<script src="https://SEU_DOMINIO/phoenix-zero-embed.v1.js" defer></script>
```

### 4.2) **DEPRECATED** — `/phoenix-zero-embed.js`

- **Seletor do DOM:** `[data-phoenix-zero-embed]`
- **Atributos suportados:**
  - `data-video-url`, `data-proof-url`, `data-api-base`
- **API chamada:**
  - `GET {apiBase}/api/global-auth?videoUrl=...&proofUrl=...`
- **Status:** **Pronto, mas deprecated**

Risco principal do legado:

- Não força o uso do contrato estável `/api/auth-proxy`.

---

## 5) Embed de Imagem

### 5.1) **RECOMENDADO** — `/phoenix-zero-image-embed.v1.js`

- **Seletor do DOM:** `[data-phoenix-zero-image-embed]`
- **Atributos suportados:**
  - `data-image-url` (obrigatório)
  - `data-proof-url` (obrigatório)
  - `data-api-base` (opcional)
- **API chamada:**
  - `GET {apiBase}/api/auth-proxy?type=image&imageUrl=...&proofUrl=...`
- **Status:** **Pronto (contrato público)**

HTML mínimo:

```html
<div
  data-phoenix-zero-image-embed
  data-api-base="https://SEU_DOMINIO"
  data-image-url="https://cdn.exemplo.com/image.png"
  data-proof-url="https://cdn.exemplo.com/image-proof.json"
></div>
<script src="https://SEU_DOMINIO/phoenix-zero-image-embed.v1.js" defer></script>
```

### 5.2) **DEPRECATED** — `/phoenix-zero-image-embed.js`

- **Seletor do DOM:** `[data-phoenix-zero-image-embed]`
- **API chamada:**
  - `GET {apiBase}/api/global-image-auth?imageUrl=...&proofUrl=...`
- **Status:** **Pronto, mas deprecated**

---

## 6) Embed de Live

### 6.1) **RECOMENDADO** — `/phoenix-zero-live-embed.v1.js`

- **Seletor do DOM:** `[data-phoenix-zero-live-embed]`
- **Atributos suportados:**
  - `data-job-id` (obrigatório)
  - `data-api-base` (opcional)
  - Também aceita `data-live-job-id` (fallback)
- **API chamada:**
  - `GET {apiBase}/api/auth-proxy?type=live&jobId=...`
- **Status:** **Pronto (contrato público)**

HTML mínimo:

```html
<div
  data-phoenix-zero-live-embed
  data-api-base="https://SEU_DOMINIO"
  data-job-id="SEU_JOB_ID"
></div>
<script src="https://SEU_DOMINIO/phoenix-zero-live-embed.v1.js" defer></script>
```

### 6.2) **DEPRECATED** — `/phoenix-zero-live-embed.js`

- **Seletor do DOM:** `[data-phoenix-zero-live-embed]`
- **Atributos suportados:** `data-job-id` (ou `data-live-job-id`), `data-api-base`
- **API chamada:**
  - `GET {apiBase}/api/global-live-auth?jobId=...`
- **Status:** **Pronto, mas deprecated**

---

## 7) SDK (programático)

### 7.1) **RECOMENDADO** — `/phoenix-zero-sdk.v1.js`

- **O que é:** SDK para usar via JS (sem embed) com chamadas diretas ao contrato.
- **Global exposto:** `globalThis.PhoenixZeroSDK`
- **Factory:** `PhoenixZeroSDK.createClient({ apiBase, fetch })`
- **Métodos:**
  - `verifyVideoByUrl({ videoUrl, proofUrl, includeUpstream, signal })`
  - `verifyImageByUrl({ imageUrl, proofUrl, includeUpstream, signal })`
  - `verifyLiveByJobId({ jobId, includeUpstream, signal })`
- **API chamada:** sempre `/api/auth-proxy`.

Exemplo mínimo:

```html
<script src="https://SEU_DOMINIO/phoenix-zero-sdk.v1.js"></script>
<script>
  const client = PhoenixZeroSDK.createClient({ apiBase: 'https://SEU_DOMINIO' })
  client.verifyVideoByUrl({
    videoUrl: 'https://cdn.exemplo.com/video.mp4',
    proofUrl: 'https://cdn.exemplo.com/proof.json'
  }).then(console.log)
</script>
```

---

## 8) Migração (legado -> v1)

### 8.1) Vídeo

- Troque:
  - `src="/phoenix-zero-embed.js"`
- Por:
  - `src="/phoenix-zero-embed.v1.js"`

E garanta que seu backend/host expõe:

- `/api/auth-proxy` com CORS para o domínio que embeda

### 8.2) Imagem

- Troque:
  - `src="/phoenix-zero-image-embed.js"`
- Por:
  - `src="/phoenix-zero-image-embed.v1.js"`

### 8.3) Live

- Troque:
  - `src="/phoenix-zero-live-embed.js"`
- Por:
  - `src="/phoenix-zero-live-embed.v1.js"`

---

## 9) Notas de contrato (o que o embed espera do backend)

- O embed espera JSON com `ok: true`.
- Para o estado “verde”, o `v1` usa principalmente `verified === true`.
- Para “suspected”, mapeia `decision === 'suspected_impersonation'`.
- Se houver `shareUrl`, o badge vira um link clicável.
