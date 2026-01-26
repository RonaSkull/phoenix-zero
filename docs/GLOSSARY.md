# Glossary (Phoenix Zero)

- **Agent**
  - Identidade que executa ações e acumula histórico econômico.

- **Tenant**
  - Isolamento lógico (ambiente/cliente) para agentes e configurações.

- **PaymentIntent**
  - Objeto de intenção de pagamento; transita estados (ex.: `pending` -> `paid`).

- **Webhook**
  - Callback do provedor de pagamento para informar mudanças de estado.

- **PPO (Payment Proof Object)**
  - Prova persistida de que um pagamento foi confirmado (`paid`) e aceito pelo sistema.

- **Ledger**
  - Registro auditável e determinístico de PPOs e efeitos econômicos.

- **Root hash (`rootHash`)**
  - Hash determinístico do estado/registro, usado para auditoria e verificação externa.

- **PPO Gate**
  - Mecanismo de autorização server-side que bloqueia execução se o agente não tem provas/saldo suficientes.

- **Settlement**
  - Processo de liquidação: separa “pagamento confirmado” de “saldo liquidado/usable”, com regras e reversões.

- **Advance / Revert (Settlement)**
  - Operações administrativas para avançar ou reverter liquidações.

- **Antifraud**
  - Camada de eventos/regras para detecção de abuso e decisões de risco.

- **Slashing**
  - Penalização aplicada a um agente (redução/penalidade econômica) por comportamento indevido.

- **Escrow**
  - Reserva/bloqueio de parte do saldo (ex.: até passar uma janela de contestação).

- **Idempotência**
  - Propriedade onde repetir o mesmo evento não muda o resultado depois da primeira aplicação.
