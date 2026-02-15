# Phoenix Zero — Enterprise Customer Onboarding & Operations (APIs)

## 0) Objetivo
Este documento é um runbook operacional, focado em engenharia/infra, para colocar um cliente em produção (Exchange, AI Marketplace, Gaming, Banking) usando as **APIs do Phoenix Zero**.

Ele cobre:
- Requisitos e credenciais
- Fluxo end-to-end (criar checkout → confirmar pagamento → gate → execute → verificação pública)
- Contrato mínimo de request/response
- Observabilidade, limites e troubleshooting

> Nota: os exemplos abaixo descrevem o **sistema real** (produção). O "demo" da landing simula apenas a confirmação de pagamento; o restante (infra/APIs/provas) é o mesmo caminho.

---

## 1) Rotas canônicas (o que o cliente realmente chama)
### 1.1 Descoberta e contrato (público)
- `GET /.well-known/ai-service.json`
- `GET /api/capabilities`
- `GET /api/pricing`
- `POST /api/compatibility`
- `GET /api/docs/ai-service-discovery`
- `GET /api/docs/agent-integration-contract`
- `GET /api/docs/go-live-contract`
- `GET /api/docs/agent-trust-model`
- `GET /api/docs/how-agents-pay`

### 1.2 Fluxo econômico (tenant-scoped)
- `POST /api/checkout/create`
- `GET /api/checkout/status?paymentId=...`

### 1.3 Execução (tenant-scoped)
- `GET /api/agents/{agentId}/gate?taskId=...&taskType=...`
- `POST /api/agents/{agentId}/execute`

### 1.4 Verificação pública (público)
- `GET /api/guarantee-proofs/{proofId}`
- Página humana: `/verify/{proofId}`

---

## 2) Autenticação e headers
### 2.1 Tenant API key
Para endpoints tenant-scoped, o cliente precisa de uma API key.

Headers aceitos:
- `x-api-key: pz_...`
- ou `Authorization: Bearer pz_...`

### 2.2 Idempotência
Para checkout creation (evitar pagamento duplicado), use:
- `x-idempotency-key: <string>`

O servidor trata este header como chave replay-safe por tenant.

---

## 3) Pré-requisitos (cliente)
### 3.1 Identidade do cliente (tenant)
O cliente precisa:
- `tenantId` (interno)
- `apiKey` (segredo)

### 3.2 Identidade do executor (agent)
O cliente define `agentId` (string) como **identificador estável do executor**.

Recomendação:
- Um `agentId` por sistema/serviço executor (ex.: `exchange_settlement_worker`, `marketplace_settlement_bot`, etc.)

### 3.3 “Operation” e “TaskType”
- **Operation** é o SKU/serviço cobrado (vem do catálogo em `/api/pricing`).
- **TaskType** participa do binding no proof/gate.

Regra operacional recomendada:
- Use `proofMeta.taskType` igual ao `operation` principal do `lineItems[0].operation`.

---

## 4) Fluxo end-to-end (produção)
### 4.1 Passo A — Descobrir operações suportadas
1) `GET /.well-known/ai-service.json`
2) `GET /api/capabilities`
3) `GET /api/pricing`

O cliente **não deve inventar** operations. Se não estiver em `/api/pricing`, trate como não suportado.

### 4.2 Passo B — Criar checkout (unidades)
`POST /api/checkout/create`

Header:
- `x-api-key: pz_...`
- `x-idempotency-key: <uuid ou hash>` (recomendado)

Body mínimo:
```json
{
  "currency": "USD",
  "providerHint": "crypto",
  "lineItems": [{ "operation": "reconcile_psp", "units": 100 }],
  "proofMeta": {
    "agentId": "exchange_settlement_worker",
    "taskId": "settlement_2026_02_14_0001",
    "taskType": "reconcile_psp",
    "taskInputHash": "sha256:<hex>",
    "taskOutputHash": "sha256:<hex>"
  }
}
```

Resposta esperada (estrutura):
```json
{
  "ok": true,
  "paymentId": "pay_...",
  "status": "pending",
  "provider": "nowpayments",
  "amountCents": 1234,
  "currency": "USD",
  "checkoutUrl": "https://..."
}
```

### 4.3 Passo C — Confirmar pagamento
- O cliente paga no `checkoutUrl`.
- O backend recebe webhook do provedor e muda o status para `paid`.

Para polling:
`GET /api/checkout/status?paymentId=pay_...`

### 4.4 Passo D — Gate (verificar liberação econômica)
`GET /api/agents/{agentId}/gate?taskId=...&taskType=...`

- Antes de `paid`: deve bloquear.
- Após `paid`: deve liberar.

### 4.5 Passo E — Execute
`POST /api/agents/{agentId}/execute`

Header:
- `x-api-key: pz_...`

Body mínimo:
```json
{
  "taskId": "settlement_2026_02_14_0001",
  "taskType": "reconcile_psp"
}
```

Resposta (estrutura):
```json
{
  "ok": true,
  "executed": true,
  "agentId": "exchange_settlement_worker",
  "taskId": "settlement_2026_02_14_0001",
  "taskType": "reconcile_psp",
  "proofId": "ppo_..."
}
```

### 4.6 Passo F — Verificação pública
- `GET /api/guarantee-proofs/{proofId}` (JSON para auditoria)
- `/verify/{proofId}` (página humana para auditor/contraparte)

---

## 5) Como isso se aplica aos 4 verticais
A infraestrutura/contrato é o mesmo. O que muda é:
- `operation` / `taskType`
- o **schema do arquivo** (CSV/JSON) e a semântica do `taskInputHash` / `taskOutputHash`

### 5.1 Exchange
- Uso típico: reconciliação/settlement
- Evidence sharing: auditoria e contrapartes

### 5.2 AI Marketplace
- Uso típico: settlement de execuções (compute units/hours/cost)
- Evidence sharing: builders, enterprise customers, compliance

### 5.3 Gaming
- Uso típico: payouts por batch (tournament payouts)
- Evidence sharing: players, partners, auditoria antifraude

### 5.4 Banking
- Uso típico: reconciliação regulatória e trilha de auditoria
- Evidence sharing: auditor interno/externo, compliance

---

## 6) Limites e garantias operacionais
- **Rate limit**: endpoints principais têm rate limits por tenant/ip (retornam `429` com `Retry-After`).
- **Idempotência**:
  - Use `x-idempotency-key` em `checkout/create`.
- **Consistência econômica**:
  - `gate`/`execute` devem bloquear sem pagamento confirmado.

---

## 7) Troubleshooting (erros comuns)
### 7.1 `401 Unauthorized`
- `x-api-key` ausente/errado.

### 7.2 `403` em `gate` / `execute`
- Normalmente é falta de PPO válido (pagamento ainda `pending`) ou mismatch em `taskId/taskType`.

### 7.3 `429 Rate limit`
- Respeitar `Retry-After`.
- Reduzir polling de `checkout/status`.

### 7.4 Pagamento fica `pending` “para sempre”
- Webhook não está chegando.
- Base URL pública incorreta.
- Secret do provedor divergente.

---

## 8) O que o cliente precisa para iniciar (checklist)
- API key (`x-api-key`)
- Definir `agentId` estável
- Mapear `operation/taskType` via `/api/pricing`
- Implementar `checkout/create` com `x-idempotency-key`
- Implementar polling de `checkout/status`
- Implementar gate+execute
- Publicar verify URLs para auditoria (`/verify/{proofId}`)
