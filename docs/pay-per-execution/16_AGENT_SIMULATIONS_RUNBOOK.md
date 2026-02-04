# PPE — Agent Simulations Runbook (phoenix-zero-agent-simulations)

Este documento descreve **como a suite `phoenix-zero-agent-simulations/` funciona**, quais cenários (personas) existem, **quais comandos rodamos**, quais variáveis de ambiente são usadas, onde ficam os artifacts e como interpretar os resultados.

> Importante: este harness é **externo ao backend** (roda na sua máquina) e testa o Phoenix Zero PPE como um agente real testaria (somente via HTTP).

---

## 1) Onde fica

Pasta:

- `phoenix-zero-agent-simulations/`

Entrypoints:

- Suite completa: `src/run-all.ts`
- Execução isolada (1 persona): `src/run-one.ts`

Artifacts:

- `phoenix-zero-agent-simulations/out/<suiteRunId>/`

---

## 2) O que a suite testa (hoje)

A suite atual executa 5 personas:

- `automation_engineer`
  - Discovery
  - Pricing
  - Compatibility
  - Signup (`POST /api/public/agent-signup`)
  - Checkout (`POST /api/checkout/create`)
  - PPO enforcement: pre-payment `gate` / `execute` devem bloquear
  - Payment confirm via webhook simulado (PIX)
  - Execute pós pagamento (deve permitir)
  - Proofs + verify (`/api/guarantee-proofs/{id}` e `/verify/{id}`)
  - Opcional: refund/chargeback simulado e checagem de revogação

- `agent_founder`
  - Foco: monetização + tentativas de bypass/fraude

- `compliance_buyer`
  - Foco: auditabilidade + verificabilidade (proofs)

- `naive_agent`
  - Foco: inputs levemente incorretos / compatibilidade

- `hostile_agent`
  - Foco: inputs inválidos / tentativas de execução sem auth

---

## 3) O que é considerado PASS/FAIL

Cada persona emite eventos em estágios (`DISCOVERY`, `ONBOARDING`, `PURCHASE`, `PAYMENT_CONFIRMED`, `EXECUTION`, `VERIFICATION`, `REFUND`, `DONE`).

A persona é marcada como:

- **PASS**: todos os asserts relevantes deram `ok: true`.
- **FAIL**: algum assert crítico falhou (a lista fica em `blockers`).

Arquivos gerados por suite:

- `summary.json`: `totals` + `results` resumidos
- `summary.md`: versão markdown do resumo
- `agent-readiness-report.md`: “one pager” de readiness
- `<persona>.json`: log completo (eventos, blockers, hints)

---

## 4) Variáveis de ambiente

### 4.1 Base URL

- `PHOENIX_ZERO_BASE_URL`
  - Exemplo: `https://phoenix-zero-web.onrender.com`

### 4.2 Segredos (para automação full do paid flow)

- `ASAAS_WEBHOOK_SECRET`
  - Necessário para chamar `POST /api/webhooks/pix` no Render com `asaas-access-token`.

- `NOWPAYMENTS_IPN_SECRET`
  - Necessário para simular o webhook crypto em `POST /api/webhooks/nowpayments`.

### 4.3 Robustez / cold start

- `PHOENIX_ZERO_HTTP_TIMEOUT_MS` (ex.: `240000`)
- `PHOENIX_ZERO_HTTP_RETRIES` (ex.: `6`)
- `PHOENIX_ZERO_HTTP_RETRY_BACKOFF_MS` (ex.: `900`)

### 4.4 Signup rate limit (429)

- `PHOENIX_ZERO_SIGNUP_RETRIES` (ex.: `6`)
- `PHOENIX_ZERO_SIGNUP_BACKOFF_MS` (ex.: `4000`)

### 4.5 Gap entre cenários

- `PHOENIX_ZERO_SCENARIO_GAP_MS` (ex.: `6000`)

### 4.6 Modo manual (sem secrets)

- `PHOENIX_ZERO_WAIT_FOR_PAYMENT_MS`
  - Se > 0, as personas que compram podem entrar em “wait/poll” no `/api/checkout/status` aguardando pagamento manual.

### 4.7 Flags por persona

- `PHOENIX_ZERO_PERSONA` (para `sim:one`)
- `PHOENIX_ZERO_SIMULATE_REFUND` (para `automation_engineer` no `sim:one`)

---

## 5) Comandos (Windows / PowerShell)

### 5.1 Rodar suite completa

Rodar **dentro** de `phoenix-zero-agent-simulations/`:

```powershell
npm install

$env:PHOENIX_ZERO_BASE_URL='https://phoenix-zero-web.onrender.com'
$env:PHOENIX_ZERO_HTTP_TIMEOUT_MS='240000'
$env:PHOENIX_ZERO_HTTP_RETRIES='6'
$env:PHOENIX_ZERO_HTTP_RETRY_BACKOFF_MS='900'
$env:PHOENIX_ZERO_SIGNUP_RETRIES='6'
$env:PHOENIX_ZERO_SIGNUP_BACKOFF_MS='4000'
$env:PHOENIX_ZERO_SCENARIO_GAP_MS='6000'

# opcionais (para automação total)
# $env:ASAAS_WEBHOOK_SECRET='...'
# $env:NOWPAYMENTS_IPN_SECRET='...'

npm run sim
```

### 5.2 Rodar UMA persona isolada

```powershell
$env:PHOENIX_ZERO_BASE_URL='https://phoenix-zero-web.onrender.com'
$env:PHOENIX_ZERO_PERSONA='automation_engineer'

# default: refund ligado para automation_engineer
# (opcional) desligar refund:
# $env:PHOENIX_ZERO_SIMULATE_REFUND='0'

npm run sim:one
```

Personas válidas:

- `automation_engineer`
- `agent_founder`
- `compliance_buyer`
- `naive_agent`
- `hostile_agent`

### 5.3 Carregar secrets do `.env.local` sem colar no terminal

Se seu `.env.local` fica na raiz do repo:

```powershell
Get-Content ..\.env.local | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $p = $_ -split '=', 2
  if ($p.Count -eq 2) { Set-Item -Path ("Env:" + $p[0].Trim()) -Value ($p[1].Trim().Trim('"')) }
}

npm run sim
```

---

## 6) Interferência entre testes e recomendação de branches

Para evitar que mudanças de um teste afetem outro:

- **Recomendação**: criar branches por suíte/objetivo.

Exemplos:

- `tests/sim-suite-stable`
  - somente fixes de robustez (timeouts/retries), logging, documentação.

- `tests/hardening-webhook-ordering`
  - testes específicos para webhooks fora de ordem / idempotência.

- `tests/hardening-race`
  - testes de concorrência (gate/execute durante transições).

- `tests/hardening-adversarial`
  - ataques (replay, swap, reuse) desde que existam endpoints/sinais suficientes.

---

## 7) Hardening Suite (plano de testes sênior)

Os testes abaixo são a **lista de hardening** que devemos implementar/rodar para go-live com confiança.

> Nota: alguns testes podem exigir endpoints adicionais (ou ajustes de payload) para serem 100% automáticos. A recomendação é implementar gradualmente, 1 por branch.

### 7.1 Consistência de estado (Fonte de Verdade Única)

Objetivo:

- Após qualquer transição (paid/refund), `checkout/status`, `payment proof` e `gate` devem refletir o mesmo estado lógico.

### 7.2 Webhooks fora de ordem (out-of-order)

Objetivo:

- Sequências como: `failed -> paid -> failed` não podem resultar em `gate.allowed=true` após o último `failed`.

### 7.3 Race conditions

Objetivo:

- Chamadas concorrentes a `gate/execute` durante transição não podem liberar execução indevida.

### 7.4 Adversarial (replay/reuse/swap)

Objetivo:

- Tentar reutilizar proof fora do contexto correto deve falhar.

---

## 8) Observações de execução (output demorando)

É normal o `npm run sim` demorar 2–3 minutos sem imprimir o JSON final, por causa de:

- cold start do Render
- retries/backoff
- gaps entre cenários
- waits de pagamento (se `PHOENIX_ZERO_WAIT_FOR_PAYMENT_MS` > 0)

Para acompanhar, abra o artifact enquanto roda:

- `phoenix-zero-agent-simulations/out/<suiteRunId>/automation_engineer.json`

---

## 9) Estado atual conhecido

Executando contra Render sem redeploy do fix de revogação de PPO após refund, a suite tende a ficar em **4/5** com falha no `automation_engineer` na fase `REFUND`.

Após redeploy do fix no backend, o esperado é **5/5**.
