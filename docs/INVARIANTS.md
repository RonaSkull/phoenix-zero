# Invariants (Phoenix Zero — Agentic)

Este documento lista invariantes que o sistema deve preservar. Eles são a base de auditoria, testes e futuras garantias formais.

---

## Invariantes de autenticação e autorização

- **I-001: Webhook autenticado quando secret está setado**
  - Se `ASAAS_WEBHOOK_SECRET` existe, o endpoint de webhook deve exigir `asaas-access-token` válido.

- **I-002: Endpoints admin exigem token**
  - Qualquer `/api/admin/*` deve exigir `PHOENIX_ZERO_ADMIN_TOKEN` válido.

---

## Invariantes de PPO / Ledger

- **I-101: PPO é derivado de pagamento confirmado (`paid`)**
  - Não deve existir PPO “paid” sem uma transição de pagamento para `paid`.

- **I-102: PPO não duplica por evento**
  - Para um `sourceEventId`/evento externo, no máximo um efeito contábil é aplicado (idempotência).

- **I-103: Ledger root hash é determinístico**
  - Mesma sequência ordenada de PPOs produz o mesmo `rootHash`.

---

## Invariantes de Gate / Execução

- **I-201: Execução nunca ocorre sem gate aprovado**
  - Qualquer ação “execute” deve passar pelo PPO Gate server-side.

- **I-202: Gate é função do estado do ledger/balance**
  - A decisão do gate não depende de estado externo não auditável.

---

## Invariantes de Settlement

- **I-301: Settlement não duplica por PPO**
  - Um PPO/`proofId` não pode gerar múltiplas liquidações efetivas para o mesmo agente.

- **I-302: Advance/revert são idempotentes**
  - Repetir advance/revert não pode corromper saldo.

- **I-303: Balance é consistente com (ledger + settlement state)**
  - `balance` deve ser reconstituível do histórico + settlement store.

---

## Invariantes de Slashing / Escrow / Reputação

- **I-401: Slashing não cria saldo**
  - Slashing apenas reduz/penaliza; nunca aumenta saldo total.

- **I-402: Escrow é contabilmente conservativo**
  - Colocar em escrow deve reduzir o disponível e aumentar o reservado, mantendo o total.

- **I-403: Reputação é derivável**
  - A reputação é função do histórico auditável (ledger/root hash + regras), não de inputs arbitrários.
