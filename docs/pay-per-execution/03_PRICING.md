# PPE — Pricing (técnico + comercial)

## 1) Dois níveis de pricing

### A) Pricing técnico (o que o backend calcula)
- O backend calcula preço via `lineItems` + `pricingProfileId`.
- O cliente **não escolhe o preço final**; ele informa contexto.

### B) Pricing comercial (o que você comunica no site)
- Tabela simples por “tipo de execução” (simples/média/pesada) ou por “caso de uso”.
- Você pode dar desconto por volume **privado**.

## 1.1) Glossário (pra não confundir)

- **`operation`**
  - É o **código cobrável** (o “SKU técnico”).
  - É o que precisa existir em `basePriceCentsByOp` dentro do pricing profile.
  - Exemplos: `protect_video`, `verify_by_url`, `execution_unit`, `external_action`.
- **`product`**
  - É um **rótulo de produto/serviço** (pra UI/telemetria/UX).
  - Pode ser mais “humano” e genérico.
  - Exemplos: `video_protection`, `document_protection`.
- **`taskType` (PPO/Gate)**
  - É a **classe abstrata** usada no contrato de execução e no PPO Gate.
  - Para não haver “pago barato / executo caro”, a regra prática do MVP é:
    - **`taskType` deve representar o mesmo código cobrável da execução**.
    - No checkout, isso significa: `proofMeta.taskType` deve corresponder ao `lineItems.operation` (canônico).
- **`sector` / `clientType` / `country`**
  - São dimensões do contexto que aplicam multiplicadores (segmentação), mas **não** são o “produto”.

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
- A “tabela” técnica mora em **Pricing Profiles**:
  - `apps/web/src/lib/pricing.ts` (`PricingProfile`)
  - Campos principais:
    - `basePriceCentsByOp` (preço base por operação, ex.: `protect_video`)
    - `multiplierBySector` (multiplicador por setor)
    - `multiplierByClientType` (multiplicador por tipo de cliente)
    - `multiplierByCountry` + outros multiplicadores opcionais
- Persistência:
  - Quando `DATABASE_URL` está setado, fica no Postgres KV (`phoenix_zero_kv`) sob a chave `pricing-profiles`.
  - Sem Postgres, cai em arquivo local `.pz-tmp/pricing-profiles.json`.
- Para alterar com segurança (sem hardcode):
  - Use os endpoints admin existentes:
    - `GET /api/admin/pricing-profiles?id=default&currency=USD` (requer `x-admin-token`)
    - `POST /api/admin/pricing-profiles` (requer `x-admin-token`)
    - Versionamento/ativação:
      - `GET /api/admin/pricing-profiles?id=default&versions=1`
      - `POST /api/admin/pricing-profiles/activate` com `{ id, versionId }`
- Evitar hardcode em endpoints públicos.

## 4.1) Como usar (na prática) com o `/pricing-admin`

Checklist rápido:
- Escolha o `pricingProfileId` (geralmente `default`) e a `currency`.
- Garanta que existe um `basePriceCentsByOp["<operation>"]` para cada operação que você quer cobrar.
- Ajuste `multiplierBySector` / `multiplierByClientType` para segmentar.
- Ative a versão (activate) para virar “produção”.

Regra de ouro:
- Se o `operation` não existir no `basePriceCentsByOp`, você corre o risco de precificar como **0** (ou cair em fallback).
- Portanto, para go-live, prefira ter um conjunto explícito de operações cobráveis.

## 5) Tabela comercial sugerida (go‑live)
- Simples: **US$ 3**
- Média: **US$ 7**
- Pesada: **US$ 15**

Observação:
- Para bater meta agressiva, você precisa de poucos clientes com ticket maior (B2B), não volume gigante no começo.

## 6) Moedas
- BRL via PIX/Asaas.
- USD via NowPayments (beta/experimental).

## 7) O que NÃO fazer no MVP
- Não expor a fórmula detalhada.
- Não deixar cliente “setar amountCents” livremente.
