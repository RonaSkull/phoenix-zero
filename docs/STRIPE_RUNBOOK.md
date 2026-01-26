# Stripe (Cartão) — runbook

## Objetivo

Garantir webhook seguro (assinatura) + idempotência + `paidAt` e reversões automáticas.

## Variáveis de ambiente

- `STRIPE_WEBHOOK_SECRET=...`

Observação:

- Em `NODE_ENV=production`, se `STRIPE_WEBHOOK_SECRET` não estiver setado, o endpoint retorna erro.

## Endpoint

- `POST /api/webhooks/stripe`

## Requisitos do Stripe

Configure no dashboard do Stripe:

- Webhook URL apontando para `/api/webhooks/stripe`
- Eventos recomendados:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `charge.refunded`
  - `charge.dispute.created`
  - `charge.dispute.funds_withdrawn`
  - `charge.dispute.closed`

## Idempotência

- O backend deduplica por `event.id` e retorna `{ deduped: true }` na repetição.

## Como o backend mapeia o pagamento

- O Stripe precisa enviar `metadata.paymentId` no objeto (ex: PaymentIntent/Charge/CheckoutSession).
- Esse `paymentId` é o `PaymentIntent.id` interno do Phoenix Zero.

## Reversões automáticas

- Em `charge.refunded` e eventos `charge.dispute.*`, o backend:
  - atualiza o intent para `failed`
  - reverte o settlement do PPO correspondente
