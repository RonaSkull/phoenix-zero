# Phoenix Zero — BACKLOG (auditoria do repo)

Este documento compara o que foi **prometido/planejado** (listas longas) com o que está **realmente presente no repositório** `redessociaisvideo3s`.

## Estrutura real do repo (alto nível)

- `libs/phoenix-zero/`
  - core criptográfico (Ed25519)
  - módulos Node (`/src/node/*`) com watermark, temporal fingerprint e assinatura híbrida (Ed25519 + SPHINCS+)
- `apps/web/`
  - Next.js (UI + APIs `/api/phoenix-zero/*`)
- `apps/mobile/`
  - Expo/React Native (não auditado a fundo neste backlog)
- `scripts/`
  - CLI e harness de testes por plataforma
- `docs/`
  - status/presets/roadmap

## ✅ Implementado e verificado (existe no repo)

- Watermark invisível (vídeo)
  - `libs/phoenix-zero/src/node/watermark.ts`
- Fingerprint temporal robusta (re-encode)
  - `libs/phoenix-zero/src/node/temporal.ts`
- Assinatura híbrida (Ed25519 + SPHINCS+)
  - `libs/phoenix-zero/src/node/hybrid.ts`
  - `libs/phoenix-zero/src/node/pq-sphincs.ts`
- Presets (por duração + override por plataforma)
  - `libs/phoenix-zero/src/node/presets.ts`
- CLI offline-first
  - `scripts/phoenix-zero-stamp-watermarked.ts`
  - `scripts/phoenix-zero-verify-watermarked.ts`
- Next.js API + UI (offline/local)
  - `apps/web/src/app/api/phoenix-zero/stamp-watermarked/route.ts`
  - `apps/web/src/app/api/phoenix-zero/verify-watermarked/route.ts`
  - `apps/web/src/app/page.tsx`
- Harness de testes reais por plataforma (manual upload/download)
  - `scripts/test-all-platforms.ps1`

## ⚠️ Implementado parcialmente / precisa calibrar

- Presets mais granulares por duração (7–10, 11–15, etc.)
  - Hoje existe bucketização simples:
    - `3–6s`, `7–15s`, `16–35s`, `36–90s`
  - O refinamento fino ainda não foi implementado.

## ❌ Não existe no repo ainda (citados, mas não implementados)

A lista abaixo foi citada, porém **não há pastas/arquivos correspondentes** no repo neste momento:

- Integrações automáticas com plataformas
  - `libs/platform-bridge/*`
  - `integrations/*`
  - API `apps/web/src/app/api/platform-integration/route.ts`
- SDK para desenvolvedores
  - `sdk/*`
  - docs do SDK `docs/sdk-documentation.md`
- Sistema “auto” (detector/processor/prover/checker/batch)
  - `auto/*`
  - API `apps/web/src/app/api/auto/route.ts`
- Watermark/fingerprint para **imagem**
- Watermark para **áudio**
- ECC explícito (reed-solomon/hamming)
  - `libs/phoenix-zero/src/node/ecc.ts`
- ROI adaptativo por plataforma
  - `libs/phoenix-zero/src/node/roi.ts`
- Multi-canal (RGB/YUV)
  - `libs/phoenix-zero/src/node/multichannel.ts`
- Dashboard
  - `apps/web/src/app/dashboard/page.tsx`
- Monitoramento / analytics
  - `auto/monitoring/*`
- Segurança / controle de acesso
  - `auto/security/*`

## Próximas entregas sugeridas (ordem prática)

1. Corrigir `EPERM` no Windows (Next `.next/trace`) e estabilizar `dev/build`
2. Refinar presets por duração (quebrar `7–15` e `16–35` em subfaixas)
3. Criar um script de benchmark por preset (gera relatório local)
4. Dashboard simples (histórico local) + export/verify UX
5. Depois disso, discutir SDK/integrações (com atenção a ToS/2FA)
