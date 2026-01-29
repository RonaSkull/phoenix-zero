# PPE — Go‑Live Status + Checklist (single source of truth)

Este documento consolida o estado atual do PPE e o checklist mínimo para deixar o sistema **operacional para agentes** em produção.

## Status atual (confirmado)

- `POST /api/compatibility` (Render): **OK** (machine-readable)
- `POST /api/admin/tenants`: usado para criar tenant público sistêmico

## Alertas de segurança (importante)

- Endpoints `/api/admin/*` devem sempre exigir `PHOENIX_ZERO_ADMIN_TOKEN`.
- Se algum deploy permitir admin sem token, trate como incidente e faça redeploy com envs corretos.

## Endpoints públicos para agentes

- Discovery:
  - `GET /.well-known/ai-service.json`
- Docs (HTTP, agent-friendly):
  - `GET /api/docs/ai-service-discovery`
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

## Pendências (não bloqueiam go-live)

- Assinatura criptográfica do catálogo (`/api/pricing` e `/.well-known`) como upgrade pós-go-live (doc/decisão primeiro; implementação depois)
- Decidir política do `GET /api/compatibility` atual (social preview) vs compatibilidade de agentes
- Rodar testes “do ponto de vista de agentes” contra o Render e corrigir falhas

## Lista de tasks (para não perder o foco)

- Deploy no Render das rotas novas (inclui `/api/docs/ai-service-discovery`) e validação
- Setar `PHOENIX_ZERO_PUBLIC_API_KEY` no Render e validar `GET /api/pricing` sem headers
- Segurança: garantir que `/api/admin/*` sempre exige `PHOENIX_ZERO_ADMIN_TOKEN` (sem fallback), e validar que requests sem header falham
- Testes de agentes contra o Render: `scripts/external-agent-client.ts` e/ou `npm run test:agentic:e2e:real:*`
- Pós-testes: rotação de segredos (`09_SECRET_ROTATION.md`)
