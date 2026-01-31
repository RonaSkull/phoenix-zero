# PPE — Pendências finais (go-live público)

Este documento é a **lista consolidada** de pendências e decisões finais do PPE para go-live.

Objetivo:

- não perder contexto entre sessões
- separar claramente o que bloqueia go-live público vs o que pode ir para beta vs pós-live
- apontar itens que geram suporte/ambiguidade mesmo quando “tecnicamente funciona”

Base:

- `https://phoenix-zero-web.onrender.com`

---

## 1) Classificação (decisão do comitê)

### ❌ Bloqueadores de go-live público

- **Idempotência / contrato de retry do `POST /api/checkout/create`**
  - risco: cliente com retry automático gerar múltiplas cobranças para o mesmo pedido lógico.
  - decisão necessária: contrato explícito (já documentado em `17_GO_LIVE_CONTRACT.md`) e/ou mecanismo de idempotência (se vier depois, muda o contrato).

- **Semântica de “failed” (finalidade) e caso `failed -> paid`**
  - risco: cliente paga, mas o sistema ignora e não libera execução (suporte/chargeback).
  - decisão necessária: declarar **`failed` como final** no go-live (já documentado em `17_GO_LIVE_CONTRACT.md`).

### ⚠️ Riscos aceitáveis em beta (comunicados, mas não bloqueadores)

- **Contratos implícitos de erro**
  - clientes vão fazer parse de `reason` e inferir semântica por HTTP.
  - mitigação: centralizar o contrato de semântica em `17_GO_LIVE_CONTRACT.md` e manter exemplos consistentes.

- **Pending indefinido + delays operacionais (provider + cold start)**
  - risco: tickets de “paguei e não refletiu”.
  - mitigação: documento + copy no frontend (sem promessas fortes).

- **Abandono + retomada (checkout criado, volta horas depois)**
  - risco: expectativa de validade/expiração não explícita.
  - mitigação: documentar expectativa: status pode permanecer `pending` e o provedor define expiração; execução só após `paid`.

- **Polling agressivo / loops de gate e status**
  - risco: custo operacional (mesmo com rate limit) e fricção (429).
  - mitigação: documentar rate limits e recomendar polling “saudável” nos exemplos.

### 🟢 Pode ser pós-live

- **Chaos / auditor externo** (validação de escala e UX)
- **WhatsApp WABA** (se `/verify/<proofId>` for o canal principal; WhatsApp vira upgrade)
- **Hardening equivalente para Crypto** (se Crypto não for anunciado como GA no go-live)

---

## 2) Evidências (suiteRunId) — hardening sênior

- `provider-downtime` `provider_timeout`: `hardening_2026-01-31T16-32-19-696Z`
- `provider-downtime` `webhook_never_arrives`: `hardening_2026-01-31T16-59-16-650Z`

---

## 3) Higiene obrigatória (Render) antes do go-live

- Remover flags temporárias:
  - `PHOENIX_ZERO_SIMULATE_PROVIDER_DOWNTIME`
  - `PHOENIX_ZERO_SIMULATE_PROVIDER_TIMEOUT_MS`
  - `PHOENIX_ZERO_ALLOW_SIMULATED_FAILURE`
  - `PHOENIX_ZERO_PPO_FAILURE_POLICY` (voltar default)
  - `PHOENIX_ZERO_SETTLEMENT_RISK_WINDOW_MS_*` (remover overrides)

- Rodar **1 hardening suite completa pós-higiene** e registrar `suiteRunId` como evidência final.

---

## 4) Onde o contrato vive e como o cliente vê

- Documento fonte (repo):
  - `docs/pay-per-execution/17_GO_LIVE_CONTRACT.md`

- Exposição pública (API):
  - `GET /api/docs/go-live-contract` (markdown)

- Frontend:
  - página `/ppe` deve linkar o contrato explicitamente (reduz suporte e ambiguidades).

---

## 5) Lista de pendências operacionais (curta)

- **(Render) Higiene de envs temporárias** (remover flags acima + redeploy limpo)
- **Rodar suite completa pós-higiene** e registrar `suiteRunId`
- **WhatsApp**: diagnosticar delivery / WABA (se for parte da promessa de produto)
- **Crypto**: decidir se é anunciado como GA ou beta (e alinhar com hardening)
