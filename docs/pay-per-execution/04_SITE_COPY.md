# PPE — Site Copy (copiar/colar)

## HERO
**Pay‑per‑execution AI agents.**
Only pay when execution happens.

## SUBTITLE
Run AI agents securely.
Execution is released only after payment confirmation.

## WHAT THIS IS
Phoenix Zero PPE is an API‑first payment‑gated execution layer for AI agents.

## WHO THIS IS FOR
- AI agent builders who need monetization and economic enforcement for autonomous actions
- SaaS products exposing paid capabilities (paid API actions) without subscriptions
- Platforms/marketplaces that must prevent unpaid executions

## ROLES (UCP-style)
- Platform/Agent: discovers pricing, creates checkout, triggers execution
- Phoenix Zero PPE: enforces payment-gated execution, issues proof (PPO), tracks settlements
- Payment rails: PIX (Asaas) and crypto (NowPayments, beta)

## HOW IT WORKS
Negotiation → Acquisition → Completion:
1) Discover & validate (Discovery/Pricing/Compatibility)
2) Create checkout (PIX / crypto)
3) Payment confirmation generates a proof
4) Execute after confirmation
5) Receive result + receipt/proof

## WHY THIS EXISTS
- No unpaid executions
- No human approval
- Fully automated
- Built for agents and developers

## KEY FEATURES
- Dynamic discovery: `/.well-known/ai-service.json`
- Agent-friendly pricing & compatibility endpoints
- PPO Gate: execution is blocked until paid (machine-readable errors)
- Verifiable proof: public `/verify/<proofId>` + tenant-scoped PPO APIs
- Multi-provider payments: BRL (PIX) + USD (crypto, beta)
- Webhook idempotency (safe against replay)

## TRANSPORT
REST-first today. MCP/A2A adapters can be added without changing the core API.

## USE CASES
- Paid automation workflows
- Agent execution marketplaces
- Proof of execution receipts
- Content authenticity proofs (phase 2)

## PRICING (texto público)
Transparent. Per execution. No hidden fees.

## CTA
Get an API key

## FAQ
### Can agents call the API directly?
Yes. The API is designed for autonomous agents.

### What happens if payment fails?
Execution is not released.

### Do you store my data?
Only execution metadata required for billing and proof.

### Is this subscription‑based?
No. Pay only for what you execute.

### Do you support crypto?
Yes (beta). Via NowPayments.

### Do you depend on payment providers?
We use established payment rails to move money (PIX and crypto). Standard processing fees may apply. The system is designed to be modular so additional providers can be supported.

## O QUE VOCÊ DEVE FALAR (sempre)
- “Pay‑per‑execution”
- “Execution only after payment”
- “API‑first”
- “Built for agents”
- “No human approval”

## O QUE VOCÊ NÃO DEVE FALAR (nunca)
- “Impossível burlar”
- “Antifraude avançado”
- “Tokenização / economia autônoma”
- “Blockchain interno”
- “Arquitetura proprietária”
