# Robustez de Watermark (Reencode/Reshare) + Automação Social Assistida

Este guia explica como rodar os novos testes **B (robustez/reencode)** e **C (automação social semi-automática)**.

Objetivo: medir e melhorar a capacidade do Phoenix Zero de manter **autenticidade** e **watermark invisível** quando o conteúdo é:

- redimensionado,
- recomprimido,
- reencodado (vídeo),
- recortado (crop),
- recompartilhado.

E, em paralelo, acelerar os testes em plataformas com um fluxo “assistido” (Playwright abre os caminhos e coleta evidência, mas o humano finaliza login/2FA/post).

---

## 1) Requisitos

- Node/NPM funcionando.
- `apps/web` com dependências instaladas (`sharp` está lá).
- Para vídeo: `ffmpeg-static` (já está no repo via devDependencies) — o script resolve o caminho automaticamente.

---

## 2) B — Robustez de imagem (simulação de plataforma)

### O que o teste faz

Roda um pipeline local:

1. Pega uma imagem base (demo) e **embute watermark invisível**.
2. Para cada perfil de plataforma, simula transformações típicas:
   - crop leve (opcional)
   - resize (limite máximo)
   - recompressão JPEG (quality)
   - blur leve (opcional)
3. Tenta extrair a watermark com `expectedPayloadB64Url`.
4. Calcula `dHash` e mede distância (binding do conteúdo).
5. Gera outputs e um `report.json`.

### Como rodar

```powershell
npm run test:robust:image
```

Opcional:

```powershell
npm run test:robust:image -- --in .\caminho\para\image.png --dumpDir .\platform-tests\robustness\minha-pasta
```

### Onde sai o resultado

- Pasta gerada automaticamente em:
  - `platform-tests/robustness/image-<timestamp>/`
- Arquivos:
  - `whatsapp.jpg`, `instagram.jpg`, etc
  - `report.json`

### Como interpretar `report.json`

Campos principais por plataforma:

- `watermarkOk`
  - `true` = payload extraído bate com o payload esperado.
- `bestBitErrors`
  - menor é melhor (ideal = 0). Ajuda a medir margem.
- `dhashDistance` e `dhashOk`
  - mede se o conteúdo continua “perceptualmente equivalente” ao original.

### Ajustes típicos quando falha

- Aumentar `repeatPerBit`
- Ajustar `grid` para ficar longe das bordas (reduzir impacto de crop)
- Aumentar `analysisSize` (até certo limite)
- Ajustar `brightnessDelta` (cuidado para não ficar perceptível)

---

## 3) B — Robustez de vídeo (reencode local com ffmpeg)

### O que o teste faz

1. Parte de um vídeo watermarked (`watermarked.mp4`) e um proof (`original.proof.json`).
2. Para cada “plataforma”, faz um reencode local via ffmpeg:
   - `scale` (maxSize)
   - `libx264 + crf + preset`
   - áudio AAC (kbps)
3. Roda verificação de assinatura + watermark + temporal fingerprint.
4. Escreve `report.json`.

### Como rodar

```powershell
npm run test:robust:video
```

Opcional:

```powershell
npm run test:robust:video -- --in .\platform-tests\output\watermarked.mp4 --proof .\platform-tests\proofs\original.proof.json
```

### Onde sai o resultado

- `platform-tests/robustness/video-<timestamp>/`
- `*.mp4` reencodados por plataforma
- `report.json`

### Como interpretar

Por plataforma, `verify.ok` deve ser `true`.

Detalhes úteis:

- `verify.watermark.ok`
- `verify.watermark.bestBitErrors`
- `verify.temporal.ok`
- `verify.temporal.mad` vs `madThreshold`

Quando a watermark falhar mas temporal passar, ainda é um “OK degradado” (o sistema aceita). Isso indica que a watermark ficou frágil para aquele preset e precisa ajuste.

---

## 4) C — Automação social semi-automática (Playwright)

### Por que é semi-automática

Plataformas exigem:

- login,
- 2FA,
- CAPTCHA,
- mudanças constantes de UI,

então a automação 100% é instável. A estratégia aqui é:

- Playwright abre o fluxo certo,
- imprime instruções no terminal,
- captura screenshots/trace,
- você finaliza o post/share.

### Como rodar

1) Setar flag para habilitar:

```powershell
$env:PW_SOCIAL_FLOWS="1"
```

2) Rodar:

```powershell
npm run test:social:flows
```

### O que ele faz

- Gera um `shareUrl` via `/api/share-link`.
- Abre:
  - WhatsApp Web share
  - Telegram share
  - LinkedIn share
  - X/Twitter intent
  - Discord (abre web e você cola)
  - Slack (abre login e você cola)
  - YouTube Studio (para upload/reencode; você finaliza)
  - Instagram/TikTok (abre web, fluxo limitado)
- Salva screenshots em `playwright-artifacts/`.

### Limitações importantes

- Instagram/TikTok em web têm limitação para postar e preview; muitas vezes precisa app.
- Discord/Slack não têm “share intent” oficial; é assistido (abrir + colar).

---

## 5) Próximos upgrades recomendados

- Produzir um **score de robustez** por plataforma (ex.: watermark ok%, bitErrors médio).
- Criar profiles mais realistas a partir de vídeos baixados reais (WhatsApp/Instagram/YouTube).
- Evoluir automação assistida para “checklist + pause por etapa” (em vez de só navegar e tirar screenshot).
