# Phoenix Zero — Próximos passos (segunda-feira) + fallback NowPayments

## Status atual

- Deploy no Render está no ar:
  - `https://phoenix-zero-web.onrender.com`
- Bloqueio atual:
  - Asaas (sandbox e/ou produção) está pedindo **validação por SMS** para liberar a integração/chave.
  - Isso impede configurar `ASAAS_API_KEY` agora.

## Status técnico (local)

- PPO + Gate + Enforcement: implementado.
- `agentic-stress-test.ts`:
  - L1-L12: OK (quando `ASAAS_WEBHOOK_SECRET` está setado no processo do backend e no stress test)
  - L3: SKIPPED quando `ASAAS_API_KEY` não está configurado

## O que dá pra fazer hoje (sem Asaas): testar NOWPayments (cripto)

### Observação sobre SMS

- **NowPayments normalmente não depende de validação por SMS** como o Asaas.
- Pode exigir **verificação por e-mail** e/ou habilitar **2FA** (varia por conta/política).
- Portanto: a forma de confirmar é **tentar gerar a API key** no painel do NowPayments.

### O que já existe no código

- Checkout (criação de cobrança): `POST /api/checkout/create`
- Webhook NowPayments (IPN): `POST /api/webhooks/nowpayments`
  - Assinatura esperada (se `NOWPAYMENTS_IPN_SECRET` estiver setada): header `x-nowpayments-sig` (HMAC SHA-512 do JSON com chaves ordenadas; compatível com raw)

### Env vars necessárias no Render (para NowPayments)

Setar no Render → Service → Environment:

- `PAYMENTS_CRYPTO_PROVIDER=nowpayments`
- `NOWPAYMENTS_API_KEY=...` (secret)
- `NOWPAYMENTS_IPN_SECRET=...` (secret)

Também setar (recomendado):

- `PHOENIX_ZERO_PUBLIC_BASE_URL=https://phoenix-zero-web.onrender.com`

Opcional (apenas se o sandbox exigir host diferente do default):

- `NOWPAYMENTS_API_BASE=...`

Recomendado manter também:

- `PHOENIX_ZERO_ADMIN_TOKEN=...` (já existe no Blueprint)

### Criar conta no NOWPayments Sandbox + gerar chaves

- Criar conta no Sandbox:
  - `https://account-sandbox.nowpayments.io`
- Em Store settings:
  - adicionar wallet de saída (sandbox)
  - gerar `API key`
  - gerar `IPN Secret key`

### Configurar webhook (IPN) no NowPayments

No painel NowPayments (IPN / Webhooks):

- URL:
  - `https://phoenix-zero-web.onrender.com/api/webhooks/nowpayments`
- IPN secret:
  - usar o mesmo valor de `NOWPAYMENTS_IPN_SECRET`

### Teste rápido (SANDBOX, sem dinheiro real)

Pré-requisitos:

- Render com env vars acima.
- Webhook/IPN configurado no NowPayments.

Rodar localmente (PowerShell) apontando pro Render:

```powershell
$env:PHOENIX_ZERO_BASE_URL="https://phoenix-zero-web.onrender.com"
$env:PHOENIX_ZERO_ADMIN_TOKEN="<pegar no Render>"

# SANDBOX (simulação de webhook)
$env:AGENTIC_STRESS_REAL="0"
$env:NOWPAYMENTS_IPN_SECRET="<pegar no Render>"

npx tsx .\agentic-stress-test.ts
```

O script vai:

- criar uma invoice real no NOWPayments (via servidor no Render)
- simular o IPN (webhook) assinando o payload com `NOWPAYMENTS_IPN_SECRET`
- validar que o status muda para `paid`

Depois que o sandbox estiver OK, aí sim fazemos o modo REAL (produção) com `AGENTIC_STRESS_REAL=1`.

## Segunda-feira (Asaas): checklist completo

### 1) Gerar chave API no Asaas (sandbox primeiro)

No Asaas Sandbox:

- Menu → Integrações → Chaves de API → **Gerar chave de API**
- Se travar por SMS:
  - concluir validação no horário comercial
  - depois repetir o passo

### 2) Configurar env vars no Render

No Render → Service → Environment:

- `PAYMENTS_PIX_PROVIDER=asaas`
- `ASAAS_ENV=sandbox` (ou `production` depois)
- `ASAAS_API_KEY=...` (secret)
- `ASAAS_WEBHOOK_SECRET=...` (já existe no Blueprint; copiar valor para o Asaas)

Nota:
- em DEV/local, se `ASAAS_WEBHOOK_SECRET` estiver setado, o webhook PIX exige o header `asaas-access-token`. Se você alterar env vars, reinicie o backend.

### 3) Webhook no Asaas

No Asaas → Integrações → Webhooks:

- URL:
  - `https://phoenix-zero-web.onrender.com/api/webhooks/pix`
- Token de autenticação:
  - usar o valor de `ASAAS_WEBHOOK_SECRET`
- O servidor valida o header:
  - `asaas-access-token: <ASAAS_WEBHOOK_SECRET>`

### 4) Teste (PIX real)

Rodar localmente (PowerShell) apontando pro Render:

```powershell
$env:PHOENIX_ZERO_BASE_URL="https://phoenix-zero-web.onrender.com"
$env:PHOENIX_ZERO_ADMIN_TOKEN="<pegar no Render>"

$env:AGENTIC_STRESS_REAL="1"
$env:AGENTIC_STRESS_REAL_PROVIDER="pix"
$env:AGENTIC_STRESS_WAIT_SECONDS="900"

npx tsx .\agentic-stress-test.ts
```

## Referências no projeto

- Webhook Asaas (PIX): `apps/web/src/app/api/webhooks/pix/route.ts`
- Webhook NowPayments: `apps/web/src/app/api/webhooks/nowpayments/route.ts`
- Checkout create: `apps/web/src/app/api/checkout/create/route.ts`
- Lógica de providers: `apps/web/src/lib/payments.ts`

## Notas de segurança

- **Nunca commitar** `ASAAS_API_KEY`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`.
- Guardar apenas no Render → Environment.

## Próximos passos (pós-L12)

1) Habilitar testes reais do Asaas
- configurar `ASAAS_API_KEY` (sandbox primeiro)
- rodar `AGENTIC_STRESS_REAL=1` com PIX real

2) Introduzir settlement (L13+)
- separar: PPO (pagamento confirmado) vs saldo liquidado (settled)
- adicionar estado de settlement em eventos de valor e/ou ledger derivado

3) Hardening de produção
- rotação de secrets (`ASAAS_WEBHOOK_SECRET`, IPN)
- observabilidade (logs/alerts por falhas de webhook, dedupe, invalid signature)
- testes de regressão no CI (dry-run)
