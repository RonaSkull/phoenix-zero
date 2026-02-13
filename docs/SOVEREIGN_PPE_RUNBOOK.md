# Phoenix Zero — SOVEREIGN PPE Runbook (CRYPTO / NowPayments)

## 0) Objetivo
Este runbook é o passo-a-passo definitivo para **testar e operar** o fluxo **SOVEREIGN (crypto-first, USD)**:

- `checkout/create` (crypto)
- pagar invoice (sandbox ou live)
- `checkout/status` até `paid`
- PPO (Payment Proof Object) é criado automaticamente
- `gate` libera por `(agentId, taskId, taskType)`
- `execute` consome units e executa
- verificação pública por `GET /api/guarantee-proofs/<proofId>` e página `/verify/<proofId>`

**Não usar PIX.** PIX é Global (BRL) e não faz parte do fluxo Sovereign.

---

## 1) Regras de ouro (invariantes)

- **Auth**: `x-api-key = pz_...` (tenantId `t_...` não autentica)
- **Contrato PPO/Gate**: matching por:
  - `agentId`
  - `taskId`
  - `taskType`
- **Sem pagamento**: `checkout/status` fica `pending` e `gate/execute` devem bloquear. Isso é correto.
- **Regra `taskType` vs `operation`**:
  - para manter compatibilidade e previsibilidade, use `proofMeta.taskType == lineItems[0].operation` (principalmente em fluxos self-serve).
  - o backend pode aplicar regras adicionais para non-sovereign e/ou sovereign dependendo do enforcement e do contrato.
- **Webhook**:
  - produção exige assinatura `x-nowpayments-sig` (HMAC SHA-512 do body com `NOWPAYMENTS_IPN_SECRET`)
  - sem webhook correto, fica `pending` “para sempre”

---

## 2) Endpoints oficiais (sem inventar)

### Tenant auth
- Header: `x-api-key: pz_...`

### Checkout crypto
- `POST /api/checkout/create`
- `GET /api/checkout/status?paymentId=...`

### Webhook NowPayments (IPN)
- `POST /api/webhooks/nowpayments`

### Agent APIs
- `GET /api/agents/{agentId}/gate?taskId=...&taskType=...`
- `POST /api/agents/{agentId}/execute`

### Verificação pública
- Página: `/verify/<proofId>`
- JSON: `GET /api/guarantee-proofs/<proofId>`

---

## 3) Campos obrigatórios do `checkout/create`

Body mínimo (SOVEREIGN):

- `currency = "USD"`
- `providerHint = "crypto"`
- `lineItems = [{ operation, units }]`
- `proofMeta`:
  - `agentId`
  - `taskId`
  - `taskType`
  - `taskInputHash` (formato `sha256:<hex|texto>`)
  - `taskOutputHash` (formato `sha256:<hex|texto>`)

---

## 4) Operations baratas para teste mínimo

Fonte: `apps/web/src/lib/pricing.ts` (`defaultPricingProfile().basePriceCentsByOp`).

Para economizar:
- **preferir operations de 1 cent**
  - `time_anchor_get`
  - `public_anchor_get`
  - `live_cancel`
  - `live_get`
  - `live_telemetry`

Observação importante:
- Crypto providers têm **mínimos por asset/network** que ignoram seu pricing interno.
- Então, na prática, você usa op barata, mas aumenta `units` para bater o mínimo do provider.

---

## 5) NowPayments: Sandbox vs Live (o que muda)

### Sandbox
- URL da invoice costuma ser `https://sandbox.nowpayments.io/...`
- Serve para validar **integração**.
- Pode ter mínimos **altos** e inconsistentes por asset.
- A UI pode mostrar erro do tipo:
  - `Crypto amount X is less than minimal`

### Live (produção)
- Pagamento real on-chain.
- Você precisa:
  - `NOWPAYMENTS_API_KEY` (produção)
  - `NOWPAYMENTS_IPN_SECRET` (produção)
  - webhooks apontando para `PHOENIX_ZERO_PUBLIC_BASE_URL/api/webhooks/nowpayments`

---

## 6) Variáveis de ambiente no deploy (SOVEREIGN crypto)

Obrigatórias:

- `PAYMENTS_CRYPTO_PROVIDER=nowpayments`
- `NOWPAYMENTS_API_KEY=...`
- `NOWPAYMENTS_IPN_SECRET=...`
- `PHOENIX_ZERO_PUBLIC_BASE_URL=https://<seu-dominio>`

Opcional:
- `PHOENIX_ZERO_NOWPAYMENTS_PAY_CURRENCY=<coin>`
  - se não setar, o buyer escolhe a moeda na UI da invoice

---

## 7) Fluxo REAL (cliente/agent) — sem endpoints admin

### Passo A) Criar checkout
1. Cliente/agent chama `POST /api/checkout/create` com `providerHint=crypto`.
2. Backend retorna `paymentId` e `checkoutUrl`.

### Passo B) Pagar invoice
1. Abrir `checkoutUrl`.
2. Escolher asset com taxa baixa (ex.: USDT TRC20 / TRX / etc — depende do que a invoice oferece).
3. Completar pagamento.

### Passo C) Aguardar `paid`
Polling:
- `GET /api/checkout/status?paymentId=...`

### Passo D) Gate
- `GET /api/agents/{agentId}/gate?taskId=...&taskType=...`

### Passo E) Execute
- `POST /api/agents/{agentId}/execute` com o **mesmo** `taskId/taskType`.

### Passo F) Verificação pública
- pegar `proofId` via `GET /api/agents/{agentId}/proofs`
- validar publicamente via `GET /api/guarantee-proofs/<proofId>` ou `/verify/<proofId>`

---

## 8) Diagnóstico rápido (anti-erros)

### 401
- `x-api-key` ausente/errado
- você usou `tenantId` no header

### Webhook 401
- `NOWPAYMENTS_IPN_SECRET` configurado no backend, mas você enviou `x-nowpayments-sig` inválido
- você está mandando webhook para URL errada

### `pending` eterno
- webhook não chega
- `PHOENIX_ZERO_PUBLIC_BASE_URL` errado
- IPN secret diferente entre NowPayments e backend

### Gate 403
- `NO_MATCHING_PPO`:
  - `taskId` ou `taskType` diferente do `proofMeta` usado no checkout
- `INSUFFICIENT_UNITS`:
  - units já consumidas

### Execute 403
- normalmente é `PPO_GATE_BLOCKED` (mesma causa do gate)
- ou `AGENT_NOT_REGISTERED` / `AGENT_CAPABILITY_DENIED` se enforcement estiver ligado

---

## 10) Script E2E automatizado (`sovereign-test-complete.ps1`)

Script PowerShell que executa **E2E completo** do fluxo Sovereign, com 3 modos de operação:

### Modos disponíveis (`MODE`)

| Modo | Descrição | Quando usar |
|------|-----------|-------------|
| `invoice` | Gera checkout e sai | Quer pagar manualmente na UI depois |
| `wait` | Gera checkout e fica polling até `paid` | Vai pagar na UI e esperar webhook confirmar |
| `simulate` | Gera checkout e auto-confirma via admin | Roda 100% automatizado (sem depender de webhook) |

### Variáveis de ambiente

```powershell
# Obrigatórias
$env:PHOENIX_ZERO_BASE_URL = "https://phoenix-zero-web.onrender.com"

# Opcionais (script auto-provisiona se ausente)
$env:PHOENIX_ZERO_SOVEREIGN_TEST_API_KEY = "pz_test_..."  # ou deixe vazio para auto-criar
$env:PHOENIX_ZERO_SOVEREIGN_AGENT_ID = "agt_..."          # ou deixe vazio para auto-criar

# Necessário apenas para MODE=simulate
$env:PHOENIX_ZERO_ADMIN_TOKEN = "..."

# Configuração
$env:PHOENIX_ZERO_E2E_MODE = "wait"          # invoice | wait | simulate
$env:PHOENIX_ZERO_E2E_TIMEOUT_SECONDS = "300" # timeout para wait/simulate
```

### Execução

```powershell
# Modo invoice: só gera e mostra URL
$env:PHOENIX_ZERO_E2E_MODE = "invoice"
.\sovereign-test-complete.ps1

# Modo wait: gera e aguarda pagamento (abra a URL e pague)
$env:PHOENIX_ZERO_E2E_MODE = "wait"
$env:PHOENIX_ZERO_E2E_TIMEOUT_SECONDS = "600"
.\sovereign-test-complete.ps1

# Modo simulate: 100% automático (precisa admin token)
$env:PHOENIX_ZERO_E2E_MODE = "simulate"
$env:PHOENIX_ZERO_ADMIN_TOKEN = "seu_token_aqui"
.\sovereign-test-complete.ps1
```

### Auto-provisionamento

Se `PHOENIX_ZERO_SOVEREIGN_TEST_API_KEY` não estiver setado:
1. Script chama `POST /api/public/agent-signup`
2. Cria tenant sovereign automaticamente
3. Usa a API key retornada para o resto do fluxo

**Persistência**: o script loga a API key criada — copie e reuse em runs futuros para manter o mesmo tenant.

### Fluxo executado pelo script

1. **Auto-provision** (se necessário): `agent-signup` → API key
2. **Checkout**: `POST /api/checkout/create` com `proofMeta`
3. **Invoice**: exibe `checkoutUrl`
4. **Pagamento**:
   - `invoice`: sai aqui
   - `wait`: polling até `paid` (ou timeout)
   - `simulate`: chama `POST /api/admin/fallback-paid` para marcar como pago
5. **PPO**: recupera proof via `GET /api/agents/{agentId}/proofs`
6. **Gate/Execute**: valida liberação e execução
7. **Verify**: valida prova publicamente via `GET /api/guarantee-proofs/{proofId}`

---

## 11) Testes automatizados do repo (`agentic-stress-test.ts`)

Execução (local/dev):

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN="..."      # necessário para criar tenant sovereign no teste
$env:NOWPAYMENTS_IPN_SECRET="..."        # necessário se seu backend exige assinatura
npm run test:agentic
```

Para rodar somente esses níveis:

```powershell
$env:AGENTIC_STRESS_ONLY="L2S,L2N"
npm run test:agentic
```

### Verificação em produção (Render)

- `GET https://phoenix-zero-web.onrender.com/api/health`
  - commit: `5f968c234b72c63f211e64ba1701402b153be465`
- `L4` (PIX webhook unknown mapping fails safely) passou contra Render via `scripts/agentic-stress-e2e.ps1`.
