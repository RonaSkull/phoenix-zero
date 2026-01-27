# PPE — Pricing (técnico + comercial)

## 1) Dois níveis de pricing

### A) Pricing técnico (o que o backend calcula)
- O backend calcula preço via `lineItems` + `pricingProfileId`.
- O cliente **não escolhe o preço final**; ele informa contexto.

### B) Pricing comercial (o que você comunica no site)
- Tabela simples por “tipo de execução” (simples/média/pesada) ou por “caso de uso”.
- Você pode dar desconto por volume **privado**.

## 2) Como o backend precifica hoje
- `createPaymentIntent()` chama `computeTotalCents()`.
- Cada `lineItem` vira um `PricingContext`.
- A operação canônica usada na base é algo como `protect_video`, `protect_image`, etc.

Arquivos relevantes:
- `apps/web/src/lib/payments.ts`
- `apps/web/src/lib/pricing.ts`

## 3) Recomendações para PPE (sem quebrar o que existe)
- Definir 2–3 operações canônicas para PPE (ex.: `execute_simple`, `execute_medium`, `execute_heavy`) **sem remover** as atuais.
- Mapear o input do cliente (segmento/caso de uso) para essas operações.

## 4) Onde você altera preço (controle total seu)
- Use o admin/pricing já existente (UI/endpoint) quando possível.
- Evitar hardcode em endpoints públicos.

## 5) Tabela comercial sugerida (go‑live)
- Simples: **US$ 3**
- Média: **US$ 7**
- Pesada: **US$ 15**

Observação:
- Para bater meta agressiva, você precisa de poucos clientes com ticket maior (B2B), não volume gigante no começo.

## 6) Moedas
- BRL via PIX/Asaas.
- USD via NowPayments (USDT/USDC) enquanto não houver cartão internacional.

## 7) O que NÃO fazer no MVP
- Não expor a fórmula detalhada.
- Não deixar cliente “setar amountCents” livremente.
