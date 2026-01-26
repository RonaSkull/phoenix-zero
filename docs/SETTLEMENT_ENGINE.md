# Settlement Engine (L13)

This document describes how Phoenix Zero derives a *settled*, usable agent balance from Payment Proof Objects (PPOs).

## Goals

- Separate **payment proof** from **usable balance**.
- Apply provider-specific **risk windows** (e.g. card chargeback risk) using `paidAt`.
- Provide **idempotent** and **auditable** state transitions.

## Data Model

The engine persists `SettlementEntry` records to:

- `.pz-tmp/settlements.json`

Key fields:

- `settlementId`: unique settlement record ID (`set_*`).
- `proofId`: PPO ID that originated this settlement.
- `paymentId`: PaymentIntent ID.
- `tenantId`, `agentId`: scoping.
- `amountCents`, `currency`: economic amount.
- `provider`, `providerPaymentId`: provider correlation.
- `status`: `pending | settled | reverted | expired`.
- `paidAt`: the timestamp used as the base time for risk calculations.
- `riskWindowEndsAt`: `paidAt + providerRiskMs(provider)`.
- `settledAt`, `revertedAt`: lifecycle timestamps.
- `version`: monotonically increasing on mutation.
- `sourceEventId`: optional correlation to the webhook/admin event that created/changed the entry.
- `lastUpdatedBy`: audit string (`system`, `webhook:*`, `admin:*`).
- `createdAt`, `updatedAt`.

## Lifecycle

### Creation (PPO -> Settlement)

A settlement is created when:

- A `PaymentIntent` transitions to `paid`, and
- A PPO is ensured/created with `status = paid_confirmed`.

The integration lives in `updatePaymentIntentStatus()`:

- Ensure PPO (`ensurePaymentProofForIntent`)
- Ensure settlement (`ensureSettlementForProof`)

`ensureSettlementForProof` is **idempotent** by `proofId`:

- If a settlement exists for `proofId`, the function returns it.
- If `sourceEventId` is provided and the existing settlement has no `sourceEventId`, it is updated (version bumped).

### Advancing (pending -> settled)

Settlements are advanced by `advanceSettlements({ nowMs })`:

- For each `pending` entry where `riskWindowEndsAt <= nowMs`, mark as `settled`.

This is exposed via:

- `POST /api/admin/settlement/advance`

### Reverting

Manual reversion is supported via `revertSettlement`:

- Target by `settlementId` or `proofId`
- Marks `status = reverted`, sets `revertedAt`, bumps `version`

This is exposed via:

- `POST /api/admin/settlement/revert`

## Provider Policies

Risk windows are currently defined in `apps/web/src/lib/settlement/store.ts`:

- `pix`: `0ms` (immediate)
- `crypto`: `0ms` (immediate)
- `card`: `7 days`

The engine computes:

- `riskWindowEndsAt = paidAt + providerRiskMs(provider)`

`paidAt` precedence:

1. `paidAt` passed from webhook (when available)
2. PPO `verifiedAt`
3. PPO `createdAt`
4. Engine `createdAt`

## Agent Balance

Balance is derived *only* from settlements, not directly from PPOs.

- `settled` -> `availableCents`
- `pending` -> `pendingCents`
- `reverted` -> `revertedCents`
- `expired` -> `expiredCents`

Computed by:

- `computeAgentBalance()` in `apps/web/src/lib/settlement/balance.ts`

Exposed via:

- `GET /api/agents/[agentId]/balance`

## Antifraud Semantics

- `antifraudDecision` is carried by the PPO (source of truth) and mirrored into the settlement record.
- `advanceSettlements()` evaluates antifraud at **advance time**:
  - `blocked`: the settlement transitions to `status = blocked` and **never reaches** `settled`.
  - `review`: the settlement stays `pending` (even if the risk window ended).
  - `clear`/unset: normal risk-window progression.
- Antifraud events are processed idempotently by `(source, eventId)`.

## Query API

- `GET /api/agents/[agentId]/settlements`
  - Returns a list of `SettlementEntry` for the tenant+agent.

## Operational Notes

- Storage is JSON-file based for local/dev/stress-test environments.
- The engine is designed so **creation is safe to call multiple times** (idempotent) and state changes are **versioned**.
- If you need to continuously advance settlements in production, run `/api/admin/settlement/advance` on a schedule (cron) with an admin token.
