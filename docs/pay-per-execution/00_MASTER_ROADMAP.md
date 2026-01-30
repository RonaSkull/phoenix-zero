# PPE — Master Roadmap (Go‑Live)

Este é o **documento mestre** do produto **Pay‑Per‑Execution** dentro do repo `redessociaisvideo3s`.

## 1) Definição do produto (1 frase)
**Execução de agentes de IA condicionada a pagamento confirmado, com prova verificável, sem humanos no loop.**

## 2) O que é “go‑live” (critério objetivo)
Você pode dizer **"está live"** quando todos estiverem verdadeiros:

- `POST /api/checkout/create` cria uma cobrança.
- Webhook (`/api/webhooks/pix` e/ou `/api/webhooks/nowpayments`) confirma pagamento e o intent vira `paid`.
- Quando vira `paid`, o sistema cria:
  - PPO (Payment Proof Object)
  - settlement
  - notificação (Telegram/WhatsApp) quando `proofMeta.customerContact` estiver presente
- `POST /api/agents/[agentId]/execute` **nunca executa** se não houver PPO/Gate válido.
- Persistência **sobrevive restart** (Render): estado continua via `DATABASE_URL` (Postgres).
- Site/copy (landing mínima) explica o produto sem promessas perigosas.

## 3) Invariantes (NÃO quebrar)
- **Nenhuma execução sem pagamento confirmado**.
- Webhooks idempotentes.
- Ledger/settlement append‑only.
- Não expor secrets e não logar secrets.
- Não mover/remover código existente; apenas adicionar/estender.

## 4) Onde estão as peças hoje (links rápidos)
- **Checkout**: `apps/web/src/app/api/checkout/create/route.ts`
- **Status**: `apps/web/src/app/api/checkout/status/...` (ver `02_API_CONTRACT.md`)
- **Webhooks**:
  - PIX/Asaas: `apps/web/src/app/api/webhooks/pix/route.ts`
  - NowPayments: `apps/web/src/app/api/webhooks/nowpayments/route.ts`
- **PPO**: `apps/web/src/lib/payment-proofs.ts`
- **Update status (trigger do PPO/settlement/notificação)**: `apps/web/src/lib/payments.ts` (`updatePaymentIntentStatus`)
- **Settlement**: `apps/web/src/lib/settlement/*`
- **PPO Gate / execução condicionada**: `apps/web/src/lib/ppo-gate.ts` + `apps/web/src/app/api/agents/[agentId]/execute/route.ts`
- **Healthcheck**: `apps/web/src/app/api/health/route.ts`

## 5) Checklist em ordem (executar sem pular)

### A. Render / DB / envs (produção)
- [x] Configurar `DATABASE_URL` (Neon) + `PGSSLMODE=require`
- [x] Setar `PHOENIX_ZERO_PUBLIC_BASE_URL`
- [x] Setar `PHOENIX_ZERO_ADMIN_TOKEN` (gerado no Render)
- [x] Criar tenant público sistêmico (read-only) e setar `PHOENIX_ZERO_PUBLIC_API_KEY` (para `GET /api/pricing` sem auth)
- [x] PIX:
  - [x] `PAYMENTS_PIX_PROVIDER=asaas`
  - [x] `ASAAS_API_KEY`
  - [x] `ASAAS_WEBHOOK_SECRET`
- [x] Crypto:
  - [x] `PAYMENTS_CRYPTO_PROVIDER=nowpayments`
  - [x] `NOWPAYMENTS_API_KEY`
  - [x] `NOWPAYMENTS_IPN_SECRET`
- [x] Notificações:
  - [x] `TELEGRAM_BOT_TOKEN`
  - [x] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
- [x] Validar `/api/health` em produção

Guia: `01_DEPLOY_RENDER.md`

### B. Persistência pós‑restart
- [x] Criar um pagamento (simulado ou real)
- [x] Confirmar que PPO existe (`/verify/<proofId>`)
- [x] Reiniciar o serviço no Render
- [x] Confirmar que PPO/provas/settlements ainda existem

Guia: `01_DEPLOY_RENDER.md` + `docs/PERSISTENCIA.md`

### C. LineItems (clareza produto vs operação)
- [x] Definir contrato recomendado: `product` (o “o que”) e `operation` (o “como”)
- [x] Garantir compatibilidade: aceitar inputs antigos sem quebrar pricing
- [x] Documentar mapping/normalização

Guia: `02_API_CONTRACT.md` e `03_PRICING.md`

### D. Pagamentos (meios)
- [x] PIX (Asaas) em produção
- [x] Crypto (NowPayments) em produção
- [ ] Documentar cartão de crédito (habilitar no Asaas)

### D2. Pós‑testes: rotação de segredos + redeploy
- [ ] Rotacionar `PHOENIX_ZERO_ADMIN_TOKEN`
- [ ] Rotacionar `ASAAS_WEBHOOK_SECRET`
- [ ] Rotacionar `NOWPAYMENTS_IPN_SECRET`
- [ ] (Opcional) Rotacionar `TELEGRAM_BOT_TOKEN` / `TWILIO_AUTH_TOKEN`
- [ ] Redeploy/restart no Render
- [ ] Revalidar com `scripts/external-agent-client.ts`

Guia: `09_SECRET_ROTATION.md`

Guia: `01_DEPLOY_RENDER.md` + `06_OPERATIONS_RUNBOOK.md`

### E. Site (landing mínima)
- [ ] Publicar copy e FAQ do produto PPE
- [ ] Evitar falar sobre tokens, “impossível burlar”, antifraude avançado

Guia: `04_SITE_COPY.md`

### F. Prompt para IA de código (guardrails)
- [ ] Usar prompt único e versionado

Guia: `07_PROMPT_FOR_CODING_AI.md`

## 6) “O que eu faço vs o que a IA faz” (prático)
- **Você (manual)**:
  - Configurar Neon/Render/envs
  - Criar conta Asaas e habilitar PIX/cartão
  - Definir pricing público (tabela comercial) e nome do produto
- **IA (código)**:
  - Consolidar módulos sem mover arquivos
  - Melhorar docs e testes
  - Ajustar lineItems com compatibilidade
  - Garantir invariantes e logs

## 7) Próxima execução (agora)
Siga:
1) `01_DEPLOY_RENDER.md`
2) `06_OPERATIONS_RUNBOOK.md` (testes)
3) `04_SITE_COPY.md` (go‑live copy)

Documentos públicos para agentes (HTTP):
- Discovery: `/.well-known/ai-service.json`
- Docs: `/api/docs/ai-service-discovery`
