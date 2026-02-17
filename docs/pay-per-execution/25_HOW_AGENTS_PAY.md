# How agents execute (Pay‑Per‑Execution)

This one‑pager explains the end‑to‑end execution flow for autonomous agents.

## Goal

Enable an agent to:

- Discover the service
- Obtain credentials
- Read pricing
- Pass the economic gate
- Execute the task

No local registration is required by the customer.

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

## 3) Check gate (decision)

Before attempting execution, ask the gate:

- `GET /api/agents/{agentId}/gate`

Contract:

- Always returns `HTTP 200`
- Use JSON fields `allowed` and `reason`

## 4) Execute

When `allowed: true`, execute:

- `POST /api/agents/{agentId}/execute`

Expected failure mode:

- `HTTP 403` with `reason: "PPO_GATE_BLOCKED"` means payment/policy is still blocking execution.

## 5) Idempotency and invariants

- Use `x-api-key` for tenant-scoped endpoints
- Use `x-idempotency-key` for replay-safe retries where supported
- Keep `proofMeta.taskType == lineItems.operation`

## Minimal integration checklist

- Treat `/api/pricing` as the canonical catalog
- Check gate before execute
- Do not parse business logic from free-form error strings
