# Phoenix Zero — Benchmarks

Este documento explica como rodar benchmarks locais para **calibrar presets** (por duração e/ou plataforma) e gerar relatórios repetíveis.

## Script

- Script: `scripts/phoenix-zero-benchmark-presets.ts`
- Comando npm: `npm run bench:presets`

O benchmark gera um vídeo sintético (ffmpeg), faz `stamp` (embed watermark + fingerprint + assinatura), e depois cria variantes recomprimidas para testar robustez.

## Saídas

Cada execução cria uma pasta única em:

- `./benchmarks/<outDir>/<runId>/`

Com arquivos:

- `report.json` — relatório completo (máquina)
- `report.md` — tabela resumida (humano)
- `inputs/` — vídeos sintéticos gerados
- `watermarked/` — vídeos carimbados
- `variants/` — recompressões (simulações)
- `proofs/` — proofs JSON

## Como rodar (smoke test)

```bash
npm run bench:presets -- --durations 3 --variants crf32 --outDir ./benchmarks/presets-smoke
```

## Como rodar (cobertura por duração)

```bash
npm run bench:presets -- \
  --durations 3,8,12,20,33,40,55,75 \
  --variants crf28,crf32,fps24_scale540_crf32 \
  --outDir ./benchmarks/presets
```

## Como rodar por plataforma (usa hints e ids do preset)

```bash
npm run bench:presets -- \
  --platforms whatsapp,tiktok,instagram,youtube,linkedin \
  --durations 3,8,12,20,33,40,55,75 \
  --variants crf32,fps24_scale540_crf32 \
  --outDir ./benchmarks/presets-platform
```

## Parâmetros suportados

- `--outDir` (default `./benchmarks/presets`)
- `--durations` (CSV, default `3,8,12,20,33,40,55,75`)
- `--platforms` (CSV, default: `default`)
- `--variants` (CSV)
  - `crf28`
  - `crf32`
  - `fps24_scale540_crf32`
- `--size` (default `720x1280`)
- `--fps` (default `30`)

## Como interpretar

- A tabela em `report.md` marca `OK/FAIL` para o **watermark**.
- `report.json` inclui também:
  - `watermarkBitErrors` / `watermarkBitCount` (distância de Hamming)
  - `temporalMad` e `temporalOk` (robustez da fingerprint)

Quando um preset falhar em uma variante, os ajustes típicos são:

- Aumentar redundância:
  - `repeatPerBit`
  - número de `rois`
  - diminuir `frameInterval`
- Ajustar `brightnessDelta` com cuidado (invisibilidade)
- Ajustar `watermarkVerify.yThreshold` (apenas para extração; não muda embed)

## Observação importante

Essas recompressões (CRF/scale/fps) são **aproximações**. As redes sociais aplicam pipelines diferentes, então o benchmark serve para:

- detectar regressões
- comparar presets
- guiar calibração

O “teste final” continua sendo o harness real:

- `scripts/test-all-platforms.ps1`
