# Phoenix Zero — Anchor Specification (Time Anchor)

## 1) Escopo
Este documento define o contrato e a arquitetura da **Âncora Externa (Time Anchor)**.

Objetivos:
- Provar uma declaração **assinada** que amarra um `contentCommit` a um intervalo de tempo.
- Oferecer experiência **consumer-first** via domínio (`/verify-anchor/...`).
- Oferecer trilha de auditoria via **log append-only** (auditoria independente).

Não é objetivo:
- Substituir verificação offline (watermark/temporal proofs).
- Integrar blockchain/IPFS neste MVP.

---

## 2) Respostas às 3 perguntas críticas (decisão)
### 2.1 Âncora por post (VOD) e janela (live), ou só live?
- **AMBOS**
  - `live`: janela curta (tipicamente `5–30s`)
  - `vod`: retenção longa baseada no `createdAt` (tipicamente `1–10 anos`)

### 2.2 Depender do domínio ou log público auditável?
- **HÍBRIDO**
  - Consumidor: link estável via domínio (ex.: `verify.phoenix-zero.com`)
  - Auditor: acesso ao log append-only (cadeia por `prevHash`/`entryHash`)

### 2.3 Gerar via painel web ou CLI/SDK?
- **AMBOS**
  - Web Panel: criação simples (1 clique)
  - CLI/SDK: automação para pipelines

---

## 3) Artefatos e pontos de entrada
- Core (manager):
  - `apps/web/src/lib/time-anchors.ts`
  - `apps/web/src/lib/time-anchor-manager.ts`
- Perfis:
  - `apps/web/src/lib/anchor-profiles.ts`
- API:
  - `POST /api/time-anchor`
  - `GET /api/public-anchor/[id]`
  - `GET /api/time-anchor-log`
  - `GET /api/anchor-profiles`
  - `POST /api/suggest-profile`
- UI:
  - Consumer verify: `/verify-anchor/[id]`
  - Creator panel: `/creator/panel`
- SDK/CLI:
  - `scripts/phoenix-zero-anchor-sdk.ts`
  - `scripts/phoenix-zero-anchor-cli.ts`

---

## 4) Modelo de dados
### 4.1 Payload assinado (conceito)
Campos essenciais:
- `anchorId`
- `createdAt`
- `expiresAt`
- `kind`: `live` | `vod`
- `contentCommit`:
  - `alg: sha256_b64url_v1`
  - `value: string` (base64url)
- Identidade (opcional no payload, mas parte do produto):
  - `creatorId?: string`
  - `clientId?: string`
  - `anchorProfileId?: string`

### 4.2 Verificação (conceito)
- `window`: `valid` | `expired`
- `signature.ok`: integridade/identidade do payload
- `coincidence`: `contentCommit` bate e está dentro da janela
- `confidence`: escore simples (ex.: 1 quando `coincidence=true`)

---

## 5) TTL e políticas
- `live`:
  - alvo de produto: `5–30s`
  - limite máximo: `24h`
- `vod`:
  - alvo de produto: `1–10 anos`
  - limite máximo: `10 anos`

Perfis (`anchorProfileId`) definem defaults e clamps.

---

## 6) Log append-only (auditoria)
### 6.1 Objetivo
Permitir auditoria independente sem depender do banco/servidor (além de servir o log).

### 6.2 Formato atual (MVP)
Arquivo `tmp/time-anchors.transparency.jsonl` com linhas JSON.
Campos principais do entry:
- `v`
- `anchorId`, `createdAt`, `expiresAt`, `kind`, `contentCommit`, `hybridId`
- `prevHash`
- `entryHash` = `sha256(prevHash + canonical(entrySemHashes))`

### 6.3 Endpoint
- `GET /api/time-anchor-log?limit=N`

---

## 7) Operação
- Chaves:
  - ed25519: `keys/phoenix-zero-ed25519.json`
  - strict/PQC: `keys/phoenix-zero-sphincs.json`
- Base pública:
  - `PHOENIX_ZERO_PUBLIC_BASE_URL` para gerar links de verificação com domínio público

---

## 8) Testes
- Smoke test:
  - `scripts/time-anchor-smoke-test.ps1`
- CLI manual:
  - `tsx ./scripts/phoenix-zero-anchor-cli.ts help`
