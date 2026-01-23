# Phoenix Zero — Runbook: Validação em Modo Produção (localhost:3001)

Este documento descreve o processo completo para validar a plataforma Phoenix Zero em **modo produção** local, rodando em `http://localhost:3001`, incluindo:

- build de produção
- start do servidor em 3001
- como definir o `PHOENIX_ZERO_ADMIN_TOKEN`
- como rodar os testes (hardening + Playwright e2e) contra 3001
- como resolver erro de porta ocupada (`EADDRINUSE`)

> Ambiente esperado: **Windows + PowerShell**

---

## 1) Pré-requisitos

- Node.js e npm instalados
- Dependências instaladas (se necessário):

```powershell
npm run bootstrap
```

> Se você já roda `npm run dev:web` normalmente, provavelmente já está tudo instalado.

---

## 2) Build de produção

No root do repo (`D:\redessociaisvideo3s`):

```powershell
npm run build
```

Isso executa:

- `npm run build:core`
- `npm run build:web` (`next build`)

> Avisos de build (warnings) podem aparecer e ainda assim o build ser válido, desde que o exit code seja 0.

---

## 3) Definir o Admin Token (obrigatório para rotas /api/admin/*)

O `PHOENIX_ZERO_ADMIN_TOKEN` é um **segredo que você define** (não vem “pronto” no repo).

### 3.1 Gerar um token forte (recomendado)

No PowerShell:

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN = "pz_admin_" + [guid]::NewGuid().ToString("n")
$env:PHOENIX_ZERO_ADMIN_TOKEN
```

Guarde o valor exibido.

### 3.2 Regra crítica

- O token precisa estar setado no **terminal do servidor** (para o servidor aceitar admin requests)
- E também no **terminal do Playwright** (para testes e2e que provisionam tenants via `/api/admin/tenants`)

Se você gerar um token novo, você precisa **reiniciar** o servidor com esse novo token.

---

## 4) Start do servidor em modo produção na porta 3001

No terminal onde você vai rodar o servidor:

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN='COLE_O_TOKEN_AQUI'
npm run start:web -- -p 3001
```

Saída esperada (exemplo):

- `Local: http://localhost:3001`
- `Ready in ...`

---

## 5) Rodar Hardening Smoke Test contra 3001

Em outro terminal (ou no mesmo, se você estiver rodando o servidor em outro terminal):

```powershell
$env:PHOENIX_ZERO_ADMIN_TOKEN='COLE_O_TOKEN_AQUI'
powershell -ExecutionPolicy Bypass -File scripts/hardening-smoke-test.ps1 -Base http://localhost:3001
```

Saída esperada no final:

- `All checks passed (or are informational).`

---

## 6) Rodar Playwright E2E contra 3001 (sem webserver)

Em outro terminal:

```powershell
$env:PW_NO_WEBSERVER='1'
$env:PW_BASE_URL='http://localhost:3001'
$env:PHOENIX_ZERO_ADMIN_TOKEN='COLE_O_TOKEN_AQUI'
npm run test:e2e
```

### 6.1 Interpretação do resultado

- `4 passed, 1 skipped` é considerado **OK** neste repo quando o `skipped` for o teste de **social flows assisted** (manual/opcional).

---

## 7) Solução de problemas

### 7.1 Erro: `EADDRINUSE: address already in use :::3001`

Significa que já existe um processo escutando na porta 3001.

1) Descobrir PID:

```powershell
netstat -ano | findstr :3001
```

Você verá linhas com `LISTENING` e um PID no final.

2) Finalizar o processo:

```powershell
taskkill /PID <PID_AQUI> /F
```

3) Subir o servidor novamente:

```powershell
npm run start:web -- -p 3001
```

### 7.2 `social-preview` falha em `expect(res.ok()).toBeTruthy()`

Causa mais comum:

- `PHOENIX_ZERO_ADMIN_TOKEN` **não** está setado no terminal do Playwright
- ou o servidor está rodando com um token diferente do que o Playwright está usando

Solução:

- garanta que o servidor foi iniciado com `PHOENIX_ZERO_ADMIN_TOKEN=...`
- garanta que o Playwright está rodando com o **mesmo** `PHOENIX_ZERO_ADMIN_TOKEN`

### 7.3 Embed badge não aparece em páginas demo

Se embeds falharem em produção, verifique se os scripts públicos estão sendo carregados e executados.

Páginas relevantes:

- `/demo`
- `/image-demo`
- `/image-demo-wm`
- `/live-embed-demo`

Arquivos de embed (public):

- `apps/web/public/phoenix-zero-embed.js`
- `apps/web/public/phoenix-zero-image-embed.js`
- `apps/web/public/phoenix-zero-live-embed.js`

---

## 8) Checklist final (produção 3001)

- `npm run build` OK
- `npm run start:web -- -p 3001` OK
- `hardening-smoke-test.ps1 -Base http://localhost:3001` OK
- `PW_NO_WEBSERVER=1 PW_BASE_URL=http://localhost:3001 npm run test:e2e` OK

---
