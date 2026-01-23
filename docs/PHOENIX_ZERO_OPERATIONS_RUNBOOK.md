# Phoenix Zero — Operations Runbook (Decisões + Testes + Próximos Passos)

## 1) Objetivo deste documento
Este runbook é a **fonte única operacional** para:
- Testar agora (copiar/colar) os endpoints do **Time Anchor** e **Anchor Profiles**.
- Registrar **o que foi decidido** (sem retrabalho/duplicatas).
- Deixar um checklist claro para qualquer assistente executar amanhã.

Documentos base (referência):
- `docs/PHOENIX_ZERO_STRATEGY_FINAL.md`
- `docs/PHOENIX_ZERO_ANCHOR_HANDOFF.md`
- `docs/PHOENIX_ZERO_TIME_ANCHOR_TECHNICAL.md`
- `docs/PHOENIX_ZERO_PHASE1_CHECKLIST.md`

---

## 2) Decisões consolidadas (o que NÃO vamos retrabalhar agora)
- Twitch live viewer capture foi **PASS** e deve ser classificado como **Verified (Robust)**.
  - `ok=true` + `signature.ok=true` + `temporal.ok=true`.
  - `watermark.ok=false` com `bestBitErrors=1` **não é bloqueador** em cenário real.
- Time Anchor (Âncora Externa) MVP:
  - Tem **binding com conteúdo** via `contentCommitB64Url`.
  - Tem **binding com identidade** via assinatura híbrida (ed25519 + opcional PQ).
  - TTL expirar e a verificação virar `expired` com `verified.ok=false` **é comportamento correto**, não bug.

---

## 3) Estado atual do produto (o que existe no repo)
### 3.1 Time Anchor — core
- `apps/web/src/lib/time-anchors.ts`
  - `createTimeAnchor()`
  - `getTimeAnchor()`
  - `verifyTimeAnchor()`

Persistência DEV (arquivo):
- `apps/web/tmp/time-anchors.json`

Log append-only (DEV):
- `apps/web/tmp/time-anchors.transparency.jsonl`

### 3.2 Endpoints
- Criar âncora:
  - `POST /api/time-anchor`
- Verificar internamente (debug):
  - `GET /api/time-anchor?anchorId=...&contentCommit=...`
- Verificar publicamente (CORS):
  - `GET /api/public-anchor/[id]?contentCommit=...`

### 3.3 Anchor Profiles
- Biblioteca:
  - `apps/web/src/lib/anchor-profiles.ts`
- Endpoint:
  - `POST /api/suggest-profile`

IDs de perfis (atuais):
- `live_social_basic`
- `live_sports_mobile`
- `live_kyc_enterprise`
- `live_telemed`
- `vod_media_standard`
- `vod_kyc_2y`
- `vod_kyc_5y_pqc`
- `vod_forensic_max`

### 3.4 Demo (vendas)
- Página estática:
  - `apps/web/public/demo-anchor-selector.html`
  - URL: `http://localhost:3000/demo-anchor-selector.html`

---

## 4) Pré-requisitos para rodar testes agora
### 4.1 Subir servidor
No root do repo:
```powershell
npm run dev:web
```

### 4.2 Chaves
O `POST /api/time-anchor` exige chave ed25519.
- Arquivo esperado: `keys/phoenix-zero-ed25519.json`

Para `mode=strict` (PQC), pode usar chave PQ (se existir):
- `keys/phoenix-zero-sphincs.json`

Se for necessário gerar chaves (somente se estiver faltando):
```powershell
npm run keygen
npm run pq:keygen
```

---

## 5) Testes manuais (PowerShell — copiar/colar)
> Base URL padrão: `http://localhost:3000`

Nota de reprodutibilidade (dev):
- Em `npm run dev:web` (Next.js dev), no **primeiro hit** algumas rotas podem compilar on-demand.
- Por isso, o script `scripts/time-anchor-smoke-test.ps1` faz um warm-up antes de criar a âncora, para evitar TTL curto expirar durante o cold start.

### 5.1 Teste: sugerir perfil (`POST /api/suggest-profile`)
```powershell
$base = "http://localhost:3000"

$body = @{
  isLive = $true
  sector = "social"
  verificationTiming = "during"
  sessionDurationSec = 120
  highFraudRisk = $false
  unstableNetwork = $false
  needsOfflineVerification = $false
  requiresPqc = $false
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$base/api/suggest-profile" -ContentType "application/json" -Body $body
```

Saída esperada (estrutura):
- `ok: true`
- `suggestedProfileId: "live_social_basic"` (para este exemplo)
- `config.kind`, `config.ttlSeconds`, `config.mode`

Status: PASS (validado em dev local).

### 5.2 Teste: criar âncora usando profile (`POST /api/time-anchor`)
```powershell
$base = "http://localhost:3000"

# contentCommitB64Url é um identificador/commitment do conteúdo (string base64url). Para teste, pode ser qualquer string válida.
$commit = "SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ"

$body = @{
  contentCommitB64Url = $commit
  profile = "live_social_basic"
  clientId = "demo-client"
  creatorId = "creator-demo"
} | ConvertTo-Json

$create = Invoke-RestMethod -Method Post -Uri "$base/api/time-anchor" -ContentType "application/json" -Body $body
$create | ConvertTo-Json -Depth 20

# Extraindo ids/urls
$anchorId = $create.anchorId
$verifyUrlWithCommit = $create.verifyUrlWithCommit
"ANCHOR_ID=$anchorId"
"VERIFY_URL_WITH_COMMIT=$verifyUrlWithCommit"
```

Saída esperada (estrutura):
- `ok: true`
- `applied.profile` = `live_social_basic`
- `applied.kind` = `live`
- `record.anchorProfileId` = `live_social_basic`
- `record.clientId` = `demo-client`

Status: PASS (validado em dev local).

### 5.3 Teste: verificar âncora publicamente (`GET /api/public-anchor/[id]`)
```powershell
$base = "http://localhost:3000"
$commit = "SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ"

# use o anchorId do passo 5.2
$anchorId = $anchorId

$verifyNowUrl = "$base/api/public-anchor/$anchorId?contentCommit=$commit"
$verifyNow = Invoke-RestMethod -Method Get -Uri $verifyNowUrl
$verifyNow | ConvertTo-Json -Depth 20

"VERIFY_NOW_WINDOW=$($verifyNow.verified.window)"
"VERIFY_NOW_OK=$($verifyNow.verified.ok)"
"VERIFY_NOW_COINCIDENCE=$($verifyNow.verified.coincidence)"
"VERIFY_NOW_CONFIDENCE=$($verifyNow.verified.confidence)"
```

Saída esperada imediatamente:
- `verified.window: valid`
- `verified.ok: true`
- `verified.coincidence: true`
- `verified.confidence: 1`

Status: PASS (validado em dev local).

### 5.4 Smoke test automatizado (VALID -> EXPIRED)
Script:
- `scripts/time-anchor-smoke-test.ps1`

Comando recomendado (TTL curto para observar expiração):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\time-anchor-smoke-test.ps1 -ContentCommit "SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ" -Kind live -Mode compat -TtlSeconds 30
```

Comando único (demo plug-and-play):
```powershell
tsx .\scripts\phoenix-zero-anchor-cli.ts demo --commit "SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ" --profile live_social_basic --creator "creator-demo" --client "demo-client"
```

Saída esperada (resumo):
- Dentro do TTL:
  - `VERIFY_NOW_WINDOW: valid`
  - `VERIFY_NOW_VERIFIED_OK: True`
  - `VERIFY_NOW_COINCIDENCE: True`
  - `VERIFY_NOW_CONFIDENCE: 1`
- Após o TTL:
  - `VERIFY_LATER_WINDOW: expired`
  - `VERIFY_LATER_VERIFIED_OK: False`
  - `VERIFY_LATER_COINCIDENCE: False`
  - `VERIFY_LATER_CONFIDENCE: 0`

Status: PASS (validado em dev local).

---

## 6) Checklist operacional — amanhã
### 6.1 Phase 1 (fim do dia / amanhã cedo)
- **YouTube live viewer capture**
  - Capturar vídeo do viewer durante live (não VOD)
  - Rodar verify offline + salvar report
  - Atualizar `docs/PHOENIX_ZERO_PHASE1_CHECKLIST.md` com paths e evidência
- **WhatsApp live-like** (se liberar 2 contas/dispositivos)
  - Capturar receptor
  - Rodar verify offline + salvar report
  - Atualizar checklist

### 6.2 Phase 2 (hardening Time Anchor)
- Congelar e versionar contrato público (`record.version`, schema e compat)
- Evoluir log append-only para:
  - prova de integridade (hash encadeado + checkpoint)
  - endpoint/export para auditor
- Persistência robusta (substituir arquivo por storage transacional, ex.: SQLite)
- Segurança:
  - rate limit
  - validação de inputs
- Operação:
  - GC/limpeza de registros expirados
  - métricas por `clientId`/`anchorProfileId`

---

## 7) Nota importante (evitar duplicatas)
- Este runbook **não substitui** os docs existentes; ele consolida o operacional.
- Para detalhes conceituais/FAQ: usar `docs/PHOENIX_ZERO_TIME_ANCHOR_TECHNICAL.md`.
- Para decisões estratégicas: usar `docs/PHOENIX_ZERO_STRATEGY_FINAL.md`.
- Para handoff rápido: usar `docs/PHOENIX_ZERO_ANCHOR_HANDOFF.md`.
