# PPE — Agent Test Journey (Render)

Este documento registra **a jornada real de validação** do produto PPE em produção (Render) do ponto de vista de agentes.

Base:

- `https://phoenix-zero-web.onrender.com`

## 1) Objetivo

Garantir que um agente (sem acesso ao backend) consegue:

- Descobrir o serviço
- Ler catálogo de pricing
- Checar compatibilidade
- Criar checkout (com `x-api-key` de tenant)
- Ser bloqueado antes do pagamento (PPO gate)
- Executar após confirmação de pagamento
- Validar idempotência de webhooks
- Validar settlements (`pending -> settled -> reverted`)
- Validar notificações (Telegram/WhatsApp) quando configuradas

## 2) Pré‑requisitos (local)

Para rodar os testes a partir da sua máquina (Windows):

- Node instalado
- Dependências do repo instaladas (`npm install`)

Padronização:

- Rodar TypeScript via `npx tsx ...`

## 3) Endpoints públicos (sem headers)

### 3.1 Health

```powershell
Invoke-RestMethod https://phoenix-zero-web.onrender.com/api/health
```

Esperado:

- `{ ok: true, ts: ... }`

### 3.2 Discovery

```powershell
Invoke-RestMethod https://phoenix-zero-web.onrender.com/.well-known/ai-service.json
```

Esperado:

- `discovery.pricing=/api/pricing`
- `discovery.compatibility=/api/compatibility`
- `discovery.docs=/api/docs/ai-service-discovery`

### 3.3 Docs (HTTP)

```powershell
Invoke-WebRequest https://phoenix-zero-web.onrender.com/api/docs/ai-service-discovery | Select-Object StatusCode
```

Esperado:

- `200`

### 3.4 Pricing público

```powershell
Invoke-RestMethod https://phoenix-zero-web.onrender.com/api/pricing | Select-Object tenantId,currency,isPublicTenant
```

Esperado:

- `isPublicTenant: True`

## 4) Configuração do tenant público (causa raiz e correção)

Sintoma observado:

- `GET /api/pricing` retornava `500` com:
  - `Public tenant is not configured (set PHOENIX_ZERO_PUBLIC_API_KEY and restart the server)`

Correção:

1) Criar tenant público sistêmico via admin:

```powershell
$Base='https://phoenix-zero-web.onrender.com'
$AdminToken='<PHOENIX_ZERO_ADMIN_TOKEN>'

$body = @{
  name='public-catalog'
  clientType='system'
  sector='system'
  country='BR'
  currency='BRL'
  pricingProfile='default'
  commissionProfile='default'
  taxProfile='default'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$Base/api/admin/tenants" -Headers @{ 'x-admin-token'=$AdminToken } -ContentType 'application/json' -Body $body
```

2) No Render, setar `PHOENIX_ZERO_PUBLIC_API_KEY=<apiKey retornado>`

3) Restart do serviço

4) Revalidar `GET /api/pricing` sem headers

## 5) Compatibilidade (machine‑readable)

```powershell
$Base='https://phoenix-zero-web.onrender.com'
$body = @{ operation='protect_video'; intent='execute'; client='agent' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Base/api/compatibility" -ContentType 'application/json' -Body $body
```

Esperado:

- `{ ok: true, compatible: true, ... }`

## 6) Teste E2E “agent POV” (Render)

Comando (Windows):

```powershell
$env:PHOENIX_ZERO_BASE_URL = "https://phoenix-zero-web.onrender.com"
npx tsx .\scripts\external-agent-client.ts
```

Opcional:

```powershell
$env:SIM_SKIP_CRYPTO = "1"
npx tsx .\scripts\external-agent-client.ts
```

Variáveis no seu terminal local:

- `PHOENIX_ZERO_ADMIN_TOKEN` (token do Render)
- `ASAAS_WEBHOOK_SECRET` (secret do Render)
- `NOWPAYMENTS_IPN_SECRET` (secret do Render)
- (Opcional) `SIM_TELEGRAM_CHAT_ID`
- (Opcional) `TELEGRAM_BOT_TOKEN`
- (Opcional) `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`

Resultados esperados (sinais fortes):

- `execute` antes do pagamento:
  - `403` + `PPO_GATE_BLOCKED`
- PIX:
  - webhook simulado `paid`: `200 ok: true`
  - idempotência: `deduped: true`
  - execute pós pagamento: `200 ok: true`
  - settlement: `pending -> settled`
  - refund: `... -> reverted`
- Crypto:
  - webhook simulado: `200 ok: true`
  - execute pós pagamento: `200 ok: true`
  - refund: settlement `reverted`
- Notificações (se configuradas):
  - `customerNotifications.telegram ok: true`
  - `customerNotifications.whatsapp ok: true`

Evidência (2026-01-29):

- Fluxo PIX e Crypto passou no Render com PPO gate (403 antes / 200 depois), webhooks idempotentes (`deduped: true`), settlements e refund (reverted).

## 7) Segurança (admin)

Garantir que endpoints `/api/admin/*` respondam:

- `401 Unauthorized` se `x-admin-token` ausente/incorreto
- `500 Missing PHOENIX_ZERO_ADMIN_TOKEN` se o env não estiver setado

## 8) Decisão: `GET /api/compatibility`

Política atual:

- `POST /api/compatibility`: fluxo canônico (agentes)
- `GET /api/compatibility`: social preview / tooling legado
