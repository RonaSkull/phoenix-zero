# Internal pricing analysis — by landing (go-live)

This document is for **internal analysis only**.

Public go-live contract:

- `docs/pay-per-execution/40pricing.md`
- `GET /api/packaging`

## 0) Executive summary

- Go-live model: **Option 1** — Activation Fee + Platform Access (no public pay-per-use)
- Canonical unit: `execution_unit`
- Agents: agent-assisted payments only (default)
- Verticalization is done via `offerings[]` + `allowedOperations[]` + templates

## 1) Global commercial rules (internal)

### 1.1 List vs floor

- **List price**: public anchor; used to protect negotiation space.
- **Floor price**: internal minimum acceptable; requires approval to go below.

### 1.2 Discount policy (recommended caps)

- Annual pre-pay: up to **-18%**
- Predictable commit (volume or multi-year): up to **-7%**
- Strategic case: up to **-5%**
- Hard cap without exec approval: **-25% total**

### 1.3 Channel commissions (internal planning)

- Referral: **10%** (year 1)
- Reseller: **15%** (recurring)
- Delivery partner: up to **20%** (if they execute implementation)

### 1.4 Taxes / invoicing assumptions

- Public: prices exclude taxes.
- Internal planning: treat taxes as a separate envelope (jurisdiction-dependent).

## 2) Go-live tiers (global)

Source of truth: `GET /api/packaging`.

### 2.1 Tier anchors (list)

| Tier | Activation Fee (USD) | Platform Access / month (USD) | Included units / month | SLA | Support |
|---|---:|---:|---:|---:|---|
| Foundation | 12,000 | 15,000 | 8,000 | 99.5% | Async |
| Operational | 25,000 | 32,000 | 20,000 | 99.9% | Priority |
| Enterprise | 45,000 | 58,000 | 50,000 | 99.95% | 24x7 |
| Sovereign | Custom | Custom | Custom | Custom | TAM + Engineering |

### 2.2 Practical positioning

- Foundation is the smallest “real” entry point.
- Operational is default for continuous production workflows.
- Enterprise is for mission-critical operations with audit retention.
- Sovereign is not public.

## 3) Offerings (verticals) — how to price without changing the engine

Pricing is anchored to tiers globally.
Offerings differ by:

- Buyer persona and negotiation behavior
- Perceived risk and compliance burden
- Add-ons that change delivery cost

### 3.1 Exchange

- offeringId: `exchange`
- allowedOperations: `reconcile_psp`, `audit_bc_compliance`
- template: `/templates/exchange_settlement_template.csv`
- display unit: `proof_batch` (1 batch = 1 `execution_unit`)

Internal notes:

- Primary value: compliance risk reduction + auditability.
- Expect aggressive procurement negotiation; keep list price high.

Recommended tier guidance:

- Default: Operational / Enterprise
- Foundation: allowed only for narrow scope (single region / single PSP) if needed

Add-ons (internal):

- Extended retention
- Regulatory export pack
- Assisted audit runbook / quarterly audit support

### 3.2 Banking / Fintech

- offeringId: `banking`
- allowedOperations: `reconcile_psp`, `audit_bc_compliance`
- template: `/templates/banking_reconciliation_template.csv`
- display unit: `compliance_proof` (1 proof = 1 `execution_unit`)

Internal notes:

- Banking buyers optimize for reliability + compliance + governance.
- Expect slower cycles, higher ticket, higher internal cost of sales.

Recommended tier guidance:

- Default: Enterprise
- Foundation/Operational: only for fintechs with limited compliance scope

Add-ons (internal):

- Data residency / region pinning
- Retention (1–3 years)
- Forensic signing / higher proof grade

### 3.3 AI Marketplace

- offeringId: `ai-marketplace`
- allowedOperations: `agent_compute`
- template: `/templates/ai_marketplace_template.csv`
- display unit: `verified_execution` (1 execution = 1 `execution_unit`)

Internal notes:

- Buyers are sensitive to unit economics.
- Avoid publishing “cheap compute” framing.

Recommended tier guidance:

- Default: Foundation / Operational
- Enterprise: for marketplaces with vendor compliance and chargeback risk

Add-ons (internal):

- Invoice consolidation
- Sub-tenant keys
- Dedicated rate-limit envelopes

### 3.4 Gaming

- offeringId: `gaming`
- allowedOperations: `payout_mass`
- template: `/templates/gaming_tournament_template.csv`
- display unit: `validated_payout` (1 payout = 1 `execution_unit`)

Internal notes:

- Buyers care about fraud reduction and payout trust.
- Price can be justified via reduced dispute/chargeback + retention.

Recommended tier guidance:

- Default: Foundation / Operational
- Enterprise: for platforms with high payout volume and public audit trails

Add-ons (internal):

- Anti-fraud validation
- Tournament settlement mode
- Public audit trail bundles

## 4) Internal margin model (framework)

This section is a model template you can tune with real numbers.

### 4.1 Definitions

Let:

- `MRR` = platformAccessMonthlyUsd
- `Setup` = activationFeeUsd
- `Disc` = expected discount rate (0–0.25)
- `Comm` = channel commission rate (0–0.20)
- `Tax` = effective tax envelope rate (varies; set internally)
- `COGS_fixed` = monthly fixed operating cost allocation per client (support + infra reservation)
- `COGS_var` = variable cost per unit actually executed (if any)

### 4.2 Net revenue (monthly)

`NetMRR = MRR * (1 - Disc) * (1 - Comm) * (1 - Tax)`

### 4.3 Net profit (monthly)

`NetProfit = NetMRR - COGS_fixed - (UnitsUsed * COGS_var)`

### 4.4 Target check (your requirement)

Goal:

- `NetProfit >= 5,000 USD / month` for “small but real” clients

Practical levers:

- keep Foundation MRR high enough to absorb discount/commissions
- keep delivery scope narrow for Foundation to control `COGS_fixed`
- keep agent-assisted model to control fraud / support volume

## 5) Internal “floor guidance” (suggested)

These are internal guardrails (not public):

- Foundation floor MRR: do not go below a level where `NetProfit` drops under target.
- Activation fee floor: never discount below “integration cost recovery”.

## 6) How this maps to the product surface

- Humans see:
  - “Capacity starts at …”
  - “Request quote”
- Agents see:
  - `GET /.well-known/ai-service.json`
  - `GET /api/capabilities`
  - `GET /api/packaging`
  - `GET /api/pricing` (for operation list and policy)

## 7) Next actions

- Create `d46` playbook doc as a separate internal file (sales + discount approvals).
- Adjust landings to show:
  - Foundation / Operational / Enterprise “starting at” anchors
  - link to `/api/packaging`
  - request-quote CTA
