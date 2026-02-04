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

## Checkpoint (2026-01-29)
- E2E remoto (Render) passou com subset: `scripts/agentic-stress-e2e.ps1 -Mode real:pix -BaseUrl https://phoenix-zero-web.onrender.com -OnlyLevels L5,L11`.
- `scripts/agentic-stress-e2e.ps1`: adicionou `-OnlyLevels` e default `AGENTIC_STRESS_ONLY=L5,L11` em `real:*`.
- `agentic-stress-test.ts`: `L11` aceita `402` (tenant unpaid) como bloqueio válido em modo real; correções TS em `amountCents`.
- Agent Matrix (Render) passou com `failed: 0` e report salvo em `docs/pay-per-execution/agent-matrix-reports/`.
- `scripts/agent-matrix-runner.ts`: aumentou timeout e adicionou retry/backoff para cold start do Render (envs: `PHOENIX_ZERO_HTTP_TIMEOUT_MS`, `PHOENIX_ZERO_HTTP_RETRIES`).
- Commits:
  - `dc4e012` test(agentic): stabilize Render real E2E
  - `4cea2e2` test(agent-matrix): harden runner for Render

## Checkpoint (2026-01-30)

- Criado harness externo agent-native: `phoenix-zero-agent-simulations/` (fora do backend)
  - Personas: `automation_engineer`, `agent_founder`, `compliance_buyer`, `naive_agent`, `hostile_agent`
  - Runner: `npm run sim` grava artifacts em `phoenix-zero-agent-simulations/out/<suiteRunId>/`:
    - `summary.json`, `summary.md`
    - `agent-readiness-report.md` (one-pager enterprise gerado automaticamente)
  - Env vars principais:
    - `PHOENIX_ZERO_BASE_URL` (default: Render)
    - (opcional para automação full paid-flow) `ASAAS_WEBHOOK_SECRET`, `NOWPAYMENTS_IPN_SECRET`
    - (opcional para fluxo manual sem secrets) `PHOENIX_ZERO_WAIT_FOR_PAYMENT_MS` (poll em `/api/checkout/status`)
  - Requisito: Node >= 20 + `npm install` dentro da pasta

- Criado adapter MCP local (stdio) como wrapper do REST existente (não é feature do backend)
  - Rodar: `npm run mcp`
  - Tools: `discover`, `pricing`, `compatibility`, `checkoutCreate` (exige `apiKey`)

- Execução inicial da suite (Render) sem `ASAAS_WEBHOOK_SECRET`:
  - `suite_2026-01-30T11-19-36-115Z`: passou 2/5 (falhas: pagamento não confirmado + rate limit no signup)
  - Ajustes feitos no harness: retry/backoff para cold start e `agent-signup` (429), gap entre cenários
  - `suite_2026-01-30T11-24-31-475Z`: passou 2/5 (falhas: pagamento não confirmado)

- Hardening suite (Render) — resultado estável:
  - `hardening_2026-01-30T19-15-51-811Z`: **30/30**
  - `run-hardening.ts` passou a incluir testes "senior mode":
    - `auth-bypass`, `param-injection`, `agent-confusion`, `negotiation-abuse`, `cache-headers`, `rate-limit`

- Links públicos /verify:
  - `GET /verify/<proofId>` não deve quebrar links de Telegram/WhatsApp
  - Quando proof não existe: renderiza "Proof not found" (HTTP 200)
  - Quando proof existe mas não está publicável (refund/chargeback/pending): renderiza "Proof not available" (HTTP 200)

## Checkpoint (2026-02-01)

- Hardening suite crypto-only (Render) com testes extras de webhook NowPayments passou **16/16**:
  - `hardening_2026-02-01T13-21-14-614Z` (`--only=crypto`)
  - Evidência registrada em `docs/pay-per-execution/18_GO_LIVE_PENDENCIAS.md`.
- NowPayments: decisão de **não fixar `pay_currency`** por enquanto (deixar default/choice no provider).
  - Env opcional adicionada: `PHOENIX_ZERO_NOWPAYMENTS_PAY_CURRENCY` (se quiser fixar no futuro).
- Docs/copy alinhados para go-live conservador:
  - PIX/Asaas = GA; Crypto/NowPayments = beta/experimental.
  - Removida promessa explícita de `USDT/USDC` no pack PPE.
- Frontend `/ppe` alinhado com o contrato:
  - Exemplo `operation`/`taskType` corrigido para `protect_video`.
