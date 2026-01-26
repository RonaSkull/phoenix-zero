# Case Real — Phoenix Zero (PIX R$1)

Este documento é um template para registrar um caso real (sanitizado) que qualquer auditor/engenheiro externo consegue validar.

---

## 1) Resumo

- **Data**: YYYY-MM-DD
- **Ambiente**: sandbox | produção
- **Provider**: Asaas PIX
- **Valor**: R$ 1,00 (ou o mínimo aceito pelo provedor/ambiente)
- **Objetivo**:
  - Gerar um PPO real
  - Obter `ledgerRootHash`
  - Gerar/avançar settlement (se aplicável)

---

## 2) Pré-requisitos

- Backend rodando (ex.: `npm run dev:web`)
- Env vars setadas no backend e no stress test:
  - `PHOENIX_ZERO_ADMIN_TOKEN`
  - `PHOENIX_ZERO_BASE_URL`
  - `ASAAS_WEBHOOK_SECRET`
  - `ASAAS_API_KEY`

Notas:
- Se `ASAAS_ENV=sandbox`, o backend força um mínimo de `500` cents (R$ 5,00) ao criar cobranças PIX (para evitar rejeições do ambiente sandbox).

Runbook:
- `docs/AGENTIC_STRESS_TEST_RUNBOOK.md`

---

## 3) Comandos executados (sanitizados)

```powershell
# backend (terminal A)
$env:PHOENIX_ZERO_ADMIN_TOKEN="***"
$env:ASAAS_WEBHOOK_SECRET="***"
$env:ASAAS_API_KEY="***"

npm run dev:web

# stress test (terminal B)
$env:PHOENIX_ZERO_BASE_URL="http://localhost:3000"
$env:PHOENIX_ZERO_ADMIN_TOKEN="***"
$env:ASAAS_WEBHOOK_SECRET="***"
$env:ASAAS_API_KEY="***"

npm run test:agentic
```

---

## 4) Artefatos gerados (cole aqui)

- **tenantId**: 
- **agentId**: 
- **paymentIntentId**: 
- **asaasPaymentId** (se existir): 
- **webhookEventId / sourceEventId**: 
- **ppoId / proofId**: 
- **ledgerRootHash**: 
- **settlementId** (se existir): 

---

## 5) Evidências (logs sanitizados)

Regras de sanitização:
- Não colar tokens.
- Redigir IDs sensíveis se necessário.

Cole trechos relevantes:

```text
<cole logs aqui>
```

---

## 6) Validações feitas

- [ ] Webhook forgery retorna `401` quando token inválido
- [ ] Replay do mesmo evento não duplica PPO/settlement
- [ ] Ledger root hash registrado
- [ ] (Opcional) advance/revert settlement testado
