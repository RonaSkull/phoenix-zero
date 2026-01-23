# Phoenix Zero — Escala Global Sem Plataformas

Este documento descreve a arquitetura, os contratos públicos e a forma de integração para autenticação de conteúdo (vídeo, imagem e live) **sem depender de integrações com plataformas**.

## Objetivo

Entregar um mecanismo universal para que qualquer site, blog, portal ou player consiga:

- exibir um **badge de autenticidade** junto do conteúdo
- obter um resultado verificável (`verified/decision`) por URL
- apontar para uma página de detalhes (`shareUrl`) para auditoria humana

## Componentes (produção)

### 1) API Estável (Proxy)

**Endpoint:** `GET /api/auth-proxy`

Função: fornecer uma interface única e estável para consumo externo, independentemente da complexidade interna do verificador.

Tipos suportados:

- `type=video` com `videoUrl` + `proofUrl`
- `type=image` com `imageUrl` + `proofUrl`
- `type=live` com `jobId`

Resposta normalizada:

- `ok` (boolean)
- `type` (`video|image|live`)
- `verified` (boolean)
- `decision` (string)
- `title` / `hint` (texto curto para UI)
- `shareUrl` (URL de auditoria)
- `creatorId` (quando existir)
- `attestationOk` (quando existir)

Operação:

- CORS liberado para integração cross-domain
- rate-limit simples por IP
- cache TTL em memória (por instância)

Variáveis (server):

- `PHOENIX_ZERO_AUTH_PROXY_RPM` (default `120`) — limite por minuto por IP
- `PHOENIX_ZERO_AUTH_PROXY_TTL_SECONDS` (default `30`) — TTL do cache do proxy

### 2) APIs Globais (Upstream)

As rotas abaixo permanecem como “upstream” interno do proxy:

- `GET /api/global-auth` (vídeo)
- `GET /api/global-image-auth` (imagem)
- `GET /api/global-live-auth` (live)

Elas fazem a verificação chamando os verificadores por URL e geram/retornam `shareUrl`.

### 3) Assets públicos versionados (Embed)

Para permitir cache agressivo em CDN, os scripts são **versionados** e servidos como arquivos estáticos:

- `GET /phoenix-zero-embed.v1.js`
- `GET /phoenix-zero-image-embed.v1.js`
- `GET /phoenix-zero-live-embed.v1.js`

Cada script:

- localiza elementos no DOM por `data-*`
- chama `GET /api/auth-proxy` (CORS)
- renderiza um badge clicável apontando para `shareUrl`

Caching:

- os `.v1.js` são enviados com `Cache-Control: public, max-age=31536000, immutable`

### 4) SDK público (JS)

**Endpoint:** `GET /phoenix-zero-sdk.v1.js`

Exponibiliza:

- `globalThis.PhoenixZeroSDK.createClient({ apiBase, fetch? })`

Métodos:

- `verifyVideoByUrl({ videoUrl, proofUrl, includeUpstream?, signal? })`
- `verifyImageByUrl({ imageUrl, proofUrl, includeUpstream?, signal? })`
- `verifyLiveByJobId({ jobId, includeUpstream?, signal? })`

Todos chamam o endpoint estável `/api/auth-proxy`.

## Integração (site externo)

### Opção A) Embed (sem código)

Vídeo:

```html
<div
  data-phoenix-zero-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-video-url="https://CDN/arquivo.mp4"
  data-proof-url="https://CDN/proof.json"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-embed.v1.js" defer></script>
```

Imagem:

```html
<div
  data-phoenix-zero-image-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-image-url="https://CDN/imagem.png"
  data-proof-url="https://CDN/proof.json"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-image-embed.v1.js" defer></script>
```

Live:

```html
<div
  data-phoenix-zero-live-embed
  data-api-base="https://SEU-DOMINIO-PHOENIXZERO"
  data-job-id="SEU_JOB_ID"
></div>
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-live-embed.v1.js" defer></script>
```

### Opção B) SDK (controle total)

```html
<script src="https://SEU-DOMINIO-PHOENIXZERO/phoenix-zero-sdk.v1.js" defer></script>
<script>
  window.addEventListener('DOMContentLoaded', async () => {
    const client = PhoenixZeroSDK.createClient({ apiBase: 'https://SEU-DOMINIO-PHOENIXZERO' });

    const result = await client.verifyVideoByUrl({
      videoUrl: 'https://CDN/arquivo.mp4',
      proofUrl: 'https://CDN/proof.json'
    });

    console.log(result);
  });
</script>
```

## Requisitos para escala

- Hospedar `videoUrl/imageUrl/proofUrl` em URLs públicas (CDN/obj storage)
- Deploy do Phoenix Zero com HTTPS (recomendado)
- Manter os assets versionados (`*.v1.js`) como imutáveis

## Segurança e limites

- As rotas globais e o proxy operam com CORS liberado para permitir embed.
- O verificador por URL aplica restrições de segurança (bloqueio de URLs privadas/localhost em produção) para mitigar SSRF.

## Referência rápida

- Landing pública (copy/paste): `/global`
- Documento (viewer no web): `/global/doc`
- Demo de validação V1: `/demo/v1`
- Proxy: `/api/auth-proxy`
- Embeds V1: `/phoenix-zero-*-embed.v1.js`
- SDK V1: `/phoenix-zero-sdk.v1.js`
