# PPE — Agent Examples (External)

Este documento fornece **exemplos mínimos** de consumo HTTP da API PPE, com foco em agentes externos.

Base:

- `https://phoenix-zero-web.onrender.com`

## 1) Fluxo canônico (Agent Happy Path)

- `GET /.well-known/ai-service.json`
- (Opcional) `GET /api/capabilities`
- `GET /api/pricing`
- `POST /api/compatibility`
- `POST /api/checkout/create` (requer `x-api-key` de tenant)
- `POST /api/agents/{agentId}/execute` (requer `x-api-key` de tenant)

Observação importante:

- Discovery/pricing/docs/compatibility são públicos.
- Checkout/execution são **tenant‑scoped** e exigem `x-api-key`.

## 2) Onde estão os exemplos no repo

- `docs/pay-per-execution/agent-examples/curl/agent.sh`
- `docs/pay-per-execution/agent-examples/langgraph/agent.py`
- `docs/pay-per-execution/agent-examples/crewai/agent.py`

## 3) Como rodar (curl)

Pré‑requisitos:

- `curl`

Variáveis:

- `PHOENIX_ZERO_BASE_URL` (default: Render)
- (Opcional) `PHOENIX_ZERO_TENANT_API_KEY` para checkout/execute

Exemplo:

```bash
export PHOENIX_ZERO_BASE_URL=https://phoenix-zero-web.onrender.com
# export PHOENIX_ZERO_TENANT_API_KEY=pz_...
./docs/pay-per-execution/agent-examples/curl/agent.sh
```

## 4) Como rodar (Python)

Pré‑requisitos:

- Python 3.10+
- `pip install requests`

Exemplo:

```bash
export PHOENIX_ZERO_BASE_URL=https://phoenix-zero-web.onrender.com
python docs/pay-per-execution/agent-examples/langgraph/agent.py
python docs/pay-per-execution/agent-examples/crewai/agent.py
```

## 5) Checklist do “blind agent” (sem contexto)

- Consegue descobrir via `/.well-known/ai-service.json`
- Consegue obter pricing via `/api/pricing`
- Consegue avaliar compatibilidade via `POST /api/compatibility`
- Se tiver tenant key:
  - Consegue criar checkout via `/api/checkout/create`
  - Entende bloqueio via `PPO_GATE_BLOCKED` antes do pagamento
  - Consegue executar após pagamento confirmado
