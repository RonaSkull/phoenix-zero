# Phoenix Zero — Handoff (Âncora Externa + Twitch) — Estado Atual

## 1) Escopo deste documento
Este documento consolida **o que foi decidido**, **o que já foi implementado/testado** e **como reproduzir** a validação da **Âncora Externa (Time Anchor)** e a evidência de **Twitch viewer capture**.

Foco atual decidido:
- Manter foco **100% na Âncora Externa e integração/operacionalização**.
- **YouTube e WhatsApp** ficam **adiados para amanhã**.

---

## 2) Decisões (não mexer / não retrabalhar)
- `VERIFY_LATER_WINDOW: expired` e `VERIFY_LATER_VERIFIED_OK: False` **não é bug**.
  - É o comportamento correto quando o TTL expira.
- Twitch Live viewer capture: classificar como **Verified (Robust)**.
  - `ok: true` + `signature.ok: true` + `temporal.ok: true`.
  - `watermark.ok: false` com `bestBitErrors=1` **não é bloqueador** em cenário real.

---

## 3) Evidências salvas (paths)
### 3.1 Twitch — viewer screenshot
- Evidência visual:
  - `platform-tests/live/proofs/twitch/viewer.png`

### 3.2 Time Anchor — storage local
- Banco (dev):
  - `apps/web/tmp/time-anchors.json`
- Log de transparência (append-only):
  - `apps/web/tmp/time-anchors.transparency.jsonl`

---

## 4) Implementação — Âncora Externa (Time Anchor)
### 4.1 Core
- Arquivo:
  - `apps/web/src/lib/time-anchors.ts`
- Funções principais:
  - `createTimeAnchor()`
  - `getTimeAnchor()`
  - `verifyTimeAnchor()`

Documento técnico/FAQ:
- `docs/PHOENIX_ZERO_TIME_ANCHOR_TECHNICAL.md`

### 4.2 Endpoints
- Criar âncora:
  - `POST /api/time-anchor`
- Verificar internamente (debug):
  - `GET /api/time-anchor?anchorId=...&contentCommit=...`
- Verificar publicamente (CORS):
  - `GET /api/public-anchor/[id]?contentCommit=...`

### 4.3 UI pública
- Página de verificação:
  - `GET /verify-anchor/[id]?contentCommit=...`

---

## 5) Smoke test reprodutível (VALID -> EXPIRED)
### 5.1 Subir servidor
Em um terminal (raiz do repo):
```powershell
npm run dev:web
```

### 5.2 Rodar smoke test automático
Script:
- `scripts/time-anchor-smoke-test.ps1`

Comando recomendado:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\time-anchor-smoke-test.ps1 -ContentCommit "SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ" -Kind live -Mode compat -TtlSeconds 30
```

Notas:
- O script falha com uma mensagem clara se o servidor não estiver acessível em `localhost:3000`.
- Para evitar teste instável, usar `-TtlSeconds 10` ou maior.

### 5.3 Resultado esperado
Dentro do TTL (logo após criar):
- `VERIFY_NOW_WINDOW: valid`
- `VERIFY_NOW_VERIFIED_OK: True`
- `VERIFY_NOW_COINCIDENCE: True`
- `VERIFY_NOW_CONFIDENCE: 1`

Após o TTL passar:
- `VERIFY_LATER_WINDOW: expired`
- `VERIFY_LATER_VERIFIED_OK: False`
- `VERIFY_LATER_COINCIDENCE: False`
- `VERIFY_LATER_CONFIDENCE: 0`

---

## 6) O que falta fazer (prioridade do próximo assistente)
### 6.1 Documentação (Phase 1)
- `docs/PHOENIX_ZERO_PHASE1_CHECKLIST.md` já está atualizado:
  - Twitch viewer screenshot concluído (`viewer.png`).
  - Smoke test reprodutível da Âncora Externa documentado.

### 6.2 Itens adiados (não fazer agora)
- Live — YouTube (viewer capture simultâneo)
- Live — WhatsApp (bloqueado sem 2 contas/dispositivos)

---

## 7) Fase 2 — Próximos itens (Âncora Externa)
Objetivo: sair de MVP funcional para **produto robusto/hardened**.

- **[API/Contrato]** Congelar e versionar contrato público do record (`version`, schema estável) e mapear compatibilidade.
- **[Transparência]** Evoluir log append-only para prova de integridade (hash encadeado + checkpoint) e endpoint/export para auditor.
- **[Persistência]** Substituir/encapsular storage em arquivo por backend mais robusto (ex.: SQLite) e lidar com concorrência.
- **[Segurança]** Rate limiting e validação de inputs (anchorId/contentCommit/ttl) em todos os endpoints.
- **[Operação]** Limpeza/GC de registros expirados, métricas e logs (observabilidade).
- **[Produto]** Web Panel/CLI/SDK para geração de âncoras e integração com pipelines.
