# Bots (Telegram / WhatsApp) — runbook

## Objetivo

Enviar automaticamente ao cliente um link público de prova (`/verify/<proofId>`) quando o pagamento for confirmado (`paid_confirmed`).

## Onde o envio acontece

O envio dispara quando um pagamento transiciona para `paid` (webhook), no fluxo:

- Webhook Asaas/NowPayments chama `updatePaymentIntentStatus()`
- O sistema cria o PPO (`ensurePaymentProofForIntent()`)
- O sistema chama `notifyCustomerForPaidProof({ proofId })`

## Teste end-to-end (cliente externo)

Você pode simular um parceiro real (sem acesso ao código do backend) rodando:

- `npx tsx ./scripts/run-full-agent-simulation.ts`

Pré-requisitos:

- Servidor rodando em `PHOENIX_ZERO_BASE_URL` (default `http://localhost:3000`)
- `PHOENIX_ZERO_ADMIN_TOKEN` setado para criar um tenant de teste

## Teste end-to-end em produção (Render) — modo B (simulação)

Este modo executa o mesmo cliente externo, mas apontando para o seu serviço no Render.

Pré-requisitos:

- Serviço no ar (HTTPS)
- `TELEGRAM_BOT_TOKEN` e `PHOENIX_ZERO_PUBLIC_BASE_URL` setados no Render
- `ASAAS_WEBHOOK_SECRET` do Render (necessário para chamar `/api/webhooks/pix` em produção)
- `PHOENIX_ZERO_ADMIN_TOKEN` do Render (necessário para criar tenant de teste via `/api/admin/tenants`)

No seu terminal local, execute:

- `PHOENIX_ZERO_BASE_URL=https://<seu-servico>.onrender.com`
- `PHOENIX_ZERO_ADMIN_TOKEN=<token do Render>`
- `ASAAS_WEBHOOK_SECRET=<secret do Render>`
- `SIM_TELEGRAM_CHAT_ID=<seu chatId>`

e rode:

- `npx tsx ./scripts/external-agent-client.ts`

Se tudo estiver ok:

- O pagamento simulado vira `paid`
- O PPO é criado (`paid_confirmed`)
- O bot envia uma mensagem Telegram com o link `/verify/<proofId>`

Observação:

- Sempre que você alterar código, faça `git add/commit/push` antes de redeploy no Render.

## Como informar o contato do cliente

No `POST /api/checkout/create`, inclua:

- `proofMeta.customerContact.whatsappNumber` (formato E.164 só números. Ex: `5511999999999`)
- `proofMeta.customerContact.telegramChatId` (string/number do Telegram)

## Telegram

### Variáveis

- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_WEBHOOK_SECRET=...` (opcional, recomendado)
- `PHOENIX_ZERO_PUBLIC_BASE_URL=https://...` (obrigatório para webhook público)

### Endpoint

- `POST /api/telegram/webhook`

### Setup do webhook

Execute:

- `npx tsx ./scripts/setup-telegram-webhook.ts`

Se você preferir rodar via `npm run`, garanta que está no root do repo e use o mesmo comando acima (o `tsx` está nas devDependencies do root).

### Como pegar o chatId

- Abra o bot e envie `/start`
- Ele responde com `telegramChatId`

## WhatsApp (Z-API)

### Variáveis

- `ZAPI_INSTANCE_ID=...`
- `ZAPI_INSTANCE_TOKEN=...`
- `ZAPI_CLIENT_TOKEN=...` (opcional; se você ativar o "Account Security Token" na Z-API)

### Envio

O backend envia mensagem via:

- `POST https://api.z-api.io/instances/<instance>/token/<token>/send-text`

com JSON:

- `phone`: número no formato `5511999999999`
- `message`: texto
