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
- `npx tsx ./scripts/external-agent-client.ts --baseUrl https://phoenix-zero-web.onrender.com`
