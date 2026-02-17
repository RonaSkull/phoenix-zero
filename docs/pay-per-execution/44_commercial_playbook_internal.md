# Commercial Playbook (Internal) — Phoenix Zero Go‑Live (Option 1)

This document is **internal only**.

Public pricing contract:

- `docs/pay-per-execution/40pricing.md`
- `GET /api/packaging`

---

## 1) What we sell at go‑live

Commercial model:

- **Activation Fee** (one-time)
- **Platform Access** (monthly)
- Overage is **contract-only** (not publicly priced at go-live)

Non-negotiables:

- Pricing anchors come from `/api/packaging`.
- Autonomous agent payments are **off by default**.

---

## 2) Sales motion (default)

### 2.1 Standard motion

- Demo (end-to-end) → verify URL + proof artifacts
- Technical call (30 min): map template + define proof semantics
- Activation + platform access proposal
- Contract signature and onboarding

### 2.2 What to avoid

- Selling “price per call” publicly.
- Promising custom workflows before the Activation scope is defined.

---

## 3) Discount policy (caps + rules)

Baseline principle:

- Discounts must preserve delivery viability and support burden.

Recommended caps (without exec approval):

- **Hard cap**: **-25% total**

Allowed buckets:

- Annual pre-pay: up to **-18%**
- Predictable commit (multi-year or volume commit): up to **-7%**
- Strategic case: up to **-5%**

Rules:

- Discounts stack until reaching the hard cap.
- Any discount beyond the hard cap requires exec approval.
- Discounts must be recorded with reason + scope.

---

## 4) Channel model (commissions)

- Referral: **10%** (year 1)
- Reseller: **15%** (recurring)
- Delivery partner: up to **20%** (if they execute implementation)

Requirements:

- Partner must be attached to tenant/account at quote time.
- Disputes resolved against signed partner terms.

---

## 5) Activation Fee — what it covers

Activation is not “setup time”. It purchases:

- Production-grade environment enablement
- Proof semantics agreement + template mapping
- Operational readiness gates

Guardrails:

- One offering (vertical) per activation by default.
- Add-ons expand scope (retention, residency, exports).

---

## 6) Platform Access — what it covers

Platform Access includes:

- Reserved verified capacity
- Rate limits and policy enforcement
- SLA target and support envelope (by tier)

Guardrails:

- Included monthly capacity is defined in `/api/packaging`.
- Overage is contract-only.

---

## 7) Quote structure (recommended)

Every quote should have:

- Tier name (Foundation/Operational/Enterprise/Sovereign)
- Activation fee + monthly access
- Included capacity (execution_unit/month)
- SLA + support
- Offering scope (exchange/banking/ai-marketplace/gaming)
- Add-ons (if any)

---

## 8) Autonomous agent payments (feature flag)

Default: **disabled**.

Enable only if all are true:

- Contract includes budgets/limits
- Human override defined
- Audit logs and proof meta are enforced

---

## 9) When to say no (protect maintenance)

Decline or delay if:

- Scope is unclear but customer demands custom workflows
- They want unlimited throughput without committing to tier
- They want autonomy without governance
- They demand deep discounts while requiring high-touch support
