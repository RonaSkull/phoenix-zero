# PPE — Contrato de API (o que clientes/agentes chamam)

## 1) Princípios
- API‑first.
- O site é "documentação e legitimação"; a venda real acontece via API.
- Autenticação por `x-api-key` (tenant).

## 2) Autenticação
- Header: `x-api-key: <TENANT_API_KEY>`

## 3) Checkout / Pagamento

### `POST /api/checkout/create`
Cria uma intenção de pagamento (PaymentIntent) e retorna `paymentId` e `checkoutUrl`.

Campos importantes:
- `providerHint`: `pix` | `crypto`
- `lineItems`: array (pricing)
- `proofMeta`: metadata para PPO/prova

Recomendação para `lineItems` (clareza):
- `product`: o “tipo de entrega” (ex.: `video_protection`, `document_protection`)
- `operation`: a operação canônica (ex.: `protect_video`)

### `GET /api/checkout/status/...`
Consulta status de pagamento (o formato exato pode variar; confirme no código e mantenha sincronizado com este doc).

## 4) Execução condicionada

### `GET /api/agents/[agentId]/gate`
Retorna se existe permissão econômica (PPO/Gate) para executar.

### `POST /api/agents/[agentId]/execute`
Executa apenas se o Gate permitir.

## 5) Provas

### `GET /verify/<proofId>` (público)
Página pública de prova.

### `GET /api/payment-proofs/[id]`
Retorna o PPO.

### `GET /api/agents/[agentId]/proofs`
Lista PPOs por agente.

### `GET /api/agents/[agentId]/ledger`
Agregado econômico do agente.

## 6) Admin (não expor publicamente)
- Endpoints sob `/api/admin/*` exigem `x-admin-token`.

## 7) Compatibilidade
- Não quebrar clientes:
  - `lineItems.operation` antigo ainda deve funcionar.
  - `lineItems.product` deve ser aceito como input adicional.

## 8) Exemplos (placeholder)
Este documento deve ser atualizado com exemplos reais (curl) após confirmar os caminhos exatos de `status`.
