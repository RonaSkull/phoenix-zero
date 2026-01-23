# Phoenix Zero — Estratégia Final (Decisões + Operacionalização)

## 1) Objetivo
Padronizar e finalizar a validação do Phoenix Zero (Phase 1) e estabelecer o caminho de produto para verificação simples ao consumidor com **zero interferência visual** e **sem depender das plataformas**, mantendo **evidência forense auditável**.

---

## 2) Decisões finais (o que está decidido)
- **Sistema atual está aprovado para produção (Phase 1) quando todas as validações pendentes forem concluídas**.
- **Twitch Live (captura do viewer) foi um sucesso**: classificar como **Verified (Robust)**.
- **Não é bloqueador** corrigir agora o caso `watermark.ok=false` em Twitch quando `ok=true` e `temporal.ok=true`.
- **Verificação offline é a base (“fonte de verdade”)** para auditoria e reprodutibilidade.
- **Camada ideal para consumidor é híbrida**:
  - **Online** (link público simples, 1 clique)
  - **Offline** (CLI/SDK para auditoria e disputa)
- **Nova evolução de produto decidida**: implementar **Âncora de Tempo Externa** (Time Anchor) para **VOD e Live**, com:
  - **Binding com conteúdo** (content commitment)
  - **Binding com identidade** (assinatura do criador)
  - **Modo híbrido de transparência**: domínio próprio para consumidor + log imutável/append-only para auditoria.
- **Geração de âncora será dupla**:
  - **Web Panel** (1 clique)
  - **CLI/SDK** (automação para empresas/pipelines)

---

## 3) Evidência: Twitch Live Viewer Capture (PASS)
### Comando executado
```powershell
npm run verify:wm -- --in "platform-tests/live/downloads/twitch/live-capture.mp4" --proof "platform-tests/proofs/original.proof.json" --platform twitch
```

### Resultado (resumo)
- **ok**: `true`
- **signature**: `ok=true` (ed25519 + pq ok)
- **temporal**: `ok=true` (mad `3.9167` <= threshold `12`)
- **watermark**: `ok=false` com `bestBitErrors=1` (quase match; 1 bit de erro após re-encode/captura)

### Interpretação
- **Resultado final aprovado** porque o critério é:
  - assinatura válida AND (watermark match OR temporal match)
- Em plataformas reais + captura, o watermark pode sofrer erros pontuais.
- Para produto, isso deve virar **nível de verificação** (ver seção 4), sem confundir consumidor.

---

## 4) Classificação de verificação (produto)
- **Verified (Strong)**
  - Assinatura OK
  - Watermark OK
- **Verified (Robust)**
  - Assinatura OK
  - Temporal OK
  - (Watermark pode falhar por re-encode/captura)
- **Inconclusive**
  - Assinatura OK
  - Sem match em watermark e temporal
- **Not Verified**
  - Assinatura falhou

### Regra de UX
- **Consumidor** vê apenas: `VERIFIED / NOT VERIFIED / INCONCLUSIVE`.
- **Auditor** pode ver `Strong/Robust` e métricas detalhadas.

---

## 5) Verificação offline: bom/ruim/ótimo?
- **Excelente para auditoria/compliance**
  - Reprodutível, determinística, independente do seu servidor.
- **Ótimo para cliente (criador/empresa)**
  - Evidência forte em disputa (provas + verificador).
- **Não é ideal como UX de massa para consumidor**
  - Consumidor não roda CLI.

**Conclusão**: offline é a **camada de verdade**. Para excelência total, adicionar uma **camada online** de conveniência.

---

## 6) Perspectivas (stakeholders) e o que é “excelente” para cada um
### Consumidor
- **Meta**: 1 clique, sem instalar nada, sem alterar hábito.
- **Entrega**:
  - Link público “Verificar autenticidade”
  - Status claro + timestamp de última confirmação (especialmente em live)
  - Detalhes técnicos escondidos

### Cliente (criador/empresa que publica)
- **Meta**: fluxo simples, sem mexer no jeito de postar/live.
- **Entrega**:
  - Web Panel: “Gerar link de verificação” / “Iniciar Live Verificada”
  - Copiar e colar link no local padrão (descrição, painel, pinned message, bot)

### Auditor
- **Meta**: evidência independente, replicável.
- **Entrega**:
  - Evidence Pack exportável (capturas, proofs, resultados JSON)
  - Procedimento e CLI/SDK
  - Logs append-only/imutáveis para validar que a âncora existiu na janela temporal

### Sua empresa
- **Meta**: reduzir suporte, reduzir disputa, escalar globalmente.
- **Entrega**:
  - Produto híbrido (consumer link + offline tooling)
  - Políticas claras de classificação (Strong/Robust)
  - Auditoria por logs imutáveis/append-only

---

## 7) Arquitetura alvo (camadas)
- **Camada A — Watermark/Temporal + Proofs (offline-first)**
  - Gera provas e permite verificação local.
- **Camada B — Página pública de verificação (consumer-friendly)**
  - Mostra status simples (VERIFIED etc.)
- **Camada C — Âncora de Tempo Externa (MVP)**
  - Prova efêmera independente da plataforma
  - Serve como “prova de liveness/coincidência temporal” sem elemento visual copiável

---

## 8) Âncora de Tempo Externa (Time Anchor) — MVP (especificação mínima)
### 8.1 Requisitos não negociáveis
- **Binding com conteúdo (content commitment)**
  - A âncora precisa comprometer um identificador derivado do conteúdo/fingerprint.
- **Binding com identidade (assinatura do criador)**
  - A âncora precisa ser assinada para provar autoria.

### 8.2 Estrutura mínima (conceitual)
- `anchorId`
- `creatorId`
- `creatorPublicKey`
- `createdAt`
- `expiresAt`
- `contentCommit` = hash de um identificador robusto do conteúdo
- `signature` = assinatura do criador sobre todos os campos

### 8.3 Fluxo para Live (janela curta)
- Criador inicia “Live Verificada” no painel
- Sistema cria âncoras em janelas (ex.: 5–30s)
- Página pública mostra:
  - `VERIFIED (LIVE)` enquanto há âncoras válidas recentes
  - “Última confirmação há Xs”

### 8.4 Fluxo para VOD (post)
- Criador gera âncora ao publicar (ou após publicar)
- `expiresAt` pode ser mais longo, ou usar “âncora por timestamp de criação”
- Página pública mostra `VERIFIED (VOD)` com metadados mínimos

### 8.5 Transparência híbrida (consumidor + auditor)
- Consumidor usa `verify.<domínio>` (simples)
- Auditor tem acesso a:
  - export dos registros
  - log append-only/imutável (ex.: storage + hash encadeado), com prova de integridade

### 8.6 Não metas (para evitar escopo infinito)
- Não prometer “bloquear espelhamento em tempo real” sem integração de plataforma.
- O objetivo é provar: **autoria + integridade + coincidência temporal**.

---

## 9) Operacionalização (checklist executável por um assistente)
### 9.1 Fechamento Phase 1 — evidências e checklist
- **Twitch**
  - Garantir arquivo: `platform-tests/live/downloads/twitch/live-capture.mp4`
  - Salvar resultado JSON:
    ```powershell
    mkdir platform-tests/live/reports/twitch -Force
    npm run verify:wm -- --in "platform-tests/live/downloads/twitch/live-capture.mp4" --proof "platform-tests/proofs/original.proof.json" --platform twitch |
      Tee-Object -FilePath "platform-tests/live/reports/twitch/verify-result.json"
    ```
  - Capturar 1 print do viewer (manual) e salvar em `platform-tests/live/proofs/twitch/viewer.png`

- **YouTube Live**
  - Aguardar liberação da conta
  - Fazer captura do viewer em tempo real (não VOD)
  - Rodar verify offline e salvar report

- **WhatsApp Live-like**
  - Fazer video call/screen share
  - Capturar o lado receptor
  - Rodar verify offline e salvar report

- **Checklist final**
  - Atualizar tabela com:
    - plataforma
    - path do arquivo capturado
    - comando executado
    - ok + nível (Strong/Robust)
    - paths de evidência (JSON + prints)

### 9.2 MVP Time Anchor (Fase 2 — 2 semanas)
- Especificar `contentCommit` (fonte do commitment) para:
  - vídeo, áudio, imagem, live
- Implementar TimeAnchorManager
- Criar API pública de leitura da âncora
- Criar página pública `verify-anchor/<id>` com UX simples
- Criar painel do criador para gerar âncora (1 clique)
- Criar CLI/SDK para gerar âncora em pipelines
- Implementar log append-only (imutável) + export para auditor

### 9.3 Produção (Fase 3 — 1 mês)
- Rate limiting e hardening
- Observabilidade e auditoria
- Documentação para:
  - consumidor
  - cliente
  - auditor

---

## 10) Definition of Done (DoD)
- Phase 1:
  - Todas as plataformas-alvo com evidências registradas (paths + reports)
  - Scripts e verificações reproduzíveis
  - Checklist final completo
- MVP Time Anchor:
  - Âncora com binding de conteúdo + identidade
  - Página pública de verificação
  - Evidence export + log append-only para auditoria

