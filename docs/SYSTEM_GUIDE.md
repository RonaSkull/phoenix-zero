# Phoenix Zero — Guia do Sistema (Web + Extensão)

## 1) Como rodar (Windows)

### 1.1 Pré-requisitos

- Node.js + npm instalados
- (Recomendado) ffmpeg disponível no PATH (o projeto também usa `ffmpeg-static`/`ffprobe-static` em scripts)

### 1.2 Instalar dependências

No diretório raiz do repo:

```powershell
npm install
```

### 1.3 Subir o Web App (Next.js)

No diretório raiz do repo:

```powershell
npm run dev:web
```

Isso inicia o Next.js em `http://localhost:3000`.

> Observação: `npm run dev` no diretório raiz **não existe** (o script correto é `dev:web`).

## 2) Páginas do Web App

Base URL (dev): `http://localhost:3000`

- `/`
  - Página principal (UI de dev) para testar stamp/verify via upload.

- `/demo`
  - Página simples para testar a extensão.
  - Serve:
    - vídeo: `/demo/watermarked.mp4`
    - prova: `/demo/proof.json`
  - Também inclui um exemplo do **embed universal** (badge automático no site) usando o script `/phoenix-zero-embed.js`.

- `/demo/v1`
  - Demo V1 para validar **embeds versionados** (`*.v1.js`) e **SDK V1**.
  - Inclui blocos copy/paste (embed/SDK/curl) e validação direta via `/api/auth-proxy`.

- `/global`
  - Landing pública (copy/paste oficial) para integração de terceiros.

- `/global/doc`
  - Visualizador do documento: `docs/ESCALA_GLOBAL_SEM_PLATAFORMAS.md`.

- `/verify`
  - Verificador para consumidor por URL.
  - Aceita query params:
    - `videoUrl`: URL pública do vídeo
    - `proofUrl`: URL pública do `proof.json`
    - `pageUrl` (opcional): URL de origem (para exibir link “Voltar”)

- `/live-stream`
  - Página de live (modo webcam) usada para testes do pipeline de segments, Q-STEP, watermark e prova.

- `/live-challenge`
  - Página de challenge (se existir no fluxo do live).

## 3) APIs (Next.js App Router)

As rotas estão em `apps/web/src/app/api/**/route.ts`.

### 3.1 Phoenix Zero

#### `POST /api/phoenix-zero/stamp`

- **Objetivo**: gerar prova (sem watermark) a partir de um vídeo.
- **Entrada**: `multipart/form-data`
  - `video` (File)
  - `creatorId` (string, opcional)
  - `privateKeyB64Url` (string, opcional) ou `PHOENIX_ZERO_PRIVATE_KEY_B64URL`
- **Saída**: JSON `{ ok, proof, proofCompact, proofId }`

#### `POST /api/phoenix-zero/stamp-watermarked`

- **Objetivo**: embedar watermark invisível + gerar prova híbrida (Ed25519 + opcional PQ) e retornar um ZIP.
- **Entrada**: `multipart/form-data`
  - `video` (File)
  - `mode` (`compat` | `strict`, default `compat`)
  - `creatorId` (string, opcional)
  - `platform` (string, opcional)
  - `presetId` (string, opcional)
  - `privateKeyB64Url` (string, opcional)
- **Saída**: ZIP com:
  - `watermarked.mp4`
  - `proof.json`

#### `POST /api/phoenix-zero/verify`

- **Objetivo**: verificar prova (sem watermark) a partir de upload.
- **Entrada**: `multipart/form-data`
  - `video` (File)
  - `proofCompact` (string, opcional) **ou** `proof` (string JSON / file)
- **Saída**: JSON (status 200 se `ok=true`, senão 400)

#### `POST /api/phoenix-zero/verify-watermarked`

- **Objetivo**: verificar watermark + fingerprint temporal + assinatura híbrida via upload.
- **Entrada**: `multipart/form-data`
  - `video` (File)
  - `proofCompact` (string, opcional) **ou** `proof` (string JSON / file)
  - `platform` (string, opcional)
  - `wmThreshold` (number string, opcional)
  - `wmSearchWindow` (number string, opcional)
- **Saída**: JSON com blocos `signature`, `watermark`, `temporal` (status 200 se `ok=true`, senão 400)

#### `POST /api/phoenix-zero/verify-by-url`

- **Objetivo**: verificação por URLs (fluxo do consumidor/extensão).
- **Entrada**: JSON `{ videoUrl, proofUrl, platform?, wmThreshold?, wmSearchWindow? }`
- **Saída**: JSON com:
  - `ok`
  - `decision` (consumer): `verified` | `verified_unregistered_creator` | `suspected_impersonation` | `not_verified`
  - `identity` (registry): status e chaves comparadas
  - `fraud` (watchlist): `{ blocked, reasons }`
  - `attestation` (issuer): status do atestado do emissor (dual-auth)
  - `meta` (inclui `creatorId`, `createdAt`, `preset`, `videoUrl`, `proofUrl`)
  - `signature`, `watermark`, `temporal`

**SSRF/Safety**:
- bloqueia URLs privadas/localhost em produção
- em dev, localhost é permitido
- env: `PHOENIX_ZERO_VERIFY_URL_ALLOW_LOCALHOST=1` para permitir localhost (se necessário)

Exemplo (PowerShell):

```powershell
$body = @{ videoUrl = "http://localhost:3000/demo/watermarked.mp4"; proofUrl = "http://localhost:3000/demo/proof.json" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/phoenix-zero/verify-by-url -ContentType "application/json" -Body $body
```

### 3.2 Global Auth (sem plataformas)

#### `GET /api/global-auth` (vídeo)

- **Objetivo**: fornecer um endpoint público e estável para sites/blogs renderizarem um badge de autenticidade via embed.
- **Entrada**: query params:
  - `videoUrl` (string)
  - `proofUrl` (string)
- **Saída**: JSON com:
  - `ok` (sempre `true` quando a rota responde normalmente)
  - `verified` (boolean)
  - `decision` (string)
  - `title` / `hint` (texto curto para UI)
  - `creatorId` (opcional)
  - `attestationOk` (boolean)
  - `shareUrl` (link para detalhes em `/s/{id}`)

Observações:

- A rota chama internamente `POST /api/phoenix-zero/verify-by-url`.
- Ela cria um `shareId` e atualiza o cache em `tmp/share-links.json` (mesmo mecanismo do Link Preview).
- **CORS**: `Access-Control-Allow-Origin: *` para permitir embed em outros domínios.

Exemplo (PowerShell):

```powershell
$base = "http://localhost:3000"
$video = "$base/demo/watermarked.mp4"
$proof = "$base/demo/proof.json"
Invoke-RestMethod -Uri "$base/api/global-auth?videoUrl=$([uri]::EscapeDataString($video))&proofUrl=$([uri]::EscapeDataString($proof))"
```

#### `GET /api/global-image-auth` (imagem)

- **Objetivo**: endpoint público e estável para sites/blogs renderizarem um badge de autenticidade de **imagem** via embed.
- **Entrada**: query params:
  - `imageUrl` (string)
  - `proofUrl` (string)
- **Saída**: JSON com:
  - `ok` (sempre `true` quando a rota responde normalmente)
  - `verified` (boolean)
  - `decision` (string)
  - `title` / `hint` (texto curto para UI)
  - `creatorId` (opcional)
  - `shareUrl` (link para detalhes em `/verify-image` ou `/verify-image-wm`)

Observações:

- A rota chama internamente `POST /api/phoenix-zero/verify-image-by-url` e, se não verificar, tenta `POST /api/phoenix-zero/verify-image-watermarked-by-url`.
- **CORS**: `Access-Control-Allow-Origin: *` para permitir embed em outros domínios.

Exemplo (PowerShell):

```powershell
$base = "http://localhost:3000"
$image = "$base/demo/assets/v2/image-wm.png"
$proof = "$base/demo/assets/v2/image-wm-proof.json"
Invoke-RestMethod -Uri "$base/api/global-image-auth?imageUrl=$([uri]::EscapeDataString($image))&proofUrl=$([uri]::EscapeDataString($proof))"
```

#### `GET /api/global-live-auth` (live)

- **Objetivo**: endpoint público e estável para sites/blogs renderizarem um badge de status de **live** via embed.
- **Entrada**: query params:
  - `jobId` (string)
- **Saída**: JSON com:
  - `ok` (sempre `true` quando a rota responde normalmente)
  - `verified` (boolean)
  - `decision` (string)
  - `title` / `hint` (texto curto para UI)
  - `shareUrl` (link para detalhes em `/live-stream?jobId=...`)

Exemplo (PowerShell):

```powershell
$base = "http://localhost:3000"
$jobId = "SEU_JOB_ID"
Invoke-RestMethod -Uri "$base/api/global-live-auth?jobId=$([uri]::EscapeDataString($jobId))"
```

### 3.3 Live Stream

#### `GET /api/live-stream` e `POST /api/live-stream`

- **Objetivo**: pipeline de live-stamping/verify por segmentos.
- **Features implementadas**:
  - ingestToken por job (POST state-changing exige token)
  - rate-limit leve e contadores de uso por job
  - processamento de segments (watermark + fingerprint + assinatura + verificação)
  - Q-STEP (passivo): score e cadeia por segmento (visível no status do job)

Q-STEP report (dev/diagnóstico):

- `GET /api/live-stream?jobId=...&qstep=1`
  - revalida a cadeia e retorna diagnóstico por segmento (`chainOk`, `segmentHashOk`, score recomputado)

## 4) Extensão Chrome (Consumer Verification)

Pasta: `consumer-verification/extension`

### 4.1 Instalar em modo dev

1. Abra `chrome://extensions`
2. Ative **Developer mode**
3. Clique em **Load unpacked**
4. Selecione a pasta:
   - `d:\redessociaisvideo3s\consumer-verification\extension`

### 4.2 Teste rápido

1. Suba o web app (`npm run dev:web`)
2. Abra:
   - `http://localhost:3000/demo`
3. O badge deve aparecer e a extensão deve conseguir abrir `/verify` pré-preenchido.

### 4.3 Recarregar quando mudar o código

- `chrome://extensions` → **Reload** na extensão
- Recarregue a página (recomendado: hard refresh)

## 5) Scripts úteis (raiz)

- `npm run dev:web` — sobe o web app
- `npm run keygen` — gera chave Ed25519
- `npm run pq:keygen` — gera chave PQ (SPHINCS)
- `npm run stamp:wm` — stamp watermark via script
- `npm run verify:wm` — verify watermark via script
- `npm run test:platforms` — roda testes em plataformas (PowerShell)

## 6) Identidade + Anti-Fraude (implementado)

Arquivos/estruturas:

- `keys/creator-registry.json` — mapeia `creatorId` → chaves públicas (Ed25519 e opcional PQ)
- `keys/creator-registry.signature.json` — assinatura do registry (publicada pelo admin)
- `keys/creator-registry.transparency.jsonl` — transparency log (append-only) de publicações
- `keys/phoenix-zero-registry-authority-ed25519.json` — chave da “autoridade do registry” (dev)
- `keys/fraud-watchlist.json` — lista de bloqueio (creatorId/chaves)
- `keys/phoenix-zero-issuer-ed25519.json` — chave do emissor (dev) para `issuerAttestation`
- `apps/web/tmp/fraud-events.jsonl` — trilha de auditoria (eventos suspeitos)

Comportamento:

- `verify-by-url` agora retorna `decision`/`identity`/`fraud`/`attestation`.
- Se houver conflito com registry (mismatch) ou bloqueio na watchlist, `decision` vira `suspected_impersonation`.

Issuer Attestation (dual-auth) opcional:

- `stamp-watermarked` inclui `issuerAttestation` no `proof.json` quando a chave do emissor estiver disponível.
- `verify-by-url` valida o atestado e retorna `attestation.present` / `attestation.ok`.
- Envs:
  - `PHOENIX_ZERO_ISSUER_PRIVATE_KEY_B64URL` (força chave do emissor)
  - `PHOENIX_ZERO_TRUSTED_ISSUER_PUBLIC_KEY_B64URL` (fixa qual emissor é confiável)
  - `PHOENIX_ZERO_REQUIRE_ISSUER_ATTESTATION=1` (exige atestado para considerar `ok=true`)

Enforcement opcional na emissão (anti-fraude no stamp):

- Env: `PHOENIX_ZERO_ENFORCE_CREATOR_REGISTRY=1`
  - Se a prova for gerada com `creatorId` que existe no registry, o servidor exige que a chave de assinatura corresponda ao registry.
  - No `stamp-watermarked`, se o registry também tiver `pqPublicKeyB64Url`, o servidor exige PQ correspondente.

Admin (dev-only):

- `GET /api/admin/fraud?what=events&limit=50` — lista últimos eventos (lê `tmp/fraud-events.jsonl`)
- `GET /api/admin/fraud?what=watchlist` — lê a watchlist
- `POST /api/admin/fraud?what=watchlist` — atualiza a watchlist

Registry assinado (B):

- `POST /api/admin/registry?action=publish` — gera/atualiza `creator-registry.signature.json` e adiciona uma linha no transparency log
- `GET /api/admin/registry?what=verify` — valida assinatura vs registry atual
- `GET /api/admin/registry?what=log&limit=50` — lê tail do transparency log

Env:

- `PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY=1`
  - exige que o registry esteja assinado e válido
  - `verify-by-url` retorna 503 se a assinatura estiver ausente/inválida
  - `stamp`/`stamp-watermarked` também podem falhar fechado quando `PHOENIX_ZERO_ENFORCE_CREATOR_REGISTRY=1`
- `PHOENIX_ZERO_TRUSTED_REGISTRY_PUBLIC_KEY_B64URL` (opcional)
  - fixa qual chave pública é confiável para assinar o registry

Seguranca minima:

- Em produção a rota retorna 404.
- Se `PHOENIX_ZERO_ADMIN_TOKEN` estiver setado, o cliente precisa enviar header `x-admin-token`.

## 7) Zero-ação via Link Preview (PoC)

Objetivo: permitir que o consumidor veja um selo **no preview do chat** (WhatsApp/Telegram/iMessage) sem instalar extensão/app.

Isso não verifica um arquivo enviado como anexo (E2EE); em vez disso, troca o formato do compartilhamento para um link que já carrega o resultado da verificação.

Endpoints:

- `POST /api/share-link`
  - body: `{ "videoUrl": "...", "proofUrl": "..." }`
  - cria um ID curto e retorna `shareUrl` no formato `/s/{id}`
  - executa `verify-by-url` server-side e cacheia um resumo para o preview

- `GET /s/{id}`
  - página de compartilhamento
  - expõe OpenGraph/Twitter metadata (preview automático)

- `GET /api/share-card?id={id}`
  - gera uma imagem (SVG) usada no preview

- `GET /api/share-card-png?id={id}`
  - gera uma imagem (PNG) para OpenGraph via `ImageResponse`
  - alguns crawlers/apps (ex: WhatsApp) tendem a ser mais compatíveis com PNG/JPG do que SVG

Teste local (dev):

1. Suba o web (`npm run dev:web`)
2. Gere um link com o demo:
   - `videoUrl = http://localhost:3000/demo/watermarked.mp4`
   - `proofUrl = http://localhost:3000/demo/proof.json`
3. `POST /api/share-link` e copie o `shareUrl`
4. Abra `shareUrl` no navegador

Exemplo PowerShell (dev):

```powershell
$base = "http://localhost:3000"
$body = @{ videoUrl = "$base/demo/watermarked.mp4"; proofUrl = "$base/demo/proof.json" } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri "$base/api/share-link" -ContentType "application/json" -Body $body
$resp
Start-Process $resp.shareUrl
```

Validar se o HTML está saindo com OG tags (no browser ou via curl):

```powershell
curl.exe -s $resp.shareUrl | Select-String -Pattern "og:image|og:title|twitter:image" | Select-Object -First 20
```

### 7.1 Por que “não aconteceu nada” no WhatsApp?

Se você colar um link `http://localhost:3000/...` no WhatsApp (Web ou celular), o preview geralmente não aparece.

Motivo: o WhatsApp precisa **acessar o link publicamente** para ler as tags OpenGraph (`og:title`, `og:description`, `og:image`).
`localhost` (ou `127.0.0.1`) só existe na sua máquina; os servidores/crawlers do WhatsApp não conseguem acessar.

Então:

- `localhost` funciona para testar no navegador (você vê a página `/s/{id}` e os metadados no HTML)
- mas **não** produz preview no WhatsApp

### 7.2 Como testar preview de verdade (requer URL pública)

Você precisa expor o `localhost:3000` com uma URL pública (idealmente HTTPS) usando um túnel.

Depois disso, faça o share com o domínio público e **gere o link curto usando a base pública**.

Env (server):

- `PHOENIX_ZERO_PUBLIC_BASE_URL=https://SEU-DOMINIO-PUBLICO`

Isso faz `POST /api/share-link` retornar `shareUrl` já no domínio público.

Observação: para o fluxo ficar 100% consistente quando o consumidor abrir `/s/{id}` no celular, `videoUrl` e `proofUrl` também precisam ser públicos.
Quando `PHOENIX_ZERO_PUBLIC_BASE_URL` está setado e você passa URLs no mesmo host do request (ex: `http://localhost:3000/...`), o backend reescreve e armazena essas URLs com o host público.

#### Opção A) Cloudflare Tunnel (recomendado)

1. Inicie o Next dev normalmente.
2. Em outro terminal, execute um túnel para o `localhost:3000`.
3. Pegue o domínio HTTPS gerado (ex: `https://xxxx.trycloudflare.com`).
4. Reinicie o `next dev` com:

```powershell
$env:PHOENIX_ZERO_PUBLIC_BASE_URL = "https://xxxx.trycloudflare.com"
npm run dev:web
```

5. Agora, no `/verify`, clique em **Gerar link WhatsApp (preview)**.
6. Cole o link no WhatsApp e aguarde o preview.

#### Opção B) ngrok

1. Inicie o túnel para `3000`.
2. Copie o domínio HTTPS gerado.
3. Defina `PHOENIX_ZERO_PUBLIC_BASE_URL` e gere o link novamente.

### 7.3 Caching de preview

Alguns apps fazem cache do preview por minutos/horas.
Se você colar o mesmo link e não mudar nada, ele pode não atualizar.

Dicas:

- gere um novo `shareUrl` (novo id)
- ou force a atualização mudando a URL (id diferente)

### 7.4 Checklist de troubleshooting (quando o preview não aparece)

- **URL pública/HTTPS**
  - `localhost` e `127.0.0.1` não funcionam para preview.
  - use túnel (cloudflared/ngrok) e gere link com `PHOENIX_ZERO_PUBLIC_BASE_URL`.
- **`og:image` acessível**
  - a URL do `og:image` precisa responder 200 e retornar uma imagem.
  - o repo expõe `GET /api/share-card-png?id=...` (PNG) para compatibilidade.
- **Cache do app**
  - WhatsApp pode cachear o preview.
  - gere um novo link (novo id) para forçar refresh.

## 8) Embed universal (sem plataformas)

Objetivo: permitir que qualquer site/blog mostre um badge de autenticidade ao lado de um vídeo/link, sem depender de integração com plataformas.

Arquivos:

- Script estático: `GET /phoenix-zero-embed.js`
- API: `GET /api/global-auth`

Para imagem:

- Script estático: `GET /phoenix-zero-image-embed.js`
- API: `GET /api/global-image-auth`

Para live:

- Script estático: `GET /phoenix-zero-live-embed.js`
- API: `GET /api/global-live-auth`

Snippet (site externo):

```html
<div
  data-phoenix-zero-embed
  data-api-base="https://SEU-DOMINIO-DO-PHOENIXZERO.com"
  data-video-url="https://.../video.mp4"
  data-proof-url="https://.../proof.json"
></div>

<script src="https://SEU-DOMINIO-DO-PHOENIXZERO.com/phoenix-zero-embed.js" defer></script>
```

Teste local (dev):

- Abra: `http://localhost:3000/demo`

### 8.1 Teste cross-domain (CORS) em dev

Para simular um site em outro domínio/porta (origem diferente), suba um HTML simples em outra porta e aponte para o Phoenix Zero em `localhost:3000`.

Exemplo (PowerShell):

1) Suba o web app (veja seção 1.3).

2) Em outro terminal, rode um servidor HTML na porta 3001:

```powershell
node -e "require('http').createServer((req,res)=>{res.writeHead(200,{ 'content-type':'text/html' });res.end('<!doctype html><meta charset=\"utf-8\" /><div data-phoenix-zero-embed data-api-base=\"http://localhost:3000\" data-video-url=\"http://localhost:3000/demo/watermarked.mp4\" data-proof-url=\"http://localhost:3000/demo/proof.json\"></div><script src=\"http://localhost:3000/phoenix-zero-embed.js\" defer></script>');}).listen(3001);console.log('CORS test: http://localhost:3001');"
```

3) Abra no browser: `http://localhost:3001`

Se o badge renderizar corretamente, o CORS do `GET /api/global-auth` está OK.
