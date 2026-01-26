# Agentic Payment Receivable — Playbook (Phoenix Zero)

## Objetivo
Este playbook documenta como replicar e operar um sistema de **Agentic Payment Receivable** no Phoenix Zero:

- agente cria cobrança
- confirmação é assíncrona (webhooks)
- sistema reconcilia com segurança
- pagamento libera acesso automaticamente
- tudo fica auditável (ledger)

O foco é **execução** e **replicabilidade**.

---

## O que é Agentic Payment Receivable (prático)
É um modelo onde o agente não “pede pagamento” de forma manual. Ele:

- decide **quando** cobrar
- decide **quanto** cobrar
- decide **se** executa (gatekeeper)
- observa a confirmação (webhook seguro)
- libera/revoga acesso
- registra eventos auditáveis

---

## Arquitetura mínima (o que tem que existir)

### A) PaymentIntent
Entidade de intenção de pagamento.

Propriedades chave:
- `id`
- `tenantId`
- `provider` (`pix|card|crypto`)
- `status` (`pending|paid|failed`)
- `amountCents`, `currency`
- `providerPaymentId` (id do provedor — base para reconciliação)

### B) Webhook seguro + idempotência
Requisitos:
- **não confiar em `paymentId` no body**
- reconciliar por `providerPaymentId`
- validar autenticidade (token/assinatura)
- deduplicar eventos (idempotência)

### C) BillingAccount (dinheiro → acesso)
Estado do acesso do tenant.

Modelo mínimo:
- `tenantId`
- `status` (`pending|paid|failed|grace|suspended`)
- `paidAt?`

Regra:
- `PaymentIntent.status === 'paid'` ⇒ `BillingAccount.status = 'paid'`

### D) Ledger (auditabilidade)
Um log append-only (jsonl) que registra:
- uso de produto
- eventos de valor (ex: `payment_received`)
- contexto, preço, plano, pilUnits

### E) PPO + Gate + Enforcement (execução condicional)

Para fechar o loop de **pagamento → execução**, o sistema usa:

- PPO (Payment Proof Object): prova determinística derivada de `PaymentIntent.status=paid`
- PPO Gate: autorização por `agentId` + `taskId`/`taskType`
- Enforcement: wrapper server-side obrigatório para ações com efeito real

---

## Implementação no Phoenix Zero (onde fica cada peça)

### PaymentIntent + Checkout
- `POST /api/checkout/create`
- `GET /api/checkout/status?paymentId=...`

Persistência local:
- `tmp/payment-intents.json`

### Webhooks
- Asaas (PIX): `POST /api/webhooks/pix`
- NowPayments (cripto): `POST /api/webhooks/nowpayments`
- Stripe (cartão): `POST /api/webhooks/stripe` (stub)

Idempotência:
- `tmp/payment-webhook-events.json`

### BillingAccount
- lib: `apps/web/src/lib/billing-accounts.ts`
- tenant endpoint: `GET /api/billing/account` (retorna `isActive` e `accessStatus`)

### Ledger
- lib: `apps/web/src/lib/usage-ledger.ts`
- arquivo: `tmp/usage-ledger.jsonl`

Evento de valor:
- `op = payment_received`

---

## Fluxo Agentic padrão (receivable loop)

### 1) Agente calcula/decide preço
Input típico:
- `product`
- `durationSeconds | sizeBytes | pages`
- `exposure | persistence | guaranteeWindow`
- `authenticityLevel | proofGrade`

Saída:
- `lineItems[]` + `providerHint` + `currency`

### 2) Agente cria checkout
Chamada:
- `POST /api/checkout/create`

O agente deve guardar:
- `paymentId`
- `checkoutUrl`
- `instructions`

Opcional (recomendado para agentic hardening):
- `proofMeta.taskId`
- assinatura Ed25519 do `proofMeta`:
  - `agentEd25519PublicKeyB64Url`
  - `agentEd25519SignatureB64Url`

### 3) Agente aguarda confirmação
Polling mínimo:
- `GET /api/checkout/status?paymentId=...`

O polling é redundante (o sistema já terá webhook), mas útil para UX.

### 4) Webhook chega (seguro)
- valida autenticidade
- deduplica
- reconcilia por `providerPaymentId`
- chama `updatePaymentIntentStatus(... status=paid ...)`

### 5) Billing link
Ao transicionar pra `paid`:
- ativa `BillingAccount`
- registra `payment_received` no ledger

### 6) Produto libera execução
O produto (ou o agente) consulta guardrails por duas camadas:

1) Guardrail por tenant (acesso geral):
- `GET /api/billing/account` → `isActive`

2) Guardrail por tarefa (capacidade agentic):
- `GET /api/agents/[agentId]/gate?taskId=...&requireSignature=1`

E a execução com efeito real deve passar por:
- `executeWithPPOGate()` (`apps/web/src/lib/ppo-gate.ts`)

---

## Checklist de segurança (mínimo viável)

### Webhook
- Asaas:
  - configurar `accessToken` no painel
  - validar header `asaas-access-token`
  - setar `ASAAS_WEBHOOK_SECRET`
- NowPayments:
  - configurar IPN secret no painel
  - validar header `x-nowpayments-sig` (HMAC SHA-512)
  - setar `NOWPAYMENTS_IPN_SECRET`

### Idempotência
- definir `eventId` (do provedor quando existir)
- persistir `processed_events`
- retornar `200` quando duplicado

### Reconciliação
- mapear sempre por `providerPaymentId`
- nunca aceitar `paymentId` do body como fonte de verdade

---

## 7 playbooks de monetização (o que dá dinheiro agora)

### 1) Pay-to-Use Agent (pague por ação)
Regra:
- cada ação valiosa = 1 cobrança

Padrão:
- agente pede confirmação de preço
- cobra
- executa

### 2) Agent Gatekeeper (pague para destravar)
Regra:
- endpoint/feature só roda se `BillingAccount` ativo

### 3) Auto-upsell contextual
Regra:
- se complexidade ou urgência aumentar, o agente oferece upgrade

### 4) Debt-aware (entrega micro, cobra depois)
Regra:
- agente entrega uma parte e registra débito
- cobra em seguida

### 5) Revenue-sharing (plataforma)
Regra:
- split automático por evento pago (futuro: payouts)

### 6) Instant credit + lock (limite + bloqueio)
Regra:
- libera com limite
- bloqueia automaticamente ao estourar

### 7) Agents that sell themselves
Regra:
- agente estima esforço
- define preço
- cobra
- executa

---

## Templates prontos (copiar e colar)

### Template: mensagem de cobrança (1 frase)
"Consigo executar isso agora por **R$ X**. Quer que eu libere e execute?"

### Template: justificativa curta (1 frase)
"Esse caso envolve risco público e prova legal, por isso o custo é **R$ X**."

### Template: fallback (sem pagamento)
"Sem problema. Se quiser, eu posso gerar um checkout quando você estiver pronto."

---

## Pacote replicável (o que copiar para outro projeto)

Arquivos prontos neste repo:

- **deploy (produção)**
  - `deploy.sh`
- **template de agente (YAML)**
  - `docs/AGENT_TEMPLATE.yaml`
- **pitch técnico (parceiros/investidores)**
  - `docs/PARTNER_PITCH.md`
- **stress test extremo (L1–L5)**
  - `agentic-stress-test.ts`

Objetivo desta seção:

- você conseguir pegar **estes 4 arquivos** + as rotas `api/*` e replicar o sistema do zero em outro repo
- você conseguir validar guardrails e billing **sem depender** de UI

## Variáveis de ambiente (produção)

### Phoenix Zero (core)
```env
NODE_ENV=production
PORT=3000

# admin
PHOENIX_ZERO_ADMIN_TOKEN=...

# crypto signing (usado por endpoints como time-anchor)
PHOENIX_ZERO_PRIVATE_KEY_B64URL=...

# recomendado
PHOENIX_ZERO_PUBLIC_BASE_URL=https://seu-dominio.com
PHOENIX_ZERO_TMP_DIR=/var/lib/phoenix-zero/tmp

# opcional: para endpoints públicos/globais que chamam endpoints guardrailed por dentro
PHOENIX_ZERO_PUBLIC_API_KEY=...
```

### Asaas
```env
PAYMENTS_PIX_PROVIDER=asaas
ASAAS_API_KEY=...
ASAAS_WEBHOOK_SECRET=...
ASAAS_ENV=production
```

### NowPayments
```env
PAYMENTS_CRYPTO_PROVIDER=nowpayments
NOWPAYMENTS_API_KEY=...
NOWPAYMENTS_IPN_SECRET=...
```

---

## Stress test extremo (L1–L5) — como rodar

Arquivo:

- `agentic-stress-test.ts`

O que ele valida:

- **L1** guardrail 402 antes do pagamento e 200 depois do unlock (por webhook PIX **ou** fallback admin quando não há keys)
- **L2** fluxo crypto (NowPayments) quando `NOWPAYMENTS_API_KEY` existir
- **L3** replay/idempotência do webhook PIX quando `ASAAS_API_KEY` existir
- **L4** falha segura para `providerPaymentId` desconhecido
- **L5** tentativas adversariais (tenantId mismatch + endpoint de valor sem pagar)

### Rodar local (Windows / PowerShell)

1) Subir o servidor (porta alternativa recomendada para evitar conflitos)

```powershell
npm --prefix .\apps\web run dev -- -p 3001
```

2) Rodar os testes apontando para o servidor local

```powershell
$env:PHOENIX_ZERO_BASE_URL='http://localhost:3001'
npx tsx .\agentic-stress-test.ts
```

Notas:

- Se `PHOENIX_ZERO_ADMIN_TOKEN` não estiver setado, em dev local o servidor aceita admin sem token e o script também.
- Se `ASAAS_API_KEY` / `NOWPAYMENTS_API_KEY` não estiverem setadas, alguns níveis vão sair como `SKIPPED`.
- Para rodar **100% end-to-end** (checkout real → webhook real), você precisa de domínio + HTTPS e registrar webhooks nos provedores.

### Rodar em produção

- Exportar env vars reais
- Garantir que o `PHOENIX_ZERO_TMP_DIR` aponta para volume persistente
- Rodar:

```bash
PHOENIX_ZERO_BASE_URL=https://seu-dominio.com \
PHOENIX_ZERO_ADMIN_TOKEN=... \
node ./node_modules/.bin/tsx ./agentic-stress-test.ts
```

### Rodar com dinheiro real (modo REAL)

No modo REAL o script:

- cria um checkout
- imprime `checkoutUrl`/`instructions`
- espera o webhook real do provedor chegar
- faz polling em `GET /api/checkout/status` até `status == paid`
- valida unlock via `GET /api/live-stream` (guardrail)

Env vars:

```env
AGENTIC_STRESS_REAL=1

# escolha o provedor real a validar
AGENTIC_STRESS_REAL_PROVIDER=pix  # ou crypto

# timeout de espera do pagamento (segundos)
AGENTIC_STRESS_WAIT_SECONDS=900
```

Exemplo (PowerShell):

```powershell
$env:PHOENIX_ZERO_BASE_URL='https://seu-dominio.com'
$env:PHOENIX_ZERO_ADMIN_TOKEN='...'
$env:AGENTIC_STRESS_REAL='1'
$env:AGENTIC_STRESS_REAL_PROVIDER='pix'
$env:AGENTIC_STRESS_WAIT_SECONDS='900'
npx tsx .\agentic-stress-test.ts
```

## Guardrails de produto (pagou → executou)
O guardrail fecha o loop: **não existe execução de valor sem `BillingAccount` ativo**.

Regra:
- se `isBillingAccountActive(account) === false` ⇒ retornar `402`.

Status que liberam execução:
- `paid`
- `grace`

Status bloqueados:
- `pending`
- `failed`
- `suspended`

### Onde está aplicado (Phoenix Zero)
Endpoints protegidos com guardrail (retornam `402` se bloqueado):

- `POST /api/phoenix-zero/stamp`
- `POST /api/phoenix-zero/stamp-watermarked`
- `POST /api/phoenix-zero/stamp-image`
- `POST /api/phoenix-zero/stamp-image-watermarked`
- `POST /api/phoenix-zero/stamp-audio-watermarked`
- `POST /api/phoenix-zero/verify`
- `POST /api/phoenix-zero/verify-watermarked`
- `POST /api/phoenix-zero/verify-by-url`
- `POST /api/phoenix-zero/verify-image`
- `POST /api/phoenix-zero/verify-image-by-url`
- `POST /api/phoenix-zero/verify-image-watermarked`
- `POST /api/phoenix-zero/verify-image-watermarked-by-url`
- `POST /api/phoenix-zero/verify-audio`
- `POST /api/phoenix-zero/verify-audio-by-url`
- `GET/POST /api/time-anchor`
- `GET/POST /api/live-stream`

Arquivos onde a checagem foi inserida:
- `apps/web/src/app/api/phoenix-zero/*/route.ts`
- `apps/web/src/app/api/time-anchor/route.ts`
- `apps/web/src/app/api/live-stream/route.ts`

### Forma do erro (contrato mínimo)
Quando bloqueado, o endpoint responde:

- HTTP `402`
- JSON com:
  - `ok: false`
  - `reason: 'Payment required'`
  - `billing.status`

Isso permite que qualquer agente implemente o loop:
- se 402 ⇒ ofertar checkout
- se 200 ⇒ executar

---

## Replicação end-to-end (do zero)
Esta seção é o roteiro operacional para você reproduzir o sistema inteiro em outro ambiente/instância.

### 0) Pré-requisitos
- Node.js rodando o `apps/web`
- Persistência local habilitada (os arquivos `tmp/*.json` e `tmp/*.jsonl`)
- Providers:
  - Asaas (PIX) opcional
  - NowPayments (cripto) opcional

Observação: em ambiente local você consegue testar tudo **simulando webhooks**.

### 1) Configurar env (mínimo)
Defina as variáveis necessárias para:

- rodar o app
- criar tenants
- criar pagamentos

Mínimo recomendado:
```env
PHOENIX_ZERO_ADMIN_TOKEN=dev_admin_token

# opcional (fluxos públicos): chave de um tenant “public” para endpoints que precisam chamar outros endpoints internamente
# (ex.: /api/global-live-auth chamando /api/live-stream)
PHOENIX_ZERO_PUBLIC_API_KEY=pz_...

# pagamentos (use 1 provider por vez se quiser simplificar)
PAYMENTS_PIX_PROVIDER=asaas
ASAAS_API_KEY=...
ASAAS_WEBHOOK_SECRET=...

PAYMENTS_CRYPTO_PROVIDER=nowpayments
NOWPAYMENTS_API_KEY=...
NOWPAYMENTS_IPN_SECRET=...

# opcional (produção):
PHOENIX_ZERO_PUBLIC_BASE_URL=https://seu-dominio.com
```

### 2) Criar tenant (admin)
Crie um tenant via:
- `POST /api/admin/tenants` com header `x-admin-token`

Saída importante:
- `tenant.tenantId`
- `apiKey`
- `sessionToken` (para usar UI via cookie)
- `redeemUrl` (atalho para setar cookie no browser)

O que isso cria em disco:
- `tmp/tenants.json`
- `tmp/tenant-sessions.json`

### 3) Criar BillingAccount (automático)
Você não precisa criar manualmente.

O BillingAccount é criado na primeira vez que:
- você chama `GET /api/billing/account`
- ou quando algum endpoint com guardrail chama `getOrCreateBillingAccount()`

Arquivo:
- `tmp/billing-accounts.json`

### 4) Fluxo de cobrança (checkout)
Chame:
- `POST /api/checkout/create`

Headers:
- `x-api-key: <apiKey do tenant>`

Guarde a resposta:
- `paymentId`
- `checkoutUrl`
- `instructions`
- `provider`

### 5) Validar que o guardrail está bloqueando antes do pagamento
Chame qualquer endpoint protegido (ex.: `POST /api/phoenix-zero/stamp-watermarked`).

Resultado esperado:
- HTTP `402`
- `reason: 'Payment required'`
- `billing.status: 'pending'`

### 6) Marcar pagamento como pago (2 formas)

#### Forma A — produção (real)
- o usuário paga no checkout
- o provider chama o webhook
- o webhook valida autenticidade + idempotência
- o sistema reconcilia por `providerPaymentId`

#### Forma B — local (simulação)
Você envia um evento para o webhook correspondente (PIX/crypto) e força `paid`.

Regra chave: o webhook **não confia em `paymentId` interno** no body.
Ele procura o `PaymentIntent` pelo `providerPaymentId`.

### 7) Confirmar o billing link
Depois do `paid`, valide:

- `GET /api/checkout/status?paymentId=...` retorna `paid`
- `GET /api/billing/account` retorna `isActive: true`

E em disco:
- `tmp/billing-accounts.json` com `status: paid` e `paidAt`
- `tmp/usage-ledger.jsonl` contém um evento `payment_received`

### 8) Executar produto (agora passa)
Chame o mesmo endpoint guardrailed novamente.

Resultado esperado:
- HTTP `200`
- operação executa

---

## Checklist operacional (produção)

### Setup
- `PHOENIX_ZERO_PUBLIC_BASE_URL` configurado
- domínio público + HTTPS
- servidor exposto (sem bloquear webhooks)

### Webhooks
- Asaas:
  - endpoint: `https://seu-dominio.com/api/webhooks/pix`
  - configurar access token no painel
  - setar `ASAAS_WEBHOOK_SECRET`
- NowPayments:
  - endpoint: `https://seu-dominio.com/api/webhooks/nowpayments`
  - setar IPN secret no painel
  - setar `NOWPAYMENTS_IPN_SECRET`

### Operação diária
- monitorar erros 4xx/5xx nos webhooks
- monitorar `tmp/payment-webhook-events.json` (crescimento)
- monitorar `tmp/usage-ledger.jsonl` (receita/uso)

---

## Troubleshooting (falhas comuns)

### 1) Tudo retorna 401
- Verifique se você está passando `x-api-key`.
- Se estiver usando browser, verifique se o cookie `pz_tenant_session` existe.

### 2) Webhook retorna 401/403
- Asaas: `ASAAS_WEBHOOK_SECRET` não confere com `asaas-access-token`.
- NowPayments: `NOWPAYMENTS_IPN_SECRET` não confere com `x-nowpayments-sig`.

### 3) Webhook retorna 200 mas não muda o status
- Confirme que `providerPaymentId` do evento é o mesmo salvo no `PaymentIntent`.
- Confirme que o `PaymentIntent` existe em `tmp/payment-intents.json`.

### 4) Webhook duplicado
- Com idempotência, o comportamento esperado é:
  - retornar 200
  - `deduped: true`

### 5) Guardrail continua retornando 402 depois do pagamento
- Confirme `GET /api/billing/account` → `isActive: true`.
- Confirme `BillingAccount.status` não ficou `pending`.
- Confirme que o webhook efetivamente chamou `updatePaymentIntentStatus(... paid ...)`.

---

## Próximos passos recomendados (sem dispersão)

1) Domínio + hospedagem para webhooks reais.
2) Stripe: integração real + assinatura do webhook.
3) (Escala) separar ledger por tenant e adicionar export.
