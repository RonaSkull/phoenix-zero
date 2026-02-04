# Agent Trust & Enforcement Model

This document describes how decisions are made, how executions are authorized, and why certain blocks happen by design in the Pay‑Per‑Execution model.

The goal is to make the technical contract between agents, the platform, and payments explicit, without ambiguity.

## 1. Decision vs Execution

### Decision

Decision happens before any real execution. It answers the question:

"Can this agent execute this action right now?"

It involves only deterministic checks:

- Agent identity
- Existence of a valid PPO
- Governance rules (cooldown, limits)

No side effects occur here.

### Execution

Execution only happens after the decision returns `allowed: true`.

"Now that it is authorized, the action will be executed."

If something fails during execution, it is not a trust problem, but a runtime issue (model, infra, timeout, etc.).

## 2. Hard Gates (actual enforcement order)

The gates below are evaluated in sequence. Any failure blocks immediately.

### 2.1 Identity Gate

Checks:

- known `agentId`
- registered `publicKey`
- valid signature (Ed25519)
- time window (`issuedAt`) when the flag is enabled

Common failures:

`INVALID_SIGNATURE`

`ISSUED_AT_OUT_OF_WINDOW`

### 2.2 PPO Gate (Payment Proof Object)

Checks:

- PPO exists
- PPO matches task/model/amount
- PPO not consumed

Expected failure before payment:

`NO_MATCHING_PPO`

This is the system's hard financial gate.

### 2.3 Governance Gate

Checks algorithmic policies:

- cooldown
- per-agent rate
- period limits

Everything is deterministic and auditable.

## 3. Deterministic vs Derived

### Deterministic (core)

- Identity
- PPO
- Governance

These never depend on subjective scoring.

### Derived (read‑model)

- Trust score
- Reputation
- Risk heuristics

These do not block execution directly. They are used for:

- observability
- ranking
- alerts

## 4. Why Trust Score is not core

Trust score:

- changes over time
- depends on history
- can be recalculated

Using it as a gate would create:

- non-determinism
- disputes that are hard to audit

That is why it lives outside the critical path.

## 5. Failure Modes (expected by design)

| Code | Meaning |
| --- | --- |
| `NO_MATCHING_PPO` | payment not completed yet |
| `INVALID_SIGNATURE` | invalid identity |
| `COOLDOWN_ACTIVE` | governance blocked |
| `PPO_CONSUMED` | PPO already used |

These errors do not indicate a bug. They indicate the contract is being enforced.

## 6. Mental model

No payment → no execution

No valid identity → no decision

Trust score observes, it does not decide

This model guarantees:

- predictability
- auditability
- security against replay and abuse
