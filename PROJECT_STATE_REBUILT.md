# PROJECT_STATE_REBUILT (ponto inicial oficial)

Gerado em: 2026-02-14 (UTC-03)

Este documento consolida o **histórico técnico reconstruído oficial** do repositório `redessociaisvideo3s`.

Regras deste documento:
- **Não** tenta recuperar prompts antigos.
- É um **novo ponto inicial oficial** para continuidade do projeto.
- Consolida apenas o que está evidenciado no repo, documentação e marcos executados (suites/tests/deploy).

---

## 1) Objetivo do sistema

### 1.1 Phoenix Zero (produto base)
Fornecer **provas verificáveis** (PPO / páginas públicas de verificação) e infraestrutura para **execução confiável** de operações/agents, com foco em segurança, auditabilidade e integração com pagamentos.

Evidências (referências principais do repo):
- `docs/STATUS.md`
- `apps/web/src/app/verify/[proofId]/page.tsx`
- `apps/web/src/lib/payment-proofs.ts`

### 1.2 PPE — Pay‑Per‑Execution (produto dentro do produto)
**Executar agentes/operações apenas após pagamento confirmado**, emitindo uma **Prova de Pagamento (PPO)** verificável publicamente, com **ledger/settlement** e invariantes de segurança.

Evidências:
- `docs/pay-per-execution/*` (pack PPE)
- `apps/web/src/lib/payments.ts` (autoridade de checkout/status)
- `apps/web/src/lib/ppo-gate.ts` (gate de execução)

---

## 2) Estrutura do projeto (visão rápida)

- **Monorepo Node/TS**
  - `apps/web` — Next.js (API routes + páginas públicas)
  - `libs/phoenix-zero` — libs auxiliares (inclui histórico de watermark/presets)
  - `phoenix-zero-agent-simulations/` — harness externo de simulações/hardening (fora do backend)

Evidências:
- `apps/web/src/app/api/*` (rotas)
- `phoenix-zero-agent-simulations/out/<suiteRunId>/*` (artefatos de suite)

---

## 3) Roadmap (fases 01–04)

> Observação: as fases abaixo refletem o estado consolidado do projeto (inclui PPE como produto principal de go-live), mantendo compatibilidade com a documentação existente.

### Fase 01 — Fundamentos (PPO + verificação pública + contrato mínimo)
- Definir PPO como artefato verificável e páginas públicas de verificação.
- Definir contrato mínimo de checkout, proofMeta e autenticação por tenant.

Evidências:
- `docs/pay-per-execution/02_API_CONTRACT.md`
- `apps/web/src/app/verify/[proofId]/page.tsx`
- `apps/web/src/lib/payment-proofs.ts`

### Fase 02 — Pagamentos + webhooks + idempotência
- Checkout e status por intent.
- Webhooks PIX (Asaas) e Crypto (NowPayments) com verificação por secret + dedupe.
- Garantir transição `paid` → emitir PPO + criar settlement/ledger.

Evidências:
- `apps/web/src/lib/payments.ts`
- `apps/web/src/app/api/webhooks/pix/route.ts`
- `apps/web/src/app/api/webhooks/nowpayments/route.ts`

### Fase 03 — Enforcement (gate) + trilhas financeiras (ledger/settlement)
- Gate autoritativo em `/api/agents/[agentId]/gate` e execução em `/api/agents/[agentId]/execute`.
- Settlement engine + modelos (append-only) e endpoints de listagem/advance/revert.
- (Opcional por env) identidade/registro/governança e semantic ledger.

Evidências:
- `docs/pay-per-execution/00_MASTER_ROADMAP.md`
- `docs/pay-per-execution/02_API_CONTRACT.md`
- `apps/web/src/lib/payments.ts` (PaymentIntent, providers, status)
- `apps/web/src/lib/payment-proofs.ts` (PPO)
- `apps/web/src/lib/ppo-gate.ts` + `apps/web/src/app/api/agents/[agentId]/execute/route.ts`
- `apps/web/src/app/verify/[proofId]/page.tsx` e `apps/web/src/app/provas/page.tsx`

### Fase 04 — Produção (Render) + persistência + hardening + operação
- Deploy no Render: `https://phoenix-zero-web.onrender.com`.
- Healthcheck: `GET /api/health`.
- Persistência financeira resiliente:
  - Postgres KV (`DATABASE_URL`, `PGSSLMODE=require`) com fallback para `.pz-tmp/*`.
- Pagamentos:
  - PIX (Asaas) e Crypto (NowPayments) com webhooks verificados + idempotência.
- PPE core:
  - Checkout create/status.
  - Gate e execução bloqueada sem PPO válido.
  - PPO público em `/verify/<proofId>` (com estados "not found" e "not available" sem quebrar links).
- Settlement/ledger:
  - Engine + endpoints de listagem/advance/revert.
- Hardening:
  - Rate limit aplicado aos endpoints críticos.
  - Logs de observabilidade seguros.
- Suites de validação:
  - Hardening suite (PIX + Crypto) e variações crypto-only (incluindo NowPayments webhook extras) com evidências registradas.
- Enterprise sales demo system:
  - Demo enterprise para 4 verticais via `/api/demo/run` + scripts (`record-demo.ps1`) com URLs públicas de verificação.

Evidências:
- `render.yaml`, `apps/web/src/app/api/health/route.ts`
- `docs/STATUS.md`
- `docs/pay-per-execution/*`

### Critério objetivo de “go-live” (PPE)

O pack `docs/pay-per-execution/*` define “está live” quando **todos** estiverem verdadeiros:
- `POST /api/checkout/create` cria uma cobrança.
- Webhook (`/api/webhooks/pix` e/ou `/api/webhooks/nowpayments`) confirma e o intent vira `paid`.
- Ao virar `paid`, o sistema cria:
  - PPO (Payment Proof Object)
  - settlement
  - notificação (Telegram/WhatsApp) quando `proofMeta.customerContact` existir
- `POST /api/agents/[agentId]/execute` **nunca executa** sem PPO/Gate válido.
- Persistência sobrevive restart (Render) via Postgres (`DATABASE_URL`).
- Landing mínima explica PPE sem promessas perigosas.

Evidências:
- `docs/pay-per-execution/00_MASTER_ROADMAP.md`
- `docs/pay-per-execution/04_SITE_COPY.md`

---

## 4) Decisões arquiteturais finais (consolidadas)

### 4.0 Invariantes (não quebrar)
- Nunca executar sem gate válido de pagamento confirmado + PPO.
- Webhooks: dedupe/replay-safe (idempotência).
- Ledger/settlement: append-only, sem efeitos duplicados.
- Não logar/expor secrets.
- Mudanças antes do go-live: preferir extensões compatíveis (evitar migrações invasivas).

### 4.1 Runtime e layout
- Next.js API routes em runtime `nodejs` (não Edge) para suportar integrações e libs Node.

Evidências:
- `apps/web/src/app/api/*/route.ts` (múltiplos com `export const runtime = 'nodejs';`)
- Evidência indireta de troubleshooting: `terminal_history.txt` com inspeção de `.next/server/.../route.js` para runtime/`self`/Edge.

### 4.2 Persistência: Postgres KV (produção) com fallback
- Produção: Postgres (Neon) via KV JSONB (`phoenix_zero_kv`) quando `DATABASE_URL` está setado.
- Fallback: arquivos JSON em diretório tmp (`PHOENIX_ZERO_TMP_DIR`).
- Seed: quando aplicável, fazer seeding one-time a partir dos JSON legados.

Evidências:
- `docs/PERSISTENCIA.md`
- `apps/web/src/lib/pg-kv.ts`
- presença de `.pz-tmp/*.json` na árvore recente (`tree_recent_core.txt`).

### 4.3 Pagamentos e provedores
- PIX via **Asaas** (controlado por `PAYMENTS_PIX_PROVIDER=asaas`).
- Ambiente Asaas explicitado por `ASAAS_ENV` (`sandbox` ou `production`).
- Secrets obrigatórios no Render para PIX: `ASAAS_API_KEY` e `ASAAS_WEBHOOK_SECRET`.
- Crypto via **NowPayments** (controlado por `PAYMENTS_CRYPTO_PROVIDER=nowpayments`).
- Decisão: **não fixar `pay_currency`** por padrão (não setar `PHOENIX_ZERO_NOWPAYMENTS_PAY_CURRENCY`).
- Secrets obrigatórios no Render para crypto: `NOWPAYMENTS_API_KEY` e `NOWPAYMENTS_IPN_SECRET`.
- `PGSSLMODE=require` em produção para conectividade Postgres (Neon).
- Cartão aparece como opcional (não requisito do go-live inicial se PIX resolver o começo).

Evidências:
- `render.yaml` (env vars)
- `docs/pay-per-execution/01_DEPLOY_RENDER.md`
- `apps/web/src/lib/payments.ts`

### 4.4 Prova econômica (PPO) e gate
- Invariante: **nenhuma execução sem pagamento confirmado**.
- Webhooks precisam ser **idempotentes**.
- Ledger/settlement deve ser **append-only**.
- Não expor e não logar secrets.
- Não mover/remover/renomear código existente; apenas adicionar/estender.
- Gate server-side no endpoint de execução.
- Anti "pay cheap / execute expensive": `proofMeta.taskType` (quando presente) deve bater com a operação normalizada em `lineItems`.

Evidências:
- `docs/pay-per-execution/00_MASTER_ROADMAP.md` (invariantes)
- `docs/pay-per-execution/05_SECURITY_MVP.md`
- `docs/pay-per-execution/07_PROMPT_FOR_CODING_AI.md`
- `apps/web/src/lib/observation-sessions.ts`
- `apps/web/src/app/api/observe/start/route.ts`
- `apps/web/src/app/api/observe/state/route.ts`
- `apps/web/src/app/api/pricing/preview/route.ts`

### 4.6 Notificações
- WhatsApp via **Twilio** e Telegram via bot.

Evidências:
- `apps/web/src/lib/customer-notify.ts`
- `.env.example` e `render.yaml` (vars Twilio)

### 4.7 Autenticação e chaves públicas
- Tenant auth via header `x-api-key`.
- Admin auth via `x-admin-token` comparado com `PHOENIX_ZERO_ADMIN_TOKEN`.
- Chave pública para endpoints de descoberta/pricing: `PHOENIX_ZERO_PUBLIC_API_KEY`.

Notas consolidadas:
- `x-admin-token` deve ser sempre exigido em admin; se `PHOENIX_ZERO_ADMIN_TOKEN` não existir no env, o comportamento esperado é falhar (500) ao invés de permitir bypass.
- Endpoints públicos com `PHOENIX_ZERO_PUBLIC_API_KEY`: quando ausente/inválido, retornar 403 (não 500) para falhas de auth pública.

Evidências:
- `docs/pay-per-execution/02_API_CONTRACT.md`

### 4.8 Hardening mínimo para go-live
- Rate limiting in-memory por minuto (controlado por env vars) aplicado nos endpoints críticos do PPE.
- Logs de observabilidade "seguros" (sem secrets) para webhooks e transições de status.
- Enforce de admin token: se env está ausente → retornar 500 (não permitir bypass).

### 4.9 Persistência financeira (escopo)
- Store em Postgres KV quando `DATABASE_URL` está setado (tabela `phoenix_zero_kv`).
- Módulos com persistência PG (quando habilitado): payments/intents, payment-proofs, settlement/store, payment-webhook-events, tenants e sessions, billing-accounts, escrow, slashing.

### 4.10 Notas operacionais
- Windows/Next build: mitigação de `EPERM` em `.next/trace` via `distDir` alternativo e script de clean com retry.
- Smoke test via PowerShell: para evitar JSON “mangled” no `curl.exe`, usar stop-parsing (`--%`) e `--data-binary`.

### 4.11 Env vars (mínimo típico em produção)
- `PHOENIX_ZERO_ADMIN_TOKEN`
- `PHOENIX_ZERO_PUBLIC_BASE_URL`
- `PHOENIX_ZERO_PUBLIC_API_KEY`
- Persistência:
  - `DATABASE_URL`
  - `PGSSLMODE=require`
- PIX (Asaas): `PAYMENTS_PIX_PROVIDER=asaas`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET`, `ASAAS_ENV`
- Crypto (NowPayments): `PAYMENTS_CRYPTO_PROVIDER=nowpayments`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`
- Notificações (opcional): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TELEGRAM_BOT_TOKEN`

---

## 5) Estado atual (pronto / em andamento)

### 5.1 Pronto (implementado e validado)
- Deploy no Render: `https://phoenix-zero-web.onrender.com`.
- Healthcheck: `GET /api/health`.
- Persistência financeira resiliente:
  - Postgres KV (`DATABASE_URL`, `PGSSLMODE=require`) com fallback para `.pz-tmp/*`.
- Pagamentos:
  - PIX (Asaas) e Crypto (NowPayments) com webhooks verificados + idempotência.
- PPE core:
  - Checkout create/status.
  - Gate e execução bloqueada sem PPO válido.
  - PPO público em `/verify/<proofId>` (com estados "not found" e "not available" sem quebrar links).
- Settlement/ledger:
  - Engine + endpoints de listagem/advance/revert.
- Hardening:
  - Rate limit aplicado aos endpoints críticos.
  - Logs de observabilidade seguros.
- Suites de validação:
  - Hardening suite (PIX + Crypto) e variações crypto-only (incluindo NowPayments webhook extras) com evidências registradas.
- Enterprise sales demo system:
  - Demo enterprise para 4 verticais via `/api/demo/run` + scripts (`record-demo.ps1`) com URLs públicas de verificação.

Evidências:
- `render.yaml`, `apps/web/src/app/api/health/route.ts`
- `docs/STATUS.md`
- `docs/pay-per-execution/*`

### 5.2 Em andamento
- Itens pendentes citados como próximos passos:
  - Rodar `external-agent-client`/simulações contra Render para validar fluxo crypto end-to-end em modo "real".
  - Rotacionar secrets e redeploy/restart após mais confiança.
- Itens desejados de próxima iteração (produto/demo):
  - Página pública de demo (1 página, 3 colunas: Agent / Proof / Execution) com diagrama de fluxo.
  - Texto separando claramente "Sandbox" vs "Real".
  - Arquivo de discovery em `/.well-known/*` para descoberta automática.

### 5.4 Evidências (suiteRunId) citadas como estáveis
- Hardening (PIX + Crypto): evidências registradas em docs (runs múltiplas, incluindo 12/12, 16/16, 30/30 dependendo do recorte).
- Race gate (PIX) e race gate (crypto): evidências registradas.

### 5.3 Em teste / operação contínua
- Runner determinístico e E2E (`npm run test:agentic:e2e`).
- Variantes real (quando apropriado): `npm run test:agentic:e2e:real:pix` e `:real:crypto`.
- Harness externo: `phoenix-zero-agent-simulations` (hardening suites e evidências em `out/<suiteRunId>/`).

Evidências:
- `docs/AGENTIC_STRESS_TEST_RUNBOOK.md`
- `scripts/agentic-stress-e2e.ps1`

---

## 6) Áreas ativas por último (referências principais)

Fonte: docs PPE + módulos centrais do backend.

### 6.1 Backend (autoridade PPE)
- `apps/web/src/lib/payments.ts`
- `apps/web/src/lib/pricing.ts`
- `apps/web/src/lib/payment-proofs.ts`
- `apps/web/src/lib/ppo-gate.ts`
- `apps/web/src/lib/pg-kv.ts`

### 6.2 Rotas críticas e páginas públicas
- `apps/web/src/app/api/checkout/create/route.ts`
- `apps/web/src/app/api/checkout/status/route.ts`
- `apps/web/src/app/api/webhooks/pix/route.ts`
- `apps/web/src/app/api/webhooks/nowpayments/route.ts`
- `apps/web/src/app/api/agents/[agentId]/execute/route.ts`
- `apps/web/src/app/verify/[proofId]/page.tsx`

---

## 7) Próxima ação imediata (recomendada)

1) Validar o fluxo real end-to-end (principalmente crypto):
- Rodar o harness/simulador externo contra o Render e confirmar criação de PPO + settlement após `paid`.

2) Após validação, executar higiene de produção:
- Rotacionar secrets (Asaas/NowPayments/Admin/Public API key) e redeploy/restart.

3) Se o objetivo for crescimento/topo de funil:
- Implementar a página pública de demo (1-página) e o arquivo `/.well-known/*` de discovery.

---

## 8) Incertezas explícitas (o que NÃO foi possível confirmar)

- O status exato de quais env vars estão presentes localmente (dev) vs Render depende do ambiente no momento.
- O backlog de UI pública (demo page + discovery) está definido como próximo passo, mas pode ser repriorizado.

---

## 9) Referências primárias (ponto de partida)

- Visão macro: `docs/STATUS.md`
- PPE pack: `docs/pay-per-execution/*`
- Deploy: `render.yaml`
- Persistência PG KV: `apps/web/src/lib/pg-kv.ts`
- Checkout/pagamentos: `apps/web/src/lib/payments.ts`
- Pricing: `apps/web/src/lib/pricing.ts`
- Gate/PPO: `apps/web/src/lib/ppo-gate.ts`, `apps/web/src/lib/payment-proofs.ts`
- Notificações: `apps/web/src/lib/customer-notify.ts`
- Stress/E2E: `docs/AGENTIC_STRESS_TEST_RUNBOOK.md`, `scripts/agentic-stress-e2e.ps1`
- Harness externo: `phoenix-zero-agent-simulations/`
