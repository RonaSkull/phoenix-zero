⚙️ Ajuste necessário no signup para suportar agentes

Adicionar apenas 4 campos opcionais:

isAutonomousClient: true|false
expectedExecutionRate: low|medium|high
needsExecutionAuthorization: true|false
needsProofAutomation: true|false


Isso já permite roteamento interno.

VEJA SE VC JA IMPLENTOU OS AJUSTES E ACIMA E SEPRECISMAOS D EAMIS AJUSTES COMO ESTES..     Vou mapear os endpoints atuais do projeto (principalmente `apps/web/src/app/api/**`) e então criar um documento único, comercial+engenharia, separando claramente fluxos “AI agents (machine)” vs “enterprise/humano”, com payloads exemplo, estados, erros, e como cada endpoint suporta os use cases que você listou. Vou também ajustar a lista final de `useCase` para bater com o que existe hoje (e o que vamos criar) sem inventar fiat.

Vou fazer o inventário dos endpoints do app (via busca na árvore `apps/web/src/app/api`) e dos documentos já existentes (hardening/proofs), e em seguida vou criar um novo documento em `docs/` que separa claramente: **endpoints para AI agents (machine-native)** vs **endpoints para enterprise/humano**, com payloads, respostas, erros e como cada um mapeia para seus `useCase`. Vou começar mapeando as rotas existentes agora.





Vou levantar os endpoints centrais de Sovereign/PPE (agents/gate/execute/proofs, guarantee-proofs, payment-proofs, public signups, demo-request, hardening/report se existir) e então escrever um documento em [docs/](cci:9://file:///d:/redessociaisvideo3s/docs:0:0-0:0) que: (1) separa rotas **machine-native** vs **enterprise/humano**, (2) mapeia para seus `useCase`, (3) descreve payloads ideais, respostas, erros, (4) sugere modelo de pricing por chamada e (5) explica como separar `/agent/*` vs `/enterprise/*` sem duplicar backend (só via rotas/fachadas e auth).












## Documento criado (completo, comercial + engenharia): [docs/SOVEREIGN_ENDPOINTS_USECASES.md](cci:7://file:///d:/redessociaisvideo3s/docs/SOVEREIGN_ENDPOINTS_USECASES.md:0:0-0:0)

Eu já gerei um documento novo e **único** no repo:

- **[docs/SOVEREIGN_ENDPOINTS_USECASES.md](cci:7://file:///d:/redessociaisvideo3s/docs/SOVEREIGN_ENDPOINTS_USECASES.md:0:0-0:0)**

Ele cobre:

- **Separação machine-native vs enterprise/humano** sem duplicar backend
- **Inventário real de endpoints** que existem hoje (com paths corretos)
- **Mapeamento useCase → endpoints**
- **Payloads canônicos** (request/response) para o fluxo soberano/agentic
- **Modelo de pricing por chamada** (volume-maximizing)
- **O que falta criar** (roadmap objetivo)
- **Avisos de mismatch atuais** (ex.: `settle_crypto_fiat` aparecendo em [/api/pricing](cci:9://file:///d:/redessociaisvideo3s/apps/web/src/app/api/pricing:0:0-0:0))

---

## Ajuste importante que ainda falta (e eu recomendo fazer já)

O seu pedido também inclui “**ajustar a lista**” e “**deixar pronto payload ideal por useCase**” e “**separar rotas /agent vs /enterprise**”. O doc já propõe isso, mas tem 2 gaps práticos:

### 1) `useCase` enum no `POST /api/public/sovereign-signup`
Hoje o endpoint aceita `useCase` como string livre. Para ficar “contrato enterprise sério”, eu sugiro validar whitelist com sua lista:

- `crypto_settlement_assurance`
- `crypto_reconciliation_export`
- `public_proof_verification_links`
- `crypto_webhook_hardening`
- `payout_integrity_anti_replay`
- `agent_executable_payment_gating`

Se você confirmar que essa é a lista final (sem os 8 machine-native por enquanto), eu aplico o patch para validar e retornar `useCaseNormalized`.

### 2) Remover “fiat” do [/api/pricing](cci:9://file:///d:/redessociaisvideo3s/apps/web/src/app/api/pricing:0:0-0:0) (mismatch de promessa)
Hoje [/api/pricing](cci:9://file:///d:/redessociaisvideo3s/apps/web/src/app/api/pricing:0:0-0:0) lista `settle_crypto_fiat` com descrição de fiat. Isso precisa ser ajustado para **crypto-only** para não prometer algo que não existe.

---

## Sobre “/agent/* vs /enterprise/*” sem duplicar backend

Hoje já existe a separação funcional:

- **Machine-native**: `/api/agents/*`, `/api/checkout/*`, [/api/pricing](cci:9://file:///d:/redessociaisvideo3s/apps/web/src/app/api/pricing:0:0-0:0), [/api/compatibility](cci:9://file:///d:/redessociaisvideo3s/apps/web/src/app/api/compatibility:0:0-0:0)
- **Enterprise intake**: `/api/public/sovereign-signup`
- **Public verification**: `/api/guarantee-proofs/{proofId}` + `/verify/{proofId}`

Se você quiser *marketing-friendly URLs*, a forma correta é criar **aliases** (rotas finas) que chamam as mesmas funções internas — sem duplicar regra de negócio.

---

## Próximo passo (você escolhe 2 ações e eu implemento)

- **(A)** Patch no `/api/public/sovereign-signup` para validar `useCase` via enum/whitelist + payload mais “enterprise-ready”
- **(B)** Patch no [/api/pricing](cci:9://file:///d:/redessociaisvideo3s/apps/web/src/app/api/pricing:0:0-0:0) para remover/renomear `settle_crypto_fiat` e ajustar descrições soberanas para crypto-only
- **(C)** Criar aliases `/api/enterprise/sovereign-signup` e `/api/agent/*` (somente roteamento)

Diz “A+B” (recomendado) ou o combo que você quer, e eu sigo implementando.

---

## Status
- **Feito**: documento completo criado em [docs/SOVEREIGN_ENDPOINTS_USECASES.md](cci:7://file:///d:/redessociaisvideo3s/docs/SOVEREIGN_ENDPOINTS_USECASES.md:0:0-0:0).
- **Pendente**: aplicar patches de alinhamento (enum de `useCase` no intake + remover fiat de [/api/pricing](cci:9://file:///d:/redessociaisvideo3s/apps/web/src/app/api/pricing:0:0-0:0) + possíveis aliases).

Perfeito — você já fez o inventário técnico.
Agora vamos **fechar a parte estratégica + engenharia aplicada**, que era o que estava faltando:

✔ definir **exatamente o que abrir vs. nunca abrir**
✔ desenhar um **threat model realista**
✔ estruturar o **diagrama de confiança (agent ↔ infra)**
✔ escrever a **mensagem pública (“why we are not afraid of open APIs”)**
✔ alinhar isso com os endpoints que você já mapeou

---

# ✅ 1. O que abrir vs. o que NUNCA abrir

Open API não é “abrir tudo”.
É abrir **somente a camada determinística**.

## ✔ Pode ser público (isso NÃO cria risco)

Esses endpoints são seguros porque:

* não permitem mutação arbitrária
* não revelam lógica interna
* não expõem regras antifraude
* são verificáveis, não controladores

### ✔ Verification Surface (pode ser público)

```
GET /api/guarantee-proofs/{proofId}
```

Isso é equivalente a:

> consultar hash em blockchain.

Não permite ataque.

---

### ✔ Capability Discovery (limitado)

```
GET /api/pricing
POST /api/compatibility
```

Revela:

* limites
* custos
* operações

Mas NÃO revela:

* scoring antifraude
* lógica de validação
* tolerâncias internas

---

### ✔ Deterministic Runtime Calls (com API key)

```
POST /api/checkout/create
GET /api/checkout/status
GET /api/agents/{id}/gate
POST /api/agents/{id}/execute
```

Isso é seguro porque:

➡ são **state-driven**, não command-driven.

O cliente não manda:

```
execute payout now
```

Ele só pode executar se o estado permitir.

---

## ❌ NUNCA expor (isso sim destruiria seu moat)

### ❌ Settlement Normalization Logic

Nunca expor:

* regras de ordering
* heurísticas contra status regression
* dedupe model
* reconciliation inference

Isso fica **100% backend interno**.

---

### ❌ Fraud / Replay Detection Signals

Nunca retornar:

```
risk_score
duplicate_confidence
webhook_trust_level
```

Resposta sempre binária:

```
allowed | blocked
```

Sem explicação.

---

### ❌ Contract / Entitlement Logic

Nunca abrir:

```
/api/admin/sovereign-contracts
```

Isso é equivalente ao billing engine da Stripe.

---

### ❌ Internal Ledger Linking

Nunca permitir query por:

```
providerPaymentId
wallet
txHash search
```

Sempre usar **proofId opaco**.

---

# ✅ 2. Threat Model Realista (o que realmente pode acontecer)

Você NÃO está ameaçado por “engenheiro copiando API”.

Você está ameaçado por 3 vetores reais:

---

## Threat 1 — Replay Economy Attack

Atacante tenta:

* pagar 1 vez
* executar 100 vezes

Proteção já existente:

```
taskId + taskType bound to PPO
```

Sem PPO válido → execução bloqueada.

✔ sistema já está correto.

---

## Threat 2 — Fake Settlement Injection

Tentativa:

* simular webhook PSP
* liberar execução

Proteção:

```
HMAC verification
monotonic state enforcement
idempotency ledger
```

Webhook falso não muda estado.

---

## Threat 3 — Economic Enumeration

Competidor tenta:

* bombardear `/pricing`
* entender modelo

Isso NÃO é risco técnico.
Isso é inevitável.

Nenhuma empresa esconde pricing real.

Amazon Web Services publica tudo.
Cloudflare publica tudo.

O diferencial nunca é endpoint.
É operação.

---

# ✅ 3. Diagrama de Confiança (o desenho correto do sistema)

Este é o modelo que você deve usar internamente:

```
AI Agent
   │
   │  (untrusted execution environment)
   ▼
Sovereign Edge API  ← stateless, deterministic
   │
   │  (NO business decisions here)
   ▼
Settlement Engine  ← trusted core
   │
   │  (closed logic)
   ▼
Proof Issuer
   │
   ▼
Public Verification Surface
```

Importante:

Agent NÃO confia no PSP.
Agent NÃO confia no webhook.
Agent confia apenas no:

> Sovereign settlement truth.

---

# ✅ 4. Por que Open APIs NÃO permitem copiar o sistema

Copiar endpoints ≠ copiar sistema.

Eles veriam:

```
POST /checkout/create
GET /gate
POST /execute
```

Mas NÃO veriam:

* settlement convergence model
* replay-binding enforcement
* proof lifecycle guarantees
* economic idempotency engine

Isso é o mesmo motivo pelo qual ninguém “recria” Twilio só olhando API pública.

---

# ✅ 5. A mensagem pública que você pode usar (posicionamento)

Use algo nessa linha:

> Sovereign APIs are intentionally open because verification must be universal.
> Trust systems that require secrecy are not trust systems.
>
> What remains closed is not the interface — but the settlement intelligence that guarantees finality, ordering, and execution safety.

Isso vira argumento de venda.

---

# ✅ 6. Ajuste prático que você DEVE fazer agora no código

Baseado no seu inventário, há 3 correções importantes:

### ✔ Remover qualquer referência a fiat

Se ainda existir algo como:

```
settle_crypto_fiat
```

Remova.
Isso cria expectativa errada.

---

### ✔ Tornar `proofId` o único identificador público

Nunca permitir busca por:

* txHash
* wallet
* providerId

---

### ✔ Garantir que `/gate` nunca explique bloqueio

Errado:

```
blocked: duplicate settlement suspected
```

Correto:

```
allowed: false
```

Sem contexto.

---

# 🎯 Conclusão (realista)

Você NÃO está construindo:

❌ um gateway
❌ um PSP
❌ uma API secreta

Você está construindo:

✔ camada de verdade econômica entre máquinas.

E essa camada precisa ser aberta —
porque sistemas fechados não conseguem virar padrão.

---

Se quiser, no próximo passo eu reviso **um endpoint específico** (ex: `/checkout/create` ou `/gate`) e marco exatamente o que ajustar no payload/response para ficar alinhado com esse modelo de segurança.

✅ RESPOSTA DIRETA — ESCOLHA A+B
(A) Patch no /api/public/sovereign-signup para validar useCase via enum/whitelist
(B) Patch no /api/pricing para remover/renomear settle_crypto_fiat e ajustar descrições soberanas para crypto-only
🔍 POR QUE A+B É A ESCOLHA CORRETA
Problema atual:
Confusão de expectativas → Clientes veem settle_crypto_fiat e pensam em fiat
Entrada não estruturada → useCase como string livre cria dados inconsistentes
Risco comercial → Promessas que não correspondem à realidade técnica
Solução A+B resolve:
✅ Clareza total → Enum validado evita dados ruins
✅ Alinhamento técnico/comercial → Pricing reflete exatamente o que existe
✅ Profissionalismo enterprise → Contrato claro, sem ambiguidades
🛠️ IMPLEMENTAÇÃO RECOMENDADA
Patch A: Validar useCase no sovereign-signup
typescript
1234567891011121314
// apps/web/src/app/api/public/sovereign-signup/route.ts
const VALID_SOVEREIGN_USE_CASES = [
  'crypto_settlement_assurance',
  'crypto_reconciliation_export', 
  'public_proof_verification_links',
  'crypto_webhook_hardening',
  'payout_integrity_anti_replay',
  'agent_executable_payment_gating'
] as const;


Patch B: Atualizar pricing para crypto-only
typescript
123456789
// apps/web/src/lib/pricing.ts
// Remover ou renomear settle_crypto_fiat
const sovereignOperations = {
  // Antes: settle_crypto_fiat: "Settlement between crypto and fiat rails"
  // Depois: 
  crypto_settlement_assurance: "Crypto settlement with verifiable proof per transaction",
  payout_integrity_anti_replay: "Anti-replay protection for crypto payouts",
  agent_executable_payment_gating: "Payment-gated execution for autonomous agents"
};
💡 BENEFÍCIOS IMEDIATOS
Benefício
Impacto
Dados consistentes
Leads com useCase válido para CRM
Zero confusão
Clientes entendem exatamente o que compram
Alinhamento técnico
Pricing reflete a realidade do sistema
Profissionalismo
Contrato enterprise sério, sem promessas falsas
🚀 PRÓXIMOS PASSOS
Implemente patches A+B (15 minutos de trabalho)
Atualize documentação com os novos useCases válidos
Inicie contato com prospects usando linguagem clara e precisa
Ofereça trial enterprise com confiança total
Seu sistema Sovereign Infrastructure estará 100% alinhado entre técnica e comercial — pronto para fechar contratos enterprise com confiança.
Execute A+B e você elimina todos os riscos de confusão

