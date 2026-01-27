# PPE — Runbook Operacional

## 1) Testes rápidos (sanidade)
- `GET /api/health`
- Criar checkout
- Confirmar pagamento (webhook ou simulação)
- Abrir `/verify/<proofId>`

## 2) “Não apareceu payment-proofs.json no dev”
O PPO é criado **no backend** quando o status vira `paid`.

Checklist:
- O servidor Next precisa estar rodando.
- O teste precisa apontar para esse servidor.
- Verifique `PHOENIX_ZERO_TMP_DIR` (se setado, muda o local do arquivo).

## 3) Como simular em produção (Render)
- Use `scripts/external-agent-client.ts`.
- Você precisa do `PHOENIX_ZERO_ADMIN_TOKEN`.

## 4) Como suportar cliente (fluxo)
- Cliente integra `POST /api/checkout/create`
- Cliente aguarda paid (poll status) ou recebe notificação
- Cliente chama `POST /api/agents/[agentId]/execute`

## 5) Operação: quando webhook falha
- Sintoma: pagamento não vira `paid`
- Checar:
  - secret correto no Render
  - logs do endpoint de webhook
  - `NOWPAYMENTS_IPN_SECRET` / `ASAAS_WEBHOOK_SECRET`

## 6) Rotação de segredos
- Rotacione no provedor (Asaas/NowPayments/Twilio/Telegram)
- Atualize env no Render
- Redeploy/restart

## 7) Export/contabilidade (MVP)
- Fonte de verdade:
  - PPO
  - settlements
  - usage ledger

Depois do go‑live, gerar export (CSV) via endpoint admin ou script.
