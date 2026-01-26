# PPO + Agent Ledger — Runbook (Phoenix Zero)

## Objetivo
Este runbook é o passo-a-passo reprodutível (Windows/PowerShell-friendly) para:

- Validar PPO (Payment Proof Object) localmente
- Entender exatamente onde os arquivos são persistidos (`phoenixZeroTmpDir`)
- Consultar PPO por API (por agente e por id)
- Consultar o Agent Ledger (agregado determinístico de PPOs)
- Replicar o mesmo padrão em outros projetos

> Para visão geral dos provedores e integração, veja também:
> - `docs/MEIOS_DE_PAGAMENTO.md`
> - `docs/AGENTIC_PAYMENT_RECEIVABLE_PLAYBOOK.md`

---

## 1) Conceitos (bem curtos)

### 1.1 PaymentIntent (intenção de pagamento)
- Criado por `POST /api/checkout/create`
- Persistido em `payment-intents.json`

### 1.2 PPO (Payment Proof Object)
Um PPO é criado automaticamente quando um `PaymentIntent` transiciona para `paid`.

Ele liga:
- pagamento (provider + providerPaymentId)
- tenant (`tenantId`)
- tarefa do agente (`agentId`, `taskType`, opcionalmente `taskId`)
- hashes de input/output (`taskInputHash`, `taskOutputHash`)

Opcional (L7+): identidade cripto do agente (anti-spoof / anti-replay)
- `agentEd25519PublicKeyB64Url`
- `agentEd25519SignatureB64Url`

Persistência:
- `payment-proofs.json`

Idempotência:
- 1 PPO por `(provider, providerPaymentId)`

### 1.3 Agent Ledger
Um Ledger é **derivado** de PPOs (read-only). Não grava estado.

Ele responde:
- quantos PPOs um agente tem
- quanto valor já foi confirmado
- breakdown por `taskType` e moeda

E também expõe:
- `rootHashB64Url`: hash determinístico (auditável) do stream de PPOs do agente

---

## 2) Onde os dados ficam (persistência local)

O projeto usa `phoenixZeroTmpDir()`.

Ele resolve assim:
1) Se existir `PHOENIX_ZERO_TMP_DIR`, usa esse caminho.
2) Senão, usa um diretório de tmp padrão do runtime.

No seu ambiente local validado, o backend estava usando:
- `D:\redessociaisvideo3s\.pz-tmp`

Arquivos principais:
- `payment-intents.json`
- `payment-proofs.json`
- `payment-webhook-events.json`
- `billing-accounts.json`
- `tenants.json`

---

## 3) Debug: descobrir o tmpDir real do backend

### 3.1 Endpoint dev-only
Em DEV (não-prod), use:

- `GET /api/debug/paths`

Exemplo PowerShell:

```powershell
$r = Invoke-RestMethod "http://localhost:3000/api/debug/paths"
$r | ConvertTo-Json -Depth 6
```

Você recebe:
- `tmp.phoenixZeroTmpDir`
- `files[]` com existência/tamanho/mtime

### 3.2 Ler o arquivo `payment-proofs.json` sem adivinhar caminho

```powershell
$r = Invoke-RestMethod "http://localhost:3000/api/debug/paths"
$p = Join-Path $r.tmp.phoenixZeroTmpDir "payment-proofs.json"
Test-Path $p
if (Test-Path $p) { Get-Content -Raw $p }
```

---

## 4) Rodar o smoke test local (PPO + Ledger)

### 4.1 Subir o backend

```powershell
npm run dev:web
```

Env vars importantes (DEV):

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN="..."
$env:ASAAS_WEBHOOK_SECRET="..."  # se setado, o webhook PIX exige o header asaas-access-token
```

Nota:
- se você alterar env vars, reinicie o processo do backend.

### 4.2 Rodar o stress test

O repo usa `tsx`.

```powershell
npx tsx .\agentic-stress-test.ts
```

O script valida:
- criação de tenant
- criação de checkout
- simulação de webhook/admin fallback
- criação de PPO
- query de PPOs por agente
- query do Agent Ledger

Níveis avançados (L7-L10) incluem:
- assinatura Ed25519 do `proofMeta`
- gate de execução por `taskId`
- isolamento multi-tenant e multi-agent
- ataques adversariais (replay / assinatura inválida)

Níveis avançados (L11-L12) incluem:
- enforcement no ponto de execução (backend)
- tentativa de execução sem PPO (bloqueada)
- `taskId` errado (bloqueado) vs `taskId` correto (permitido)

Níveis avançados (L13-L16) incluem:
- settlement derivado de PPO (criado quando o pagamento vira `paid`)
- transição `pending -> settled` via avanço do engine
- janela de risco por provider (ex.: `card` com janela)
- reversion manual (`reverted`) e impacto no balance
- idempotência contra replay de webhook (não duplica settlement)

Documentação do engine:
- `docs/SETTLEMENT_ENGINE.md`

Nota:
- se `ASAAS_WEBHOOK_SECRET` estiver setado no backend, o stress test também precisa ter `ASAAS_WEBHOOK_SECRET` (para enviar `asaas-access-token`). Caso contrário, o webhook retorna `401` e níveis que dependem de PIX ficam `SKIPPED`.
- L3 depende de `ASAAS_API_KEY` (criar PaymentIntent real via Asaas). Se não estiver setado, L3 fica `SKIPPED`.

### 4.3 Confirmar no console
Quando um PPO for criado em dev, você verá:

- `[PPO] created { ... tmpDir: ..., dbPath: ... }`

---

## 5) Endpoints: consultar PPO e Ledger

### 5.1 PPO por agente

- `GET /api/agents/[agentId]/proofs`

PowerShell:

```powershell
$base = "http://localhost:3000"
$apiKey = "<TENANT_API_KEY>"
$agentId = "agent://agentic-stress-test-v1"

Invoke-RestMethod -Method Get -Uri "$base/api/agents/$([uri]::EscapeDataString($agentId))/proofs" -Headers @{ 'x-api-key' = $apiKey } |
  ConvertTo-Json -Depth 10
```

### 5.2 PPO por id

- `GET /api/payment-proofs/[id]`

```powershell
$base = "http://localhost:3000"
$apiKey = "<TENANT_API_KEY>"
$proofId = "ppo_xxx"

Invoke-RestMethod -Method Get -Uri "$base/api/payment-proofs/$proofId" -Headers @{ 'x-api-key' = $apiKey } |
  ConvertTo-Json -Depth 10
```

### 5.3 Agent Ledger

- `GET /api/agents/[agentId]/ledger`

```powershell
$base = "http://localhost:3000"
$apiKey = "<TENANT_API_KEY>"
$agentId = "agent://agentic-stress-test-v1"

Invoke-RestMethod -Method Get -Uri "$base/api/agents/$([uri]::EscapeDataString($agentId))/ledger" -Headers @{ 'x-api-key' = $apiKey } |
  ConvertTo-Json -Depth 10
```

### 4.5 Settlement & Balance

```powershell
$base = "http://localhost:3000"
$apiKey = "<TENANT_API_KEY>"
$agentId = "agent://agentic-stress-test-v1"

Invoke-RestMethod -Method Get -Uri "$base/api/agents/$([uri]::EscapeDataString($agentId))/settlements" -Headers @{ 'x-api-key' = $apiKey } |
  ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Get -Uri "$base/api/agents/$([uri]::EscapeDataString($agentId))/balance" -Headers @{ 'x-api-key' = $apiKey } |
  ConvertTo-Json -Depth 10
```

Admin (advance/revert):

```powershell
$base = "http://localhost:3000"
$adminToken = "<PHOENIX_ZERO_ADMIN_TOKEN>"

Invoke-RestMethod -Method Post -Uri "$base/api/admin/settlement/advance" -Headers @{ 'x-admin-token' = $adminToken; 'Content-Type' = 'application/json; charset=utf-8' } -Body "{}" |
  ConvertTo-Json -Depth 10
```

### 5.4 PPO Gate (L7+)

O gate serve para o agente (ou orquestrador) checar se **pode executar** uma tarefa.

- `GET /api/agents/[agentId]/gate`

Query params:
- `taskId` (opcional): se informado, exige PPO pago para esse `taskId`
- `taskType` (opcional): se informado, exige PPO pago para esse `taskType`
- `requireSignature=1` (opcional): exige `agentEd25519SignatureVerified=true` no PPO

PowerShell:

```powershell
$base = "http://localhost:3000"
$apiKey = "<TENANT_API_KEY>"
$agentId = "agent://agentic-stress-test-v1"
$taskId = "task_xxx"

Invoke-RestMethod -Method Get -Uri "$base/api/agents/$([uri]::EscapeDataString($agentId))/gate?taskId=$taskId&requireSignature=1" -Headers @{ 'x-api-key' = $apiKey } |
  ConvertTo-Json -Depth 10
```

### 5.5 Execução protegida (L11+)

Para testes automatizados, existe um endpoint mínimo que só retorna sucesso se passar pelo PPO Gate:

- `POST /api/agents/[agentId]/execute`

Body:

```json
{
  "taskId": "task_xxx",
  "taskType": "...",
  "requireSignature": true
}
```

---

## 6) Como o PPO é criado (pipeline técnico)

### 6.1 Entrada no checkout
`POST /api/checkout/create` aceita `proofMeta`:

```json
{
  "providerHint": "pix",
  "currency": "BRL",
  "lineItems": [ ... ],
  "proofMeta": {
    "agentId": "agent://agentic-stress-test-v1",
    "taskId": "task_xxx",
    "taskType": "payment_smoke",
    "taskInputHash": "sha256:...",
    "taskOutputHash": "sha256:...",
    "agentEd25519PublicKeyB64Url": "...",
    "agentEd25519SignatureB64Url": "..."
  }
}
```

Quando a assinatura Ed25519 é fornecida, o backend valida (L7+):
- gera um payload canônico (stable JSON)
- verifica `agentEd25519SignatureB64Url` com `agentEd25519PublicKeyB64Url`
- persiste no PPO:
  - `agentEd25519SignatureVerified`
  - `agentEd25519SignaturePayloadHashB64Url`

Payload assinado (formato):

```json
{
  "v": 1,
  "kind": "ppo_meta",
  "tenantId": "tenant_xxx",
  "agentId": "agent://...",
  "taskId": "task_xxx",
  "taskType": "...",
  "taskInputHash": "sha256:...",
  "taskOutputHash": "sha256:..."
}
```

### 6.2 Persistência no PaymentIntent
O `proofMeta` é salvo no `PaymentIntent`.

### 6.3 Transição para `paid`
Quando o webhook (ou admin fallback) atualiza o intent para `paid`, o backend chama:

- `ensurePaymentProofForIntent(intent)`

Isso cria/atualiza o PPO e persiste em `payment-proofs.json`.

---

## 6.4 Ledger root hash (`rootHashB64Url`)

O ledger calcula um hash determinístico do stream de PPOs do agente.

Propriedades:
- depende apenas dos PPOs do agente (e seus campos relevantes)
- é estável para o mesmo conjunto/ordem canônica
- muda se qualquer PPO relevante mudar (ex: adicionar PPO, mudar status, mudar assinatura)

Semântica (alto nível):
- ordena PPOs por `createdAt` e depois `id`
- calcula um hash-chain do tipo:
  - `prev = sha256("genesis")`
  - `prev = sha256(prev + "\n" + stableStringify(entry))` para cada PPO
  - retorna `prev` como `rootHashB64Url`

---

## 6.5 Enforcement (PPO-gated execution)

Até aqui, PPO + Gate permitem validar pagamento e autorização.

Para transformar isso em **condição prévia de execução** (não só auditoria), toda ação com efeito real deve passar por:

- `executeWithPPOGate()` (`apps/web/src/lib/ppo-gate.ts`)

Invariante:
- nenhuma execução paga deve rodar sem `executeWithPPOGate()`

Para testes automatizados (stress test), existe também:

- `POST /api/agents/[agentId]/execute`

Esse endpoint é um “executor mínimo” que **só retorna sucesso** se o PPO Gate permitir (por `taskId`/`taskType` e opcionalmente `requireSignature`).

Código (referência):
- `apps/web/src/lib/ppo-gate.ts` (check + enforcement)
- `apps/web/src/app/api/agents/[agentId]/execute/route.ts` (endpoint de execução mínima)

---

## 10) Status validado (local)

Em ambiente local (Next dev), o suite `agentic-stress-test.ts` está validado com:

- L1-L12: OK
- L3: SKIPPED quando `ASAAS_API_KEY` não está configurado

### L11/L12 (compliance tests)

- L11: tentativa de executar sem PPO -> deve falhar (403)
- L12: `taskId` errado -> falha; `taskId` correto -> sucesso

---

## 7) Replicar em outro projeto (checklist)

### 7.1 Mínimo viável
- Um modelo equivalente a `PaymentIntent`
- Um lugar para persistir (arquivo/DB) e índice por `(provider, providerPaymentId)`
- Um webhook seguro + idempotência
- Uma função `ensurePaymentProofForIntent()`
- Endpoints read-only:
  - `GET /api/agents/[agentId]/proofs`
  - `GET /api/agents/[agentId]/ledger`
  - `GET /api/payment-proofs/[id]`

### 7.2 Pontos que não podem variar
- Reconciliação do pagamento por `providerPaymentId` (nunca por `paymentId` vindo do body)
- Idempotência por evento (ex: `eventId` do provedor)
- PPO derivado apenas de status `paid`

### 7.3 Env vars (base)
- `PHOENIX_ZERO_TMP_DIR` (recomendado em produção)
- `PHOENIX_ZERO_ADMIN_TOKEN`

### 7.4 Env vars (providers)
Consulte `docs/MEIOS_DE_PAGAMENTO.md` para lista completa.

---

## 8) Troubleshooting

### 8.1 `/api/_debug/paths` dá 404
Use `/api/debug/paths` (sem underscore).

### 8.2 `Invoke-RestMethod` NullReference
Isso ocorre quando você passa header com valor `$null`.
Cheque:

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN
```

Se vier vazio, não envie header.

### 8.3 `Test-Path : Caracteres inválidos no caminho`
Você colocou `<>` no path (placeholder literal). Use o script que pega o path via `/api/debug/paths`.

---

## 9) Arquivos/código (referência)

- PPO:
  - `apps/web/src/lib/payment-proofs.ts`
  - `apps/web/src/app/api/agents/[agentId]/proofs/route.ts`
  - `apps/web/src/app/api/payment-proofs/[id]/route.ts`

- Ledger:
  - `apps/web/src/lib/agent-ledger.ts`
  - `apps/web/src/app/api/agents/[agentId]/ledger/route.ts`

- Debug paths (DEV):
  - `apps/web/src/app/api/debug/paths/route.ts`

- Checkout:
  - `apps/web/src/app/api/checkout/create/route.ts`

- Status:
  - `apps/web/src/app/api/checkout/status/route.ts`

- Stress test:
  - `agentic-stress-test.ts`
