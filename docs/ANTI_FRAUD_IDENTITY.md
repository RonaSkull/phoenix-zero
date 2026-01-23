# Anti-Fraude + Identidade (Phoenix Zero)

## 1) Objetivo

Evitar que um fraudador use o sistema para “parecer legítimo” enquanto tenta se passar por outra pessoa/empresa.

O problema central não é “alguém conseguir gerar uma prova” (isso é esperado), e sim **alguém conseguir gerar uma prova que o público interprete como pertencendo a outra identidade**.

## 2) O que já está implementado neste repo (agora)

### 2.1 Registro de criadores (Creator Registry)

- Arquivo: `keys/creator-registry.json`
- Formato (por creatorId):
  - `ed25519PublicKeyB64Url` (obrigatório)
  - `pqPublicKeyB64Url` (opcional; se existir, passa a ser exigido para “match” quando a prova tem PQ)

### 2.2 Verificação com decisão anti-fraude (consumer decision)

- Endpoint: `POST /api/phoenix-zero/verify-by-url`
- Agora retorna, além dos blocos já existentes (`signature`, `watermark`, `temporal`):
  - `decision`:
    - `verified`
    - `verified_unregistered_creator`
    - `suspected_impersonation`
    - `not_verified`
  - `identity`: avaliação do vínculo entre a prova e o registry
  - `fraud`: resultado do watchlist (`blocked` + `reasons`)
  - `attestation`: status do atestado do emissor (issuer attestation)
  - `registry` (opcional): status de confiança do registry assinado quando `PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY=1`

### 2.3 Watchlist + auditoria (fraud tracking)

- Watchlist: `keys/fraud-watchlist.json`
- Auditoria (JSONL): `apps/web/tmp/fraud-events.jsonl`
  - eventos são gravados quando `decision=suspected_impersonation`

### 2.4 Issuer Attestation (dual-auth)

- Prova pode carregar `issuerAttestation` assinado pelo emissor.
- Verificação valida e retorna `attestation.present/ok`.
- Envs:
  - `PHOENIX_ZERO_REQUIRE_ISSUER_ATTESTATION=1`
  - `PHOENIX_ZERO_TRUSTED_ISSUER_PUBLIC_KEY_B64URL`

### 2.5 Registry assinado + Transparency Log (B)

- Registry: `keys/creator-registry.json`
- Assinatura atual: `keys/creator-registry.signature.json`
- Transparency log: `keys/creator-registry.transparency.jsonl`
- Chave da autoridade (dev): `keys/phoenix-zero-registry-authority-ed25519.json`

Admin (dev-only):

- `POST /api/admin/registry?action=publish` — gera a assinatura e adiciona uma entrada no log
- `GET /api/admin/registry?what=verify` — valida assinatura vs registry atual
- `GET /api/admin/registry?what=log&limit=50` — lê tail do log

Envs:

- `PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY=1`
  - exige assinatura válida do registry
  - `verify-by-url` retorna 503 se estiver ausente/inválida
- `PHOENIX_ZERO_TRUSTED_REGISTRY_PUBLIC_KEY_B64URL` (opcional)
  - fixa qual chave pública é confiável para assinar o registry

### 2.6 UX do consumidor

- `/verify` mostra decisão + identidade + origem (quando houver attestation)
- Extensão mostra badge/popup com:
  - `Autêntico ✅` / `Autêntico ✅+` (quando origem confirmada)
  - warn/suspeito conforme decisão

## 3) Como a prova funciona (o que ela prova)

A prova (`proof.json`) contém:

- **Assinatura híbrida** (Ed25519 + opcional PQ/SPHINCS+)
  - Prova que **alguém que possui a chave privada correspondente** assinou o payload.
- **Vínculo com o vídeo** (2 sinais redundantes)
  - watermark invisível (payload embutido no vídeo)
  - fingerprint temporal (sequência/assinatura de amostras do conteúdo)

Na verificação, consideramos `ok=true` quando:

- `signature.ok === true` **e**
- `(watermarkMatch || temporalMatch)`

Isso prova: “o vídeo exibido é o mesmo (ou compatível, dentro da tolerância) com o vídeo que foi assinado e carimbado na prova”.

## 4) Como a identidade funciona (o que ela prova)

### 4.1 Conceito

A assinatura prova a posse de uma chave. **Para virar ‘identidade’**, é preciso um mecanismo externo que diga:

> “Esta chave pública pertence ao criador X”

No repo, isso é representado por `creator-registry.json`.

### 4.2 Regras atuais de identidade

O endpoint `verify-by-url` faz:

1. Extrai as chaves públicas embutidas na prova:
   - `proof.hybridSignature.ed25519.publicKeyB64Url`
   - `proof.hybridSignature.pq.publicKeyB64Url` (se existir)

2. Resolve o criador esperado (duas maneiras):
   - **Por creatorId**: se a prova tem `creatorId`, consulta `creator-registry.json[creatorId]`
   - **Por chave (fallback)**: se a prova **não** tem `creatorId`, tenta encontrar no registry um criador com **as mesmas chaves públicas** (reverse lookup)

3. Avalia o vínculo:
   - `match`: chaves da prova == chaves do registry
   - `mismatch`: creatorId resolvido existe no registry, mas chaves não batem
   - `unregistered`: creatorId existe na prova, mas não existe no registry
   - `unknown`: não existe creatorId e não foi possível inferir por chave

### 4.3 Decisão (consumer)

A decisão é calculada assim:

- Se a prova falha (`signature` inválida ou sem vínculo com o vídeo):
  - `decision = not_verified`

- Se a prova passa e identidade é `mismatch`:
  - `decision = suspected_impersonation`

- Se a prova passa e identidade é `match`:
  - `decision = verified`

- Se a prova passa e identidade é `unknown` ou `unregistered`:
  - `decision = verified_unregistered_creator`

## 5) O que isso impede (ameaças e respostas)

### 5.1 Fraudador tenta “usar o sistema legitimamente” para se passar por outro creatorId

Exemplo: ele gera uma prova com `creatorId="empresaX"`, mas usa as próprias chaves.

- Assinatura pode ser válida (para a chave dele)
- Vínculo com vídeo pode ser válido
- **Identidade falha**: registry de `empresaX` tem outras chaves
- Resultado:
  - `decision = suspected_impersonation`

Isso resolve o problema clássico: “fraudador usa o sistema corretamente, mas tenta enganar a identidade”.

### 5.2 Fraudador omite creatorId

- Resultado tende a ser:
  - `verified_unregistered_creator`

Isso preserva segurança (não “atribui” identidade errada).

### 5.3 Ataques que NÃO são resolvidos apenas com registry

- **Chave privada comprometida/roubada**: se o atacante obtém a chave real, ele consegue produzir provas que passam como o criador.
  - Mitigação necessária: rotação/revogação de chaves + incident response + transparência.

- **Registry comprometido**: se alguém altera o registry, pode reatribuir chaves.
  - Mitigação necessária: assinatura do registry, auditoria, HSM, controle de mudanças.

## 6) Como tornar o registry uma “prova de identidade real” (recomendado)

Hoje o registry é um arquivo local (dev). Para virar “identidade real”, você precisa de um processo de enrollment/atestado. Modelos possíveis:

- **KYC** (documento/empresa)
- **Prova de domínio** (DNS TXT / arquivo em site oficial)
- **Prova de conta social** (post assinado com a chave, challenge por API)
- **Certificados/PKI** (cadeia de confiança)
- **Assinatura do registry** (registry assinado por autoridade do sistema)
- **Logs imutáveis** (transparency log estilo Certificate Transparency)

## 7) Próximos módulos (ainda não implementados)

Os caminhos citados no rascunho (`identity/dual-auth.ts`, `fraud-tracking/fraud-detector.ts`, etc.) **não existem como módulos completos neste repo ainda**.

O que falta para um sistema anti-fraude “completo”:

- **Política de rotação** de chaves (com período de overlap)
- **Assinatura do registry** e/ou transparency log em produção (HSM, controle de mudanças, CI)
- **Dual-auth de origem** (integração com Q-STEP/live para origem temporal/anti-replay)

## 8) Como usar (dev)

1. Adicione o criador no `keys/creator-registry.json`.
2. Gere provas normalmente.
3. Verifique via:
   - `/verify` (UX)
   - `POST /api/phoenix-zero/verify-by-url` (API)

Se `creatorId` existir e bater com o registry, você verá `decision=verified`.

---

Resumo: hoje você já tem uma camada real de anti-fraude baseada em **assinatura + vínculo ao vídeo + registry de chaves**, que detecta o caso mais crítico: “fraudador usa o sistema para fingir ser outra identidade”. O que transforma isso em “identidade legal/forte” é o processo de enrollment + governança/assinatura do registry.
