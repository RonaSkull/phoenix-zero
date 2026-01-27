# PPE — Segurança (MVP, realista)

## 1) Objetivo
Ser seguro o suficiente para go‑live **sem virar overkill**.

## 2) Ameaças reais no MVP
- Execução sem pagamento
- Replay de webhook
- Abuso de API (rate/credential stuffing)
- Vazamento de secrets

## 3) Controles mínimos obrigatórios
- Tenant auth via `x-api-key`
- `x-admin-token` apenas para admin endpoints
- Webhooks com segredo/assinatura:
  - Asaas token/header
  - NowPayments IPN signature (`NOWPAYMENTS_IPN_SECRET`)
- Idempotência em webhooks (eventId/sourceEventId)
- Gate de execução (PPO Gate) — nenhuma execução sem paid

## 4) Segredos
- Nunca logar tokens.
- Rotacionar:
  - `PHOENIX_ZERO_ADMIN_TOKEN`
  - `ASAAS_API_KEY` / `ASAAS_WEBHOOK_SECRET`
  - `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET`
  - `TELEGRAM_BOT_TOKEN`, credenciais Twilio

## 5) Rate limit
- Aplicar rate limit por API key e/ou IP.
- Preferir limites simples e claros.

## 6) O que NÃO prometer
- Não prometer “impossível burlar”.
- Não prometer “antifraude avançado” sem uma stack dedicada.

## 7) Observabilidade mínima
- Logar eventos de:
  - criação de intent
  - webhook recebido (sem payload sensível)
  - transição para `paid`
  - criação de PPO
  - execução liberada/bloqueada
