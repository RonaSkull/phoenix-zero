# WINDSURF_MEMORY.md

Este arquivo é uma memória fixa para dar continuidade ao projeto **Phoenix Zero** (repo `redesociaisvideo3s`), com foco no produto **Pay-Per-Execution (PPE)**.

## Objetivo do PPE (go-live)
- **Executar agentes só após pagamento confirmado**, com **Prova de Pagamento (PPO)** e registro/ledger.
- Webhooks de pagamento precisam ser **idempotentes** e **verificados por secret**.
- Persistência de estado financeiro deve sobreviver restart:
  - Preferencial: **Postgres** (`DATABASE_URL`) via KV `phoenix_zero_kv`.
  - Fallback local: `.pz-tmp/*`.

## Invariantes (não quebrar)
- Nunca executar endpoint de execução sem gate de **pagamento confirmado + PPO**.
- Webhooks: dedupe/replay-safe.
- Ledger/settlement: append-only/sem efeitos duplicados.
- Não logar/expor secrets.
- Evitar mudanças invasivas antes do go-live (somente extensões compatíveis).

## Autenticação
- Tenant: header `x-api-key`.
- Admin: header `x-admin-token` deve bater com `PHOENIX_ZERO_ADMIN_TOKEN`.

## Env vars (mínimo típico)
- `PHOENIX_ZERO_ADMIN_TOKEN`
- `PHOENIX_ZERO_PUBLIC_BASE_URL` (ex.: `https://phoenix-zero-web.onrender.com`)
- Persistência:
  - `DATABASE_URL`
  - `PGSSLMODE=require` (Render/Neon)
- PIX (Asaas):
  - `PAYMENTS_PIX_PROVIDER=asaas`
  - `ASAAS_API_KEY`
  - `ASAAS_WEBHOOK_SECRET`
  - `ASAAS_ENV=sandbox|production`
- Crypto (NowPayments):
  - `PAYMENTS_CRYPTO_PROVIDER=nowpayments`
  - `NOWPAYMENTS_API_KEY`
  - `NOWPAYMENTS_IPN_SECRET`
- Notificações (opcional):
  - WhatsApp via Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
  - Telegram: `TELEGRAM_BOT_TOKEN`

## Testes / validação
- Suite determinístico: `npm run test:agentic:e2e`
  - Observação: readiness check usa `GET /api/health`.
  - Não envia WhatsApp/Telegram a menos que o `customerContact` esteja presente no PPO e que as env vars estejam configuradas.
- Real mode (opcional): `npm run test:agentic:e2e:real:pix` / `:real:crypto`.

## Arquitetura (pontos de referência)
- Pricing/lineItems e criação de intent:
  - `apps/web/src/lib/payments.ts`
  - `apps/web/src/lib/pricing.ts`
- Webhooks:
  - PIX: `apps/web/src/app/api/webhooks/pix/route.ts`
  - NowPayments: `apps/web/src/app/api/webhooks/nowpayments/route.ts`
- Checkout:
  - `apps/web/src/app/api/checkout/create/route.ts`
  - `apps/web/src/app/api/checkout/status/route.ts`
- Notificação cliente (Twilio/Telegram): `apps/web/src/lib/customer-notify.ts`
- Persistência PG KV: `apps/web/src/lib/pg-kv.ts`

## Documentação PPE (fonte da verdade)
- Pasta: `docs/pay-per-execution/`

## Último marco conhecido
- Commit de go-live com compat de lineItems + docs PPE + fix readiness e2e (push para `origin/main`), disparando deploy no Render.
