# PPE — Go‑Live Contract (API pública)

Este documento define o **contrato operacional explícito** do Phoenix Zero PPE no go‑live.

Objetivo:

- remover ambiguidades para integrações de clientes/agentes
- reduzir suporte ("isso é bug" vs "isso é comportamento esperado")
- proteger o produto contra integrações que assumem padrões errados

## 1) Criação de checkout — `POST /api/checkout/create`

- **Não é idempotente.**
- Cada request **bem‑sucedida** cria um novo `paymentId`.

Regras para clientes:

- Clientes **não devem** aplicar retry automático cego em `POST /api/checkout/create`.
- Em timeout/erro de rede:
  - trate como **indeterminado**
  - e resolva manualmente ou via reconciliação (ex.: checando o provedor/checkout URL) conforme seu fluxo.

## 2) Status de pagamento — `GET /api/checkout/status?paymentId=...`

Estados possíveis (alto nível):

- `pending`
- `paid`
- `failed`

Notas operacionais:

- `pending` pode persistir por tempo indeterminado (latência de provedor + webhooks + cold start).
- O backend pode revalidar com o provedor de forma **eventual** (não é sincronismo forte).

Finalidade:

- **`failed` é final no go‑live.**
- Transições `failed -> paid` são ignoradas por design.

## 3) Webhooks (PIX/Asaas e Crypto/NowPayments)

- Eventos são deduplicados por `eventId` do provedor.
- Ordem de entrega não é garantida.
- Retentativas do provedor são esperadas.

## 4) Gate econômico — `GET /api/agents/{agentId}/gate`

- Retorna **HTTP 200** mesmo quando a execução está bloqueada.
- O bloqueio/liberação é expresso pelos campos do JSON:
  - `allowed: true | false`
  - `reason`

Clientes **não devem** inferir permissão pela semântica do HTTP status.

## 5) Execução — `POST /api/agents/{agentId}/execute`

Semântica:

- `403` com `reason: "PPO_GATE_BLOCKED"` → execução bloqueada (não pago / policy)
- `500` com `reason: "EXECUTE_FAILED"` → falha interna de execução

Retries:

- `403` **não deve** ser retry.
- `500` pode ser retry a critério do cliente.

## 6) Semântica de erros (compatibilidade)

- Mensagens livres como `reason`/`error` são **descritivas**, não contratos rígidos.
- Clientes **não devem** fazer lógica de negócio baseada em strings de erro.

## 7) Expectativas de ambiente

- O serviço pode sofrer cold start e atrasos de processamento.
- Pagamentos podem levar tempo para refletir (por design operacional, não necessariamente defeito).

## 8) Escopo do go‑live

- PIX/Asaas: suportado.
- Crypto/NowPayments: suportado se anunciado; caso contrário tratar como beta/experimental.
