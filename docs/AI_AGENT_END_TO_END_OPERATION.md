# Phoenix Zero — AI Agent End-to-End Operation (Discovery → Checkout → Gate → Execute → Verify)

## 0) Objetivo
Este documento descreve como **agentes de IA** (LLMs, planners, executors) podem descobrir e operar o Phoenix Zero de ponta a ponta, de forma autônoma, usando apenas endpoints públicos + tenant-scoped.

Ele também lista o que já está pronto no produto para agentes e quais são os invariantes que um agente deve respeitar.

---

## 1) Estado atual: a plataforma está “agent-ready”?
Sim, para a camada PPE (Pay-Per-Execution) o sistema já expõe um protocolo de descoberta e contratos HTTP próprios para agentes:
- `/.well-known/ai-service.json` (descoberta canônica)
- `/api/capabilities` (resumo machine-friendly)
- `/api/pricing` (catálogo de operations)
- `/api/compatibility` (intent → operation)
- `/api/docs/*` (contratos em Markdown/HTML)

Isso é exatamente o tipo de superfície que agentes conseguem consumir sem contexto humano.

O que **não** é automaticamente “agent-ready” por si só:
- obtenção inicial de `x-api-key` (onboarding/emitir chave) depende do fluxo de provisionamento do tenant.

---

## 2) Discovery (sempre começar por aqui)
### 2.1 Endpoint canônico
`GET /.well-known/ai-service.json`

Ele retorna:
- `serviceId`
- `protocolVersion`
- endpoints relevantes
- `auth` model
- `pricing` model

### 2.2 Capabilities
`GET /api/capabilities`

Esse endpoint é ideal para agentes, porque declara explicitamente:
- rotas públicas vs tenant-scoped
- headers de auth
- endpoints de docs
- idempotência

---

## 3) Seleção de operação (sem adivinhar)
### 3.1 Catálogo canônico
`GET /api/pricing`

Regras para agentes:
- se uma operation não existe aqui, é **fora do escopo**.
- agentes não devem inferir preços.

### 3.2 Intent mapping
Se o agente tem intenção mas não tem certeza da operation:
`POST /api/compatibility`

O agente deve:
- enviar intenção e a operation candidata
- aceitar `compatible: false` como resposta válida
- usar `suggestions` (se presente) para ajustar

---

## 4) Execução econômica (PPO model)
Phoenix Zero usa um modelo de prova de pagamento (“PPO”) como **binding de execução**.

Conceito operacional:
- “Pagar” cria um saldo liberador de execuções.
- `gate` é o controle econômico.
- `execute` consome unidades de forma atômica.

---

## 5) Fluxo end-to-end para um agente (pseudocódigo)
### 5.1 Entrada mínima que o agente precisa
- `baseUrl`
- `x-api-key` (tenant)
- `agentId` (identificador do agente executor)
- `taskId`, `taskType`
- `taskInputHash`, `taskOutputHash`
- operação e units

### 5.2 Pseudocódigo
```text
1) GET /.well-known/ai-service.json
2) GET /api/capabilities
3) GET /api/pricing
4) (opcional) POST /api/compatibility
5) POST /api/checkout/create   (x-api-key + x-idempotency-key)
6) aguardar pagamento (poll GET /api/checkout/status?paymentId=...)
7) GET /api/agents/{agentId}/gate?taskId=...&taskType=...
8) POST /api/agents/{agentId}/execute
9) GET /api/guarantee-proofs/{proofId}
10) retornar verify URL /verify/{proofId}
```

---

## 6) Guardrails que agentes devem respeitar
- **Idempotência**:
  - sempre usar `x-idempotency-key` em `checkout/create`.
- **Rate limiting**:
  - respeitar `429` e `Retry-After`.
- **Binding**:
  - `agentId/taskId/taskType` precisam ser consistentes entre checkout, gate e execute.
- **Sem execução sem pagamento**:
  - se gate bloqueia, o agente deve encerrar/aguardar e não insistir em execute.

---

## 7) Recomendação para “agent-first onboarding”
Se você quer que agentes externos consigam operar do zero, sem humanos:
- fornecer um endpoint público de signup (com políticas de risco) que retorne `x-api-key`.

Antes de abrir isso, recomenda-se:
- thresholds de risco
- limites de RPM
- restrições de units por período
- observabilidade e alertas

---

## 8) O que as landing pages precisam para serem encontradas/consumidas por agentes
Para agentes, páginas HTML só ajudam se tiverem:
- links estáveis para endpoints canônicos
- conteúdo machine-readable (ex.: JSON-LD)

Recomendação:
- adicionar um bloco “AI Agent Integration” com links para:
  - `/.well-known/ai-service.json`
  - `/api/capabilities`
  - `/api/pricing`
  - `/api/docs/agent-integration-contract`
  - `/api/docs/go-live-contract`

- incluir JSON-LD com esses links.
