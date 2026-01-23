# Phoenix Zero — Âncora Externa (Time Anchor) — Documento Técnico + FAQ

## 1) O que é a Âncora (Time Anchor)
A **Âncora Externa** é um registro assinado que prova que um determinado `contentCommit` (compromisso criptográfico do conteúdo) foi declarado por um emissor (criador/empresa) **em um intervalo de tempo específico**.

Ela serve como camada **online, auditável e simples** para:
- Consumidor: abrir um link e ver um status.
- Auditor/empresa: ter um JSON assinado com `createdAt`, `expiresAt` e `contentCommit`.

Importante:
- A âncora **não depende de plataforma** (YouTube/Twitch/etc.).
- A âncora **não substitui** a verificação offline (proofs/watermark/temporal). Ela complementa.

---

## 2) Para quem serve
- **Consumidor**: quer 1 clique (página `/verify-anchor/...`).
- **Criador/empresa**: quer gerar um link verificável para colar em bio/descrição/pinned message.
- **Auditor/jurídico/compliance**: quer evidência reproduzível (JSON + assinatura + log append-only).

---

## 3) Conceitos principais
### 3.1 `contentCommit`
- É um identificador **derivado do conteúdo**.
- No MVP, ele entra como string já pronta (`contentCommitB64Url`).
- Conceito: **SHA-256 em base64url** de um fingerprint/ID do conteúdo.

### 3.2 Janela temporal (TTL)
- A âncora tem um `createdAt` e um `expiresAt`.
- A verificação possui um campo `window`:
  - `valid` quando `now <= expiresAt`
  - `expired` quando passou do `expiresAt`

### 3.3 Assinatura (identidade)
- O payload da âncora é assinado com **assinatura híbrida**.
- Resultado de verificação inclui `signature.ok`.

---

## 4) Endpoints (como usar)
### 4.1 Criar
- `POST /api/time-anchor`

Body (JSON):
- `kind`: `live` | `vod`
- `contentCommitB64Url`: string (obrigatório)
- `ttlSeconds`: number (opcional)
- `mode`: `compat` | `strict` (opcional)
- `creatorId`: string (opcional)
- `clientId`: string (opcional)
- `profile`: string (opcional, `anchorProfileId`) — aplica presets de TTL/mode/kind

Exemplo (PowerShell):
```powershell
$body = @{ kind = 'live'; contentCommitB64Url = 'SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ'; profile = 'live_social_short'; clientId = 'demo-client'; ttlSeconds = 30; mode = 'compat' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/time-anchor" -ContentType "application/json" -Body $body
```

Resposta:
- `anchorId`
- `verifyUrl`
- `verifyUrlWithCommit`
- `applied` (config efetivamente aplicada após profile/clamp)
- `record`

### 4.2 Verificar (público)
- `GET /api/public-anchor/[id]?contentCommit=...`

### 4.3 Verificar (interno/debug)
- `GET /api/time-anchor?anchorId=...&contentCommit=...`

### 4.4 UI
- `GET /verify-anchor/[id]?contentCommit=...`

---

## 5) TTL “ideal” para negócios (recomendação)
O TTL depende do tipo de evidência que você quer oferecer.

### 5.1 Live (recomendado)
Objetivo: provar **liveness** e “batimento” recente.
- **Janela curta (liveness / demo técnico)**: `5–30s` (perfil `live_social_short`)
- **Produção (mobile + latência real)**: `120–300s` (ex.: `live_social_basic=120`, `live_sports_mobile=180`, `live_telemed=240`, `live_broadcast_official=300`)

Motivo:
- TTL muito curto (ex.: 5s) pode expirar antes do primeiro request/refresh.
- TTL muito longo reduz o valor de “prova de tempo recente” em live.

Limite no código:
- `live`: TTL máximo aceito = `24h`.

### 5.2 VOD (recomendado)
Objetivo: prova persistente para conteúdo publicado.
- **Recomendado comercial (default do produto hoje)**: `365 dias` (1 ano)
- **Faixa recomendada**:
  - `180 dias – 5 anos` conforme retenção e risco de disputa

Limite no código:
- `vod`: TTL máximo aceito = `10 anos`.

Nota de produto:
- Para VOD, na prática você quer “âncora de publicação” com retenção longa.

---

## 6) Como interpretar os resultados (campo por campo)
A resposta de verificação tem dois blocos relevantes: `record` e `verified`.

### 6.1 `record` (o que foi registrado)
- **`record.anchorId`**: id único da âncora.
- **`record.createdAt`**: quando a âncora foi criada.
- **`record.expiresAt`**: até quando ela conta como “válida”.
- **`record.kind`**: `live` ou `vod`.
- **`record.contentCommit.value`**: commitment do conteúdo.
- **`record.signatureMode`**: modo da assinatura híbrida (`compat`/`strict`).
- **`record.hybridSignature`**: assinatura em si (prova de identidade/integridade do payload).

### 6.2 `verified` (resultado da verificação naquele instante)
- **`verified.window`**:
  - `valid`: ainda dentro do TTL
  - `expired`: TTL passou

- **`verified.signature.ok`**:
  - `True`: assinatura do payload confere
  - `False`: payload/assinatura não confere

- **`verified.ok`**:
  - `True` somente quando `signature.ok=True` **e** `window=valid`
  - Se `window=expired`, `verified.ok` **vai ser False** (isso é o esperado)

- **`verified.coincidence`**:
  - `True` somente quando:
    - o `contentCommit` enviado na query é igual ao do registro **e**
    - `window=valid` **e**
    - `signature.ok=True`
  - Se `window=expired`, `coincidence` fica `False` por definição do produto (não “pontua” coincidência fora da janela)

- **`verified.confidence`**:
  - `1` quando `coincidence=True`
  - `0.75` quando `ok=True` mas sem commit informado (ou sem coincidência)
  - `0` quando `ok=False`

---

## 7) FAQ (perguntas comuns)
### 7.1 “Por que aparece `expired` e um monte de `False`?”
Porque a âncora foi desenhada para testar/provar a **janela temporal**.
- Dentro do TTL: você vê `valid` + `verified.ok=True`.
- Depois do TTL: você vê `expired` + `verified.ok=False`.

Isso não é bug: é a regra.

### 7.2 “Como eu escolho o TTL certo?”
- **Live**: use **profiles**. Para demo/liveness: `live_social_short` (30s). Para produção: `live_social_basic` (120s) ou perfis setoriais.
- **VOD**: `365 dias` é um bom padrão comercial inicial (retenção anual).

### 7.3 “Se eu quiser que VOD nunca expire?”
No MVP, expirar é parte do modelo (simplifica governança e evita promessas irreais).
Se você quer evidência permanente:
- Fase 2: evoluir para log transparente com checkpoints e políticas de retenção.

### 7.4 “O que acontece se eu mandar `contentCommit` errado?”
- `verified.ok` pode continuar `True` (se `window=valid` + assinatura ok),
- mas `verified.coincidence` vai ser `False` e `confidence` não vai ser `1`.

### 7.5 “A âncora prova que o vídeo é meu?”
Ela prova:
- que um emissor assinado declarou um `contentCommit` em um intervalo de tempo.
Para prova completa de autoria/robustez, entra a camada offline (proofs + watermark/temporal).

---

## 8) Implementação (referência rápida)
- Core: `apps/web/src/lib/time-anchors.ts`
- API create/get: `apps/web/src/app/api/time-anchor/route.ts`
- API pública: `apps/web/src/app/api/public-anchor/[id]/route.ts`
- UI: `apps/web/src/app/verify-anchor/[id]/page.tsx`
- Smoke test: `scripts/time-anchor-smoke-test.ps1`
