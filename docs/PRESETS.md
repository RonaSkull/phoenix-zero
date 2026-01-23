# Phoenix Zero — Presets

Objetivo: organizar parâmetros de watermark + fingerprint temporal em presets, para que `stamp:wm` e o backend escolham um conjunto consistente sem o usuário precisar entender detalhes.

## Conceitos de preset

Um preset define:
- **Watermark**
  - `payloadByteLength`
  - `bitCount` (normalmente `payloadByteLength * 8`)
  - `startFrame`
  - `frameInterval`
  - `repeatPerBit`
  - `brightnessDelta`
  - `rois[]`
- **Temporal fingerprint**
  - `fps`, `scale`, `targetLen`, `quant`
  - `madThreshold`

## Regras práticas
- Vídeos mais curtos tendem a exigir:
  - payload menor
  - mais redundância (repeatPerBit e/ou ROIs)
- Vídeos mais longos permitem:
  - payload maior
  - redundância distribuída no tempo

## Presets atuais (implementados)

> Nota: valores são ponto de partida e devem ser calibrados com testes reais (WhatsApp/TikTok/IG/LinkedIn). Não é promessa de “100%”.

### 3–6s (curto)
- `payloadByteLength`: 2
- `repeatPerBit`: 2
- `brightnessDelta`: 0.03
- `frameInterval`: 3
- `rois`: 3 regiões (centro + 2 quadrantes)
- `madThreshold`: 12

### 7–10s (médio-curto)
- `payloadByteLength`: 4
- `repeatPerBit`: 2
- `brightnessDelta`: 0.03
- `frameInterval`: 3
- `rois`: 3 regiões
- `madThreshold`: 12

### 11–15s (médio)
- `payloadByteLength`: 6
- `repeatPerBit`: 2
- `brightnessDelta`: 0.03
- `frameInterval`: 3
- `rois`: 3 regiões
- `madThreshold`: 12

### 16–29s (médio-longo)
- `payloadByteLength`: 8
- `repeatPerBit`: 2
- `brightnessDelta`: 0.03
- `frameInterval`: 3
- `rois`: 3 regiões
- `madThreshold`: 12

### 30–35s (longo)
- `payloadByteLength`: 12
- `repeatPerBit`: 1
- `brightnessDelta`: 0.03
- `frameInterval`: 2
- `rois`: 3 regiões
- `madThreshold`: 12

### 35–45s (longo-médio)
- `payloadByteLength`: 16
- `repeatPerBit`: 1
- `brightnessDelta`: 0.03
- `frameInterval`: 2
- `rois`: 3 regiões
- `madThreshold`: 12

### 45–60s (longo)
- `payloadByteLength`: 20
- `repeatPerBit`: 1
- `brightnessDelta`: 0.03
- `frameInterval`: 2
- `rois`: 3 regiões
- `madThreshold`: 12

### 60–90s (muito longo)
- `payloadByteLength`: 24
- `repeatPerBit`: 1
- `brightnessDelta`: 0.03
- `frameInterval`: 2
- `rois`: 3 regiões
- `madThreshold`: 12

## Override por plataforma

### Instagram

Alguns downloads/re-encodes do Instagram degradam muito o delta de luminância do watermark. Para isso, o preset inclui hints de verificação:

- `watermarkVerify.yThreshold`: 0.2
- `watermarkVerify.searchStartFrameWindow`: 24

### WhatsApp

O WhatsApp tende a recomprimir de forma mais agressiva. Para aumentar robustez e reduzir falhas de sincronização na extração:

- `watermark.brightnessDelta`: >= 0.04 (especialmente no bucket `3–6s`)
- `watermarkVerify.yThreshold`: 0.25
- `watermarkVerify.searchStartFrameWindow`: 240

## Onde está implementado

- `libs/phoenix-zero/src/node/presets.ts`
- `scripts/phoenix-zero-stamp-watermarked.ts`
- `scripts/phoenix-zero-verify-watermarked.ts`
- `apps/web/src/app/api/phoenix-zero/stamp-watermarked/route.ts`
- `apps/web/src/app/api/phoenix-zero/verify-watermarked/route.ts`

