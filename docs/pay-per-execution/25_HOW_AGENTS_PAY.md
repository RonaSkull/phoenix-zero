# How agents pay (Pay‑Per‑Execution)

This one‑pager explains the end‑to‑end payment flow for autonomous agents.

## Goal

Enable an agent to:

- Discover the service
- Obtain credentials
- Read pricing
- Create a checkout
- Wait for payment confirmation
- Pass the economic gate
- Execute the task

No Brazilian local registration (Asaas / NowPayments accounts) is required by the customer.

## 0) Discovery

Start from:

- `/.well-known/ai-service.json`
- `/api/capabilities`

These endpoints describe where pricing and docs live.

## 1) Get credentials (x-api-key)

Create a tenant API key:

- `POST /api/public/agent-signup`

Then use the key as:

- Header `x-api-key: <YOUR_KEY>`

## 2) Read pricing (catalog)

Get pricing and invariants:

- `GET /api/pricing`

Key invariants:

- PPO model is **pay-per-execution** (units)
- `proofMeta.taskType` MUST match `lineItems.operation`

Payment/currency rules:

- `providerHint: "pix"` requires `currency: "BRL"`
- `providerHint: "crypto"` typically supports `currency: "USD" | "USDC"`

## 3) (Optional) Quote a price

For quoting an amount before creating checkout:

- `POST /api/pricing/quote`

## 4) Create a checkout (payment intent)

Create a payment intent:

- `POST /api/checkout/create`

Strongly recommended:

- Use `x-idempotency-key` (per tenant) for safe retries.

### Example: PIX (BRL)

```bash
curl -s -X POST "https://YOUR_BASE_URL/api/checkout/create" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "x-idempotency-key: YOUR_REQUEST_KEY" \
  -d '{
    "currency":"BRL",
    "providerHint":"pix",
    "lineItems":[{"operation":"protect_video","units":1}],
    "proofMeta":{
      "agentId":"agent://your-agent",
      "taskId":"task_123",
      "taskType":"protect_video",
      "taskInputHash":"sha256:...",
      "taskOutputHash":"sha256:..."
    }
  }'
```

### Example: Crypto (USD/USDC)

```bash
curl -s -X POST "https://YOUR_BASE_URL/api/checkout/create" \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "x-idempotency-key: YOUR_REQUEST_KEY" \
  -d '{
    "currency":"USD",
    "providerHint":"crypto",
    "lineItems":[{"operation":"protect_video","units":1}],
    "proofMeta":{
      "agentId":"agent://your-agent",
      "taskId":"task_123",
      "taskType":"protect_video",
      "taskInputHash":"sha256:...",
      "taskOutputHash":"sha256:..."
    }
  }'
```

## 5) Poll payment status

Poll until paid or failed:

- `GET /api/checkout/status?paymentId=...`

Notes:

- `pending` can persist due to provider latency / webhooks / cold start.
- `failed` is final at go‑live.

## 6) Check gate (decision)

Before attempting execution, ask the gate:

- `GET /api/agents/{agentId}/gate`

Contract:

- Always returns `HTTP 200`
- Use JSON fields `allowed` and `reason`

## 7) Execute

When `allowed: true`, execute:

- `POST /api/agents/{agentId}/execute`

Expected failure mode:

- `HTTP 403` with `reason: "PPO_GATE_BLOCKED"` means payment/policy is still blocking execution.

## Minimal integration checklist

- Use `x-api-key` for authenticated endpoints
- Use `x-idempotency-key` for `POST /api/checkout/create`
- Respect `PIX => BRL`
- Keep `proofMeta.taskType == lineItems.operation`
- Do not parse business logic from free-form error strings
