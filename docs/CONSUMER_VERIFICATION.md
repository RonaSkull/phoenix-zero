# Phoenix Zero — Verificação Passiva para Consumidores (sem ação do usuário)

Este documento explica **como um consumidor pode saber se um vídeo é autêntico ou fake sem fazer nada**, e traz um **passo a passo** por operação (criação/stamp, publicação, verificação manual e verificação passiva por canal).

Importante: hoje, neste repositório, existe o **motor de verificação** (assinatura + watermark + temporal) e APIs/CLI para rodar isso. O “zero ação do consumidor” depende de **um integrador** (plataforma, extensão ou app) que executa a verificação automaticamente e mostra um indicador visual.

## 1) O que o Phoenix Zero prova (modelo mental)

Para o consumidor, “autêntico” significa:

- O vídeo contém um **sinal invisível** (watermark) e/ou uma **impressão temporal** (fingerprint) que sobrevive a recompressão.
- O pacote de prova (`proof`) tem uma **assinatura híbrida**:
  - Ed25519 (clássica)
  - SPHINCS+ (pós-quântica)
- A verificação retorna `ok: true` somente se:
  - a assinatura é válida **e**
  - (`watermark.ok` **ou** `temporal.ok`) é verdadeiro

Na prática:

- **Signature OK** garante integridade/autoria do `proof`.
- **Watermark/Temporal OK** liga aquele `proof` ao vídeo visto pelo consumidor.

## 2) O que já está implementado no repo (agora)

- **Stamp watermarked (gera vídeo + proof)**
  - API: `POST /api/phoenix-zero/stamp-watermarked` (retorna ZIP com `watermarked.mp4` + `proof.json`)
- **Verify watermarked (verifica vídeo + proof)**
  - API: `POST /api/phoenix-zero/verify-watermarked` (retorna JSON com assinatura/watermark/temporal)
- **UI web** (stamp/verify)
  - `apps/web/src/app/page.tsx`
- **CLI** (para fluxo offline)
  - `npm run stamp:wm`
  - `npm run verify:wm`

Ainda NÃO existe no repo:

- Extensão de navegador
- Overlay automático
- App móvel de verificação
- Integração nativa em plataformas

Este documento descreve o passo a passo para:

- usar o que já existe hoje
- e como organizar o produto para “zero ação” via extensão/plataforma

## 3) Operação A — Criador: gerar vídeo autenticável (stamp)

Você tem 3 caminhos.

### A1) Via UI (mais simples)

1) Rode o web app:
   - `npm run dev` em `apps/web`
2) Abra:
   - `http://localhost:3000/`
3) Use a seção de **stamp watermarked**.
4) Baixe o ZIP gerado:
   - `phoenix-zero-watermarked.zip`
5) Extraia:
   - `watermarked.mp4`
   - `proof.json`

### A2) Via API (automação)

Endpoint:

- `POST /api/phoenix-zero/stamp-watermarked`

Campos `multipart/form-data`:

- `video` (File)
- `mode` (`compat` | `strict`) (opcional)
- `creatorId` (string) (opcional)
- `platform` (opcional)
- `presetId` (opcional)
- `privateKeyB64Url` (opcional; pode vir de env/arquivo)

Resultado:

- ZIP com `watermarked.mp4` e `proof.json`

### A3) Via CLI (offline-first)

1) Gere chaves:
   - `npm run keygen`
   - `npm run pq:keygen`
2) Faça stamp:
   - `npm run stamp:wm`

## 4) Operação B — Criador: publicar de um jeito que o consumidor “descubra” a prova

Para existir verificação passiva, a prova precisa ser **descoberta automaticamente**.

Opções práticas (recomendadas):

### B1) “Proof sidecar” (recomendado)

Você publica o vídeo normalmente e publica o `proof.json` em um URL estável (seu domínio/CDN).

Exemplo de convenção (sugestão):

- Vídeo: publicado na rede
- Proof: `https://seu-dominio.com/proofs/<videoId-ou-hash>.json`

Depois, você coloca esse link:

- na descrição
- no comentário fixado
- no campo “website” do perfil

A extensão/plataforma vai procurar esse link e verificar automaticamente.

### B2) `proofCompact` colado em texto

Para alguns canais, dá para embutir uma string compacta (`proofCompact`) no texto.

Prós:

- Não precisa hospedar arquivo.

Contras:

- Pode ser cortado/formatado pela plataforma.

### B3) Integração oficial (plataforma)

A própria plataforma armazena o proof como metadado interno e exibe o selo nativamente.

É o melhor UX, mas exige parceria.

## 5) Operação C — Consumidor (manual, fallback): verificar um vídeo hoje

Quando não existe extensão/integrador, a verificação pode ser feita manualmente (ainda assim útil para auditoria).

### C1) Via UI

1) Abra o web app: `http://localhost:3000/`
2) Use a seção **verify watermarked**.
3) Envie:
   - o vídeo baixado da rede (mp4)
   - o `proof.json` correspondente
4) Veja o resultado:
   - `ok: true` → autenticidade confirmada (nos critérios atuais)
   - `ok: false` → falhou (assinatura e/ou watermark/temporal)

### C2) Via API

Endpoint:

- `POST /api/phoenix-zero/verify-watermarked`

Campos `multipart/form-data`:

- `video` (File)
- `proof` (string/file) OU `proofCompact` (string)
- `platform` (opcional)
- `wmThreshold` (opcional)
- `wmSearchWindow` (opcional)

A resposta detalha:

- `signature.ok`
- `watermark.ok`
- `temporal.ok`

## 6) Operação D — Consumidor (passivo): como ele “não faz nada” e mesmo assim sabe

O consumidor só terá **zero ação** se algum software fizer automaticamente:

1) Descobrir o `proof` (B1/B2/B3)
2) Obter o vídeo visto (ou amostra suficiente)
3) Verificar (localmente ou chamando um serviço)
4) Mostrar o resultado como overlay/badge

A seguir os 3 canais de implantação.

### D1) Extensão de navegador (primeira linha)

Objetivo: ao abrir um vídeo (YouTube/TikTok/Instagram Web), aparecer um selo:

- ✅ Autêntico (Phoenix Zero)
- ⚠️ Não verificado / prova ausente
- ❌ Falha (assinatura inválida / sem vínculo com o vídeo)

Passo a passo (implementação do produto):

1) **Content Script** detecta um player (`<video>`) e extrai URL/ID do vídeo.
2) **Discovery do proof**:
   - procurar link para `proof.json` na descrição/comentários (B1)
   - ou procurar `proofCompact` em texto (B2)
   - ou consultar um registry (se você tiver um)
3) **Verificação**:
   - modo A (rápido para MVP): enviar `video`+`proof` para `POST /api/phoenix-zero/verify-watermarked`
   - modo B (mais privado): rodar verificação local (exige ffmpeg/WebAssembly e é mais complexo)
4) **Overlay**: desenhar um badge no DOM do player.

Nota de viabilidade: extrair bytes do vídeo no browser pode ser limitado por CORS/DRM. Um MVP tende a:

- usar links de download do próprio usuário (quando disponíveis)
- ou integrar com um app/desktop que baixa o arquivo e verifica

### D2) Integração na plataforma (segunda linha)

Objetivo: a própria plataforma exibe o selo (melhor UX possível).

Passo a passo:

1) No upload, o criador envia `proof.json` junto do vídeo (ou a plataforma calcula internamente usando SDK).
2) A plataforma valida:
   - assinatura
   - watermark/temporal
3) A plataforma grava o resultado e exibe:
   - selo no player
   - informações do criador/chave

Requisito-chave: modelo de confiança de chaves (como o usuário sabe que aquela `publicKey` é do criador real?).

### D3) App móvel (terceira linha)

Objetivo: consumidor assiste/abre o vídeo dentro do app e o app verifica em background.

Passo a passo:

1) O usuário compartilha o link do vídeo para o app.
2) O app baixa o vídeo (ou recebe um arquivo local).
3) O app baixa o `proof` (B1/B2/B3).
4) O app verifica (local/servidor) e mostra o selo.

## 7) Interpretação do resultado (como comunicar ao consumidor)

Recomendação de UX (texto curto):

- **✅ Autêntico**: assinatura válida + vínculo por watermark/temporal.
- **⚠️ Não verificado**: não foi possível encontrar proof ou dados suficientes.
- **❌ Suspeito/Falhou**: assinatura inválida ou prova não bate com o vídeo.

## 8) Checklist rápido (organização por operação)

- **Criador (stamp)**
  - gerar `watermarked.mp4` + `proof.json`
- **Criador (publicar)**
  - publicar vídeo
  - publicar proof (link estável) e expor no texto
- **Consumidor (passivo)**
  - extensão/plataforma/app:
    - descobrir proof
    - verificar
    - exibir overlay

## 9) Próximos passos sugeridos no repo

Se você quiser transformar este documento em implementação real aqui dentro do repositório, os próximos itens (em ordem) são:

1) Definir um formato “oficial” de publicação do proof (B1) e padronizar URL.
2) Criar uma página pública simples:
   - cola URL do vídeo + URL do proof → retorna resultado e link compartilhável.
3) Criar uma extensão MVP:
   - somente overlay + discovery via link de proof na descrição.
