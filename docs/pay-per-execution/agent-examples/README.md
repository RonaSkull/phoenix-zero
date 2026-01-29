# PPE — Agent Examples

Minimal agent-facing examples for Phoenix Zero PPE.

Base URL:

- `https://phoenix-zero-web.onrender.com`

## Run (curl)

```bash
export PHOENIX_ZERO_BASE_URL=https://phoenix-zero-web.onrender.com
# export PHOENIX_ZERO_TENANT_API_KEY=pz_...
./curl/agent.sh
```

## Run (python)

```bash
pip install requests
export PHOENIX_ZERO_BASE_URL=https://phoenix-zero-web.onrender.com
python ./langgraph/agent.py
python ./crewai/agent.py
```
