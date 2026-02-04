# PPE — Go‑Live Contract (Public API)

This document defines the **explicit operational contract** for Phoenix Zero PPE at go‑live.

Objective:

- Remove ambiguity for customer/agent integrations
- Reduce support load ("this is a bug" vs "this is expected behavior")
- Protect the product against integrations that assume incorrect patterns

## Quick reference

| Topic | Rule |
| --- | --- |
| Idempotency (checkout) | Use `x-idempotency-key` on `POST /api/checkout/create` |
| Status `pending` | May persist (provider latency + webhooks + cold start) |
| Status `failed` | **Final** at go-live (`failed -> paid` is ignored) |
| Gate | Always `HTTP 200` (use `allowed`/`reason`) |
| Blocked execute | `HTTP 403` + `reason: "PPO_GATE_BLOCKED"` |

Main endpoints:

```text
POST /api/checkout/create
GET  /api/checkout/status?paymentId=...
GET  /api/agents/{agentId}/gate
POST /api/agents/{agentId}/execute
```

## 1) Checkout creation — `POST /api/checkout/create`

Currency:

- PIX/Asaas: `currency` **MUST be `BRL`**.

- Without `x-idempotency-key`: **not idempotent**.
  - Each **successful** request creates a new `paymentId`.

- With `x-idempotency-key`: **idempotent (per tenant)**.
  - The server deduplicates by `(tenantId, x-idempotency-key)`.
  - In production, this is guaranteed by persistence (Postgres).
  - Re-sending the same request (same key + same effective payload) returns the **same** `paymentId`.
  - Reusing the same key with a **different payload** returns **HTTP 409** (conflict).
  - If creation is still in progress for that key, returns **HTTP 409** (in progress); clients must wait and retry.

Client rules:

- Clients **MUST** use `x-idempotency-key` and can safely retry.
- On timeout/network error:
  - retry with the **same** `x-idempotency-key`
  - on **HTTP 409** (in progress), wait and retry
  - if still indeterminate, resolve via reconciliation (e.g., checking provider/checkout URL) according to your flow.

## 2) Payment status — `GET /api/checkout/status?paymentId=...`

Possible states (high level):

- `pending`
- `paid`
- `failed`

Operational notes:

- `pending` may persist for an indeterminate amount of time (provider latency + webhooks + cold start).
- The backend may revalidate with the provider **eventually** (not strong synchronization).

Finality:

- **`failed` is final at go‑live.**
- Transitions `failed -> paid` are ignored by design.

## 3) Webhooks (PIX/Asaas and Crypto/NowPayments)

- Events are deduplicated by the provider `eventId`.
- Delivery order is not guaranteed.
- Provider retries are expected.

## 4) Economic gate — `GET /api/agents/{agentId}/gate`

- Returns **HTTP 200** even when execution is blocked.
- Block/allow is expressed via JSON fields:
  - `allowed: true | false`
  - `reason`

Clients **MUST NOT** infer permission based on HTTP status semantics.

## 5) Execution — `POST /api/agents/{agentId}/execute`

Semantics:

- `403` with `reason: "PPO_GATE_BLOCKED"` → execution blocked (not paid / policy)
- `500` with `reason: "EXECUTE_FAILED"` → internal execution failure

Retries:

- `403` **MUST NOT** be retried.
- `500` may be retried at the client's discretion.

## 6) Error semantics (compatibility)

- Free-form messages like `reason`/`error` are **descriptive**, not strict contracts.
- Clients **MUST NOT** implement business logic based on error strings.

## 7) Environment expectations

- The service may experience cold starts and processing delays.
- Payments may take time to reflect (operational design, not necessarily a defect).

## 8) Go-live scope

- PIX/Asaas: supported.
- Crypto/NowPayments: beta/experimental (supported, but subject to operational availability; may be disabled by operational decision).
