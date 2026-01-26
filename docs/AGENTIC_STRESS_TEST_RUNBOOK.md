# Agentic Stress Test — Runbook (Phoenix Zero)

Este runbook descreve como rodar o `agentic-stress-test.ts` de forma reprodutível.

O objetivo é:
- Rodar o suite determinístico (L1–L22) localmente
- (Opcional) Rodar o L3 com Asaas real (usa `ASAAS_API_KEY`)
- Evitar os erros mais comuns (SKIPPED por `401`, env vars no processo errado)

---

## 0) Regras de segurança (leia antes)

- Não cole tokens completos em chat/issue/doc. Use placeholders.
- Se um secret vazou, revogue e gere outro (admin token, Asaas API key, webhook secret).
- Nunca commite `.env.local` / `.env` com secrets.

---

## 1) Pré-requisitos

- Node.js + npm
- Dependências instaladas:

```powershell
npm install
```

- O repo já usa `tsx` (via `devDependencies`).

Arquivo de exemplo (Windows/PowerShell):
- `docs/AGENTIC_STRESS_ENV.example.ps1`

Você pode copiar para um arquivo local (não versionado) e dar dot-source:

```powershell
. .\docs\AGENTIC_STRESS_ENV.example.ps1
```

---

## 2) O que roda em qual processo (importante)

Você vai rodar em dois processos separados:

- **Processo A (backend)**: `npm run dev:web`
  - O Next.js lê env vars do próprio processo (e de `apps/web/.env.local`, se existir).

- **Processo B (stress test)**: `tsx ./agentic-stress-test.ts`
  - O script lê env vars do próprio processo.

Se o backend exige `ASAAS_WEBHOOK_SECRET`, o stress test também precisa dessa env var para enviar o header correto.

---

## 3) Modo A — Determinístico (L1–L22)

Este é o modo padrão (não setar `AGENTIC_STRESS_REAL`).

### 3.1 Subir o backend (Processo A)

Em um terminal:

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN="REPLACE_ME"

# Opcional, mas recomendado: se setar aqui, o webhook PIX exige token.
$env:ASAAS_WEBHOOK_SECRET="REPLACE_ME"

npm run dev:web
```

Observação:
- Se você mudar env vars, reinicie o `npm run dev:web`.

### 3.2 Rodar o stress test (Processo B)

Em outro terminal (repo root):

```powershell
$env:PHOENIX_ZERO_BASE_URL="http://localhost:3000"
$env:PHOENIX_ZERO_ADMIN_TOKEN="REPLACE_ME"

# Se o backend estiver com ASAAS_WEBHOOK_SECRET setado, setar aqui também.
$env:ASAAS_WEBHOOK_SECRET="REPLACE_ME"

npx tsx .\agentic-stress-test.ts
```

Esperado:
- `All tests completed.`
- L3 pode ficar `SKIPPED` se `ASAAS_API_KEY` não estiver setado.

---

## 4) Modo B — L3 com Asaas real (PIX replay/idempotência)

O L3 valida dois pontos:
- **forgery**: webhook com token inválido deve retornar `401`
- **replay/idempotência**: reprocessar o mesmo evento não duplica efeitos

### 4.1 Subir o backend com secrets (Processo A)

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN="REPLACE_ME"
$env:ASAAS_WEBHOOK_SECRET="REPLACE_ME"
$env:ASAAS_API_KEY="REPLACE_ME"

npm run dev:web
```

### 4.2 Rodar stress test com `ASAAS_API_KEY` (Processo B)

```powershell
$env:PHOENIX_ZERO_BASE_URL="http://localhost:3000"
$env:PHOENIX_ZERO_ADMIN_TOKEN="REPLACE_ME"
$env:ASAAS_WEBHOOK_SECRET="REPLACE_ME"
$env:ASAAS_API_KEY="REPLACE_ME"

npx tsx .\agentic-stress-test.ts
```

Esperado:
- L3: `OK`

Env vars relacionadas ao modo real:
- `AGENTIC_STRESS_REAL=1`
- `AGENTIC_STRESS_REAL_PROVIDER=pix|crypto`
- `AGENTIC_STRESS_WAIT_SECONDS=900` (timeout de espera em modo real)

---

## 5) Troubleshooting

### 5.1 Muitos `SKIPPED — pix webhook got 401`

Causa:
- Backend está com `ASAAS_WEBHOOK_SECRET` setado, mas o stress test não setou `ASAAS_WEBHOOK_SECRET`.

Correção:
- Setar `ASAAS_WEBHOOK_SECRET` no terminal do stress test e rodar novamente.

### 5.2 L3: `expected 401 for forged token, got 200`

Causa:
- Backend foi iniciado sem `ASAAS_WEBHOOK_SECRET` (em dev isso deixa o webhook “aberto”).

Correção:
- Reiniciar o `npm run dev:web` com `ASAAS_WEBHOOK_SECRET`.

### 5.3 L3: `SKIPPED — ASAAS_API_KEY not set`

Causa:
- O stress test não tem `ASAAS_API_KEY`.

Correção:
- Setar `ASAAS_API_KEY` no terminal do stress test.

---

## 6) Scripts npm (atalhos)

O repo expõe:

- `npm run test:agentic`
- `npm run test:agentic:real` (Windows/PowerShell, `AGENTIC_STRESS_REAL=1` + provider `pix`)
- `npm run test:agentic:real:pix`
- `npm run test:agentic:real:crypto`

Modo end-to-end (Windows): sobe `dev:web`, espera o server responder e roda o stress test.

- `npm run test:agentic:e2e`
- `npm run test:agentic:e2e:real:pix`
- `npm run test:agentic:e2e:real:crypto`

Eles ainda dependem das env vars acima.
