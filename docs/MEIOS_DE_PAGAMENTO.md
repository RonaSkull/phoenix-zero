# Meios de Pagamento

## Objetivo
Este documento consolida o estado atual da arquitetura de pagamentos do Phoenix Zero (Agentic Payments) e as integrações com:

- Asaas (PIX / boleto / cartão via API)
- Stripe (cartão) (stub por enquanto)
- NOWPayments (cripto) (invoice real via env; assinatura IPN + idempotência; webhook reconcilia por providerPaymentId)

O foco é manter um **contrato único e estável** de checkout para clientes e agentes, com **providers plugáveis** e **reconciliação por webhook**.

---

## Status atual (resumo)

### Asaas
- Cadastro: **feito**
- Conta ativa: **ok**
- PIX/boleto/cartão disponíveis: **ok**
- Tela “Vendas físicas / Asaas Tap”: **ignorar** (maquininha/NFC; não é o caso)

### Backend (Agentic Payments)
- `PaymentIntent` (persistência em `tmp/payment-intents.json`): **ok**
- `POST /api/checkout/create`: **ok**
- `GET /api/checkout/status?paymentId=`: **ok**
- Webhooks:
  - `POST /api/webhooks/pix` (Asaas + payload normalizado; token + idempotência): **ok**
  - `POST /api/webhooks/stripe` (normalizado; stub): **ok**
  - `POST /api/webhooks/nowpayments` (invoice real por env; assinatura IPN + idempotência): **ok**

### Billing (dinheiro → produto)
- `BillingAccount` (persistência em `tmp/billing-accounts.json`): **ok**
- Quando `PaymentIntent.status=paid`: transiciona `BillingAccount.status=paid` e registra evento `payment_received` no `usage-ledger`: **ok**
- `GET /api/billing/account` retorna `isActive` + `accessStatus`: **ok**

### Guardrails (pagou → executou)
Para fechar o loop de produto (sem UI / sem humano), endpoints de valor podem retornar:

- HTTP `402` + JSON `{ ok:false, reason:'Payment required', billing:{ status, isActive:false } }`

Isso significa:
- o agente/produto deve **criar checkout** (`POST /api/checkout/create`) e guiar o usuário
- acompanhar status via `GET /api/checkout/status`
- após `paid`, repetir a chamada do endpoint de valor

### Pendências de produção
- **Aprovação do cadastro/limites** no Asaas (quando aplicável)
- **Domínio + hospedagem** para registrar webhooks reais em produção
- **Stripe**: integrar pagamento real e validar assinatura do webhook (`stripe-signature`)

---

## Segurança / Anti-fraude (hardening mínimo)

### Princípios
- **Nunca confiar em `paymentId` vindo do body**.
- Sempre mapear pagamento interno pelo **`providerPaymentId`**.
- **Assinatura/token do provedor** (quando configurado) + **idempotência** por `eventId`.

### Idempotência
Eventos processados são persistidos em:

- `tmp/payment-webhook-events.json`

Isso garante que replays do provedor (ou ataques) não duplicam transições.

---

## Arquitetura (Agentic Payments)

### Conceito
A camada de pagamentos é uma camada de **intenção** (PaymentIntent) com providers plugáveis.

- O resto do sistema não “depende” do provider.
- O provider só entrega:
  - criação do pagamento (checkout/invoice/PIX)
  - callbacks/webhooks de status

### Contrato principal (estável)
Endpoint único:

`POST /api/checkout/create`

Entrada (exemplo recomendado):

```json
{
  "tenantId": "t_bank_xyz",
  "pricingProfileId": "default",
  "pricingVersionId": "pv_2026Q1_campaigns",
  "lineItems": [
    {
      "product": "video_protection",
      "durationSeconds": 120,
      "proofGrade": "legal",
      "authenticityLevel": "legal",
      "exposure": "public",
      "guaranteeWindow": "30d",
      "units": 1
    }
  ],
  "currency": "BRL",
  "providerHint": "pix"
}
```

Saída (agent-friendly):

```json
{
  "ok": true,
  "paymentId": "pay_...",
  "status": "pending",
  "provider": "pix",
  "amountCents": 12345,
  "currency": "BRL",
  "checkoutUrl": "https://...",
  "instructions": "...",
  "pricing": {
    "pricingProfileId": "default",
    "pricingVersionId": "pv_2026Q1_campaigns"
  }
}
```

### Consulta de status

`GET /api/checkout/status?paymentId=pay_...`

Retorna:

- `paymentId`
- `provider`
- `status` (`pending|paid|failed`)
- `amountCents`
- `currency`
- `providerPaymentId`

### Reconciliação (webhook)
Regra central:

- **Nunca confiar em `paymentId` vindo do body**.
- Sempre mapear pelo **`providerPaymentId`** (id do provedor).

Isso já está implementado para:

- PIX Asaas (`/api/webhooks/pix`)
- NOWPayments (`/api/webhooks/nowpayments`)

---

## Asaas (PIX) — integração

### Variáveis de ambiente

```env
PAYMENTS_PIX_PROVIDER=asaas
ASAAS_API_KEY=sk_live_xxx
ASAAS_WEBHOOK_SECRET=uuid_forte_gerado_no_webhook
# opcional:
ASAAS_ENV=sandbox
# opcional override:
ASAAS_API_BASE=https://api.asaas.com
```

### O que acontece no create (PIX)
Quando `providerHint=pix` e Asaas estiver configurado:

1) Cria (ou reaproveita) `Customer` no Asaas, cacheado por `tenantId`
2) Cria cobrança PIX (`/v3/payments` com `billingType=PIX`)
3) Busca QR payload (`/v3/payments/{id}/pixQrCode`)
4) Salva:
   - `providerPaymentId = <id do payment no Asaas>`
   - `checkoutUrl = invoiceUrl` (quando existir)
   - `instructions = invoice + payload`

### Webhook (PIX)
Endpoint:

`POST /api/webhooks/pix`

Atualmente aceita:
- payload normalizado (para testes locais)
- payload do Asaas (quando você registrar o webhook no painel)

Hardening implementado:
- valida `asaas-access-token` quando `ASAAS_WEBHOOK_SECRET` estiver setado
- idempotência por `eventId`

---

## NOWPayments (Cripto)

### Variáveis de ambiente

```env
PAYMENTS_CRYPTO_PROVIDER=nowpayments
NOWPAYMENTS_API_KEY=...
NOWPAYMENTS_IPN_SECRET=...
# opcional:
NOWPAYMENTS_API_BASE=https://api.nowpayments.io
```

### O que acontece no create (crypto)
Quando `providerHint=crypto` e NowPayments estiver configurado:

1) Cria invoice via `POST /v1/invoice`
2) Salva:
   - `providerPaymentId = <id/invoice_id do NowPayments>`
   - `checkoutUrl = invoice_url` (se retornado)
   - `instructions = Invoice: ...`

### Webhook (Cripto)
Endpoint:

`POST /api/webhooks/nowpayments`

Reconciliado por `providerPaymentId` (não por paymentId externo).

Hardening implementado:
- valida `x-nowpayments-sig` quando `NOWPAYMENTS_IPN_SECRET` estiver setado (HMAC SHA-512 do body raw)
- idempotência por `eventId`

---

## Stripe (Cartão)

Status atual:
- Endpoint existe (`/api/webhooks/stripe`) mas é **stub**

Próximo passo:
- integrar criação de Checkout Session / PaymentIntent
- validar assinatura do webhook (`stripe-signature`)

---

## Fluxo Agentic (exemplo prático)

### Exemplo: agente criando checkout e liberando acesso
1) Agente calcula/seleciona `pricingProfileId` + `pricingVersionId` (contrato de preço)
2) Chama `POST /api/checkout/create`
3) Entrega `checkoutUrl`/instruções para o cliente
4) Em loop:
   - chama `GET /api/checkout/status?paymentId=...`
   - quando `paid`, libera plano/uso

Opcional (agent-friendly):
- agente/produto pode checar `GET /api/billing/account` e usar `isActive`/`accessStatus`

Pseudo:

```ts
// agent loop
const checkout = await post('/api/checkout/create', payload)
while (true) {
  const st = await get('/api/checkout/status?paymentId=' + checkout.paymentId)
  if (st.status === 'paid') {
    // liberar acesso
    break
  }
  await sleep(5000)
}
```

---

## Smoke tests (local)
Já foram executados smoke tests via `npx tsx` para:

- criar `PaymentIntent`
- reconciliar via `providerPaymentId`
- transicionar `pending -> paid`

Observação:
- testes com Asaas/NowPayments reais exigem API keys válidas e acesso à internet.

---

## Pendências (para produção)

- Aprovação do cadastro/configuração de conta no Asaas (quando aplicável)
- Domínio + hospedagem (para registrar webhooks em URLs públicas)
- Assinatura e segurança:
  - Stripe: validar assinatura webhook

Observação:
- PIX/Asaas e Crypto/NowPayments já possuem validação de autenticidade (token/IPN) e idempotência quando as envs `ASAAS_WEBHOOK_SECRET` / `NOWPAYMENTS_IPN_SECRET` estão setadas.
- O billing link (paid → BillingAccount + `payment_received`) já está implementado.
