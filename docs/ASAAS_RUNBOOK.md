# Asaas (PIX) — runbook (local/dev)

## Objetivo

Garantir que o `checkoutUrl` retornado pelo backend seja um link real do Asaas (invoice/QR), e não o fallback "integration pending".

## Variáveis de ambiente (processo do servidor)

- `PAYMENTS_PIX_PROVIDER=asaas`
- `ASAAS_API_KEY=...`
- `ASAAS_ENV=sandbox` (ou `production`)
- `ASAAS_WEBHOOK_SECRET=...` (obrigatório em produção; recomendado sempre)
- `PHOENIX_ZERO_PUBLIC_BASE_URL=https://...` (URL pública/HTTPS para receber webhooks em ambiente real)

Observações:

- Se o servidor Next (`npm run dev:web`) estiver rodando sem essas envs, ele vai cair no fallback "provider integration pending".
- Em sandbox, o backend aplica um mínimo de `500` centavos na criação do PIX.
- Para webhooks externos (Asaas/Telegram), `http://localhost` não é acessível pela internet. Use uma URL pública HTTPS.

## Checklist de diagnóstico (quando aparecer "integration pending")

1. Pare o servidor dev atual.
2. Suba o servidor dev no MESMO terminal onde você exportou as env vars.
3. Faça uma chamada de checkout (API `POST /api/checkout/create`).
4. Confirme que o response tem:
   - `provider: "pix"`
   - `checkoutUrl` começando com `https://` (invoiceUrl do Asaas)
   - `instructions` contendo `Invoice: ...` e possivelmente `Pix payload: ...`

## Webhook (pagamento confirmado)

O webhook do Asaas é recebido em:

- `POST /api/webhooks/pix`

Validação:

- Se `ASAAS_WEBHOOK_SECRET` estiver setado, o backend valida `asaas-access-token`.

Efeito esperado:

- Atualiza `PaymentIntent.status` para `paid`
- Cria `PaymentProof` (PPO) com status `paid_confirmed`
- Dispara notificação para o cliente (Telegram/WhatsApp) se `customerContact` estiver presente

Reversão automática:

- Se o Asaas enviar `REFUNDED` ou `CHARGEBACK_REQUESTED`, o sistema:
  - Atualiza o intent para `failed`
  - Marca o settlement como `reverted`

Idempotência:

- O webhook é deduplicado por `eventId` (se o mesmo evento chegar duas vezes, a segunda execução retorna `{ deduped: true }`).

## Como validar end-to-end

- Crie um checkout PIX.
- Pague o PIX (via invoice Asaas).
- Confirme via `GET /api/checkout/status?paymentId=...` que:
  - `status` virou `paid`
  - `amountCents` está consistente (em `sandbox`, mínimo `500`)
- Confirme que o PPO foi criado (e que o bot/cliente recebeu o link público, quando `customerContact` estiver presente).
- Acesse:
  - `/verify/<proofId>`
  - `/provas`

Opcional (liquidação/settlement):

- `GET /api/agents/<agentId>/settlements` (tenant auth)
- `POST /api/admin/settlement/advance` (admin token)
- `POST /api/admin/settlement/revert` (após refund/chargeback; admin token)
