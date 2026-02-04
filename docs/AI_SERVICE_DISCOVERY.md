# Phoenix Zero — AI Service Discovery (PPE)

## Objective
This document defines the **agent-native** discovery and enforcement protocol for Phoenix Zero Pay-Per-Execution (PPE).

Phoenix Zero PPE is designed so autonomous agents can:
- Discover supported paid operations
- Create checkouts for a specific number of execution units
- Obtain a Proof of Payment Object (PPO)
- Execute tasks until units are exhausted

---

## 1) Discovery

### 1.1 Canonical discovery endpoint

`GET /.well-known/ai-service.json`

Agents SHOULD fetch this first.
It provides:
- Canonical `serviceId`
- `pricing` endpoint
- `compatibility` endpoint
- Capability guarantees

It also provides a `docs` URL that can be fetched over HTTP:
- `GET /api/docs/ai-service-discovery` (Content-Type: `text/markdown`)

Operational / integration contracts (HTTP):

- `GET /api/docs/go-live-contract`
- `GET /api/docs/agent-integration-contract`

Optional (recommended for blind agents):
- `GET /api/capabilities` (machine-friendly summary of endpoints, auth model, and supported operations)

---

## 2) Pricing catalog (LLM-friendly)

### 2.1 Catalog endpoint

`GET /api/pricing`

This endpoint MUST be treated as the canonical list of supported operations.

Rules:
- If an operation is not listed in `/api/pricing`, it should be treated as **not executable**.
- Agents MUST NOT guess pricing.

---

## 3) PPO model (Production-grade)

### 3.1 Concept

PPO is not an authorization token. PPO is a **binding execution balance**.

At minimum, a PPO proof must bind:
- tenant
- agent
- operation
- pricing snapshot (or equivalent immutable pricing reference)

### 3.2 Minimal PPO contract (LLM-friendly)

```json
{
  "proofId": "ppo_xxx",
  "operation": "protect_video",
  "totalUnits": 10,
  "usedUnits": 3,
  "remainingUnits": 7,
  "tenantId": "t_xxx",
  "agentId": "ag_xxx",
  "status": "paid_confirmed"
}
```

### 3.3 Execution rule (unit debit)

Each successful execution consumes units.
Units are debited atomically.

When blocked:

```json
{
  "ok": false,
  "reason": "PPO_NO_UNITS",
  "suggestion": "create_new_checkout"
}
```

---

## 4) Transactional pseudocode (atomicity)

The execution debit MUST be atomic and replay-safe.

```
BEGIN TRANSACTION

ppo = SELECT *
      FROM ppo_proofs
      WHERE proof_id = :proofId
      FOR UPDATE

if (!ppo) abort("PPO_NOT_FOUND")
if (ppo.status !== "paid") abort("PPO_NOT_PAID")
if (now() > ppo.expires_at) abort("PPO_EXPIRED")

// Context binding
if (
  ppo.agent_id  !== req.agentId ||
  ppo.tenant_id !== req.tenantId ||
  ppo.operation !== req.operation ||
  ppo.price_snapshot_hash !== hash(req.pricingContext)
) abort("PPO_CONTEXT_MISMATCH")

if (ppo.used_units + req.units > ppo.total_units) abort("PPO_NO_UNITS")

UPDATE ppo_proofs
SET used_units = used_units + req.units,
    updated_at = now()
WHERE proof_id = :proofId

INSERT INTO ppo_executions (...)
VALUES (..., "executed", null, now())

COMMIT

// Execute task outside the transaction
result = executeTask()
return { ok: true, result }
```

---

## 5) Compatibility feedback (machine-readable)

If an agent is unsure how to map its intent to an operation, it should call:

`POST /api/compatibility`

Example request:

```json
{
  "operation": "protect_video",
  "intent": "analyze_video",
  "agentType": "autonomous",
  "supportsPpo": true
}
```

Example response:

```json
{
  "ok": true,
  "compatible": true,
  "operation": "protect_video"
}
```

---

## 6) Step-by-step (replication checklist)

1. Call `GET /.well-known/ai-service.json`
2. Call `GET /api/pricing`
3. Choose an `operation`
4. Create checkout with `lineItems[].units`
5. Wait payment confirmation
6. Execute `POST /api/agents/{agentId}/execute` until units are exhausted

