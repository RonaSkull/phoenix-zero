# Briefing — Home (`/`) como Landing Profissional do Produto (multi-landing)

Objetivo: transformar a rota **`/`** em uma **landing page comercial** (venda/posicionamento), não uma ferramenta interna.

Este briefing foi escrito para você colar direto na sua IA de design/frontend.

---

## 1) Objetivo de negócio

- **Converter visitantes em ação**:
  - entender o valor do produto em 15–30 segundos
  - ver “provas” (demos) rapidamente
  - iniciar integração (Embed/SDK/API)
  - gerar lead/contato (CTA)

- **Vender por caso de uso (multi-landing)**: é melhor ter “home global” fraca do que páginas específicas fortes.

---

## 2) Estratégia de informação (IA de design)

### 2.1) Home `/` não deve tentar vender tudo ao mesmo tempo

A home deve funcionar como **hub**:

- Mostra o “core value proposition” + credibilidade
- Mostra **3–6 cards** de “Produtos / Casos de uso”
- Cada card aponta para uma landing dedicada:
  - `/global` (já existe — “Escala Global sem plataformas”)
  - (novas) landings específicas por produto (exemplos abaixo)

### 2.2) Estrutura recomendada de seções (ordem)

1) **Hero**
- Headline curta e forte
- Subheadline com 1 frase de benefício
- CTAs:
  - Primário: “Ver demo” (leva para `/demo/v1`)
  - Secundário: “Integrar agora” (scroll para seção de integração)
  - Terciário: “Falar com time” (link/contato)

2) **Problema → Solução (2 colunas)**
- Problemas comuns (fraude, deepfakes, reuploads, impersonation, falta de prova)
- Como Phoenix Zero resolve (prova verificável + link público + integração simples)

3) **Casos de uso / Produtos (cards)**
- Cards com:
  - título
  - 1 linha “para quem”
  - 2 bullets de benefício
  - CTA “Abrir”

4) **Como funciona (3 passos)**
- 1) Publica conteúdo + proof
- 2) Página ou embed verifica
- 3) Plataforma/usuário confia via card + decisão

5) **Demos (rápidas)**
- Blocos com links diretos:
  - Vídeo: `/demo/v1`
  - Imagem: `/demo/v1#image` (ou link interno equivalente)
  - Live (MVP): `/live-stream` e `/live-embed-demo`

6) **Integração (contrato único)**
- Expor só 1 caminho oficial:
  - `.v1.js` (embeds)
  - `PhoenixZeroSDK` (SDK)
  - `/api/auth-proxy` (API)
- Mostrar snippet mínimo (1 por tab: Embed / SDK / Curl)

7) **Segurança e confiabilidade**
- bullets:
  - CORS controlado
  - Rate limit
  - Cache
  - Anti-SSRF nas verificações por URL
  - Links públicos com OG (share links)

8) **FAQ**
- “Funciona sem plataformas?”
- “Preciso hospedar proof?”
- “O que é share link?”
- “Quais redes sociais suportam preview?”

9) **CTA final**
- “Começar integração” + “Agendar demo”

---

## 3) Casos de uso (modelos de landing pages)

A ideia é criar landings focadas. Sugestões (você escolhe os nomes depois):

- **Autenticidade para conteúdo em redes** (anti-reupload + anti-impersonation)
- **Verificação de mídia em portais/notícias** (prova pública de origem)
- **Creators e marcas** (provar autoria do conteúdo)
- **Live (MVP)** (cadeia de segmentos + confiança em tempo real)
- **Imagem watermarked** (quando precisa robustez contra recompressão)

Cada landing específica deve ter:

- hero + 1 demo dedicada
- integração (somente `.v1.js` e `/api/auth-proxy`)
- “por que isso é diferente” (1 seção)

---

## 4) Diretrizes visuais (UI)

- Estilo: **tech premium / trust-first**
- Componentes:
  - Hero com gradiente sutil
  - Cards com ícones
  - Tabs para snippets (Embed/SDK/Curl)
  - “Decision badge” (verde/vermelho/cinza) como elemento visual do produto
- Layout: desktop-first mas responsivo

---

## 5) Conteúdo (copy) — placeholders

### Headline (escolher 1)

- “Prova verificável para vídeos, imagens e lives.”
- “Autenticidade que sobrevive ao compartilhamento.”
- “Confiança por link, não por plataforma.”

### Subheadline

- “Phoenix Zero verifica mídia por URL e entrega um card público com decisão, identidade e evidências.”

### CTAs

- “Ver Demo” → `/demo/v1`
- “Integrar” → seção de integração

---

## 6) Requisitos técnicos (para o frontend)

- A home deve ser **multi-idioma**.
- A home deve ter **rotas dedicadas por produto** (multi-landing) com conteúdo independente.

Sugestão técnica (sem travar stack):

- Centralizar conteúdo em um “dicionário” por idioma (ex.: `pt`, `en`, `es`), com chaves por seção.
- Evitar hardcode de strings no componente.

---

## 7) O que NÃO fazer

- Não exibir ferramentas de upload/stamp/verify na home.
- Não expor scripts legados como recomendados.
- Não misturar todas as propostas no hero (vai diluir a venda).
