# Phoenix Zero — STATUS

Este documento descreve o estado **real** do repositório `redessociaisvideo3s` (o que está implementado e testado) e o que ainda é próximo passo.

## Implementado (código no repo)

### Watermark invisível (vídeo)
- **Embed/Extract (Node-only)**: `libs/phoenix-zero/src/node/watermark.ts`
- Estratégia atual:
  - modulação de luminância em ROIs
  - multi-ROI + `repeatPerBit`
  - extração com busca de `startFrame` + auto threshold/polaridade (quando `expectedPayload` está disponível)

### Assinatura híbrida (pós-quântico)
- **Ed25519 + SPHINCS+ (Node-only)**
- **Modos**:
  - `strict`: exige ambos
  - `compat`: aceita fallback

### Fingerprint temporal robusta a recompressão
- `signalstats_yavg_v1` (Node/ffmpeg)
- Comparação por MAD (mean absolute difference) com `madThreshold` no proof

### Ferramentas CLI
- `npm run make:testvideo` — gera mp4 curto de teste
- `npm run keygen` — gera chaves Ed25519 (`keys/phoenix-zero-ed25519.json`)
- `npm run pq:keygen` — gera chaves SPHINCS+ (`keys/phoenix-zero-sphincs.json`)
- `npm run stamp:wm` — gera vídeo watermarked + proof JSON
- `npm run verify:wm` — verifica assinatura + watermark + temporal

### Backend (Next.js)
- UI web para stamp/verify watermarked: `apps/web/src/app/page.tsx`
- API stamp watermarked: `apps/web/src/app/api/phoenix-zero/stamp-watermarked/route.ts` (retorna ZIP)
- API verify watermarked: `apps/web/src/app/api/phoenix-zero/verify-watermarked/route.ts` (retorna JSON)

### Harness de testes reais por plataforma
- `scripts/test-all-platforms.ps1`
- Fluxo:
  1) gera `platform-tests/output/watermarked.mp4` e `platform-tests/proofs/original.proof.json`
  2) você faz upload manual nas redes
  3) salva o vídeo baixado em `platform-tests/downloads/<plataforma>/...`
  4) roda de novo e o script verifica os downloads

## Baseline validado (V2 Watermarked) — 2026-01-10

Resultado do harness (modo `strict`):

- **WhatsApp**: watermark OK (`bestBitErrors: 0`, `bestStartFrame: 4`), assinatura OK (Ed25519 + PQ)
- **TikTok**: watermark OK (`bestBitErrors: 0`, `bestStartFrame: 4`), assinatura OK (Ed25519 + PQ)
- **Instagram**: watermark OK (`bestBitErrors: 0`, `bestStartFrame: 4`), assinatura OK (Ed25519 + PQ)
- **YouTube**: watermark OK (`bestBitErrors: 0`, `bestStartFrame: 4`), assinatura OK (Ed25519 + PQ)
- **LinkedIn**: pendente (ainda sem `platform-tests/downloads/linkedin/video.mp4`)

Observação: o `temporal.hashB64Url` pode mudar após re-encode (o que é esperado). A checagem é por MAD (`temporal.ok`) com `madThreshold` no proof.

## Testes reais já verificados
- WhatsApp: OK
- TikTok: OK
- Instagram: OK (pode exigir `watermarkVerify` com `yThreshold` baixo dependendo do download/re-encode)
- YouTube: OK
- LinkedIn: pendente (aguardando download do vídeo re-encoded)

## Presets
- Seleção automática por duração + override por plataforma: `libs/phoenix-zero/src/node/presets.ts`
- `stamp:wm` e backend já escolhem preset automaticamente

## Observações importantes
- Não existe garantia de “100% em todas as redes”: pipelines mudam e podem degradar watermark/fingerprint.
- O sistema é **offline-first**: a verificação pode rodar localmente via scripts.

## Pricing (Phoenix Zero) — Buckets e simulação

### Implementado
- Engine de pricing com buckets por conteúdo:
  - `durationSeconds` (vídeo/live)
  - `sizeBytes` (imagem/documento)
  - `pages` (documento)
- Dimensão extra de pricing:
  - `guaranteeWindow` (string livre; default `unknown`)
- Endpoints atualizados para aceitar esses campos e aplicar buckets:
  - `POST /api/pricing/preview`
  - `POST /api/pricing/simulate` (admin)
  - `POST /api/pricing/quote`
- UI atualizada:
  - `/pricing-admin` (simulador: durationSeconds/sizeBytes/pages)
  - `/pricing/protect` (fluxo público: inputs opcionais durationSeconds/sizeBytes/pages)
  - `/pricing-lab` (debug: product/units/durationSeconds/sizeBytes/pages)

### Pendente
- Estrutura de pricebook escalável com versionamento/auditoria (base + multiplicadores) para centenas de variações.
- Normalizar/taxonomizar valores de `guaranteeWindow` e definir multiplicadores padrão por janela.

## Billing — PIL + Invoice Preview + Snapshots

### Implementado
- PIL (Physical Inference Load) como métrica:
  - Estimativa via `estimatePilUnits`.
  - Registro em `usage-ledger` (fallback agora considera `durationSeconds` do contextSnapshot).
- Invoice preview (tenant, read-only):
  - `GET /api/billing/invoice-preview` agrega ledger por período.
- Invoice Snapshot `LOCKED` (persistido em tmp):
  - `POST /api/admin/billing/close-period` gera e retorna snapshot.
  - Fechamento é idempotente por `tenantId + from/to` (evita snapshots duplicados).
  - `GET /api/admin/billing/snapshots` e `GET /api/admin/billing/snapshots/[id]`.
  - Tenant read-only: `GET /api/billing/snapshots` e `GET /api/billing/snapshots/[id]`.
- Billing account status (state machine mínima, persistida em tmp):
  - Status: `pending/paid/failed/grace/suspended`.
  - Tenant read-only: `GET /api/billing/account`.
  - Admin: `GET/POST /api/admin/billing/accounts` e `GET /api/admin/billing/accounts/[tenantId]`.

### Pagamentos (Agentic Payments) — integração mínima
- `PaymentIntent` + `POST /api/checkout/create` + `GET /api/checkout/status`: implementado.
- Webhooks com reconciliação por `providerPaymentId` + hardening mínimo (token/IPN + idempotência): implementado.
- Quando `PaymentIntent.status=paid`: transiciona `BillingAccount.status=paid` e registra evento `payment_received` no `usage-ledger`: implementado.
- Guardrails de produto (endpoints de valor exigem `BillingAccount` ativo e retornam `402 Payment required` quando bloqueado): implementado.
- Pricing/amount:
  - `lineItems.operation` aceita aliases (ex.: `video_protection`) e é normalizado para operações canônicas (`protect_video`, etc.).
  - Em `ASAAS_ENV=sandbox`, o valor do PIX segue mínimo de `500` centavos e o `amountCents` do `PaymentIntent` fica consistente com o cobrado.

### PPO + Agent Ledger + Gate (agentic)

- PPO (Payment Proof Object): derivado de pagamentos `paid`, persistido em `payment-proofs.json`: implementado.
- Verificação de identidade (Ed25519) para `proofMeta` (L7+): implementado.
- Agent Ledger read-only com hash determinístico `rootHashB64Url`: implementado.
- PPO Gate (`GET /api/agents/[agentId]/gate`): implementado.
- Enforcement no ponto de execução (server-side): `executeWithPPOGate()` (`apps/web/src/lib/ppo-gate.ts`) + endpoint mínimo `POST /api/agents/[agentId]/execute`: implementado.

PPO público (link compartilhável):
- Página pública da prova: `/verify/<proofId>`: implementado.
- Lista pública: `/provas` (últimas `paid_confirmed`): implementado.

Settlement (liquidação/reversão):
- `GET /api/agents/[agentId]/settlements`: implementado.
- `POST /api/admin/settlement/advance`: implementado.
- `POST /api/admin/settlement/revert`: implementado.

Validação:
- `agentic-stress-test.ts`: L1-L22 OK (L3 depende de `ASAAS_API_KEY` para criar PaymentIntent PIX via Asaas).

Notas de operação:
- Se o backend estiver com `ASAAS_WEBHOOK_SECRET` setado, o stress test também precisa ter `ASAAS_WEBHOOK_SECRET` (para enviar o header `asaas-access-token`). Caso contrário, testes PIX ficam `SKIPPED` por `401`.
- Documentação step-by-step: `docs/AGENTIC_STRESS_TEST_RUNBOOK.md`.

Documentos de auditoria/overview:
- Threat model: `docs/THREAT_MODEL.md`
- Fluxo de arquitetura: `docs/ARCHITECTURE_FLOW.md`
- Invariantes: `docs/INVARIANTS.md`
- Glossário: `docs/GLOSSARY.md`
- Checklist de segurança: `docs/SECURITY_CHECKLIST.md`
- Template de case real: `docs/CASE_REAL_PHOENIX_ZERO.md`

Nota de segurança:
- Se secrets foram expostos em texto (admin token, Asaas key/secret), revogue/rotacione e substitua por novos. Não armazene secrets em docs.

### Pendente
- “Locking” de períodos com regras (idempotência por janela, evitar snapshots duplicados).
- Domínio + hospedagem para registrar webhooks reais em produção.
- Stripe (pagamento real) + validação de assinatura do webhook.

### Próximo passo (agentic payments)

- Habilitar modo real do Asaas (quando `ASAAS_API_KEY` estiver disponível) e rodar o stress test em `AGENTIC_STRESS_REAL=1`.
- Persistência/produção:
  - configurar `DATABASE_URL` (ex.: Neon Postgres) para persistência em DB (`phoenix_zero_kv`), com fallback JSON via `PHOENIX_ZERO_TMP_DIR`.
  - adicionar observabilidade (logs/alerts) para falhas de webhook, dedupe e assinatura inválida.
- Notificação WhatsApp (Twilio): configurar credenciais e validar envio 1x após `paid_confirmed`.

## QA / Anti-bypass

### Implementado
- Spec Playwright: `e2e/pricing-anti-bypass.spec.ts`
  - Preview público exige `sessionId`.
  - Preview público bloqueia OBSERVING e libera CLASSIFIED.
  - `/pricing/protect` sem sessionId redireciona para `/pricing/observe`.
  - HYBRID força `authenticityLevel=forensic`.

### Observações
- Os testes “public tenant” dependem do tenant público estar configurado corretamente (`PHOENIX_ZERO_PUBLIC_API_KEY` deve apontar para um tenant existente).
