# PPE — Deploy no Render + Persistência

## 1) Objetivo
Rodar o produto PPE em produção (Render) com **persistência real** (Postgres) e webhooks seguros.

## 2) Pré‑requisito essencial: Postgres (Neon)
- Crie um DB no Neon.
- Copie a `DATABASE_URL`.
- No Render, defina:
  - `DATABASE_URL` (sync)
  - `PGSSLMODE=require`

Sem `DATABASE_URL`, o sistema pode cair em fallback de arquivos em `/tmp` e **perder estado no restart**.

Referência: `docs/PERSISTENCIA.md`

## 3) Variáveis de ambiente (Render)

### Core
- `NODE_ENV=production`
- `PHOENIX_ZERO_PUBLIC_BASE_URL=https://phoenix-zero-web.onrender.com`
- `PHOENIX_ZERO_ADMIN_TOKEN` (gerado)

### Catálogo público (para agentes)
- `PHOENIX_ZERO_PUBLIC_API_KEY` (sync)
  - Deve apontar para um tenant sistêmico read-only (criado via `/api/admin/tenants`).
  - Sem isso, `GET /api/pricing` sem `x-api-key` retorna erro.

### PIX (Asaas)
- `PAYMENTS_PIX_PROVIDER=asaas`
- `ASAAS_ENV=sandbox` (ou production)
- `ASAAS_API_KEY` (sync)
- `ASAAS_WEBHOOK_SECRET` (gerado ou sync — precisa bater com os testes que injetam webhook)

### Crypto (NowPayments)
- `PAYMENTS_CRYPTO_PROVIDER=nowpayments`
- `NOWPAYMENTS_API_KEY` (sync)
- `NOWPAYMENTS_IPN_SECRET` (sync)

### Notificações
- Telegram:
  - `TELEGRAM_BOT_TOKEN` (sync)
- WhatsApp (Twilio):
  - `TWILIO_ACCOUNT_SID` (sync)
  - `TWILIO_AUTH_TOKEN` (sync)
  - `TWILIO_WHATSAPP_FROM` (sync)

## 4) Healthcheck
O Render deve checar:
- `GET /api/health` → `{ ok: true, ts: ... }`

## 5) Validação pós‑deploy (produção)
- Acesse:
  - `/api/health`
  - `/.well-known/ai-service.json`
  - `/api/docs/ai-service-discovery`
  - `/api/pricing` (sem headers; depende do `PHOENIX_ZERO_PUBLIC_API_KEY`)
  - `/provas`
  - `/verify/<proofId>`

## 6) Teste E2E (sem dinheiro real) contra o Render
Use o cliente externo (sem acesso ao backend):

- `scripts/external-agent-client.ts`

No Windows, rode via:

```powershell
$env:PHOENIX_ZERO_BASE_URL = "https://phoenix-zero-web.onrender.com"
npx tsx .\scripts\external-agent-client.ts
```

Opcional (rodar apenas PIX e pular Crypto):

```powershell
$env:SIM_SKIP_CRYPTO = "1"
npx tsx .\scripts\external-agent-client.ts
```

Você precisa exportar no seu terminal local:
- `PHOENIX_ZERO_BASE_URL=https://phoenix-zero-web.onrender.com`
- `PHOENIX_ZERO_ADMIN_TOKEN=<token do Render>`
- `ASAAS_WEBHOOK_SECRET=<secret do Render>` (se o webhook PIX exigir header)
- `NOWPAYMENTS_IPN_SECRET=<secret do Render>` (para simular NowPayments)
- `SIM_TELEGRAM_CHAT_ID=<seu chatId>` (opcional)

## 7) Restart + prova de persistência

### Passo a passo
1) Crie pelo menos 1 pagamento que vire `paid` e gere uma prova
2) Abra o link `/verify/<proofId>`
3) No Render: Restart do serviço
4) Reabra:
   - `/verify/<proofId>`
   - `/provas`

### Resultado esperado
- As provas continuam.
- Os settlements continuam.
- O status de billing continua.

Se **sumir**, é quase sempre:
- `DATABASE_URL` ausente/incorreta
- DB inacessível (SSL/PGSSLMODE)

## 8) Cartão de crédito (Asaas) — o que é “habilitar”
Isso é operacional no painel do Asaas.

Checklist prático:
- Conta verificada (KYC/empresa/pessoa, conforme plano)
- Ativar cobranças por cartão / checkout
- Definir antifraude/chargeback conforme o painel permitir

Importante:
- No produto PPE, cartão é **opcional** para go‑live inicial se PIX já resolve o início.
