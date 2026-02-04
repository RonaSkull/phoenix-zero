# Phoenix Zero — Agent Simulations

Esta pasta contém um harness **externo** (fora do backend) para simular compradores reais (agent-native) contra a API pública do Phoenix Zero PPE.

## Requisitos

- Node >= 20

## Setup

1) Instale dependências:

- `npm install`

2) Configure variáveis (PowerShell):

- `$env:PHOENIX_ZERO_BASE_URL='https://phoenix-zero-web.onrender.com'`

Opcional (para simular confirmação de pagamento via webhook):

- `$env:ASAAS_WEBHOOK_SECRET='...'`
- `$env:NOWPAYMENTS_IPN_SECRET='...'`

## Rodar simulações

- `npm run sim`

Saídas são gravadas em `./out/`.

## Rodar MCP wrapper (adapter local)

Este wrapper expõe tools MCP via stdio e chama o REST existente.

- `npm run mcp`

Configuração do target:

- `PHOENIX_ZERO_BASE_URL` (default: Render)

Observação: isso é um **adapter local**, não é feature do backend.
