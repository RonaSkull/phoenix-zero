# PPE/Sovereign — checklist aplicado (37 endpoints)

Este arquivo é um checklist **executável** do que foi feito para fechar o fluxo PPE/Sovereign para go-live.

Nota: este arquivo já conteve um grande bloco de texto redundante (estilo log/sessão). Esse conteúdo foi removido intencionalmente para virar um checklist limpo. Isso **não removeu código** e o conteúdo anterior continua recuperável via histórico do Git.

Para a documentação completa (com payloads e separação AI agents vs enterprise), use:

- `docs/SOVEREIGN_ENDPOINTS_USECASES.md`
- `docs/SOVEREIGN_PPE_RUNBOOK.md`

---

## 1) Signup machine-friendly (AI agents)

- **Implementado**: `POST /api/public/agent-signup`
- **Mudança**: só requer `acceptsTermsVersion` + `acceptsFixedPricing`
- **Campos opcionais (roteamento interno)**:
  - `isAutonomousClient: boolean`
  - `expectedExecutionRate: low|medium|high`
  - `needsExecutionAuthorization: boolean`
  - `needsProofAutomation: boolean`
- **Persistência**: hints salvos no Tenant record.

---

## 2) Enterprise intake (Sovereign)

- **Implementado**: `POST /api/public/sovereign-signup`
- **Comportamento**: intake enterprise (não cria tenant), retorna `status=pending_review`.
- **useCase**: validado via whitelist + `useCaseNormalized`.

---

## 3) Remoção de “fiat” das superfícies públicas

- **Implementado**: remoção/ocultação de `settle_crypto_fiat` em:
  - `/api/pricing`
  - `/api/compatibility`
  - `/api/agents/[agentId]/execute`

---

## 4) Webhooks idempotentes: PIX unknown mapping fails safely

- **Implementado**: `POST /api/webhooks/pix` retorna `200` + `ignored:true` quando `providerPaymentId` não mapeia para um PaymentIntent.
- **Motivo**: evitar retries infinitos do provider e manter idempotência.

### Verificação em produção
- **Render health**:
  - `GET https://phoenix-zero-web.onrender.com/api/health`
  - commit: `5f968c234b72c63f211e64ba1701402b153be465`
- **Teste automatizado**:
  - `L4` passou contra Render via `scripts/agentic-stress-e2e.ps1`.

---

## 5) Harness E2E (agentic-stress)

- **Implementado**:
  - `scripts/agentic-stress-e2e.ps1` carrega `.env.local` quando presente.
  - `-OnlyLevels` é respeitado também no modo deterministic (seta `AGENTIC_STRESS_ONLY`).
- **Correções de contrato**:
  - `checkoutCreate` sempre envia `proofMeta.taskId` quando `proofMeta` existe.
  - `L2S` provisiona contrato sovereign via admin API antes do `execute`.

---

## 6) Documentos “fonte de verdade”

- **Contratos/payloads/catálogo**: `docs/SOVEREIGN_ENDPOINTS_USECASES.md`
- **Operação real (NowPayments crypto)**: `docs/SOVEREIGN_PPE_RUNBOOK.md`
