# Security Checklist (Phoenix Zero)

## Secrets

- [ ] Segredos não são commitados (`.env.local`, tokens, API keys)
- [ ] Segredos são rotacionados ao menor sinal de vazamento
- [ ] Produção usa secret manager (ex.: Render/Cloud secrets) e não arquivos locais

## Webhooks

- [ ] Webhook exige autenticação/assinatura quando configurado (`ASAAS_WEBHOOK_SECRET`)
- [ ] Webhook é idempotente (replay não duplica efeitos)
- [ ] Logs de webhook não imprimem tokens nem payloads sensíveis

## AuthZ / Admin

- [ ] Endpoints `/api/admin/*` exigem `PHOENIX_ZERO_ADMIN_TOKEN`
- [ ] Token admin tem controle de acesso (ideal: RBAC, expiração, rotação)
- [ ] Ações críticas (advance/revert/slashing) geram audit trail

## Integridade contábil

- [ ] PPO/ledger/settlement preservam invariantes de não-duplicação
- [ ] Operações repetidas são idempotentes
- [ ] É possível recomputar `rootHash` a partir do histórico

## Persistência

- [ ] `.pz-tmp/*` é usado só para dev/test
- [ ] Produção migra para storage transacional + estratégia tamper-evident

## Observabilidade

- [ ] Logs sanitizados (sem secrets)
- [ ] Métricas/alertas para picos de webhook, falhas 401/403, replays
