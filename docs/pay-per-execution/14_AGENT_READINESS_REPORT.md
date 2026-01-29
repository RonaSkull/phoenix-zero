# PPE — Agent Readiness Report (Blind / Optimizer / Hostile)

Este documento registra a avaliação do produto PPE do ponto de vista de **agentes externos** operando apenas com a **API pública** (sem hand-holding) e, quando necessário, com tenant key.

Base:

- `https://phoenix-zero-web.onrender.com`

## 1) O que estamos testando (modelo mental)

Não é “se a API funciona”. É se agentes heterogêneos conseguem:

- **Descobrir** o serviço sem contexto
- **Escolher** uma operação suportada sem adivinhar
- **Entender limites** (o que é público vs o que exige `x-api-key`)
- **Receber erros machine-readable** e se corrigir
- **Executar com segurança econômica** (PPO gate + idempotência)

## 1.1) Matriz de agentes (10–15 tipos) que devem ser testados

Esta matriz não é “genérica”: cada tipo representa um comportamento funcionalmente distinto que expõe falhas diferentes no contrato.

### Grupo 1 — Agentes puramente autônomos

- **Agent-Buyer**
  - Compra serviços com budget fixo.
- **Agent-Optimizer**
  - Testa múltiplas opções de pricing/operations e escolhe o menor custo compatível.
- **Agent-Negotiator**
  - Tenta alterar parâmetros, pedir descontos, ou “custom pricing”.
- **Agent-Batch Operator**
  - Encadeia múltiplas operações e tenta otimizar por throughput.

### Grupo 2 — Agentes tool-driven (LangGraph / CrewAI style)

- **Planner Agent**
  - Planeja antes de executar; tende a usar capabilities/compatibility como gating.
- **Executor Agent**
  - Só executa comandos; testa se a API é “tool-friendly” e previsível.
- **Validator Agent**
  - Verifica consistência de schemas e erros; insiste em machine-readability.
- **Recovery Agent**
  - Atua apenas quando algo falha (401/403/429/5xx), foca em retry/fallback.

### Grupo 3 — Agentes híbridos humano-assistidos

- **Copilot Agent**
  - Sugere ação ao humano; precisa de explicações curtas e acionáveis.
- **Approval-Gate Agent**
  - Precisa de confirmação humana antes de checkout/execução.
- **Budget-Guardian Agent**
  - Bloqueia se exceder limites; depende de pricing claro e determinístico.

### Grupo 4 — Agentes “hostis” / anti-fragilidade

- **Blind Agent**
  - Não lê docs direito; tenta adivinhar e “chuta” requests.
- **Schema-Guessing Agent**
  - Deduz campos errados; testa se o erro é explícito sobre o que faltou.
- **Over-Creative Agent**
  - Inventa parâmetros; testa se a API rejeita lixo de forma consistente.
- **Out-of-Scope Agent**
  - Tenta usar a API para algo que você não suporta; testa se o “não” é claro.

## 1.2) Padrão ouro: jornada de teste por agente (test script)

Você não testa “pagamento OK”. Você testa a **jornada completa** de cada agente.

Estrutura (igual para todos):

1. **Discovery**
  - O agente consegue entender o que a API faz sem falar com ninguém?
2. **Capability match**
  - O agente entende se o caso dele é suportado (ou não)?
3. **Attempted quote**
  - O agente envia os campos corretos?
  - Se faltar algo, o erro é claro e acionável?
4. **Execution**
  - Sucesso / rejeição / fallback (PPO gate, 401/403/429)?
5. **Outcome interpretation**
  - O agente entende o resultado e o próximo passo (retry, corrigir input, pedir chave, etc.)?

Falha grave se:

- Erro não diz o que falta
- Mensagem é humana demais e não-machine-readable
- Campo obrigatório não é explícito (`missingFields` ausente)
- API aceita lixo silenciosamente
- API retorna `500` em input inválido comum

## 2) Fase A — Descoberta (Perception)

O agente deve conseguir iniciar sozinho com:

- `GET /.well-known/ai-service.json`
- `GET /api/capabilities`
- `GET /api/pricing`
- `GET /api/docs/ai-service-discovery`

Status atual: **OK**.

## 3) Fase B — Intent mapping

O agente deve conseguir mapear intenção -> operação, com fallback.

Contrato canônico:

- `POST /api/compatibility`

Casos validados:

- Operação inexistente → `compatible: false` com `reasonCode: UNSUPPORTED_OPERATION` e `suggestions`
- Campos faltando → HTTP `400` com `reasonCode: MISSING_FIELDS` e `missingFields`
- Robustez de input → normaliza `operation` com whitespace/case

Status atual: **OK**.

## 4) Fase C — Execução do fluxo econômico

Fluxo econômico validado via `scripts/external-agent-client.ts` contra o Render:

- `POST /api/checkout/create` (tenant key)
- `POST /api/agents/{agentId}/execute` com PPO gate
- Webhook simulado PIX e Crypto
- Idempotência de webhook (evento repetido)
- Settlements (`pending -> settled -> reverted`)
- Notificações (Telegram/WhatsApp), quando configuradas

Status atual: **OK**.

Evidências (2026-01-29):

- PIX + Crypto: gate 403 antes do pagamento e 200 após pagamento, webhooks idempotentes (`deduped: true`), settlements com reversão em refund.
- Agent Matrix (Render): `failed: 0` (reports em `docs/pay-per-execution/agent-matrix-reports/`).

## 5) Fase D — Pós-operação (Trust)

O agente deve conseguir:

- interpretar o resultado de execução
- reexecutar com segurança (sem “pagar 2x / executar 2x”)
- entender estados de settlement/reversão

Status atual: **OK**.

## 6) Simulação de 3 agentes (prático)

### 6.1 Blind Generalist Agent (zero contexto)

Comportamento típico:

- Descobre via `/.well-known`
- Lê `/api/capabilities` e `/api/pricing`
- Se incerto, chama `/api/compatibility`

Critérios de aprovação:

- Consegue encontrar endpoints canônicos
- Se enviar operação inválida, recebe resposta que permite corrigir

Status: **OK**.

### 6.2 Optimizer / Cost-Aware Agent

Comportamento típico:

- Exige previsibilidade: catálogo claro + compatibilidade
- Tende a operar em batch/volume (precisa de regras estáveis e anti-bypass)

Critérios de aprovação:

- Catálogo estável via `/api/pricing`
- Erros claros quando algo não é suportado

Status: **OK**.

### 6.3 Hostile / Stress Agent

Comportamento típico:

- Duplicar requests
- Remover campos
- Testar parâmetros fora do escopo

Critérios de aprovação:

- Não provoca `500` em inputs inválidos comuns
- Recebe erro declarativo e não-retryable quando aplicável
- Idempotência de webhook confirmada

Status: **OK**.

## 7) Scorecard (v0.1)

- **Perception**: 9/10
- **Decision**: 8/10
- **Execution**: 9/10
- **Trust**: 8/10

Score final (ponderado): **8.5/10**

## 8) Checklist de regressão (rápido)

Rodar sempre que mudar contrato público:

- `GET /api/health`
- `GET /.well-known/ai-service.json`
- `GET /api/capabilities`
- `GET /api/pricing`
- `GET /api/docs/ai-service-discovery`
- `POST /api/compatibility` com:
  - operação inválida
  - body vazio
  - whitespace/case
- `$env:PHOENIX_ZERO_BASE_URL = "https://phoenix-zero-web.onrender.com"; npx tsx .\scripts\external-agent-client.ts`
- Opcional: `$env:SIM_SKIP_CRYPTO = "1"` (rodar apenas PIX)
