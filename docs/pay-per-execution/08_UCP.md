# PPE — Universal Commerce Protocol (UCP) (Google) — análise e encaixe no PPE

> Objetivo deste doc: registrar o que é o **UCP** (Universal Commerce Protocol) e como ele pode (ou não) agregar ao **PPE** sem desviar do **go‑live**.

## 1) O que é o UCP (resumo ancorado em fontes)

O **Universal Commerce Protocol (UCP)** é uma iniciativa para padronizar “primitivas” de comércio entre:
- plataformas (incluindo agentes de IA),
- comerciantes/negócios,
- provedores de pagamento,
- provedores de credenciais.

No repo oficial, o UCP é descrito como um “common language” e um conjunto de **Capabilities** componíveis (ex.: Checkout, Order, Identity Linking) e **Extensions**, com **discovery** e suporte a diferentes transportes (REST, MCP, A2A).

Fontes:
- GitHub: https://github.com/Universal-Commerce-Protocol/ucp
- Site do projeto: https://ucp.dev

## 2) O que “UCP no Google” significa (e o que ele exige)

Pelos guias do Google, “implementar UCP no Google” é um caminho para permitir que usuários/assistentes (ex.: Modo IA na Pesquisa e Gemini) consigam **descobrir e comprar** ofertas através de uma integração padronizada.

Pontos operacionais importantes que aparecem nos guias:
- **Merchant Center é parte do caminho**:
  - preparar conta, frete, devoluções e feed de produtos;
  - produtos precisam estar qualificados para a experiência (ex.: atributo `native_commerce`).
- **A integração precisa de aprovação** (há uma “lista de espera” e requisito de aprovação antes de ativar em Modo IA/Gemini).
- **Merchant profile**:
  - o Google menciona publicar um perfil para permitir negociação/descoberta de serviços/recursos e descoberta de gerenciadores de pagamento e **chaves públicas** para verificação de assinatura.
- **Checkout nativo** (principal):
  - implementar endpoints REST para criação/atualização/conclusão de sessões.
- **Opcional**:
  - checkout “embedded/iframe” para fluxos complexos;
  - identity linking (OAuth 2.0) para checkout “account-linked”;
  - sincronização de status de pedido via webhooks.

Fontes (Google):
- Overview: https://developers.google.com/merchant/ucp?hl=pt-br
- Implementation guide: https://developers.google.com/merchant/ucp/guides?hl=pt-br
- Merchant Center prep: https://developers.google.com/merchant/ucp/guides/merchant-center?hl=pt-br

## 3) Isso concorre com o PPE?

### 3.1 O foco do UCP
O UCP, do jeito que o Google está posicionando, é principalmente:
- **discovery + checkout + pedido** em ecossistema de “merchant + catálogo/itens”,
- com forte acoplamento a Merchant Center/feeds quando falamos de “UCP no Google”.

### 3.2 O foco do PPE
O PPE (neste repo) é:
- **execução condicionada a pagamento**,
- com **prova verificável** (PPO) + ledger/settlement,
- com enforcement server-side (PPO gate) e multi-tenant (`x-api-key`).

Conclusão prática:
- UCP **não substitui** o PPE.
- No máximo, UCP pode virar um **canal/protocolo de entrada** (discovery/checkout padronizado) para vender um “serviço” como o PPE.

## 4) Onde o UCP pode ajudar diretamente este projeto

### 4.1 Linguagem e forma de empacotar o produto
O UCP reforça uma narrativa de mercado: “agentic commerce” com primitives claras.
Isso ajuda o PPE em:
- descrever o produto como **capability** ("paid execution with proof"),
- separar claramente:
  - **capability discovery** (o que eu ofereço),
  - **checkout/payment session** (como pagar),
  - **order/proof** (o recibo/prova do que aconteceu).

### 4.2 Ideia de “Merchant Profile” + chaves públicas
O guia do Google fala em publicar um perfil que inclui **chaves públicas para verificação**.
Isso se encaixa muito bem com PPE, porque:
- o PPE já gera prova (PPO) e usa assinaturas/chaves no ecossistema Phoenix Zero;
- podemos evoluir para expor:
  - uma chave pública do “merchant/service” (PPE) para assinatura de recibos/provas,
  - uma forma padronizada de verificação.

### 4.3 Transporte agnóstico (REST/MCP/A2A)
O UCP menciona oferecer capabilities via REST, MCP (Model Context Protocol) ou A2A.
O PPE já é REST. Pós go-live, dá para:
- manter REST como baseline;
- considerar uma camada MCP/A2A para “agent-native integrations”, se fizer sentido.

## 5) O que NÃO vale fazer agora (para não desviar do go-live)

Para o go-live do PPE, **não** recomendo (agora) investir tempo em:
- integração com Merchant Center / feeds / `native_commerce`;
- lista de espera/aprovação Google;
- reescrever APIs para encaixar no formato “UCP no Google”.

Motivo:
- O critério de go-live do PPE é interno e já está definido em `00_MASTER_ROADMAP.md`.
- A integração “UCP no Google” adiciona dependências externas e ciclos de aprovação.

## 6) O mínimo que dá para fazer AGORA e já “capturar valor” do UCP

Sem escrever um adapter completo, dá para capturar valor de forma segura:
- alinhar terminologia do site copy (capabilities / checkout / proof),
- deixar explícito que o PPE é “API-first” e “agent-ready”,
- manter e reforçar o contrato `x-api-key` e `x-admin-token`.

Isso é copy + docs, não muda runtime.

## 7) Plano incremental pós go-live (adapter fino)

Se a gente decidir experimentar UCP, a estratégia mais segura é:

### Fase A (adapter interno, compatível com o PPE atual)
Adicionar endpoints novos (sem mexer nos existentes), ex. prefixo `/api/ucp/*`:
- `GET /api/ucp/profile` (capability profile básico)
- `POST /api/ucp/checkout/session/create` -> chama `POST /api/checkout/create`
- `POST /api/ucp/checkout/session/update` (opcional)
- `POST /api/ucp/checkout/session/complete` (opcional)
- `GET /api/ucp/order/status` -> mapeia para “payment/proof status”

Observação:
- Isso não é “UCP no Google” ainda. É só alinhar primitives com o padrão.

### Fase B (capability = serviços / execuções)
Modelar PPE como “service capability” (ex.: `paid_agent_execution_with_proof`) e definir o mapping:
- “item/product” = tipo de execução (simples/média/pesada) ou caso de uso
- “order” = payment intent + PPO
- “receipt/proof” = PPO + link `/verify/<proofId>`

### Fase C (se fizer sentido) integração com ecossistemas externos
- avaliar conformance tests do UCP (repo menciona um projeto dedicado);
- decidir se vale tentar “UCP no Google” (Merchant Center + aprovação).

## 8) Riscos / incertezas (explícitas)

- Este doc não tenta implementar o spec completo: os guias indicam endpoints específicos de checkout session, merchant profile, identity linking, orders, etc., mas o detalhamento completo deve ser validado diretamente nas páginas de checkout/merchant-profile/identity-linking/orders.
- O canal “UCP no Google” parece orientado a catálogos/produtos; PPE é mais próximo de “serviço” e pode depender da evolução do UCP para novos verticais (o repo do UCP menciona “Services” como futuro).

## 9) Links
- UCP (Google overview): https://developers.google.com/merchant/ucp?hl=pt-br
- UCP guides: https://developers.google.com/merchant/ucp/guides?hl=pt-br
- UCP Merchant Center prep: https://developers.google.com/merchant/ucp/guides/merchant-center?hl=pt-br
- UCP GitHub: https://github.com/Universal-Commerce-Protocol/ucp
- UCP site: https://ucp.dev
