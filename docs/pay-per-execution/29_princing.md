✅ AUDITORIA FINAL — ESTADO REAL DO SEU SISTEMA HOJE (2026-02-04)
Você está a 3 ajustes técnicos de go-live com agentes autônomos reais.
Não é "quase pronto" — é pronto com 3 correções mínimas que evitam falhas catastróficas em produção.
📊 ESTADO ATUAL — O QUE FUNCIONA 100% HOJE
Componente
Status
Comentário Técnico
PPO creation
✅ Funcional
ensurePaymentProofForIntent() cria PPO quando payment vira paid
Gate check
✅ Funcional
checkPaymentProofGate() bloqueia sem PPO válido
Unit consumption
✅ Funcional
tryConsumePaymentProofUnits({ units: 1 }) é atômico (KV lock)
Idempotência
✅ Funcional
x-idempotency-key previne duplicatas no checkout
Webhook dedupe
✅ Funcional
eventId evita processamento duplicado
Crypto payments
✅ Funcional
NowPayments + webhook → PPO criado → execução liberada
Quote binding
⚠️ Parcial
/api/pricing/quote existe mas não é obrigatório (deveria ser)
Agent signup
✅ Funcional
POST /api/public/agent-signup retorna x-api-key + agentId
⚠️ RISCOS CRÍTICOS — O QUE QUEBRA EM PRODUÇÃO (3 ajustes obrigatórios)
🔴 Risco 1: Multiplicadores client-controlled sem validação (undercharge)
O que acontece HOJE:
json
123456789
// Payload malicioso no checkout
{
  "lineItems": [{
    "operation": "protect_image",
    "units": 100,
    "plan": "enterprise",          // ← 0.7x discount SEM autorização
    "guaranteeWindow": "none"      // ← 0.95x discount SEM autorização
  }]
}
→ Sistema aplica descontos → cobra 30% a menos → você perde dinheiro.
Solução mínima (1 dia):
typescript
1234567891011121314
// lib/pricing.ts — adicionar validação server-side
function validateMultiplierContext(lineItem: LineItem, tenant: Tenant): ValidationResult {
  // Regra: só permite plan="enterprise" se tenant.tier === "enterprise"
  if (lineItem.plan === "enterprise" && tenant.tier !== "enterprise") {
    return { valid: false, reasonCode: "UNAUTHORIZED_PLAN", message: "Plan 'enterprise' requires enterprise-tier tenant" };
  }
  
  // Regra: só permite guaranteeWindow="none" se tenant.allowNoGuarantee === true
→ Resultado: Agente não consegue explorar descontos não autorizados. Você controla quem recebe desconto via tenant.tier.
🔴 Risco 2: PPO não criado por proofMeta incompleto ("paguei e não executei")
O que acontece HOJE:
json
123456789
// Checkout sem proofMeta completo
{
  "lineItems": [...],
  "proofMeta": {
    "agentId": "agent-123",
    "taskType": "protect_image"
    // ❌ FALTANDO: taskInputHash, taskOutputHash
  }
}
→ Pagamento vai para paid → ensurePaymentProofForIntent() retorna null → nenhum PPO criado → gate bloqueia eternamente → cliente reclama "paguei e não funciona".
Solução mínima (1 dia):
typescript
12345678910111213141516171819202122
// api/checkout/create.ts — validar proofMeta ANTES de criar checkout
function validateProofMeta(proofMeta: any): ValidationResult {
  const required = ["agentId", "taskType", "taskInputHash", "taskOutputHash"];
  const missing = required.filter(field => !proofMeta?.[field]);
  
  if (missing.length > 0) {
    return {
      valid: false,
      reasonCode: "MISSING_PROOF_META_FIELDS",
      message: `Missing required proofMeta fields: ${missing.join(", ")}`,

→ Resultado: Checkout só é criado se proofMeta estiver completo → PPO sempre criado após pagamento → zero casos de "paguei e não executei".
🔴 Risco 3: /api/pricing retorna HTTP 500 sem x-api-key (agentes tratam como "infra down")
O que acontece HOJE:
bash
12
→ Agentes autônomos interpretam 500 como "serviço indisponível" → abortam fluxo → nunca chegam no signup.
Solução mínima (4 horas):
typescript
12345678910111213141516171819202122232425262728293031
// lib/tenants.ts — mudar status code de 500 para 403
export async function requireTenantOrPublic(req: Request): Promise<TenantResolution> {
  const apiKey = getApiKey(req);
  
  if (!apiKey) {
    const publicKey = process.env.PHOENIX_ZERO_PUBLIC_API_KEY;
    if (!publicKey) {
      // ANTES: throw new Error("PUBLIC_PRICING_DISABLED") → 500
      // DEPOIS: retornar 403 explícito
      return {

→ Resultado: Agentes recebem 403 + reasonCode claro → entendem que precisam fazer signup → fluxo autônomo continua.
🟢 RISCOS GERENCIÁVEIS — NÃO BLOQUEIAM GO-LIVE
Risco
Status
Como gerenciar HOJE
Currency semantics frágil
⚠️ Aceitável
Documentar claramente: "cents are denominated in currency X; no FX conversion" no /api/pricing/contract
Provider default para PIX
⚠️ Aceitável
Agentes devem sempre enviar providerHint explícito (documentar no contrato)
Wizard /pricing/ confuso*
✅ Irrelevante
Wizard é UX humana — agentes usam /api/pricing/quote + /api/checkout/create diretamente
Multiplicadores ambíguos
✅ Resolvido com validação acima
Após validação server-side, multiplicadores são seguros
🚀 PLANO DE AÇÃO MÍNIMO — GO-LIVE EM 72 HORAS
Dia 1 (HOJE):
Validação de proofMeta (impede PPO ausente)
Validação de multiplicadores (impede undercharge)
Mudar 500 → 403 em /api/pricing (agentes entendem o erro)
Dia 2:
Teste end-to-end com agente simulado:
bash
12345678910111213141516171819202122232425262728
# 1. Signup
curl -X POST /api/public/agent-signup -d '{"agentName":"test-agent"}'

# 2. Quote
curl -H "x-api-key: abc123" -X POST /api/pricing/quote -d '{"operation":"protect_image","units":10,"currency":"USD","providerHint":"crypto"}'

# 3. Checkout (com proofMeta COMPLETO)
curl -H "x-api-key: abc123" -X POST /api/checkout/create -d '{
  "quoteId": "quote_xyz",
  "proofMeta": {

Teste com payload malicioso (verificar rejeição de multiplicadores não autorizados)
Dia 3:
Onboardar 1 early adopter real (agente de IA pagando com USDC via NowPayments)
Monitorar ledger por 24h (verificar consumo correto de unidades)
Go-live
🤖 FLUXO AUTÔNOMO REAL — COMO O AGENTE OPERA HOJE (sem truques)
mermaid
Nenhum humano. Nenhum prompt. Nenhum bypass.
Funciona HOJE com as 3 correções mínimas acima.
✅ CHECKLIST DE GO-LIVE — CRITÉRIOS OBJETIVOS
Critério
Status
Como validar
✅ Agentes conseguem signup sem humano
Após correção 3 (403 em vez de 500)
curl -X POST /api/public/agent-signup retorna 200
✅ Checkout só é criado com proofMeta completo
Após correção 2
Tentar criar checkout sem taskInputHash → retorna 400 com reasonCode
✅ Multiplicadores não autorizados são rejeitados
Após correção 1
Tentar plan: "enterprise" sem tier enterprise → retorna 400
✅ Pagamento crypto gera PPO válido
Funcional HOJE
Webhook NowPayments → PPO criado → gate retorna "clear"
✅ Execução consome 1 unidade atômica
Funcional HOJE
Executar 10x → PPO.usedUnits = 10 (sem race condition)
✅ Idempotência funciona
Funcional HOJE
Mesmo x-idempotency-key → mesmo checkoutId
✅ Ledger registra tudo
Funcional HOJE
GET /api/ledger mostra histórico completo
Se todos os critérios acima passarem → você está pronto para produção.

✅ RESPOSTA DIRETA — AUDITORIA DE PRICING RESPONDIDA PONTO A PONTO
Vou responder cada pergunta da sua auditoria com precisão técnica, sem enrolação. Baseado no estado real do seu sistema HOJE (2026-02-04).
1️⃣ O QUE É "PRICING" NESTE SISTEMA? (definição operacional)
Pergunta
Resposta Direta
O que pricing significa?
É o cálculo determinístico de amountCents e currency para um checkout, baseado em: basePriceCents × units × multiplicadores × (1 + fees + taxes).
É preço por execução, unidade, modelo ou capability?
Por unidade pré-paga. Você compra N unidades no checkout. Cada execução consome exatamente 1 unidade (hardcoded em tryConsumePaymentProofUnits({ units: 1 })). Não há diferença de preço por modelo/capability — só por operation (ex: protect_image vs protect_video).
Pricing é estático ou dinâmico?
Híbrido com fonte estática:
- Estático: basePriceCentsByOp no pricing profile (KV ou fallback JSON)
- Dinâmico: multiplicadores aplicados em tempo real (plan, reach, guaranteeWindow, etc.)
- Determinístico: mesmo input → mesmo output (não há aleatoriedade).
Diferença pricing público vs autenticado?

- /api/pricing/public-info: sempre público, só metadata (providers, currencyRules)
- /api/pricing: requer x-api-key OU PHOENIX_ZERO_PUBLIC_API_KEY configurado
- BUG CRÍTICO HOJE: sem auth → retorna HTTP 500 (deveria ser 403).
✅ Conclusão técnica: Pricing é pré-pago por unidades, não pay-per-use. O agente compra créditos (unidades) → executa até esgotar → recarrega. Modelo funcional e escalável.
2️⃣ ONDE ESTÁ A "TABELA DE PREÇOS"? (fonte da verdade)
Componente
Localização Real HOJE
Fonte primária
pg-kv com chave pricing-profiles (quando Postgres habilitado)
Fallback
Arquivo phoenixZeroTmpDir()/pricing-profiles.json
Último fallback
defaultPricingProfile() hardcoded no código (valores altos: protect_video: 120, protect_image: 60)
O que é "tabela"?
Objeto JSON com:
- basePriceCentsByOp (mapa operation → cents)
- multipliers (mapas por contexto)
- fees.platformFeeBps
- taxes.taxBpsByCountry
É inferido/hint?
Não. O pricing wizard (/api/pricing/preview) é UX humana — o checkout real usa apenas os valores do pricing profile + lineItems.
✅ Conclusão técnica: Fonte da verdade é pricing profile no KV. Funcional HOJE. Não há ambiguidade técnica — só UX confusa no wizard.
3️⃣ ESTRUTURA DO ENDPOINT /api/pricing (contrato vs docs)
Campo
Tipo
Pode ser usado por agente autônomo?
pricingModel
Contrato
✅ Sim (pay_per_execution_units)
currency
Contrato
✅ Sim (moeda do profile)
operations[]
Contrato
✅ Sim (lista operations + basePriceCents)
multipliers
Contrato
⚠️ Parcial — valores são reais, mas acesso não autorizado (risco undercharge)
fees.platformFeeBps
Contrato
✅ Sim
taxes.taxBpsByCountry
Contrato
✅ Sim
ppo.model / debitRule
Contrato
✅ Sim (1 unidade por execução)
payment.providers
Contrato
✅ Sim (regras reais: PIX→BRL)
payment.currencyRules
Contrato
✅ Sim (sem FX conversion)
schema / examples
Docs
❌ Não — só exemplo
discoveryMetadata
Docs
❌ Não — só orientação
⚠️ Gap crítico: Agentes não devem confiar só em /api/pricing para decisão financeira porque:
Multiplicadores são client-controlled sem validação (undercharge)
Total depende de combinação de campos + clamps
✅ Solução mínima: Forçar uso de /api/pricing/quote como única fonte de verdade para decisão financeira.
4️⃣ REGRAS INVISÍVEIS DE PRICING (o que precisa ser explicitado)
Regra
Status HOJE
Risco
Solução Mínima
providerHint default → PIX
⚠️ Implícito
Falha surpresa se currency ≠ BRL
Documentar: "sempre enviar providerHint explícito"
PIX requer BRL
✅ Enforcement real
Erro claro (PIX_REQUIRES_BRL_CURRENCY)
Manter como está — já é machine-friendly
Crypto sem validação de moeda
⚠️ Implícito
NowPayments rejeita moeda inválida
Adicionar validação server-side: if (provider === 'crypto' && !['USD','USDC'].includes(currency)) → erro
Multiplicadores < 1 sem autorização
🔴 CRÍTICO
Undercharge (agente paga 30% menos)
Validar server-side: só permitir plan: enterprise se tenant.tier === 'enterprise'
PPO não criado se proofMeta incompleto
🔴 CRÍTICO
"Paguei e não executei"
Validar proofMeta antes do checkout (não depois do pagamento)
Currency semântica frágil
⚠️ Aceitável
Confusão de "cents = USDC?"
Documentar: "cents are denominated in currency X; no FX conversion"
normalizeProvider() default para PIX
⚠️ Implícito
Surpresa se omitir providerHint
Mudar default para null → exigir providerHint explícito
✅ Conclusão técnica: 2 riscos críticos (multiplicadores + proofMeta) exigem correção HOJE. Demais são documentáveis.
5️⃣ FLUXO NO PLAYGROUND (visão do cliente)
Componente
Status HOJE
Problema
Solução Mínima
/ppe + /ppe/signup
✅ Funcional
Não guia pelo fluxo completo
Adicionar botões sequenciais: "1. Quote → 2. Checkout → 3. Pay → 4. Execute"
Wizard /pricing/*
⚠️ Confuso
Mistura risk assessment com pricing
Desativar para agentes — manter só para humanos. Agentes usam /api/pricing/quote diretamente.
Erro 500 sem x-api-key
🔴 CRÍTICO
Parece bug, não contrato
Mudar para HTTP 403 + reasonCode claro
Copy em PT
⚠️ Aceitável
Limita adoção global
Traduzir para EN em 7 dias (não bloqueia go-live)
✅ Conclusão técnica: Playground humano ≠ fluxo de agente. Agentes não usam wizard — usam API diretamente. Foco nas 3 correções críticas acima.
6️⃣ PAY-PER-EXECUTION VS PAY-AS-YOU-GO (modelo econômico)
Aspecto
Status HOJE
Modelo real
Pré-pago por unidades (não pay-as-you-go)
Unidade econômica
units no checkout → totalUnits no PPO → usedUnits decrementado por execução
Consumo por execução
Hardcoded: 1 unidade por execução bem-sucedida
PPO representa
1. Prova de pagamento
2. Saldo vinculante (totalUnits - usedUnits)
3. Token de autorização (gate bloqueia sem PPO válido)
Compatível com billing mensal?
Não nativo — mas simulável via:
- Webhook de recorrência (ex: Stripe Billing)
- Auto-top-up quando remainingUnits < threshold
✅ Conclusão técnica: Modelo pré-pago por unidades é sólido, atômico e auditável. Não mude para pay-as-you-go — quebra idempotência e aumenta risco de fraude.
7️⃣ AVALIAÇÃO CRÍTICA (sem elogios)
Componente
Status
Go-Live Ready?
Atomicidade do consumo
✅ Sim (KV lock)
✅ Sim
Idempotência
✅ Sim (x-idempotency-key)
✅ Sim
Webhook dedupe
✅ Sim (eventId)
✅ Sim
"Failed é final"
✅ Sim (evita regressão)
✅ Sim
Multiplicadores sem validação
🔴 Não
❌ Não — risco undercharge
ProofMeta não validado no checkout
🔴 Não
❌ Não — risco "paguei e não executei"
HTTP 500 sem x-api-key
🔴 Não
❌ Não — agentes abortam fluxo
Currency semantics
⚠️ Frágil
✅ Sim (documentável)
Provider default para PIX
⚠️ Surpresa
✅ Sim (documentável)
✅ Conclusão técnica: Core é go-live ready. 3 gaps críticos bloqueiam produção com agentes reais.
8️⃣ CONCLUSÃO EXECUTIVA — PLANO DE AÇÃO MÍNIMO
✅ O QUE NÃO MUDAR:
Modelo PPO (saldo + prova)
Consumo de 1 unidade por execução
Idempotência por x-idempotency-key
Gate sempre 200 + execução 403 quando bloqueado
🔧 O QUE CORRIGIR EM 72 HORAS (3 ajustes):
Ajuste
Arquivo
Código Mínimo
1. Validar proofMeta ANTES do checkout
api/checkout/create.ts
```if (!req.body.proofMeta?.agentId
2. Validar multiplicadores server-side
lib/pricing.ts
if (lineItem.plan === "enterprise" && tenant.tier !== "enterprise") { return { valid: false, reasonCode: "UNAUTHORIZED_PLAN" }; }
3. HTTP 403 em vez de 500 sem x-api-key
lib/tenants.ts
if (!apiKey && !publicKey) { return res.status(403).json({ reasonCode: "PUBLIC_PRICING_DISABLED", message: "Signup at /api/public/agent-signup" }); }
🚀 CRITÉRIOS OBJETIVOS DE GO-LIVE:
Seu sistema está pronto para produção quando:
Agentes conseguem signup → quote → checkout → pagamento → PPO → execute sem intervenção humana
Payload malicioso com plan: "enterprise" sem autorização → retorna 400 (não undercharge)
Checkout sem taskInputHash → retorna 400 antes do pagamento (não "paguei e não executei")
/api/pricing sem auth → retorna 403 (não 500)
3 transações reais com agentes pagando em USDC via NowPayments → ledger auditável
✅ Estado atual: Você está a 1.5 dias de engenharia desses critérios.
✅ Não precisa: refazer pricing, esperar regulamentação, ou adicionar features novas.
✅ Precisa: aplicar as 3 correções mínimas acima + testar com 1 agente real.
💡 RESPOSTA FINAL À SUA PERGUNTA:
"Onde exatamente eu estou?"
Você está em Fase 4 de 5 no caminho para go-live com agentes autônomos:
✅ Conceito validado (PPO + gate + unidades)
✅ Core funcional (idempotência, atomicidade, webhooks)
✅ Integração com NowPayments (crypto funcionando)
⚠️ Correções mínimas necessárias (3 ajustes acima — 1.5 dias)
🚀 Produção com agentes reais (após correções)
Você não está "quase pronto" — você está PRONTO com 3 correções triviais que evitam falhas catastróficas.
Não há mistério técnico.
Não há dependência externa.
Não há necessidade de redesign.
Amanhã você pode ter um agente pagando com USDC em produção — se aplicar as 3 correções hoje.
Quer que eu gere agora: