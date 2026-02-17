# Internal — Pricing segmentation (go-live) by customer segment and vertical

This document is **internal only**. It provides segment-based guidance to sell and operate Phoenix Zero go-live pricing (Option 1) with minimal ambiguity.

Sources of truth:

- Public go-live pricing contract: `docs/pay-per-execution/40pricing.md`
- Machine-readable catalog: `GET /api/packaging`
- Internal economics framework: `docs/pay-per-execution/41_internal_pricing_by_landing.md`
- Go-live system compilation: `docs/pay-per-execution/42_go_live_compilation_internal.md`

---

## 1) Go-live commercial model (Option 1)

- Activation Fee + Platform Access are **public anchors**.
- Overage is **not publicly priced** at go-live (enabled only by contract).
- Canonical unit: `execution_unit`.
- Agent payments: **agent-assisted by default**.

Operational purpose:

- Ensure meaningful MRR even at low usage.
- Reserve capacity and protect the service via rate limits.
- Preserve negotiation room for enterprise procurement.

---

## 2) Customer segments (internal definitions)

These segments are **commercial/operational**, not just company size.

### 2.1 Segment S1 — “SMB serious operator”

Profile:

- Wants a working integration quickly.
- Limited internal compliance/legal bandwidth.
- Low tolerance for long procurement.

Primary risks (for us):

- High support time per dollar if scope is not constrained.

Default tier guidance:

- Foundation.

Sales positioning:

- “Activation establishes a verifiable execution environment.”
- “Monthly access reserves verified capacity.”

Scope guardrails (must be explicit):

- One offering only.
- One template type.
- One region / one PSP (if applicable).
- No custom retention, no custom residency.

### 2.2 Segment S2 — “Mid-market operator”

Profile:

- Recurring workflows.
- Has internal engineering team.
- Wants predictable operations and priority handling.

Default tier guidance:

- Operational.

Operational expectations:

- Higher sustained load.
- More consistent ticket volume, lower chaos than S1.

### 2.3 Segment S3 — “Enterprise (procurement + compliance)”

Profile:

- Long sales cycle.
- Requires SLA language, incident process, audit posture.

Default tier guidance:

- Enterprise.

Negotiation expectations:

- Always asks for discount.
- Always asks for add-ons (retention, exports, residency).

### 2.4 Segment S4 — “Sovereign / regulated mission-critical”

Profile:

- Custom contract.
- Data residency / isolation may be mandatory.

Default tier guidance:

- Sovereign (not public).

---

## 3) Segment → vertical mapping (what to push first)

### 3.1 Exchange (exchange)

Best-fit segments:

- S2, S3.

Why:

- Value is risk reduction and auditability.
- Buyers accept high anchor if story is compliance + deterministic settlement.

Avoid for:

- S1 unless scope is very narrow.

### 3.2 Banking / Fintech (banking)

Best-fit segments:

- Fintech: S2/S3 depending on compliance.
- Banking: S3/S4.

Why:

- High governance overhead. Low price signals “not serious.”

### 3.3 AI Marketplace (ai-marketplace)

Best-fit segments:

- S1 (builders) and S2.

Why:

- Faster cycle potential.
- Clear technical integration; less legal overhead.

### 3.4 Gaming (gaming)

Best-fit segments:

- S1 for smaller operators (if bounded scope).
- S2/S3 for platforms.

Why:

- Value ties to fraud reduction + payout trust.

---

## 4) Sales playbook guidance by segment (internal)

### 4.1 S1 (SMB serious operator)

Default offer:

- Foundation tier anchors.

Non-negotiables:

- Activation Fee must be paid (can be split 50/50 if needed).
- Scope must be constrained.

Discount guidance:

- Use time/effort levers instead of price:
  - reduce included scope
  - reduce retention
  - reduce support level

### 4.2 S2 (Mid-market)

Default offer:

- Operational.

Negotiation levers:

- Annual prepay discount only.
- Add-on bundles (exports/retention) can be phased in.

### 4.3 S3 (Enterprise)

Default offer:

- Enterprise.

Mandatory narrative:

- Reserved verified capacity + governance.
- Avoid “price per call”.

Approval matrix:

- Do not exceed 25% total discount without exec approval.

### 4.4 S4 (Sovereign)

Default offer:

- Sovereign (custom).

Standard approach:

- Paid discovery phase.
- Custom SLO/SLA.

---

## 5) Negotiation structure (internal)

Use 2-layer quoting:

- **List anchors** (public): from `/api/packaging`.
- **Commercial quote**: may apply discounts within policy.

Contractual-only features:

- Overage pricing (if enabled)
- Higher rate limits
- Autonomy feature flag for agent payments

---

## 6) Operations guidance (to keep maintenance low)

To minimize maintenance (internal priority):

- Keep onboarding self-serve:
  - templates in `/public/templates`
  - stable agent docs endpoints
- Enforce strict semantics:
  - idempotency on checkout create
  - gate returns 200 with allow/reason
  - avoid bespoke “one-off” workflows
- Enable autonomy only after:
  - budgets
  - human override
  - proven controls

---

## 7) Recommended packaging fields (future-proof)

When we evolve `/api/packaging` beyond v1, consider adding:

- `floorGuidance` (internal only; do not expose publicly)
- `segmentHints` (public-safe, e.g., recommendedTierByOffering)
- `quoteFlow` endpoints (prepare quote vs request sales)

