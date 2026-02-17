# Go‑Live Compilation (Internal) — Phoenix Zero PPE + Sovereign Verticals

This document is **internal only**. It compiles what was implemented for go‑live: agent discovery, vertical selection, pricing/packaging (Option 1), and end‑to‑end operational flow.

Public go‑live contract references:

- `docs/pay-per-execution/40pricing.md`
- `GET /.well-known/ai-service.json`
- `GET /api/capabilities`
- `GET /api/packaging`
- `GET /api/docs/agent-integration-contract`
- `GET /api/docs/go-live-contract`

Internal pricing analysis:

- `docs/pay-per-execution/41_internal_pricing_by_landing.md`

---

## 1) High-level architecture (agent-first)

Principle:

- Landing pages are for humans.
- Machines (agents / multi-agents) operate via:
  - `/.well-known/ai-service.json` (canonical discovery)
  - `/api/capabilities` (machine summary + auth model)
  - `/api/packaging` (go‑live pricing/packaging catalog — Option 1)
  - `/api/pricing` (operation catalog / tenant policy)

Goal:

- An agent can select a vertical (exchange/banking/ai-marketplace/gaming) **without parsing HTML**.

---

## 2) Canonical discovery surface

### 2.1 Well-known

- `GET /.well-known/ai-service.json`

Contains:

- `serviceId`, `version`
- canonical endpoint links (`pricing`, `capabilities`, `compatibility`, docs)
- `packaging: "/api/packaging"`
- `offerings[]`:
  - `offeringId`
  - `landingUrl`
  - `templateUrl`
  - `defaultTaskTypes`
  - `allowedOperations[]` (strict whitelist per vertical)

### 2.2 Capabilities

- `GET /api/capabilities`

Contains:

- `discovery` including `packaging: "/api/packaging"`
- `auth.public` includes `/api/packaging`
- `offerings[]` duplicated for convenience (agents can fetch only capabilities and still choose vertical)

### 2.3 Packaging (go-live pricing catalog)

- `GET /api/packaging`

This is the **source of truth** for go‑live commercial packaging.

Key invariants:

- `goLiveModel: option_1_activation_plus_access`
- `currencyAnchor: USD`
- `pricesExcludeTaxes: true`
- `unitModel.canonicalUnit: execution_unit`
- `commercialPolicy.overagePublic: false`
- `agentPolicy.mode: agent_assisted`

What `/api/packaging` provides:

- `tiers[]`:
  - `activationFeeUsd`
  - `platformAccessMonthlyUsd`
  - included capacity in `execution_unit`
  - `rateLimits` (planning + safety)
  - SLA/support hints
- `offerings[]`:
  - `allowedOperations[]`
  - `templateUrl`
  - `displayUnit` + `conversion` (commercial display only)

---

## 3) Vertical model (4 landings / 4 offerings)

Each vertical is an offering.

### 3.1 Exchange

- `offeringId`: `exchange`
- `landing`: `/for-exchanges`
- `template`: `/templates/exchange_settlement_template.csv`
- `allowedOperations`: `reconcile_psp`, `audit_bc_compliance`
- display unit: `proof_batch` (conversion: 1 batch = 1 execution_unit)

### 3.2 Banking / Fintech

- `offeringId`: `banking`
- `landing`: `/for-banking`
- `template`: `/templates/banking_reconciliation_template.csv`
- `allowedOperations`: `reconcile_psp`, `audit_bc_compliance`
- display unit: `compliance_proof` (conversion: 1 proof = 1 execution_unit)

### 3.3 AI Marketplace

- `offeringId`: `ai-marketplace`
- `landing`: `/for-ai-marketplaces`
- `template`: `/templates/ai_marketplace_template.csv`
- `allowedOperations`: `agent_compute`
- display unit: `verified_execution` (conversion: 1 execution = 1 execution_unit)

### 3.4 Gaming

- `offeringId`: `gaming`
- `landing`: `/for-gaming`
- `template`: `/templates/gaming_tournament_template.csv`
- `allowedOperations`: `payout_mass`
- display unit: `validated_payout` (conversion: 1 payout = 1 execution_unit)

---

## 4) End-to-end flow for agents (go-live)

### 4.1 Discovery (public)

1) `GET /.well-known/ai-service.json`
2) `GET /api/capabilities`
3) `GET /api/packaging`

Agent selects:

- `offeringId` based on intent
- Tier based on budgets / governance (Option 1 anchors)

### 4.2 Onboarding (get tenant credential)

- `POST /api/public/agent-signup` → returns tenant `apiKey`

Tenant-scoped endpoints require:

- `x-api-key: <TENANT_API_KEY>`

### 4.3 Compatibility and pricing

- `POST /api/compatibility`
- `GET /api/pricing` (tenant or public tenant if configured)

Important:

- `offerings.allowedOperations` is the vertical whitelist.
- `/api/pricing` is the operation catalog and policy.

### 4.4 Payment + idempotency

- `POST /api/checkout/create`
  - must include `x-idempotency-key`
- `GET /api/checkout/status?paymentId=...`

### 4.5 Gate + execute

- `GET /api/agents/{agentId}/gate`
  - always HTTP 200; uses `allowed/reason`
- `POST /api/agents/{agentId}/execute`
  - if blocked: 403 + `PPO_GATE_BLOCKED`

### 4.6 Proof verification

- Public verify (human-friendly): `GET /verify/{proofId}`
- Machine-friendly (if available): `GET /api/guarantee-proofs/{proofId}`

---

## 5) Go-live pricing model (Option 1) — operational meaning

Go-live public stance:

- Activation Fee + Platform Access are the public anchors.
- Overage is not publicly priced.

Why this matters operationally:

- Predictable revenue per client.
- Controlled capacity via tier rate limits.
- Negotiation room for enterprise procurement.

---

## 6) Operational guardrails (recommended)

- Keep `/.well-known`, `/api/capabilities`, `/api/packaging` public and stable.
- Keep vertical selection strictly via `offerings[]`.
- Keep the canonical unit stable: `execution_unit`.
- Default to agent-assisted payments; enable autonomy only per contract.

---

## 7) Known docs

- `docs/ENTERPRISE_CUSTOMER_ONBOARDING_AND_OPERATIONS.md`
- `docs/AI_AGENT_END_TO_END_OPERATION.md`
- `docs/pay-per-execution/40pricing.md` (public go-live pricing contract)
- `docs/pay-per-execution/41_internal_pricing_by_landing.md` (internal analysis)

---

## 8) Next step (pending)

- `d46`: commercial playbook formal + landing copy alignment:
  - show “Capacity starts at …”
  - CTA “Request quote”
  - link to `/api/packaging`
