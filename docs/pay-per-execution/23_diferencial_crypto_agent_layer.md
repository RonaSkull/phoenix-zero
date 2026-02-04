# Diferencial Inovador: Crypto Identity + Governance + Semantic Ledger para Agentes

## TL;DR
Este sistema implementa um **Payment Layer para agentes** onde:

- O agente tem **identidade criptográfica** (chave Ed25519)
- A execução pode ser **enforcement** por:
  - **Proof-of-Payment (PPO)**
  - **Governance (cooldown + consumo)**
  - **Assinatura do agente** (quando habilitado)
- Tudo gera um **AI Audit Trail** (semantic ledger) separado do financeiro

Isso permite afirmar com precisão:

"Agentes pagam, executam e são auditáveis por assinatura criptográfica, com enforcement financeiro e governança operacional."

## O problema que isso resolve (o que o mercado ainda não tem)
Sistemas tradicionais normalmente têm só 1 ou 2 destes pilares:

- Billing (cobrança)
- Auth (identidade)
- Audit (log)

O diferencial aqui é que você construiu os 3 em conjunto, com **ordem operacional correta** e **controle por flags**:

- Identidade do agente controla quem pode assinar/agir
- PPO controla *se pode executar* (pay-per-execution)
- Governance controla *quanto e com que frequência pode executar*
- Semantic ledger registra *o que aconteceu e por quê*, sem misturar com financeiro

## Os 4 pilares (comercializáveis)

### 1) Identidade criptográfica do agente (Agent Identity)
**O que é:**

- Cada agente tem `agentId` + `ed25519PublicKeyB64Url`
- Você pode exigir assinatura do agente em operações críticas

**Por que é diferente:**

- Não depende de sessão humana
- Permite non-repudiation (o agente não consegue negar que assinou)

**Rotação de chave com prova (key rotation):**

- Rotacionar a chave exige prova assinada pela **chave antiga**
- Isso impede takeover silencioso

**APIs relevantes:**

- `GET /api/agents/:agentId/identity`
- `PUT /api/agents/:agentId/identity`

### 2) Pay-Per-Execution (PPO Gate)
**O que é:**

- Execução só é liberada se existir um `PaymentProof` pago e válido
- O proof pode ter `totalUnits/usedUnits` para múltiplas execuções

**Por que é diferente:**

- Conecta billing ao runtime de execução
- Transforma “cobrança” em “enforcement”

**APIs relevantes:**

- `GET /api/agents/:agentId/gate`
- `POST /api/agents/:agentId/execute`

### 3) Governança algorítmica (Agent Governance)
**O que é:**

- Regras operacionais (cooldown, limites, etc.) aplicadas antes de ações críticas
- Pode ser aplicada:
  - antes de `checkout/create`
  - antes e depois de `execute`
  - no `gate`

**Por que é diferente:**

- É “cinto de segurança” contra runaway agents
- Faz throttling por agente, não só por IP/tenant

### 4) Ledger semântico (AI Audit Trail)
**O que é:**

- Um ledger separado, semântico, com eventos como:
  - `gate_check`
  - `execute`
  - `identity:update`
  - `key_rotated`

**Por que é diferente:**

- É explicável: registra *decisões e razões*
- Não mistura auditoria com financeiro

**Paginação por cursor:**

- Cursor opaco por `eventId`
- Ordem operacional: recentes → antigos

**API relevante:**

- `GET /api/agents/:agentId/events?limit=&cursor=`

## Como vender (frases prontas)

### Para devs / produto
- “AI-native billing com enforcement por execução.”
- “Agent identity + audit trail criptográfico, pronto para compliance.”

### Para enterprise
- “Non-repudiation: execução assinada + trilha auditável.”
- “Controle de risco: governance antes/depois de execução.”

## Flags de rollout (staging primeiro)
Você consegue ligar aos poucos:

- `PHOENIX_ZERO_SEMANTIC_LEDGER_ENABLED`
- `PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CAPABILITIES`

Por endpoint:

- `PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_GATE`
- `PHOENIX_ZERO_AGENT_GOVERNANCE_ENFORCE_GATE`

- `PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_EXECUTE`
- `PHOENIX_ZERO_AGENT_GOVERNANCE_ENFORCE_EXECUTE`
- `PHOENIX_ZERO_AGENT_IDENTITY_STRICT`

- `PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_IDENTITY`
- `PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_EVENTS`

## Smoke test (o mínimo para validar em 5 minutos)
1. `GET /api/agents/:id/gate`
2. `POST /api/agents/:id/execute`
3. `GET /api/agents/:id/identity`
4. `GET /api/agents/:id/events?limit=5`

## Status
Documento criado para uso como:

- One-pager técnico
- Texto base para landing page / pitch
- Checklist de staging/go-live
