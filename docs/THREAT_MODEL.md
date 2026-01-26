# Threat Model (Phoenix Zero — Agentic Payments)

## Escopo

Este documento cobre as superfícies de ataque e principais ameaças do fluxo agentic:

- Webhooks de pagamento (ex.: PIX/Asaas)
- Geração/validação de PPOs (Payment Proof Objects)
- Ledger determinístico e `rootHash`
- Settlement (liquidação), slashing, escrow, reputação
- Endpoints admin e agent

Fora do escopo (por enquanto):
- Hardening de infra (WAF, rate limiting de edge, HSM)
- Persistência com integridade criptográfica (ex.: append-only log, merkle on disk)

---

## Ativos a proteger

- **Fundos / crédito de agentes**
- **Integridade do ledger** (não permitir “saldo do nada”)
- **Autenticidade de eventos externos** (webhooks)
- **Autorização de ações administrativas** (advance/revert/slashing/escrow)
- **Disponibilidade do sistema** (evitar DoS lógico via replays)

---

## Fronteiras de confiança

- **Internet -> `/api/webhooks/*`**
- **Operador/admin -> `/api/admin/*`** (token)
- **Agente -> `/api/agents/*`** (gate + escopo)
- **Processo do servidor -> `.pz-tmp/*`** (persistência local)

---

## Ameaças principais e respostas

### 1) Forgery de webhook (token inválido)

- **Ataque**: atacante chama endpoint de webhook simulando provedor.
- **Impacto**: gerar PPO indevido / avançar estado de pagamento.
- **Mitigação**:
  - Quando `ASAAS_WEBHOOK_SECRET` está setado, o webhook valida `asaas-access-token` e retorna `401` se inválido.
  - Teste coberto: L3 (forgery).
- **Risco residual**:
  - Em dev, se o secret não estiver setado, o endpoint pode aceitar requisições (conveniência de dev). Em produção isso deve ser bloqueado.

### 2) Replay de webhook (mesmo evento repetido)

- **Ataque**: reenvio do mesmo payload/evento várias vezes.
- **Impacto**: duplicar PPO, duplicar settlement, inflar saldo.
- **Mitigação**:
  - Idempotência por `sourceEventId` (ou equivalente) no pipeline de atualização de status.
  - Stores de PPO/settlement desenhadas para não duplicar entradas.
  - Teste coberto: L3 (replay/idempotência) e testes de settlement.

### 3) Bypass do PPO Gate (executar sem prova)

- **Ataque**: chamar endpoint de execução sem PPO válido.
- **Impacto**: execução sem “pagamento confirmado”.
- **Mitigação**:
  - `executeWithPPOGate()` aplica o gate server-side.
  - Endpoint de execução deve retornar `403`/negação sem PPO.
  - Teste coberto: suite agentic (gate).

### 4) Forjar reputação / ledger root hash

- **Ataque**: tentar alterar “histórico” de provas/ledger para ganhar reputação.
- **Impacto**: confiança indevida, limites liberados.
- **Mitigação**:
  - Ledger e `rootHash` determinísticos (função pura do histórico ordenado).
  - Auditoria pode recomputar localmente.
- **Risco residual**:
  - Se persistência local for adulterada (acesso ao disco), o sistema precisa de hardening (assinaturas/append-only) para resistir a ataque local.

### 5) Duplicação de settlement / advance duplo

- **Ataque**: chamar advance/revert repetidamente ou em corrida.
- **Impacto**: saldo inconsistente.
- **Mitigação**:
  - Engine de settlement com operações idempotentes.
  - Endpoints admin protegidos por token.
  - Teste coberto: L13+.

### 6) Abuso de endpoints admin (token vazado)

- **Ataque**: alguém obtém `PHOENIX_ZERO_ADMIN_TOKEN`.
- **Impacto**: criar tenants, avançar/reverter settlement, slashing indevido.
- **Mitigação**:
  - Segredo não commitado; rotação imediata ao suspeitar vazamento.
  - Em produção, preferir secret manager + RBAC + auditoria.
- **Risco residual**:
  - Token único é simples; pode evoluir para multi-tenant RBAC e expiração.

---

## Assunções

- O processo do servidor é confiável (sem malware local).
- Segredos são gerenciados fora do git.
- Eventos externos relevantes possuem IDs estáveis para idempotência.

---

## Roadmap de hardening (curto)

- **Rate limiting** em endpoints de webhook.
- **Audit log** de decisões críticas (create PPO, advance settlement, slashing).
- **Persistência tamper-evident** (hash chain / merkle / assinatura).
