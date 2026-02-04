# PPE — Contrato de API (o que clientes/agentes chamam)

## 1) Princípios
- API‑first.
- O site é "documentação e legitimação"; a venda real acontece via API.
- Autenticação por `x-api-key` (tenant).

Contrato operacional (go-live):

- `17_GO_LIVE_CONTRACT.md`

## 2) Autenticação
- Header: `x-api-key: <TENANT_API_KEY>`

## 2.1) Obter `TENANT_API_KEY` (onboarding público)

- `POST /api/public/agent-signup`

Observações:

- Endpoint público, com rate limit.
- Retorna `tenantId` e `apiKey` (use como `x-api-key`).

Exemplo (PowerShell):

```powershell
$base = "https://SEU-DOMINIO"

$body = @{
  name = "My Agent"
  email = "my-agent@example.com"
  agentType = "buyer"
  intendedUse = "autonomous agent integration"
  acceptsTermsVersion = "2026-01-v1"
  acceptsFixedPricing = $true
  billingMode = "prepaid"
  currency = "USD"
} | ConvertTo-Json

$res = Invoke-RestMethod -Method Post -Uri "$base/api/public/agent-signup" -ContentType "application/json" -Body $body
$res.tenant.apiKey
```

## 3) Checkout / Pagamento

### `POST /api/checkout/create`
Cria uma intenção de pagamento (PaymentIntent) e retorna `paymentId` e `checkoutUrl`.

Idempotência (recomendado):

- Header opcional: `x-idempotency-key: <string>`
- Quando enviado, o endpoint se torna idempotente **por tenant**.
- Em produção, isso é garantido pela persistência (Postgres).
- Repetir a mesma chamada (mesma chave e mesmo payload efetivo) retorna o mesmo `paymentId`.
- Reusar a mesma chave com payload diferente retorna **HTTP 409**.
- Se a criação estiver em andamento para aquela chave, retorna **HTTP 409**.

Campos importantes:
- `providerHint`: `pix` | `crypto`
- `lineItems`: array (pricing)
- `proofMeta`: metadata para PPO/prova

Recomendação para `lineItems` (clareza):
- `product`: o “tipo de entrega” (ex.: `video_protection`, `document_protection`)
- `operation`: a operação canônica (ex.: `protect_video`)

Resposta (HTTP 200):
- `ok: true`
- `paymentId`
- `status`: `pending` | `paid` | `failed`
- `provider`: `pix` | `crypto`
- `amountCents`
- `currency`
- `checkoutUrl` (quando aplicável)
- `instructions` (quando aplicável)
- `pricing.pricingProfileId`
- `pricing.pricingVersionId` (opcional)

Erros comuns:
- HTTP 400: `{ ok: false, reason: ... }` (JSON inválido / campos inválidos)
- HTTP 401: `{ ok: false, reason: "Unauthorized" }` (sem `x-api-key`)
- HTTP 403: `{ ok: false, reason: "tenantId mismatch" }` (se tentar setar `tenantId` diferente)
- HTTP 409: `{ ok: false, reason: "IDEMPOTENCY_KEY_REUSED" | "IDEMPOTENCY_IN_PROGRESS" }`

Exemplo (curl):
```bash
curl -sS -X POST "https://SEU-DOMINIO/api/checkout/create" \
  -H "content-type: application/json" \
  -H "x-api-key: TENANT_API_KEY" \
  -H "x-idempotency-key: <UUID-OU-CHAVE-DO-SEU-PEDIDO>" \
  -d '{
    "currency": "BRL",
    "providerHint": "pix",
    "lineItems": [
      { "operation": "protect_video", "product": "video_protection", "units": 1 }
    ],
    "proofMeta": {
      "agentId": "ag_...",
      "taskType": "protect_video",
      "taskInputHash": "...",
      "taskOutputHash": "...",
      "customerContact": {
        "telegramChatId": "...",
        "whatsappNumber": "+55..."
      }
    }
  }'
```

Observação importante (anti-bypass):
- O preço é calculado a partir de `lineItems` (principalmente `operation` e `product`).
- O **PPO Gate** bloqueia/libera execução comparando `taskId` e `taskType` do request com o PPO.
- Portanto, para não criar “pago barato / executo caro”, a regra prática é:
  - Decida o `taskType` **antes do checkout**.
  - Use `proofMeta.taskType` alinhado ao que você está cobrando (recomendado: igual ao `lineItems.operation`).

### `GET /api/checkout/status?paymentId=...`
Consulta o status do pagamento.

Querystring:
- `paymentId` (obrigatório)

Resposta (HTTP 200):
- `ok: true`
- `paymentId`
- `provider`: `pix` | `crypto`
- `status`: `pending` | `paid` | `failed`
- `amountCents`
- `currency`
- `providerPaymentId` (ID no provedor, quando existir)

Observação operacional:
- Quando o status ainda está `pending`, o backend pode tentar **revalidar** consultando o provedor após um tempo (para evitar polling infinito do cliente).
- Controles:
  - `PHOENIX_ZERO_CHECKOUT_STATUS_REVALIDATE_AFTER_MS` (default ~15s)
  - `PHOENIX_ZERO_CHECKOUT_STATUS_REVALIDATE_COOLDOWN_MS` (default ~10s)

Erros comuns:
- HTTP 400: `{ ok: false, reason: "Missing paymentId" }`
- HTTP 401: `{ ok: false, reason: "Unauthorized" }`
- HTTP 403: `{ ok: false, reason: "Forbidden" }` (payment existe, mas é de outro tenant)
- HTTP 404: `{ ok: false, reason: "Payment not found" }`

Exemplo (curl):
```bash
curl -sS "https://SEU-DOMINIO/api/checkout/status?paymentId=pay_..." \
  -H "x-api-key: TENANT_API_KEY"
```

## 4) Execução condicionada

### `GET /api/agents/[agentId]/gate`
Retorna se existe permissão econômica (PPO/Gate) para executar.

### `POST /api/agents/[agentId]/execute`
Executa apenas se o Gate permitir.

## 4.1) Pricing (opcional, para agentes)

### `POST /api/pricing/quote`
 Retorna um preço estimado em centavos para uma **operação** (ex.: `protect_video`) no contexto do tenant.

 Header:
 - `x-api-key: <TENANT_API_KEY>`

 Body (mínimo):
 - `operation` (obrigatório)

 Observação:
 - Este endpoint é útil para agentes “descobrirem” custo antes do checkout.
 - O preço final ainda é calculado no checkout e pode depender de contexto adicional (`sector`, `country`, etc.).

## 5) Provas

### `GET /verify/<proofId>` (público)
Página pública de prova.

### `GET /api/payment-proofs/[id]`
Retorna o PPO.

### `GET /api/agents/[agentId]/proofs`
Lista PPOs por agente.

### `GET /api/agents/[agentId]/ledger`
Agregado econômico do agente.

## 6) Admin (não expor publicamente)
- Endpoints sob `/api/admin/*` exigem `x-admin-token`.

## 7) Compatibilidade
- Não quebrar clientes:
  - `lineItems.operation` antigo ainda deve funcionar.
  - `lineItems.product` deve ser aceito como input adicional.

## 8) Exemplos (placeholder)
Os exemplos acima refletem os caminhos reais dos endpoints em `apps/web/src/app/api/checkout/*`.
