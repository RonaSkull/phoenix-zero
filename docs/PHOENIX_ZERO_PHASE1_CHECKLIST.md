# Phoenix Zero — Phase 1 Checklist (Evidências)

## 1) Objetivo
Consolidar evidências (paths + comandos + resultados) das validações reais por plataforma/mídia.

---

## 2) Convenções
- **Captura/Download recebido**: arquivo tal como veio da plataforma (ou captura do viewer).
- **Verificação offline**: executada localmente via CLI (`npm run verify:*`).
- **Nível de verificação**:
  - **Verified (Strong)**: assinatura OK + watermark OK
  - **Verified (Robust)**: assinatura OK + temporal OK
  - **Inconclusive** / **Not Verified** conforme definição do produto

---

## 3) Live — Twitch (viewer capture)
- **Plataforma**: Twitch
- **Modo**: Live (captura do viewer, simultâneo)
- **Arquivo capturado (recebido)**:
  - `platform-tests/live/downloads/twitch/live-capture.mp4`
- **Proof usado**:
  - `platform-tests/proofs/original.proof.json`
- **Comando executado**:
  - `npm run verify:wm -- --in "platform-tests/live/downloads/twitch/live-capture.mp4" --proof "platform-tests/proofs/original.proof.json" --platform twitch`
- **Report salvo**:
  - `platform-tests/live/reports/twitch/verify-result.json`
- **Resultado**:
  - `ok: true`
  - `signature.ok: true`
  - `temporal.ok: true` (mad `3.9167` <= threshold `12`)
  - `watermark.ok: false` (bestBitErrors `1`)
- **Classificação do produto**:
  - **Verified (Robust)**
- **Evidência visual (concluída)**:
  - `platform-tests/live/proofs/twitch/viewer.png`

---

## 4) Live — YouTube (viewer capture, simultâneo)
- **Status**: pendente (bloqueio/liberação da conta)
- **Quando liberar**:
  - Capturar o viewer em tempo real
  - Salvar em `platform-tests/live/downloads/youtube/live-capture.mp4`
  - Rodar `verify:wm` e salvar report em `platform-tests/live/reports/youtube/verify-result.json`

---

## 5) Live — WhatsApp (live-like via chamada)
- **Status**: bloqueado no momento (sem 2 contas/dispositivos distintos)
- **Quando executar**:
  - Fazer chamada com o receptor
  - Capturar a tela do receptor (output recebido)
  - Salvar em `platform-tests/live/downloads/whatsapp/live-capture.mp4`
  - Rodar `verify:wm` e salvar report em `platform-tests/live/reports/whatsapp/verify-result.json`

---

## 6) Produto — Âncora Externa (Time Anchor) — Smoke Test (VALID -> EXPIRED)
- **Status**: concluído
- **Dev server**:
  - `npm run dev:web` (localhost:3000)
- **Script**:
  - `scripts/time-anchor-smoke-test.ps1`
- **Comando**:
  - `powershell -ExecutionPolicy Bypass -File .\scripts\time-anchor-smoke-test.ps1 -ContentCommit "SjknOrJE_3ik533dfdwIn4BgZMunITq3Rap6mkPfCHQ" -Kind live -Mode compat -TtlSeconds 30`
- **Esperado (dentro do TTL)**:
  - `VERIFY_NOW_WINDOW: valid`
  - `VERIFY_NOW_VERIFIED_OK: True`
  - `VERIFY_NOW_COINCIDENCE: True`
  - `VERIFY_NOW_CONFIDENCE: 1`
- **Esperado (após TTL)**:
  - `VERIFY_LATER_WINDOW: expired`
  - `VERIFY_LATER_VERIFIED_OK: False`
  - `VERIFY_LATER_COINCIDENCE: False`
  - `VERIFY_LATER_CONFIDENCE: 0`

