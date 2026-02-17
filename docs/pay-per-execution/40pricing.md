Pay‑per‑use funciona? Sim — mas não sozinho (senão você morre antes do volume)
# PRICING (GO-LIVE) — OPTION 1: Activation Fee + Platform Access

This document defines the go-live pricing model for Phoenix Zero under **Option 1**.

## Global rules

- **Currency anchor**: USD
- **Settlement accepted**: USD wire, stablecoins (USDT/USDC/DAI), or local currency converted at payment time (e.g., BRL)
- **Taxes**: prices exclude local taxes
- **Billing model (go-live)**: **Activation Fee + Platform Access**
- **Pay-per-use / overage**: **not public at go-live** (available **by contract only** for Growth/Enterprise/Sovereign)
- **Agent payments**: **agent-assisted only** (autonomous payments disabled by default)

## Machine-readable source of truth

- `GET /api/packaging`
- `GET /.well-known/ai-service.json` (includes `packaging` URL)
- `GET /api/capabilities` (includes `discovery.packaging`)

## Canonical unit model

- **Canonical unit (backend)**: `execution_unit`
- **Offerings** may use a display unit for commercial presentation, but billing and capacity are anchored to `execution_unit`.

## Tiers (global)

All tiers include:

- Reserved capacity
- Explicit rate limits
- Clear SLA target
- Agent-assisted payments (human approval required)

### Tier table (public anchors)

| Tier | Activation Fee (USD) | Platform Access / month (USD) | Included capacity | SLA | Support |
|---|---:|---:|---:|---:|---|
| Foundation | 12,000 | 15,000 | 8,000 `execution_unit` / month | 99.5% | Async |
| Operational | 25,000 | 32,000 | 20,000 `execution_unit` / month | 99.9% | Priority |
| Enterprise | 45,000 | 58,000 | 50,000 `execution_unit` / month | 99.95% | 24x7 |
| Sovereign | Custom | Custom | Custom | Custom | TAM + Engineering |

Notes:

- **Overage is not publicly priced** at go-live.
- Contracts may enable overage pricing and higher rate limits.

## Offerings (verticals)

Offerings are for intent mapping and commercial messaging.
Agents must select the vertical via `offerings[]` in well-known/capabilities/packaging — not by parsing landing pages.

### Exchange

- **offeringId**: `exchange`
- **Allowed operations**: `reconcile_psp`, `audit_bc_compliance`
- **Template**: `/templates/exchange_settlement_template.csv`
- **Display unit**: `proof_batch` (conversion: `1 batch = 1 execution_unit`)

### Banking / Fintech

- **offeringId**: `banking`
- **Allowed operations**: `reconcile_psp`, `audit_bc_compliance`
- **Template**: `/templates/banking_reconciliation_template.csv`
- **Display unit**: `compliance_proof` (conversion: `1 proof = 1 execution_unit`)

### AI Marketplace

- **offeringId**: `ai-marketplace`
- **Allowed operations**: `agent_compute`
- **Template**: `/templates/ai_marketplace_template.csv`
- **Display unit**: `verified_execution` (conversion: `1 execution = 1 execution_unit`)

### Gaming

- **offeringId**: `gaming`
- **Allowed operations**: `payout_mass`
- **Template**: `/templates/gaming_tournament_template.csv`
- **Display unit**: `validated_payout` (conversion: `1 payout = 1 execution_unit`)

## Agent policy (go-live)

- Agents can:
  - discover offerings and tiers
  - estimate cost (catalog-driven)
  - prepare checkout request payloads
- Agents cannot:
  - pay autonomously (unless explicitly enabled by contract via feature flag)