# Sovereign: endpoints, use cases, and integration (AI agents + enterprise)

This document describes Phoenix ZerØ Sovereign as two adoption surfaces:

- Machine-native adoption (AI agents): deterministic APIs an agent can call without dashboards.
- Enterprise adoption (humans/companies): intake + contract + operational evidence.

It also maps each use case to the existing endpoints (and any new endpoint we plan to add) and defines canonical request/response payloads.

## Core positioning (what Sovereign sells)

Sovereign is not a crypto checkout product.

Sovereign is a **Settlement Truth + Proof Engine**:

- Webhook ordering + idempotency hardening.
- Monotonic settlement state machine.
- Per-transaction proofs (PPO) that can be shared publicly and verified.
- Payment-gated execution (PPO Gate) to prevent unpaid execution.

## Two surfaces without duplicating the backend

We keep one backend and separate concerns via:

- **Route grouping / naming**:
  - `/api/agents/*` = machine-native runtime endpoints (deterministic, automatable).
  - `/api/public/*` = public enrollment/intake endpoints.
  - `/api/admin/*` = contract + ops controls (admin token).
- **Auth model**:
  - Tenant auth: `x-api-key` (required for almost all agent runtime endpoints).
  - Public: no auth (intake / proof verification).
  - Admin: `x-admin-token`.

If we want a cleaner external contract later, we can add alias routes like:

- `/api/agent/*` (alias to `/api/agents/*`)
- `/api/enterprise/*` (alias to `/api/public/sovereign-signup` + any future enterprise-only read endpoints)

…while keeping the internal implementation in a shared library module (no duplication).

## Official Sovereign useCase list (aligned with current stack)

These are the use cases supported by the system *today* (some are “packaging” of the same primitives).

Commercial (human-driven adoption):

- `crypto_settlement_assurance`
- `crypto_reconciliation_export`
- `public_proof_verification_links`
- `crypto_webhook_hardening`
- `payout_integrity_anti_replay`

Machine-native (agent adoption):

- `agent_executable_payment_gating`

If you later decide to extend with additional machine-native use cases, they should be introduced as **new endpoints that remain deterministic** and reuse the same primitives (PPO, settlement, proofs).

## Endpoint inventory (what exists today)

### Public (no auth)

- `GET /api/guarantee-proofs/{proofId}`
  - Purpose: public verification JSON for a proof.
  - Used by: `public_proof_verification_links`.

- `POST /api/public/agent-signup`
  - Purpose: self-signup to obtain an `x-api-key` for pay-per-execution (content) tenants.
  - Notes: machine-friendly; only requires `acceptsTermsVersion` + `acceptsFixedPricing`.

- `POST /api/public/sovereign-signup`
  - Purpose: enterprise intake for Sovereign (does not create a tenant).
  - Returns: `status=pending_review` and `requestId`.

- `POST /api/demo-request`
  - Purpose: generic demo request intake.

### Tenant-auth (x-api-key)

- `GET /api/pricing`
  - Purpose: discovery of pricing + operations + sovereign info.
  - Notes: contains a `sovereign` section; in the public catalog tenant it currently returns `enabled:false` with `reason:CUSTOM_PRICING_REQUIRED`.
  - Notes: the sovereign `operations` list is informational and may include placeholder taskTypes (e.g. `payout_mass`) that require a contract.

- `GET /api/compatibility` and `POST /api/compatibility`
  - Purpose: machine-readable “can I do this?” checks.
  - Notes: sovereign operations return `CUSTOM_PRICING_REQUIRED`.

- `POST /api/checkout/create`
  - Purpose: create a PaymentIntent (PIX or crypto), including proof metadata binding.
  - Notes: includes idempotency support via `x-idempotency-key`.

- `GET /api/checkout/status?paymentId=...`
  - Purpose: poll payment status; includes safe revalidation.

- `GET /api/agents/{agentId}/gate?taskId=...&taskType=...`
  - Purpose: PPO Gate check (allowed/blocked) for execution.

- `POST /api/agents/{agentId}/execute`
  - Purpose: execute a task; hard-blocks if no matching PPO.
  - Notes: includes optional signature enforcement and sovereign entitlement enforcement for sovereign taskTypes.

- `GET /api/agents/{agentId}/proofs`
  - Purpose: list payment proofs (PPOs) for that agent.

- `GET /api/payment-proofs/{id}`
  - Purpose: fetch a proof (tenant-auth only).

- `GET /api/agents/{agentId}/ledger`
  - Purpose: derived ledger view (units/consumption) for an agent.

- `GET /api/agents/{agentId}/settlements`
  - Purpose: settlement entries for an agent.

### Webhooks (provider -> backend)

- `POST /api/webhooks/nowpayments`
  - Purpose: NowPayments webhook (HMAC signature verification + idempotency + monotonic state updates).

### Admin (x-admin-token)

- `GET/POST/DELETE /api/admin/sovereign-contracts?tenantId=...&agentId=...`
  - Purpose: configure sovereign contracts (entitlements).

- `POST /api/admin/settlement/advance`
  - Purpose: advance settlement engine (ops/testing).

- `POST /api/admin/settlement/revert`
  - Purpose: revert settlement by proofId/settlementId.

## Canonical payloads (by useCase)

This section defines the *ideal* payloads for clients.

### useCase: crypto_settlement_assurance

This useCase is delivered by the combination of:

- `POST /api/checkout/create` (creates intent)
- `POST /api/webhooks/nowpayments` (confirms)
- `GET /api/checkout/status` (poll/revalidate)
- `GET /api/agents/{agentId}/proofs` (audit trail)
- `GET /api/agents/{agentId}/settlements` (state machine)
- `GET /api/guarantee-proofs/{proofId}` (public proof)

#### Create checkout (crypto)

Headers:

- `x-api-key: <TENANT_API_KEY>`
- `x-idempotency-key: <unique per checkout>` (recommended)

Body:

```json
{
  "providerHint": "crypto",
  "currency": "USD",
  "lineItems": [
    { "operation": "time_anchor_get", "units": 2000 }
  ],
  "proofMeta": {
    "agentId": "a_test_1",
    "taskId": "sv_20260213_080000",
    "taskType": "time_anchor_get",
    "taskInputHash": "sha256:...",
    "taskOutputHash": "sha256:..."
  }
}
```

Response:

```json
{
  "ok": true,
  "paymentId": "pi_...",
  "status": "pending",
  "provider": "crypto",
  "checkoutUrl": "https://..."
}
```

#### Poll status

`GET /api/checkout/status?paymentId=pi_...`

Response:

```json
{
  "ok": true,
  "paymentId": "pi_...",
  "status": "pending|paid|failed",
  "provider": "crypto"
}
```

#### Proof verification

- Tenant view: `GET /api/payment-proofs/{proofId}` (requires `x-api-key`).
- Public view: `GET /api/guarantee-proofs/{proofId}` (no auth).

### useCase: public_proof_verification_links

This is delivered by:

- `GET /api/guarantee-proofs/{proofId}`
- Public UI page: `/verify/{proofId}`

The guarantee proof JSON is meant to be shared with third parties and is safe for caching avoidance.

### useCase: crypto_webhook_hardening

This is delivered by:

- `POST /api/webhooks/nowpayments`

Notes:

- Requires `NOWPAYMENTS_IPN_SECRET` in production.
- Rejects invalid signatures.
- Dedupes events.
- Prevents status regression.

### useCase: payout_integrity_anti_replay

Today this useCase is expressed as a pattern:

- Payments create PPOs bound to `agentId+taskId+taskType`.
- Gate and execute block replay and swapping.

Endpoints:

- `POST /api/checkout/create`
- `GET /api/agents/{agentId}/gate`
- `POST /api/agents/{agentId}/execute`
- `GET /api/agents/{agentId}/ledger`

### useCase: crypto_reconciliation_export

Current state:

- We already have the primitives to build export: proofs + settlements + ledger.
- We do not yet have a single “export endpoint”.

Proposed endpoint (to be created):

- `GET /api/enterprise/reconciliation/export?from=...&to=...&format=csv|json`
  - Tenant-auth, optional admin-only depending on contract.

Until that exists, clients can pull:

- `GET /api/agents/{agentId}/proofs`
- `GET /api/agents/{agentId}/settlements`

…and build their own export.

### useCase: agent_executable_payment_gating

This is already implemented today.

The agent flow:

1) Discover constraints:

- `GET /api/pricing`
- `POST /api/compatibility` (optional)

2) Create a checkout with proof binding:

- `POST /api/checkout/create`

3) Wait for settlement confirmation:

- `GET /api/checkout/status`

4) Ask gate:

- `GET /api/agents/{agentId}/gate?taskId=...&taskType=...`

5) Execute:

- `POST /api/agents/{agentId}/execute` with the same `taskId` and `taskType`.

Canonical execute body:

```json
{
  "taskId": "sv_20260213_080000",
  "taskType": "reconcile_psp",
  "requireSignature": false
}
```

Response:

```json
{
  "ok": true,
  "executed": true,
  "agentId": "a_test_1",
  "taskId": "sv_20260213_080000",
  "taskType": "reconcile_psp"
}
```

## Pricing by call (volume-maximizing model)

A volume-maximizing model should price the **deterministic API calls** that create measurable load and value:

- `checkout_create_fee` (only when creating a PaymentIntent)
- `settlement_verification_fee` (gate/status/guarantee proof checks)
- `proof_issue_fee` (when a proof is issued, i.e., on paid confirmation)

Notes:

- The system already supports pay-per-execution via units.
- Sovereign enterprise contracts can price by:
  - per confirmed settlement
  - per proof verified
  - per month minimum + per-tx tiers

## What is missing (roadmap items for this document)

To fully support the commercial packaging for reconciliation and enterprise ops, we likely add:

- Reconciliation export endpoint.
- Enterprise-friendly read-only “proof search” endpoint (by providerPaymentId, date range).
- Hardening report verify endpoint inventory (if not already exposed under `/hardening/...`).

## Notes about current code mismatches

- `/api/pricing` may list some sovereign operations for informational purposes (e.g. `payout_mass`). These should be treated as **contract-only** and not as self-serve features.
- `/api/compatibility` treats taskTypes prefixed with `settle_` as sovereign. Ensure naming matches real product promises.

## Production verification (current deployment)

- Render health endpoint: `GET https://phoenix-zero-web.onrender.com/api/health`
- Deployed commit validated for the webhook hardening behavior (PIX unknown mapping fails safely): `5f968c234b72c63f211e64ba1701402b153be465`

