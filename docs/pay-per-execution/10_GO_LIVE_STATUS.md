# PPE — Go‑Live Status + Checklist (single source of truth)

Este documento consolida o estado atual do PPE e o checklist mínimo para deixar o sistema **operacional para agentes** em produção.

## Status atual (confirmado)

- `POST /api/compatibility` (Render): **OK** (machine-readable)
- `POST /api/admin/tenants`: usado para criar tenant público sistêmico
- `scripts/external-agent-client.ts` (Render): **OK** (PIX + Crypto) com PPO gate + webhooks idempotentes + settlements + refund
- Persistência pós-restart (Render): **OK** (PPOs continuam disponíveis via `/verify/<proofId>` após restart)
- `/api/health` (Render): **OK**

Notas de escopo:

- PIX/Asaas: GA.
- Crypto/NowPayments: beta/experimental (best-effort).

## Alertas de segurança (importante)

- Endpoints `/api/admin/*` devem sempre exigir `PHOENIX_ZERO_ADMIN_TOKEN`.
- Se algum deploy permitir admin sem token, trate como incidente e faça redeploy com envs corretos.

## Endpoints públicos para agentes

- Discovery:
  - `GET /.well-known/ai-service.json`
- Onboarding (obter tenant `x-api-key`):
  - `POST /api/public/agent-signup`
- Docs (HTTP, agent-friendly):
  - `GET /api/docs/ai-service-discovery`
  - `GET /api/docs/go-live-contract`
  - `GET /api/docs/agent-integration-contract`
- Pricing catalog (público; requer tenant público configurado):
  - `GET /api/pricing`
- Compatibility feedback:
  - `POST /api/compatibility`

## Variáveis de ambiente (produção / Render)

- Core:
  - `PHOENIX_ZERO_PUBLIC_BASE_URL=https://phoenix-zero-web.onrender.com`
  - `PHOENIX_ZERO_ADMIN_TOKEN=<render-generated-or-manual>`
  - `DATABASE_URL=<neon>`
  - `PGSSLMODE=require`
- Catálogo público:
  - `PHOENIX_ZERO_PUBLIC_API_KEY=<apiKey do tenant público read-only>`
- Pagamentos:
  - PIX/Asaas: `ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET`, `ASAAS_ENV`
  - Crypto/NowPayments: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`

## Checklist mínimo (ordem recomendada)

### 1) Criar o tenant público sistêmico (read-only)

Chamar `POST /api/admin/tenants` com header `x-admin-token`.

PowerShell (exemplo):

```powershell
$base = "https://phoenix-zero-web.onrender.com"
$adminToken = "<PHOENIX_ZERO_ADMIN_TOKEN>"

$body = @{
  name = "Phoenix Zero Public Catalog"
  clientType = "system"
  sector = "system"
  country = "global"
  currency = "USD"
  pricingProfile = "default"
  commissionProfile = "default"
  taxProfile = "default"
} | ConvertTo-Json

$res = Invoke-RestMethod -Method Post -Uri "$base/api/admin/tenants" `
  -Headers @{ "x-admin-token" = $adminToken } `
  -ContentType "application/json" `
  -Body $body

$res.apiKey
```

### 2) Setar `PHOENIX_ZERO_PUBLIC_API_KEY` no Render e reiniciar

- Render Dashboard -> serviço -> Environment
- Setar `PHOENIX_ZERO_PUBLIC_API_KEY` com o `apiKey` retornado
- Restart (ou redeploy)

### 3) Validar os endpoints públicos (sem headers)

```powershell
$base = "https://phoenix-zero-web.onrender.com"

Invoke-RestMethod -Method Get -Uri "$base/.well-known/ai-service.json"
Invoke-RestMethod -Method Get -Uri "$base/api/docs/ai-service-discovery"
Invoke-RestMethod -Method Get -Uri "$base/api/docs/go-live-contract"
Invoke-RestMethod -Method Get -Uri "$base/api/docs/agent-integration-contract"
Invoke-RestMethod -Method Get -Uri "$base/api/pricing"
```

### 4) Validar `POST /api/compatibility`

```powershell
$uri = "https://phoenix-zero-web.onrender.com/api/compatibility"
$body = @{
  operation  = "protect_video"
  intent     = "analyze_video"
  supportsPpo = $true
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body $body
```

### 5) Teste E2E “agent POV” (Render) — recomendado

Use o cliente externo (executa o fluxo completo, incluindo simulação de webhooks):

```powershell
$env:PHOENIX_ZERO_BASE_URL = "https://phoenix-zero-web.onrender.com"
npx tsx .\scripts\external-agent-client.ts
```

Opcional (rodar apenas PIX e pular Crypto):

```powershell
$env:SIM_SKIP_CRYPTO = "1"
npx tsx .\scripts\external-agent-client.ts
```

Pré‑requisitos (no seu terminal local, não no Render):

- `PHOENIX_ZERO_ADMIN_TOKEN` (token do Render)
- `ASAAS_WEBHOOK_SECRET` (secret do Render)
- `NOWPAYMENTS_IPN_SECRET` (secret do Render)
- (Opcional) `TELEGRAM_BOT_TOKEN` + `SIM_TELEGRAM_CHAT_ID`
- (Opcional) `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`

Resultado esperado (alto nível):

- `execute` antes do pagamento → `403` com `PPO_GATE_BLOCKED`
- webhook simulado → `200 ok: true` + idempotência (`deduped: true`)
- `execute` após pagamento → `200 ok: true`
- settlements: `pending -> settled -> reverted` (refund)
- notificações (se configuradas): `customerNotifications.telegram/whatsapp ok: true`

Evidências (2026-01-29):

- PIX: `execute` 403 antes do pagamento, webhook 200 + `deduped:true`, `execute` 200 após pagamento, settlements `pending -> settled -> reverted`, notificações Telegram/WhatsApp `ok:true`.
- Crypto: webhook NowPayments 200 + `deduped:true`, `execute` 200 após pagamento, settlements `pending -> reverted` (refund).

## Pendências (não bloqueiam go-live)

- Assinatura criptográfica do catálogo (`/api/pricing` e `/.well-known`) como upgrade pós-go-live (doc/decisão primeiro; implementação depois)
- Decidir política do `GET /api/compatibility` atual (social preview) vs compatibilidade de agentes
- Padronizar execução local de scripts no Windows: usar `npx tsx` para rodar arquivos `.ts` diretamente

## Política atual (documentada) — `GET /api/compatibility`

- `POST /api/compatibility`: contrato machine‑readable para agentes (produção)
- `GET /api/compatibility`: mantido para social preview / tooling legado (não é o fluxo canônico de agentes)

## Lista de tasks (para não perder o foco)

- Deploy no Render das rotas novas (inclui `/api/docs/ai-service-discovery`) e validação
- Setar `PHOENIX_ZERO_PUBLIC_API_KEY` no Render e validar `GET /api/pricing` sem headers
- Segurança: garantir que `/api/admin/*` sempre exige `PHOENIX_ZERO_ADMIN_TOKEN` (sem fallback), e validar que requests sem header falham
- Testes de agentes contra o Render: `scripts/external-agent-client.ts` e/ou `npm run test:agentic:e2e:real:*`
- Pós-testes: rotação de segredos (`09_SECRET_ROTATION.md`)
