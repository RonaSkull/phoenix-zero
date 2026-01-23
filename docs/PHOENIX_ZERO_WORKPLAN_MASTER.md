# Phoenix Zero — Workplan Mestre (Macro + Micro)

## 0) Objetivo deste documento
Consolidar **todas as tarefas** (macro e micro) para:
- **Fechar a Fase 1** com evidências e reprodutibilidade.
- Executar validações **YouTube** e **WhatsApp** (adiadas) no momento certo.
- Iniciar a **Fase 2** com produto “Anchor Profiles” (comercial + compliance + operação) sem esquecer nenhum item.

Este documento é o “mapa operacional” para amanhã.

---

## 1) Estado atual (o que já está pronto)
### 1.1 Docs existentes (fonte de verdade)
- `docs/PHOENIX_ZERO_STRATEGY_FINAL.md`
- `docs/PHOENIX_ZERO_PHASE1_CHECKLIST.md`
- `docs/PHOENIX_ZERO_ANCHOR_HANDOFF.md`
- `docs/PHOENIX_ZERO_TIME_ANCHOR_TECHNICAL.md`

### 1.2 Time Anchor (MVP) já funciona
- Criar/verificar: `POST /api/time-anchor`, `GET /api/time-anchor`, `GET /api/public-anchor/[id]`
- Página pública: `/verify-anchor/[id]?contentCommit=...`
- Smoke test: `scripts/time-anchor-smoke-test.ps1`

### 1.3 Defaults comerciais aplicados (backend)
- **Live default TTL**: 120s
- **VOD default TTL**: 365 dias
- Limites:
  - live: até 24h
  - vod: até 10 anos

---

## 2) Fase 1 — Fechamento (macro)
### 2.1 Evidências e checklist (macro)
- Garantir que tudo que foi validado tenha:
  - path do arquivo
  - comando executado
  - report salvo
  - evidência visual (se aplicável)
  - status no `PHOENIX_ZERO_PHASE1_CHECKLIST.md`

### 2.2 Reprodutibilidade (macro)
- Todo item “PASS” precisa ter:
  - script/command repetível
  - saída esperada documentada

---

## 3) Fase 1 — Micro tarefas (Âncora Externa)
### 3.1 Smoke test (micro)
- Pré-requisito: `npm run dev:web`
- Rodar:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\time-anchor-smoke-test.ps1 -ContentCommit "SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ" -Kind live -Mode compat -TtlSeconds 30`
- Confirmar:
  - NOW: `valid` + `verified_ok True` + `coincidence True` + `confidence 1`
  - LATER: `expired` + `verified_ok False` + `coincidence False` + `confidence 0`

### 3.2 Documentação explicativa (micro)
- Confirmar que as explicações de campos/FAQ estão no:
  - `docs/PHOENIX_ZERO_TIME_ANCHOR_TECHNICAL.md`
- Confirmar que handoff aponta para o doc técnico:
  - `docs/PHOENIX_ZERO_ANCHOR_HANDOFF.md`

### 3.3 Organização (micro)
- Verificar se `docs/TREE_FULL.md` lista os 4 docs acima.

---

## 4) YouTube (adiado) — Plano operacional (macro + micro)
### 4.1 Macro
Validar live real com captura do viewer **simultânea** (não VOD).

### 4.2 Micro
- **Preparação**:
  - criar pastas se faltarem:
    - `platform-tests/live/downloads/youtube/`
    - `platform-tests/live/reports/youtube/`
    - `platform-tests/live/proofs/youtube/`
- **Execução**:
  - capturar o viewer em tempo real e salvar:
    - `platform-tests/live/downloads/youtube/live-capture.mp4`
- **Verificação offline**:
  - rodar `npm run verify:wm` com proof correto
  - salvar JSON:
    - `platform-tests/live/reports/youtube/verify-result.json`
- **Evidência visual**:
  - screenshot do viewer:
    - `platform-tests/live/proofs/youtube/viewer.png`
- **Checklist**:
  - atualizar `docs/PHOENIX_ZERO_PHASE1_CHECKLIST.md`.

---

## 5) WhatsApp (adiado/bloqueado) — Plano operacional (macro + micro)
### 5.1 Macro
Validar “live-like” via chamada com captura do receptor.

### 5.2 Micro
- Bloqueio atual: sem 2 contas/dispositivos.
- Quando liberar:
  - criar pastas se faltarem:
    - `platform-tests/live/downloads/whatsapp/`
    - `platform-tests/live/reports/whatsapp/`
    - `platform-tests/live/proofs/whatsapp/`
  - capturar receptor:
    - `platform-tests/live/downloads/whatsapp/live-capture.mp4`
  - rodar verify offline e salvar:
    - `platform-tests/live/reports/whatsapp/verify-result.json`
  - screenshot do receptor:
    - `platform-tests/live/proofs/whatsapp/viewer.png`
  - atualizar checklist.

---

## 6) Fase 2 — Anchor Profiles (produto/comercial/compliance)
### 6.1 Macro (o que entregar)
Construir um sistema de **perfis de âncora** (por cliente/caso de uso) que configure:
- TTL
- janelas/refresh/grace (quando existir)
- política de confiança
- política de algoritmo/assinatura (quando existir)
- retenção/observabilidade

### 6.2 Micro — Especificação (documentos)
Criar docs (não código) para padronizar:
- **Questionário comercial** (onboarding): perguntas e saída `anchorProfileId`.
- **Matriz risco x config** (compliance-ready).
- **Glossário** de termos (TTL, grace, refresh, coincidence, confidence).

### 6.3 Micro — Implementação (código)
**A)** Biblioteca de perfis
- Criar `apps/web/src/lib/anchor-profiles.ts`:
  - `type AnchorProfileId = ...`
  - `ANCHOR_PROFILES: Record<AnchorProfileId, {...}>`
  - `getAnchorProfile(profileId)`

**B)** API sugeridora
- Criar `apps/web/src/app/api/suggest-profile/route.ts`:
  - recebe respostas do questionário
  - devolve `suggestedProfileId` + config

**C)** Integração na criação da âncora
- Estender `POST /api/time-anchor` para aceitar:
  - `clientId?`
  - `profile?` (anchorProfileId)
  - e aplicar config (ttlSeconds etc.)

**D)** Demo interna para vendas
- Criar página estática em `public/`:
  - `public/demo-anchor-selector.html`
  - sem dependências
  - mostra perfil sugerido + TTL + mensagem de UX

**E)** PDF comercial
- Script para gerar PDF via HTML (Puppeteer) (opcional)
  - `scripts/generate-anchor-profiles-pdf.mjs`
  - output: `public/docs/dq-anchor-profiles-commercial.pdf`

### 6.4 Micro — Operação/Observabilidade
- Definir log/telemetria por `clientId` e `profile`.
- Definir política de retenção e export.

---

## 7) Ordem recomendada para amanhã
1) Executar YouTube live viewer capture e registrar evidências.
2) Resolver WhatsApp (se desbloquear) ou registrar como “bloqueado”.
3) Fechar checklist Phase 1 com 100% evidência.
4) Começar Fase 2 com docs de perfis (questionário + matriz) antes de codar.

---

## 8) Definition of Done
### Phase 1
- `docs/PHOENIX_ZERO_PHASE1_CHECKLIST.md` completo com evidências reais.
- Scripts reprodutíveis.

### Phase 2
- Perfis implementados (lib + API suggestion + integração no create).
- Artefatos comerciais (demo/página ou PDF).
