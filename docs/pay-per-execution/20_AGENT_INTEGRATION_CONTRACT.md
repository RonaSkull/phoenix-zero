# PPE — Agent Integration Contract (AIC)

This document defines the **agent-facing** integration contract for Phoenix Zero Pay‑Per‑Execution (PPE).

Scope:

- an autonomous agent (or an SDK used by an agent) integrating via HTTP
- what endpoints exist, what they mean, and how to retry safely

Public base (production):

- `https://phoenix-zero-web.onrender.com`

## Quickstart (end-to-end)

```text
1) Discovery
   GET  /.well-known/ai-service.json

2) Onboarding
   POST /api/public/agent-signup        -> tenant.apiKey

3) Pricing / compatibility
   GET  /api/pricing                    (requires x-api-key unless public tenant is configured)
   POST /api/compatibility

4) Payment (PPO)
   POST /api/checkout/create            (x-api-key + x-idempotency-key)
   GET  /api/checkout/status?paymentId=...

5) Gate + execute
   GET  /api/agents/{agentId}/gate
   POST /api/agents/{agentId}/execute
```

---

## 1) Discovery (public)

- `GET /.well-known/ai-service.json`
- `GET /api/capabilities`
- `GET /api/pricing`
- `POST /api/compatibility`
- `GET /api/docs/ai-service-discovery` (markdown)

Operational contract (public):

- `GET /api/docs/go-live-contract` (markdown)

---

## 2) Onboarding (get `x-api-key`)

- `POST /api/public/agent-signup`

Notes:

- This endpoint is `POST` only. Opening it in a browser (which does `GET`) may return `405`.
- Public signup requires a JSON body with required fields. If you send only `{ "source": "..." }` you will get `400` with `reasonCode: "MISSING_FIELDS"`.

Minimal request body (recommended):

```json
{
  "name": "My Agent",
  "email": "my-agent@example.com",
  "agentType": "buyer",
  "intendedUse": "autonomous agent integration",
  "acceptsTermsVersion": "2026-01-v1",
  "acceptsFixedPricing": true,
  "billingMode": "prepaid",
  "currency": "USD"
}
```

Response:

- `tenant.apiKey` → use it in `x-api-key` for tenant-scoped endpoints.

---

## 3) Checkout / Payment

### 3.1 Create checkout (tenant)

- `POST /api/checkout/create`

Headers:

- `x-api-key: <TENANT_API_KEY>`
- `x-idempotency-key: <client-generated-key>` (recommended)

Body (high level):

- `currency`
- `providerHint`: `pix` | `crypto`
- `lineItems[]`: must include at least `operation` and `units`
- `proofMeta`: binds the payment to the execution context

Currency notes:

- `currency` is a per-checkout parameter. The signup `currency` is a tenant default.
- If `providerHint=pix`, `currency` **must be `BRL`**.

Important invariants:

- `proofMeta.taskType` MUST match `lineItems.operation`.

Idempotency:

- With `x-idempotency-key`, the server deduplicates by `(tenantId, x-idempotency-key, request payload hash)`.
- In production, this is guaranteed by persistence (Postgres).
- Re-sending the same request returns the same `paymentId`.
- Reusing the same key with a different payload returns `409`.

### 3.2 Poll payment status (tenant)

- `GET /api/checkout/status?paymentId=...`

Notes:

- `status` ∈ `pending` | `paid` | `failed`
- `pending` may persist (provider latency + infra cold start).
- The server may revalidate with the provider after some time when status is still `pending`.

---

## 4) Gate + Execute (tenant)

### 4.1 Gate (read-only, tenant)

- `GET /api/agents/{agentId}/gate?taskId=...&taskType=...&requireSignature=...`

Response:

- Always `HTTP 200`
- `allowed: true | false`
- If blocked, `reason` ∈ `NO_PPO` | `NO_MATCHING_PPO` | `MISSING_SIGNATURE` | `INVALID_SIGNATURE` | `INSUFFICIENT_UNITS`

### 4.2 Execute (tenant)

- `POST /api/agents/{agentId}/execute`

Body:

- `taskId` (string)
- `taskType` (string)
- `requireSignature` (optional boolean)

Semantics:

- If blocked: `HTTP 403` with `reason: "PPO_GATE_BLOCKED"` and `gate` payload.
- If allowed: `HTTP 200` and execution result.

Important:

- Execution consumes **1 unit per successful `POST /execute` call** (current backend behavior).
- `POST /execute` is not an idempotent “exactly once” RPC. If you need at-most-once semantics, implement it at the agent/SDK layer.

---

## 5) Proofs, verification, and receipts

### 5.1 Tenant-scoped proof fetch

- `GET /api/agents/{agentId}/proofs`
- `GET /api/payment-proofs/{id}`

### 5.2 Public verification

- `GET /verify/{proofId}` (human-friendly)
- `GET /api/guarantee-proofs/{proofId}` (machine-friendly)

---

## 6) Ledger / balance / settlements (tenant)

- `GET /api/agents/{agentId}/ledger`
- `GET /api/agents/{agentId}/balance`
- `GET /api/agents/{agentId}/settlements`

---

## 7) Retry and failure handling

- `POST /api/checkout/create`:
  - Always send `x-idempotency-key`.
  - On `409` (in progress), wait and retry.

- `GET` endpoints:
  - Use exponential backoff.
  - Respect `429 Retry-After`.

- Payment status `failed`:
  - Treated as final in the go-live contract.

---

## 8) Error compatibility

Do not build business logic on free-form strings.

- Prefer:
  - HTTP status class (4xx vs 5xx)
  - stable fields like `ok`, `allowed`, and `gate.reason`.
