# Zero Ação em Escala (Consumidor sem extensão/app)

## 1) O que significa “zero ação” de verdade

"Zero ação" para o consumidor significa:

- Não instalar extensão
- Não abrir um site para colar link
- Não baixar app
- Não clicar em “verificar”

Ou seja: a verificação precisa acontecer **dentro do lugar onde ele consome o conteúdo**, como parte do produto que ele já usa.

Também existe “zero ação” do lado do criador/empresa:

- o processo de carimbo (stamp) precisa estar embutido no pipeline de publicação (CMS/uploader/câmera)
- o criador continua fazendo o que já faz (publicar), mas a segurança acontece automaticamente

## 2) Limitação inevitável (honesta)

Sem nenhum software do lado do consumidor (app/extensão) e sem integração do lado da plataforma (TikTok/YouTube/WhatsApp/Instagram), **não existe** como extrair watermark, verificar assinatura e exibir um selo automaticamente.

Então, “zero ação universal” exige pelo menos **um** destes:

- Integração da própria plataforma (server-side ou client-side)
- Integração em nível de OS (Android/iOS) / fabricante
- Integração no player (SDK embutido) que o consumidor já usa

O Phoenix Zero fornece os sinais (watermark + fingerprint + assinatura) e a infraestrutura de verificação; a experiência zero ação vem da integração no canal.

## 3) Canais reais e o que dá para fazer em cada um

### 3.1 Plataformas públicas (YouTube/TikTok/Instagram/Twitter)

Aqui é onde “zero ação” é mais viável.

Modelo:

1. Creator publica o vídeo já carimbado.
2. No upload/ingest, a plataforma executa a verificação (server-side) ou chama um verificador.
3. A plataforma guarda o resultado (cache) e renderiza um label no player/feed.

Consumidor vê:

- “Autêntico” (criador verificado)
- “Autêntico (criador não verificado)”
- “Suspeito (possível impostor)”
- “Não verificado”

Quando houver confirmação extra de origem (issuer attestation), o label pode evoluir para:

- “Autêntico ✅+” (origem confirmada por emissor confiável)

Sem o consumidor fazer nada.

### 3.2 Mensageria com criptografia E2EE (WhatsApp/Signal)

Aqui é o caso mais difícil: a plataforma não consegue, de forma centralizada, inspecionar o conteúdo (por design).

Para ser “zero ação” nesse canal, você precisa de:

- verificação **no cliente** (dentro do app do WhatsApp/Signal) OU
- verificação **no OS** (integrada ao sistema) OU
- uma experiência alternativa: o conteúdo carrega um sinal de autenticidade que o próprio app consegue mostrar (ainda é integração).

Sem integração, o máximo é “baixo atrito”: abrir um link de verificação.

Alternativa prática (PoC no repo): **Link Preview**

- Em vez de enviar o arquivo, o creator compartilha um link curto `/s/{id}`
- O preview do WhatsApp/Telegram mostra automaticamente um card com:
  - “Autêntico ✅” / “Suspeito” / “Não verificado”
  - opcionalmente “✅+” quando há issuer attestation
- Isso dá “zero ação” para o consumidor (ele só vê o preview), mas muda o formato do compartilhamento (link em vez de anexo)

Observações práticas (WhatsApp):

- Preview **não funciona** com `localhost` / `127.0.0.1` (o crawler do WhatsApp precisa acessar a URL publicamente)
- Para testar, exponha o serviço com um domínio **público/HTTPS** e use `PHOENIX_ZERO_PUBLIC_BASE_URL` para gerar links públicos
- Para compatibilidade de preview, `og:image` usa PNG (`/api/share-card-png?id=...`) em vez de SVG

Observação importante: em E2EE, o lado “servidor da plataforma” não consegue verificar o arquivo sem quebrar o modelo de privacidade. Então o caminho realista é:

- verificação local (no app)
- ou verificação no OS/galeria

### 3.3 Sites / blogs / players próprios (sem plataformas)

Aqui dá para chegar perto de “zero ação” para o consumidor final, mas apenas quando:

- o consumidor está assistindo dentro de um site/player que você controla (ou que aceita embed)
- você consegue embutir um pequeno script para renderizar um badge

PoC implementado no repo:

- `GET /api/global-auth?videoUrl=...&proofUrl=...`
  - valida autenticidade chamando o verificador por URL
  - retorna um `title/hint` e um `shareUrl` (detalhes em `/s/{id}`)
  - tem CORS liberado (`Access-Control-Allow-Origin: *`) para funcionar em outros domínios

- `GET /phoenix-zero-embed.js`
  - script embeddável que procura elementos com `data-phoenix-zero-embed`
  - chama `/api/global-auth` e renderiza o badge automaticamente

Para imagens:

- `GET /api/global-image-auth?imageUrl=...&proofUrl=...`
  - valida autenticidade chamando o verificador por URL (tenta v1 e fallback para watermark v4)
  - retorna um `title/hint` e um `shareUrl` (detalhes em `/verify-image` ou `/verify-image-wm`)
  - tem CORS liberado (`Access-Control-Allow-Origin: *`) para funcionar em outros domínios

- `GET /phoenix-zero-image-embed.js`
  - script embeddável que procura elementos com `data-phoenix-zero-image-embed`
  - chama `/api/global-image-auth` e renderiza o badge automaticamente

Para live:

- `GET /api/global-live-auth?jobId=...`
  - consulta o estado resumido do job de live e mapeia para um card (verificando / suspeito / não verificado)
  - retorna um `title/hint` e um `shareUrl` (detalhes em `/live-stream?jobId=...`)
  - tem CORS liberado (`Access-Control-Allow-Origin: *`) para funcionar em outros domínios

- `GET /phoenix-zero-live-embed.js`
  - script embeddável que procura elementos com `data-phoenix-zero-live-embed`
  - chama `/api/global-live-auth` e renderiza o badge automaticamente

Isso não depende de plataforma, mas depende do **site** aceitar rodar o script (ou seja, é integração no canal).

### 3.3 Arquivos reenviados fora da plataforma (download/forward)

Se o vídeo é baixado e reenviado como arquivo, o rótulo precisa ser reavaliado no destino.

“Zero ação” só existe se:

- o player do destino integra verificação, ou
- o OS/galeria integra verificação

## 4) Arquitetura recomendada para escala

### 4.1 Verificação na ingestão da plataforma (ideal)

- A plataforma roda o verificador localmente (sem depender de fetch externo) ou chama um serviço de verificação.
- Resultado vira metadata interna (ex: `trustState`) e é exibido no UI.

Pontos de escala:

- Cache por `hybridId` / hash do vídeo
- Deduplicação (mesmo vídeo repostado)
- Rate limiting e custos previsíveis

### 4.2 Labels / badges padronizados

Um conjunto pequeno e consistente de labels funciona melhor para público leigo:

- **Autêntico** (criador verificado)
- **Autêntico (criador não verificado)**
- **Suspeito** (possível impostor)
- **Não verificado**

Uma forma prática de mapear isso para o que o backend já retorna hoje:

- `decision=verified` → **Autêntico**
- `decision=verified_unregistered_creator` → **Autêntico (criador não verificado)**
- `decision=suspected_impersonation` → **Suspeito**
- `decision=not_verified` → **Não verificado**

E quando `attestation.ok === true`:

- **Autêntico ✅+**

O objetivo não é “100% fake detection”, e sim:

- confirmar origem quando possível
- não atribuir identidade quando não há base
- sinalizar suspeita quando há conflito com registry

## 5) Simulações realistas (stress test)

Abaixo estão cenários reais do comportamento de um consumidor comum.

### 5.1 Catástrofe (vídeo circulando no feed)

**Hoje (sem Phoenix Zero):**
- a pessoa vê o vídeo
- acredita pelo impacto emocional
- compartilha

**Com Phoenix Zero + integração da plataforma (zero ação):**
- a pessoa vê o vídeo
- abaixo do player aparece “Autêntico — fonte verificada: Defesa Civil”
- ou “Não verificado” / “Suspeito”

A pessoa não precisa entender criptografia. Ela só precisa confiar no label da plataforma.

### 5.2 Político (deepfake de discurso)

**Ataque:** deepfake com `creatorId="canal_oficial"`.

**Resultado:**
- assinatura pode ser válida (do fraudador) e o vídeo pode “passar” vínculo
- mas o registry do canal oficial tem outras chaves
- label mostrado:
  - “Suspeito (possível impostor)”

### 5.3 Celebridade (promo falso)

**Com integração:**
- “Autêntico (criador não verificado)” quando não existe registry oficial
- ou “Autêntico — criador verificado” quando existe

Isso reduz golpes de publicidade falsa.

### 5.4 Marca (anúncio)

O consumidor não quer verificar nada. Ele quer um sinal simples:

- “Autêntico — marca verificada”

Sem isso, a marca continua vulnerável a golpes.

### 5.5 Compartilhamento via WhatsApp (E2EE)

**Sem integração do WhatsApp (hoje):**
- zero ação é impossível
- o melhor é baixo atrito:
  - link de verificação embutido junto (preview)

**Com integração no app (zero ação real):**
- WhatsApp detecta/verifica localmente e mostra:
  - “Autêntico — fonte verificada”
  - “Suspeito”

Para live, uma plataforma poderia também exibir:

- “Autêntico (live)” quando Q-STEP está `valid` e a cadeia está íntegra

## 6) O que já existe hoje no repo vs o que é “escala real”

Hoje (repo):

- verificação por URL (`/api/phoenix-zero/verify-by-url`)
- UI do consumidor (`/verify`)
- extensão Chrome (overlay) para testes
- decisões (`verified`, `suspected_impersonation`, etc.)
 - issuer attestation (segunda camada de origem)
 - registry assinado + transparência (quando habilitado)
 - Q-STEP live (cadeia + score) e relatório (`/api/live-stream?jobId=...&qstep=1`)
 - embed universal (sem plataformas): `GET /phoenix-zero-embed.js` + `GET /api/global-auth`

Para escala sem nenhuma ação do consumidor:

- integração com plataformas (SDK/ingest)
- ou integração no OS/player

## 7) Recomendações de produto (próximos passos)

- Definir um **padrão público** (schema de proof + registry + endpoints)
- Criar um **SDK de verificação** embutível (Node/Go/Rust) para plataformas
- Criar modelo de **registry assinado** + transparência
- Para E2EE: discutir integração nativa (client-side) com parceiros

Endurecimento recomendado para o modo Link Preview:

- expiração/TTL e limpeza de links em `tmp/share-links.json`
- assinar o payload do link (evitar tampering em storage)
- cache CDN para `/api/share-card` e `/s/{id}`

---

Resumo: Phoenix Zero pode ser “zero ação” para o consumidor, mas isso exige integração no lugar onde o conteúdo é consumido (plataforma/OS). O repo atual já entrega a base técnica (prova + verificação + decisão + UX), e o caminho para escala é produto/parceria/SDK, não mais UX do usuário final.

## 8) O que você consegue validar com isso (honesto)

### 8.1 Vídeos (arquivo + proof)

Você consegue validar autenticidade quando você tem:

- uma URL **direta** para um arquivo de vídeo (ex: `.mp4`) acessível por HTTP/HTTPS
- uma URL para o `proof.json` correspondente

O verificador por URL baixa o vídeo e verifica watermark/fingerprint/assinatura.

### 8.2 Imagens

O repo também inclui PoC para **imagens** (assinatura + prova por URL, com opção de watermark invisível e fingerprint perceptual), além de endpoints globais para embed.

### 8.3 Links de plataformas (YouTube/Instagram/TikTok)

Não é garantido que funcione apontando `videoUrl` para uma URL de página (ex: link do YouTube). O verificador espera conseguir baixar bytes do arquivo e recusa redirects.

Para plataformas, o caminho real é integração (server-side ingest / SDK no player).

### 8.4 Live stream

Live tem um pipeline separado (`/live-stream`) e uma métrica/cadeia (Q-STEP). Para embed/badge de live, use `GET /api/global-live-auth?jobId=...`.
