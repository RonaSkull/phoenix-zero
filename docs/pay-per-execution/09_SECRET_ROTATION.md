# 09_SECRET_ROTATION

Este documento descreve como rotacionar (trocar) os segredos do PPE (Pay-Per-Execution) no **Render** e nos provedores, com o mínimo de downtime e com validação ao final.

## Objetivo

- Garantir que, após os testes E2E (PIX e Crypto), os segredos em uso não permaneçam expostos em terminais/arquivos locais.
- Reduzir a janela de risco em caso de vazamento acidental.
- Padronizar o procedimento para qualquer pessoa que assuma a operação.

## Regras importantes

- **Nunca commitar segredos** em git.
- Troque **um segredo por vez**, valide, e só então avance para o próximo.
- Ao trocar um segredo em provedor (Asaas/NowPayments/Telegram/Twilio), atualize imediatamente o Render e faça **redeploy/restart**.
- **Pare de rodar scripts** usando tokens antigos depois da rotação.

## Onde os segredos são usados

- **`PHOENIX_ZERO_ADMIN_TOKEN`**
  - Protege endpoints admin (ex.: `/api/admin/tenants`, `/api/admin/settlement/advance`).
  - Header esperado: **`x-admin-token`**.

- **`ASAAS_WEBHOOK_SECRET`** (PIX)
  - Valida chamadas no webhook `/api/webhooks/pix`.
  - Header esperado no webhook: **`asaas-access-token`**.

- **`NOWPAYMENTS_IPN_SECRET`** (Crypto)
  - Valida assinatura do webhook `/api/webhooks/nowpayments`.
  - Header esperado no webhook: **`x-nowpayments-sig`** (HMAC SHA-512 do body canônico).

- **`TELEGRAM_BOT_TOKEN`**
  - Envia notificação para o cliente via bot no Telegram.

- **`TWILIO_AUTH_TOKEN`**
  - Envia WhatsApp via Twilio.

## Checklist de rotação (ordem recomendada)

1. `PHOENIX_ZERO_ADMIN_TOKEN`
2. `ASAAS_WEBHOOK_SECRET`
3. `NOWPAYMENTS_IPN_SECRET`
4. `TELEGRAM_BOT_TOKEN` (opcional, hard reset)
5. `TWILIO_AUTH_TOKEN` (se você rotacionar no console Twilio)

## 1) Rotacionar `PHOENIX_ZERO_ADMIN_TOKEN`

### Impacto

- **Scripts e operações admin param** até você atualizar o token em quem consome.
- Não afeta checkout/execução de tenants (fluxo normal do PPE), apenas endpoints admin.

### Como gerar um token forte

Escolha um token aleatório com alta entropia.

Opções recomendadas:

- **PowerShell (Windows)**
  - Gere 32 bytes random e encode em Base64:
    - `([Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256})))`
  - Se preferir mais forte, use 48 bytes.

(Se quiser, você pode gerar em qualquer gerenciador de senha.)

### Como aplicar no Render

- Render Dashboard -> serviço `phoenix-zero-web` -> **Environment**
- Atualize `PHOENIX_ZERO_ADMIN_TOKEN` com o novo valor
- Clique em **Save Changes**
- Faça **Manual Deploy** (ou Restart) para garantir que o app reinicia com o novo env

### Como validar

- Rode um comando admin (ex.: criar tenant pelo `external-agent-client`) usando o novo token.
- Se der `401 Unauthorized`, o token enviado no header `x-admin-token` não bate.

## 2) Rotacionar `ASAAS_WEBHOOK_SECRET` (PIX)

### Impacto

- Se o secret não bater, o webhook PIX pode começar a responder **401** e o pagamento não será confirmado via webhook.

### Onde trocar

- O backend valida o header **`asaas-access-token`** no endpoint `/api/webhooks/pix`.
- Na prática, em muitas integrações do Asaas, esse header é o **token da conta** (API key) que o Asaas usa para identificar a origem.
- Portanto, a rotação pode ser de dois jeitos (escolha 1 e padronize):
  - **Opção A (recomendado, simples):** usar `ASAAS_WEBHOOK_SECRET` **igual** ao `ASAAS_API_KEY`.
    - Rotacionar significa gerar uma nova API key no Asaas e atualizar **as duas** variáveis no Render.
  - **Opção B (se o Asaas permitir um token separado para webhooks na sua conta):** gerar esse token no painel do Asaas e colocar apenas em `ASAAS_WEBHOOK_SECRET`.

Passo a passo (Asaas):
- Asaas (sandbox/prod) → **Integrações** → **Chaves de API** → gere/rotacione a chave.
- Confirme que o webhook está apontando para:
  - `https://phoenix-zero-web.onrender.com/api/webhooks/pix`
- No Render, atualize `ASAAS_API_KEY` e/ou `ASAAS_WEBHOOK_SECRET` conforme a opção escolhida.

### Como validar

- Faça um teste que dispare `/api/webhooks/pix` com o header correto.
- O `external-agent-client` tenta enviar `asaas-access-token` quando `ASAAS_WEBHOOK_SECRET` está presente.

## 3) Rotacionar `NOWPAYMENTS_IPN_SECRET` (Crypto)

### Impacto

- Se não bater, o webhook `/api/webhooks/nowpayments` vai rejeitar a notificação e o pagamento crypto não vai marcar como `paid`.

### Onde trocar

- NowPayments dashboard (IPN secret) -> gere/defina um novo secret.
- Render -> atualize `NOWPAYMENTS_IPN_SECRET`.

### Como validar

- Rode o `external-agent-client` com:
  - `NOWPAYMENTS_IPN_SECRET` atualizado localmente (para gerar assinatura no teste)
  - Render com o mesmo secret (para validar assinatura)

## 4) Rotacionar `TELEGRAM_BOT_TOKEN` (opcional)

### Impacto

- Se o token trocar, notificações Telegram param até atualizar o Render.

### Onde trocar

- BotFather (Telegram) -> gerar novo token do bot.
- Render -> atualizar `TELEGRAM_BOT_TOKEN`.

### Como validar

- Rode um checkout que dispare notificação e verifique:
  - Em `paymentProof.customerNotifications.telegram.ok === true`

## 5) Rotacionar `TWILIO_AUTH_TOKEN`

### Impacto

- Se trocar no console Twilio e não atualizar no Render, WhatsApp para de enviar.

### Onde trocar

- Console Twilio -> rotacionar auth token
- Render -> atualizar `TWILIO_AUTH_TOKEN`

### Como validar

- Rode um checkout que dispare notificação e verifique:
  - Em `paymentProof.customerNotifications.whatsapp.ok === true`

## Pós-rotação: validação final (recomendado)

1. Rode o `external-agent-client` contra o Render.
2. Se o Asaas sandbox estiver instável (503), você pode rodar temporariamente com:
   - `SIM_SKIP_PIX=1`
   - e validar PIX depois.
3. Confira no Render logs:
   - Webhooks recebidos / dedup / status transitions
   - Sem payload sensível

## Higiene / segurança

- Remova segredos do seu terminal (sessão PowerShell) quando terminar.
- Evite manter segredos em `.env.local` se não for estritamente necessário.
- Se precisar manter, garanta que o arquivo está no `.gitignore` (já é o padrão) e restrinja o acesso local.
