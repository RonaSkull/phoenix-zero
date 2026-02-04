# Phoenix Zero PPE

Pay-Per-Execution Infrastructure for AI Agents

## 1) One-line definition
Phoenix Zero PPE is **Pay-Per-Execution infrastructure** for AI agents and automation systems: **payment before execution**, with **verifiable proof** and strict enforcement.

## 2) Overview

Phoenix Zero PPE provides a machine-readable commerce and execution layer designed specifically for AI agents operating autonomously or semi-autonomously.

Agents can:
- Discover the service and its endpoints programmatically
- Read pricing in a machine-readable format
- Validate compatibility before paying
- Create prepaid checkouts (PIX / crypto)
- Execute operations only after payment confirmation (PPO gate)
- Rely on webhook idempotency and tenant isolation

Phoenix Zero PPE is not a marketplace and not a negotiation protocol.
It is a deterministic execution infrastructure with fixed pricing and strict enforcement.

## 3) What Phoenix Zero PPE is NOT
- Not a marketplace
- Not a negotiation protocol
- Not post-paid billing
- Not an e-commerce stack (catalog/cart/logistics/returns)
- Not an identity verification system for agents

## 4) Why Phoenix Zero PPE exists
Traditional payment flows are human-centric and do not map well to autonomous execution.

Phoenix Zero PPE is built around three requirements:
- Agents need machine-readable contracts (HTTP + JSON + reason codes)
- Execution must be enforced server-side (not “by convention”)
- Payment and execution must be tightly linked

## 5) Core principles
- Pay-Per-Execution: no execution without a valid paid proof
- Agent-native discovery: standard endpoints for discovery, pricing and constraints
- Fixed pricing: deterministic pricing declared upfront (no negotiation)
- Replay-safe: webhook idempotency + strict proof consumption rules
- Transport: REST-first today

## 6) Key capabilities (current)

### 6.1 Discovery
- `GET /.well-known/ai-service.json`

Declares service identity and where agents should call:
- pricing
- compatibility
- docs

### 6.2 Pricing (public)
- `GET /api/pricing`

Notes:
- Public readability depends on the public tenant configuration (`PHOENIX_ZERO_PUBLIC_API_KEY`).

### 6.3 Compatibility validation
- `POST /api/compatibility`

Goal:
- Prevent agents from paying for unsupported operations
- Return explicit reason codes and guidance

### 6.4 Tenant onboarding (get `x-api-key`)
- `POST /api/public/agent-signup`

Notes:
- Public endpoint, rate-limited
- Returns `tenantId` and `apiKey` (use as `x-api-key`)

### 6.5 Checkout & payment
- `POST /api/checkout/create`

Payment rails:
- BRL via PIX (Asaas)
- USD via crypto (NowPayments)

### 6.6 Pay-Per-Execution gate (PPO)
Execution is enforced by the backend:
- Before payment: execution is blocked with machine-readable reason codes
- After payment: PPO is issued and execution can be allowed for matching task/operation rules

Proof visibility:
- Public: `/verify/<proofId>`
- Tenant-scoped APIs: `/api/payment-proofs/*`, `/api/agents/*/proofs`, `/api/agents/*/ledger`

## 6.7 Agent model (practical)

Phoenix Zero PPE is designed to work with multiple agent profiles:

- Buyer agents (autonomous purchase + execution)
- Enterprise buyer agents (fixed pricing + auditability via proofs)
- Planner / executor splits (one component buys, another executes)
- Human-in-the-loop flows (optional)

The system does not assume:

- Negotiation
- Long-term contracts
- Agent identity verification

Everything is transactional and explicit.

## 7) Official go-live segments (explicit)

### Segment #1 — Automation-as-a-Service (B2B)
Definition:
- Running automations/executions per job/event, without subscriptions

Why it fits:
- Pay-per-execution is the product model
- Proof + refunds + idempotency are core requirements

Who decides:
- Head of Engineering / Platform
- Ops / RevOps / Growth
- Data / Risk / Compliance
- Enterprise Architects

### Segment #2 — Agent builders / agent platforms
Definition:
- Teams and platforms building agents that must charge, execute, and prove execution

Why it fits:
- They do not want to build billing + proof + enforcement
- One platform integration can unlock many agents

Who decides:
- Platform teams
- Founders of agent-first startups
- Enterprise internal agent teams

### Segment #3 — Digital service marketplaces (not physical goods)
Definition:
- Paid digital operations (verification, risk signals, analysis, compliance)

Why it fits:
- Service execution maps to deterministic operations and units
- Proof and idempotency matter for auditability

Who decides:
- Product + Engineering leadership
- Compliance/Risk owners

## 8) Buyer reality check (how you are compared)
Phoenix Zero PPE is typically compared against:
- Internal “gambiarras” (manual invoicing, spreadsheets, manual approvals)
- Subscription pricing that does not match execution-based cost
- Orchestrators (automation tools) that do not provide payment enforcement

It is NOT directly compared to UCP as a product.
UCP is a commerce interoperability spec focused on shopping/checkout primitives.
PPE is execution gating + proof.

## 8.1) PPE vs UCP (honest comparison)

| Criteria | Phoenix Zero PPE | UCP |
| --- | --- | --- |
| Focus | Execution + payment gating + proof | Commerce interoperability (checkout/order primitives) |
| Enforcement | PPO gate enforced server-side | Spec-driven integration patterns |
| Agent readiness | Core requirement (discovery/pricing/compatibility + machine-readable errors) | Compatible, but broader scope |
| LATAM (PIX) | First-class | Not a core focus |
| Proof | Public proof page + PPO APIs | Not the core primitive |

## 9) LATAM/Brazil differentiators (go-live vs roadmap)
Go-live-friendly (already aligned):
- BRL-first payments (PIX) plus public verifiable proofs (`/verify/<proofId>`)
- Refund/revert flows with webhook idempotency
- WhatsApp notifications (when configured)

Roadmap (not go-live promises):
- Boleto pilot (evaluate fraud and settlement delays)
- Fiscal/NF-e and other regional compliance layers (only when demanded by enterprise volume)

## 10) Transport (no false promises)
Today:
- REST-first (HTTP/JSON) is the supported transport.

Roadmap:
- Thin adapters for agent transports (MCP/A2A) can be added as wrappers around the existing REST API.
- This does not require changing the core economic model or endpoints.

## 10.2 Security model (MVP, explicit)

- Tenant isolation via `x-api-key`
- Webhook secrets for payment providers (Asaas + NowPayments)
- PPO enforcement for execution (PPO gate)
- Optional signing of discovery/pricing is a post-go-live upgrade (see PPE docs)

No execution path should bypass payment validation.

## 10.1) Buyer landscape (examples, not promises)

This section is a practical map of who usually buys “pay-per-execution with proof” infrastructure.

### Automation-as-a-Service (B2B)

Who decides:
- Engineering / Platform teams
- Ops / RevOps / Growth
- Data / Risk / Compliance

Adjacent ecosystem (Brazil examples):
- Pipefy
- Take Blip
- Zenvia
- BotCity

Adjacent ecosystem (global examples):
- Zapier
- Make (Integromat)
- UiPath
- Automation Anywhere
- Workato

### Agent builders / agent platforms

Who decides:
- Agent platform teams
- AI/Automation leadership

Adjacent ecosystem (global examples):
- LangGraph
- CrewAI

### Digital services paid by execution

Who decides:
- Product + Engineering leadership
- Compliance/Risk owners

Adjacent ecosystem (Brazil examples):
- Serasa / Experian APIs
- idwall
- Unico

Adjacent ecosystem (global examples):
- Stripe Identity
- Onfido
- Trulioo

## 11) “Contract per vertical” (what must be explicit)
For each vertical/integration, the contract must explicitly state:
- What is the execution unit (`operation`)
- What is considered a paid proof
- What is the enforcement rule (what is blocked and why)
- What is out of scope (e.g., logistics, physical returns, identity verification)
- Where humans enter the loop (if any)

Example statement:
- “This service does not manage physical logistics or returns. It executes paid digital operations and releases execution only after payment confirmation.”

## 12) Current status (as operated today)

- Production backend deployed (Render)
- Discovery and pricing endpoints live
- PPO enforcement active (blocked before payment, allowed after paid)
- PIX and Crypto payment rails operational

## 13) Current limitations (explicit)

- No dynamic price negotiation
- No post-paid execution
- No agent identity verification
- No e-commerce primitives (catalog/cart/logistics/returns)

## 14) Getting started (agent perspective)

- Discover service: `GET /.well-known/ai-service.json`
- Read pricing: `GET /api/pricing`
- Validate compatibility: `POST /api/compatibility`
- Obtain tenant API key: `POST /api/public/agent-signup`
- Create checkout and pay: `POST /api/checkout/create`
- Execute operation after payment confirmation: `POST /api/agents/{agentId}/execute`

## 15) License & governance (honest)

- This repository does not currently include a top-level `LICENSE` file.
- Until a license is explicitly defined, treat the implementation as proprietary.
