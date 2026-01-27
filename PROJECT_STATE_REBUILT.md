# PROJECT_STATE_REBUILT (ponto inicial oficial)

Gerado em: 2026-01-27 (UTC-03)

Este documento consolida o **histórico técnico reconstruído** do repositório `redessociaisvideo3s` após perda de chat no Windows.

Regras deste documento:
- **Não** tenta recuperar prompts antigos.
- Toda inferência é ancorada em evidências do repo (paths, commits, logs locais exportados).
- Onde houver incerteza, ela é explicitada.

---

## 1) Objetivo do sistema

### 1.1 Phoenix Zero (produto base)
Fornecer **provas verificáveis** de autenticidade/integração de mídia (ex.: watermark invisível, verificação criptográfica e fingerprint temporal), com tooling e backend para demonstrar e validar em múltiplas plataformas.

Evidências:
- `docs/STATUS.md` (baseline e itens implementados)
- `libs/phoenix-zero/src/node/*` (watermark/presets)
- `scripts/test-all-platforms.ps1` + `platform-tests/*` (harness e outputs)

### 1.2 PPE — Pay‑Per‑Execution (produto dentro do produto)
**Execução de agentes de IA condicionada a pagamento confirmado, com prova verificável, sem humanos no loop.**

Evidências:
- `docs/pay-per-execution/README.md`
- `docs/pay-per-execution/00_MASTER_ROADMAP.md`

---

## 2) Estrutura do projeto (visão rápida)

- **Monorepo Node/TS**
  - `apps/web` — Next.js (API routes + páginas públicas/admin)
  - `apps/mobile` — app mobile (presente, mas não foi o foco das sessões recentes)
  - `libs/phoenix-zero` — core de watermark/cripto/presets

Evidências:
- `package.json` (scripts `dev:web`, `test:agentic`, `test:e2e`, etc.)
- `apps/web/src/app/api/*` (rotas)

---

## 3) Roadmap (fases 01–04)

> Observação: as fases abaixo são **inferidas** como “marcos de entrega” a partir de `docs/STATUS.md`, do pack PPE em `docs/pay-per-execution/*`, e do padrão de artefatos/testes. Não são necessariamente nomes originais.

### Fase 01 — Core de prova (watermark + assinatura + fingerprint)
- Implementar watermark invisível (vídeo) + verificação.
- Implementar assinatura híbrida e fingerprint temporal.
- Criar scripts CLI para stamp/verify.

Evidências:
- `docs/STATUS.md` (seções Watermark/Assinatura/Fingerprint + CLI)
- `libs/phoenix-zero/src/node/watermark.ts`
- `scripts/phoenix-zero-stamp-watermarked.ts`, `scripts/phoenix-zero-verify-watermarked.ts`

### Fase 02 — Validação em plataformas + harness/robustez
- Harness de testes reais por plataforma (upload/download manual) e validação.
- Robustness tests de re-encode/rede social (artefatos e reports).

Evidências:
- `docs/STATUS.md` (baseline validado)
- `platform-tests/downloads/*` e `platform-tests/proofs/*`
- `platform-tests/robustness/*/report.json` (arquivos com timestamps 2026-01-14/15)

### Fase 03 — PPE (billing + pagamentos + PPO + gate)
- Checkout (`PaymentIntent`) e webhooks.
- PPO (Payment Proof Object) público (`/verify/<proofId>`, `/provas`).
- Settlement e ledger.
- Enforcement: endpoint de execução não roda sem gate.

Evidências:
- `docs/pay-per-execution/00_MASTER_ROADMAP.md`
- `docs/pay-per-execution/02_API_CONTRACT.md`
- `apps/web/src/lib/payments.ts` (PaymentIntent, providers, status)
- `apps/web/src/lib/payment-proofs.ts` (PPO)
- `apps/web/src/lib/ppo-gate.ts` + `apps/web/src/app/api/agents/[agentId]/execute/route.ts`
- `apps/web/src/app/verify/[proofId]/page.tsx` e `apps/web/src/app/provas/page.tsx`

### Fase 04 — Produção (Render) + persistência + hardening + operação
- Deploy no Render com healthcheck.
- Persistência resiliente (Neon/Postgres) + fallback.
- Runbooks e stress tests determinísticos/real.
 
Evidências:
- `render.yaml` (deploy/healthcheck/envs)
- `apps/web/src/app/api/health/route.ts`
- `docs/PERSISTENCIA.md` + `apps/web/src/lib/pg-kv.ts`
- `docs/AGENTIC_STRESS_TEST_RUNBOOK.md`

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

### 4.1 Runtime e layout
- Next.js API routes rodando em runtime `nodejs` (não Edge) para suportar integrações e libs Node.

Evidências:
- `apps/web/src/app/api/*/route.ts` (múltiplos com `export const runtime = 'nodejs';`)
- Evidência indireta de troubleshooting: `terminal_history.txt` com inspeção de `.next/server/.../route.js` para runtime/`self`/Edge.

### 4.2 Persistência: dois modos (A/B)
- **Modo A (produção): Postgres (Neon) como KV JSONB** (`phoenix_zero_kv`).
- **Modo B (fallback/dev): arquivos JSON** em diretório tmp (`PHOENIX_ZERO_TMP_DIR`).

Evidências:
- `docs/PERSISTENCIA.md`
- `apps/web/src/lib/pg-kv.ts`
- presença de `.pz-tmp/*.json` na árvore recente (`tree_recent_core.txt`).

### 4.3 Pagamentos e provedores
- PIX via **Asaas** (controlado por `PAYMENTS_PIX_PROVIDER=asaas`).
- Ambiente Asaas explicitado por `ASAAS_ENV` (`sandbox` ou `production`).
- Secrets obrigatórios no Render para PIX: `ASAAS_API_KEY` e `ASAAS_WEBHOOK_SECRET`.
- Crypto via **NowPayments** (controlado por `PAYMENTS_CRYPTO_PROVIDER=nowpayments`).
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

Evidências:
- `docs/pay-per-execution/00_MASTER_ROADMAP.md` (invariantes)
- `docs/pay-per-execution/05_SECURITY_MVP.md`
- `docs/pay-per-execution/07_PROMPT_FOR_CODING_AI.md`
- `docs/STATUS.md` (PPO gate implementado)

### 4.5 Anti-bypass em pricing público (observação)
- Endpoints públicos usam sessão (`sessionId`) e exigem estado `CLASSIFIED`.

Evidências:
- `apps/web/src/lib/observation-sessions.ts`
- `apps/web/src/app/api/observe/start/route.ts`
- `apps/web/src/app/api/observe/state/route.ts`
- `apps/web/src/app/api/pricing/preview/route.ts`

### 4.6 Notificações
- WhatsApp via **Twilio** e Telegram via bot.

Evidências:
- `apps/web/src/lib/customer-notify.ts`
- `.env.example` e `render.yaml` (vars Twilio)

### 4.7 Autenticação (PPE)
- Tenant auth via header `x-api-key`.
- Endpoints admin sob `/api/admin/*` exigem `x-admin-token`.

Evidências:
- `docs/pay-per-execution/02_API_CONTRACT.md`

---

## 5) Estado atual (pronto / em andamento)

### 5.1 Pronto (implementado e com evidência de operação)
- Deploy e healthcheck (`/api/health`).
- Persistência Postgres KV com fallback.
- Checkout + webhooks + transição para `paid` + criação de PPO + settlement.
- Páginas públicas de prova (`/verify/<proofId>`, `/provas`).
- Notificação (Twilio/Telegram) após `paid_confirmed` quando `customerContact` existe.

Evidências:
- `render.yaml`, `apps/web/src/app/api/health/route.ts`
- `docs/STATUS.md`
- `docs/pay-per-execution/*`

### 5.2 Em andamento (última sessão)
 A árvore recente e o `git status` indicam trabalho local não commitado em:
 - `apps/web/src/lib/payments.ts`
 - `apps/web/src/lib/pricing.ts`

 Evidências:
 - `tree_recent_core.txt` (arquivos no topo)
 - `git status -sb` (marca `payments.ts` e `pricing.ts` como modificados)
 - `git diff --stat` (mostra mudanças em ambas as libs; o output de `git diff --name-only` pode variar conforme staging/estado do working tree)

Foco inferido do trabalho em andamento:
- **compatibilidade/normalização de `lineItems`** (`product` vs `operation`) no checkout/pricing.
- persistência/versões de pricing profiles (integrando com KV Postgres).

Evidências:
- `docs/pay-per-execution/02_API_CONTRACT.md` (seção “Compatibilidade”)
- diffs locais em `payments.ts` e `pricing.ts`.

### 5.3 Em teste (ativo nos últimos ciclos)
- `agentic-stress-test.ts` (modo determinístico e execuções segmentadas, ex.: `AGENTIC_STRESS_ONLY='L2'`).
- Playwright E2E (`npm run test:e2e`) e artefatos de execução.
- Robustness harness (`platform-tests/robustness/*`).

Evidências:
- `terminal_history.txt` (execuções `npx tsx .\agentic-stress-test.ts`, `npm run test:e2e`, etc.)
- `playwright-artifacts/*` (prints com timestamps)
- `platform-tests/robustness/*/report.json`

---

## 6) Áreas ativas por último (a partir da árvore recente)

Fonte: `tree_recent_core.txt` e `tree_recent_to_old.txt`.

### 6.1 Topo da árvore recente (mais ativo)
- `apps/web/src/lib/pricing.ts`
- `apps/web/src/lib/payments.ts`
- `docs/pay-per-execution/*` (pack PPE todo aparece entre os mais recentes)
- `render.yaml`
- `apps/web/src/app/verify/[proofId]/page.tsx`
- `.pz-tmp/*.json` (estado gerado em execução local)
- `agentic-stress-test.ts`
- `apps/web/src/lib/observation-sessions.ts` (também aparece na árvore)

### 6.2 Inferência do foco da última sessão
Consistente com:
- Ajustes de pricing/checkout (`payments.ts`/`pricing.ts`) + compatibilidade (`lineItems`).
- Revisão/atualização do pack PPE em docs.
- Execução local que gerou `.pz-tmp/*`.

Evidências:
- `git status -sb` (marca `payments.ts` e `pricing.ts` como modificados)
- `git diff --stat` (mostra mudanças em ambas as libs; o output de `git diff --name-only` pode variar conforme staging/estado do working tree)
- presença de `.pz-tmp/*.json` entre arquivos recentes

---

## 7) Próxima ação imediata (recomendada)

1) Revisar e finalizar o trabalho local:
- `git diff` em `apps/web/src/lib/payments.ts` e `apps/web/src/lib/pricing.ts`
- Garantir que a normalização de `lineItems` não quebra compatibilidade.

2) Rodar a bateria mínima:
- `npm run test:agentic` (determinístico)
- (opcional) Testar contra o Render sem dinheiro real via `scripts/external-agent-client.ts`.
- (opcional) `npm run test:e2e` se houver mudança em rotas públicas/admin.

3) Commitar e publicar:
- Commit claro do refactor de pricing/checkout.
- Push para acionar redeploy (Render).

---

## 8) Incertezas explícitas (o que NÃO foi possível confirmar)

- Alguns arquivos auxiliares exportados (ex.: `editor_cache_hits.txt`) contém `null bytes` e não oferecem sinais úteis via palavras-chave (possível formato binário/truncado).
- Parte dos artefatos (Playwright/test-results) está sob `.gitignore`, então o conteúdo detalhado não foi lido via viewer; usamos metadados e comandos como evidência.
- `recent_changes.txt` parece ser principalmente listagem de paths, sem timestamps confiáveis visíveis no trecho processado.

---

## 9) Referências primárias (ponto de partida)

- Visão macro de estado: `docs/STATUS.md`
- Persistência: `docs/PERSISTENCIA.md`
- PPE pack: `docs/pay-per-execution/*`
- Deploy: `render.yaml`
- Checkout/pagamentos: `apps/web/src/lib/payments.ts`
- Pricing: `apps/web/src/lib/pricing.ts`
- Gate/PPO: `apps/web/src/lib/ppo-gate.ts`, `apps/web/src/lib/payment-proofs.ts`
- Notificações: `apps/web/src/lib/customer-notify.ts`
- Testes: `agentic-stress-test.ts`, `e2e/*`, `platform-tests/*`
