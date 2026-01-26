# Architecture Flow (Phoenix Zero — Agentic)

## Visão geral (fluxo)

```text
        Provedor de pagamento (ex.: Asaas)
                    |
                    |  (webhook)
                    v
      /api/webhooks/pix (Next.js route)
                    |
                    | atualiza status do PaymentIntent
                    v
            PaymentIntent: paid
                    |
                    | cria/atualiza
                    v
          PPO (Payment Proof Object)
                    |
                    | entra no histórico
                    v
          Agent Ledger (determinístico)
                    |
                    | rootHash (auditoria)
                    v
            Settlement Engine (L13+)
                    |
                    | advance/revert (admin)
                    v
          Agent Balance Computation
                    |
                    | gate server-side
                    v
     /api/agents/[agentId]/execute (execução)
```

---

## Componentes

- **Next.js API Routes (`apps/web/src/app/api/**`)**
  - Webhooks: `/api/webhooks/*`
  - Admin ops: `/api/admin/*`
  - Agent APIs: `/api/agents/*`

- **Libs (`apps/web/src/lib/**`)**
  - PPO / ledger / gate
  - Settlement
  - Antifraud
  - Slashing
  - Escrow
  - Reputação

- **Persistência local**
  - Diretório `.pz-tmp/*` (JSON)
  - Ideal para dev/test; pode ser substituído por DB/append-only log em produção.

---

## Como os testes exercitam a arquitetura

- `agentic-stress-test.ts`:
  - Cria tenants/agentes
  - Simula eventos e valida invariantes
  - No L3 (com `ASAAS_API_KEY`), cria PaymentIntent real e valida webhook forgery/replay

Documentação de execução:
- `docs/AGENTIC_STRESS_TEST_RUNBOOK.md`
