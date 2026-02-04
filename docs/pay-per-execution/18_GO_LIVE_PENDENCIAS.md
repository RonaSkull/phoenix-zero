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

- Nenhum (idempotência do `POST /api/checkout/create` e política de `failed` como final já estão documentadas em `17_GO_LIVE_CONTRACT.md`).

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

---

## 2) Evidências (suiteRunId) — hardening sênior

- `provider-downtime` `provider_timeout`: `hardening_2026-01-31T16-32-19-696Z`
- `provider-downtime` `webhook_never_arrives`: `hardening_2026-01-31T16-59-16-650Z`

- **Pós-higiene (baseline suite completa)**: `hardening_2026-02-01T09-47-24-706Z` (12/12)

- **Hardening equivalente (Crypto)**: `hardening_2026-02-01T11-43-17-012Z` (12/12; `--only=crypto`)
- **Hardening Crypto + extra webhook tests**: `hardening_2026-02-01T13-21-14-614Z` (16/16; `--only=crypto`)

---

## 3) Higiene obrigatória (Render) antes do go-live

- Remover flags temporárias:
  - `PHOENIX_ZERO_SIMULATE_PROVIDER_DOWNTIME`
  - `PHOENIX_ZERO_SIMULATE_PROVIDER_TIMEOUT_MS`
  - `PHOENIX_ZERO_ALLOW_SIMULATED_FAILURE`
  - `PHOENIX_ZERO_PPO_FAILURE_POLICY` (voltar default)
  - `PHOENIX_ZERO_SETTLEMENT_RISK_WINDOW_MS_*` (remover overrides)

- Rodar **1 hardening suite completa pós-higiene** e registrar `suiteRunId` como evidência final.

Checklist (operacional):

1) Render Dashboard -> serviço `phoenix-zero-web` -> Environment:
   - deletar as variáveis acima (não “setar vazio”, e sim remover a chave)
2) Redeploy limpo (ou Restart do serviço)
3) Validar rapidamente (sem auth):
   - `GET /api/health`
   - `GET /.well-known/ai-service.json`
   - `GET /api/docs/go-live-contract`
   - `GET /api/docs/agent-integration-contract`
4) Rodar a **baseline hardening suite** (local) contra o Render e capturar o `suiteRunId`:

PowerShell (exemplo):

```powershell
$env:PHOENIX_ZERO_BASE_URL = "https://phoenix-zero-web.onrender.com"
$env:ASAAS_WEBHOOK_SECRET = "<ASAAS_WEBHOOK_SECRET do Render>"

# (opcional; só se você quiser incluir testes/fluxos crypto no harness)
# $env:NOWPAYMENTS_IPN_SECRET = "<NOWPAYMENTS_IPN_SECRET do Render>"

npm --prefix .\phoenix-zero-agent-simulations install
npm --prefix .\phoenix-zero-agent-simulations run sim:hardening
```

Evidência:

- o comando imprime um JSON no final com `suiteRunId: "hardening_..."`
- os artefatos ficam em `phoenix-zero-agent-simulations/out/<suiteRunId>/summary.json` e `summary.md`
- copiar o `suiteRunId` e colar na seção **2) Evidências** acima.

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
- **Rodar suite completa pós-higiene** e registrar `suiteRunId` (feito; ver seção 2)
- **Rodar hardening equivalente (Crypto)** e registrar `suiteRunId` (feito; ver seção 2)
- **WhatsApp**: diagnosticar delivery / WABA (se for parte da promessa de produto)
- **Crypto**: anunciar como beta/experimental (docs alinhados)