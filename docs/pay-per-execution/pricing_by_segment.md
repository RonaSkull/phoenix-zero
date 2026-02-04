# Pricing por segmento (benchmark) — Automação/IA

## Objetivo
Mapear setores econômicos globais que já pagam por automação/IA e traduzir isso em **pricing tiers separados por segmento** (sem unificar preços entre segmentos).

## Metodologia (como ler este documento)
- As listas de empresas são **exemplos representativos de compradores** em cada setor (BR e internacionais). Não implicam relação comercial.
- “Modelo de pricing real” descreve padrões amplamente usados no mercado (usage, seat, risk, SLA), não o preço exato de uma empresa.
- As faixas de preço são **estimativas por ordem de grandeza** para suportar desenho de tiers e reduzir fricção comercial.
- No **go-live do Phoenix Zero**, a unidade operacional é **PPO units** (atualmente: **1 unit por `POST /api/agents/{agentId}/execute`**). As “unidades típicas” por segmento (imagem/listing/claim/stop etc.) aqui são **benchmark de mercado** e servem para orientar packaging e narrativa comercial, não para expor uma tabela global a agentes.

## Setores cobertos (v1)
1. Serviços financeiros (bancos/fintech/pagamentos)
2. Varejo e e-commerce
3. Indústria, energia e mineração
4. Saúde e ciências da vida
5. Logística, mobilidade e delivery
6. Mídia, entretenimento e creator economy

## Tabela comparativa (visão rápida)
| Setor | Unidade típica | Modelos comuns | Faixa estimada por unidade | Driver de compra | SLA típico |
|---|---|---|---|---|---|
| Serviços financeiros | transação de decisão<br>KYC/KYB<br>página de documento | usage + SLA<br>seat (ops/compliance)<br>risk (mais raro) | US$ 0,002–0,05 / transação<br>US$ 0,30–3,00 / KYC<br>US$ 0,01–0,10 / página | fraude + compliance + auditoria | 99,9%+ (enterprise) + 24/7 |
| Varejo e e-commerce | imagem/listing moderado<br>request de recomendação/busca<br>assento (ops/CX) | usage + seat + SLA (picos) | US$ 0,001–0,02 / imagem<br>US$ 0,01–0,30 / listing<br>US$ 50–200 / assento/mês | conversão + CAC + custo operacional | 99,5–99,9% |
| Indústria/energia/mineração | ativo monitorado<br>inspeção por imagem/vídeo<br>job de otimização | seat + usage + SLA | US$ 5–50 / ativo/mês<br>US$ 0,01–0,20 / imagem<br>US$ 0,10–2,00 / inspeção crítica | downtime + segurança + rastreabilidade | 99,9%+ + escalonamento |
| Saúde/ciências da vida | claim/conta<br>página de prontuário<br>minuto de áudio<br>exame/estudo | usage + seat + SLA/compliance | US$ 0,05–0,50 / claim<br>US$ 0,01–0,10 / página<br>US$ 0,01–0,05 / min<br>US$ 0,50–20 / exame | compliance + qualidade + tempo | 99,9%+ + auditoria |
| Logística/mobilidade/delivery | stop/parada<br>remessa/rota<br>evento de tracking | usage + seat + SLA | US$ 0,01–0,10 / stop<br>US$ 0,0005–0,01 / evento<br>US$ 0,01–0,10 / página POD | eficiência + pontualidade | 99,9% |
| Mídia/entretenimento/creator | minuto de vídeo analisado<br>asset (post/imagem)<br>canal monitorado | usage + SLA (tempo de resposta)<br>capacidade reservada | US$ 0,01–0,30 / minuto<br>US$ 0,001–0,05 / asset<br>US$ 500–10k / canal/mês | direitos + brand safety | SLA por resposta |

---

# 1) Serviços financeiros (bancos/fintech/pagamentos)

## Empresas no Brasil (30+)
 - Itaú Unibanco
 - Bradesco
 - Banco do Brasil
 - Caixa Econômica Federal
 - Santander Brasil
 - BTG Pactual
 - Banco Safra
 - Banco Inter
 - Nubank
 - C6 Bank
 - Banco Pan
 - Banco BV
 - Banco BMG
 - Banco Daycoval
 - Banco Original
 - Banco do Nordeste
 - Banco da Amazônia
 - Banrisul
 - Banestes
 - Sicredi
 - Sicoob
 - PagBank (PagSeguro)
 - Stone
 - Cielo
 - Getnet
 - Mercado Pago
 - PicPay
 - Neon
 - RecargaPay
 - Dock
 - EBANX
 - CloudWalk
 - Swap (Swap/Banking as a Service)

## Empresas internacionais (30+)
 - JPMorgan Chase
 - Bank of America
 - Wells Fargo
 - Citigroup
 - Goldman Sachs
 - Morgan Stanley
 - HSBC
 - Barclays
 - Banco Santander
 - BBVA
 - Deutsche Bank
 - BNP Paribas
 - Société Générale
 - UBS
 - ING
 - Standard Chartered
 - Revolut
 - Wise
 - Monzo
 - N26
 - Klarna
 - Stripe
 - Adyen
 - PayPal
 - Block (Square)
 - Visa
 - Mastercard
 - American Express
 - Robinhood
 - Coinbase
 - Ant Group

## Modelos de pricing reais (padrões do setor)
 - **Usage (por transação/evento)**
   - antifraude, screening AML, scoring, validações e enriquecimento de dados.
 - **Usage (por verificação KYC/KYB)**
   - verificação de documento, selfie/liveness, validação de dados cadastrais.
 - **Usage (por página / por documento)**
   - OCR, extração de campos, classificação e validação de consistência.
 - **Seat (por operador/analista)**
   - consoles de compliance, investigação, case management, backoffice.
 - **Risk-based (por exposição/garantia)**
   - aparece quando há promessa de “fraud guarantee” ou serviço gerenciado; menos comum em API pura.
 - **SLA / suporte / auditoria (add-on)**
   - 24/7, tempo de resposta, relatórios, trilha de auditoria e integração dedicada.

## Unidade e faixa de preço (estimativa)
 - **Transação de decisão (fraude/AML/screening)**: **US$ 0,002–0,05** por transação
 - **KYC/KYB completo**: **US$ 0,30–3,00** por verificação
 - **Documento (OCR/extração)**: **US$ 0,01–0,10** por página
 - **Assento (ops/compliance)**: **US$ 80–400** por assento/mês (varia por escopo e compliance)
 - **Add-on de SLA/auditoria**: em geral **+10% a +40%** do compromisso mensal (ou mínimo mensal separado)

## Pricing tiers propostos (segmento: financeiro)
 Regras do segmento:
 - unidade tende a ser **transação/KYC/página**
 - compradores pagam mais por **confiabilidade, auditoria e SLA** do que por “IA barata”

 - **Tier F1 — FinTech Early (self-serve)**
   - Unidade: transação de decisão
   - Faixa alvo: **US$ 0,01–0,03 / transação**
   - SLA: best-effort
 - **Tier F2 — Scale (SLA operacional)**
   - Unidade: transação (commit mensal)
   - Faixa alvo: **US$ 0,03–0,08 / transação**
   - SLA: 99,9% + suporte 24/5
 - **Tier F3 — Regulado (compliance/auditoria)**
   - Unidade: transação + auditoria (add-on)
   - Faixa alvo: **US$ 0,08–0,20 / transação**
   - SLA: 99,95% + suporte 24/7 + trilha de auditoria
 - **Tier F4 — Missão crítica (capacidade reservada)**
   - Unidade: transação + capacidade reservada (pico)
   - Faixa alvo: **US$ 0,20–0,50 / transação**
   - SLA: 99,99% + escalonamento + integração dedicada

---

# 2) Varejo e e-commerce

## Empresas no Brasil (30+)
 - Magazine Luiza (Magalu)
 - Via (Casas Bahia / Ponto)
 - Americanas S.A.
 - Mercado Livre (operação BR)
 - Shopee (operação BR)
 - Amazon Brasil
 - OLX Brasil
 - Dafiti
 - Enjoei
 - iFood
 - Zé Delivery
 - Assaí Atacadista
 - Grupo Pão de Açúcar (GPA)
 - Carrefour Brasil
 - Atacadão (Carrefour)
 - Grupo Mateus
 - Natura
 - Grupo Boticário
 - Lojas Renner
 - Riachuelo (Guararapes)
 - C&A Brasil
 - Havan
 - Petz
 - Cobasi
 - Vivara
 - Arezzo&Co
 - Grupo Soma
 - Grupo SBF (Centauro)
 - Fast Shop
 - Kalunga
 - Tok&Stok
 - Mobly

## Empresas internacionais (30+)
 - Amazon
 - Walmart
 - Target
 - Costco
 - Kroger
 - Tesco
 - Carrefour
 - Aldi
 - Lidl
 - IKEA
 - Home Depot
 - Lowe’s
 - Best Buy
 - Alibaba
 - JD.com
 - Rakuten
 - eBay
 - Shopify
 - MercadoLibre
 - Zalando
 - ASOS
 - Inditex (Zara)
 - H&M
 - Nike
 - Adidas
 - Unilever
 - Procter & Gamble
 - L’Oréal
 - Nestlé
 - PepsiCo
 - The Coca-Cola Company

## Modelos de pricing reais (padrões do setor)
 - **Usage (por item/listing)**
   - moderação (texto/imagem), classificação, deduplicação, checagens anti-fraude no cadastro de produto.
 - **Usage (por asset: imagem/vídeo curto)**
   - verificação de marca, qualidade, compliance de anúncio.
 - **Usage (por request)**
   - recomendação, busca, ranking, personalização, classificação.
 - **Seat (por usuário interno)**
   - operações de catálogo, CX, analistas de fraude, time de moderação.
 - **SLA por picos (capacidade reservada)**
   - Black Friday, campanhas, lançamentos e eventos.
 - **Risk/chargeback (casos específicos)**
   - aparece quando há garantia ou repasse de risco (menos comum em API pura; mais comum em adquirência/antifraude).

## Unidade e faixa de preço (estimativa)
 - **Moderação por imagem**: **US$ 0,001–0,02** por imagem
 - **Moderação por listing**: **US$ 0,01–0,30** por listing
 - **Classificação/recomendação por request**: **US$ 0,0001–0,005** por request
 - **Assento (ops/CX/moderação)**: **US$ 50–200** por assento/mês
 - **Capacidade reservada/SLA de pico**: adicional de **+10% a +60%** (ou mínimo mensal por “reserva de throughput”)

## Pricing tiers propostos (segmento: varejo/e-commerce)
 Regras do segmento:
 - unidade tende a ser **imagem/listing/request**, com margens apertadas
 - compradores pagam mais quando há impacto direto em **conversão** e em **custos de operação**

 - **Tier R1 — Long tail (self-serve)**
   - Unidade: imagem ou listing
   - Faixa alvo: **US$ 0,003–0,02 / unidade**
   - SLA: best-effort
 - **Tier R2 — Marketplace (SLA operacional)**
   - Unidade: imagem/listing (commit mensal)
   - Faixa alvo: **US$ 0,02–0,08 / unidade**
   - SLA: 99,9% + limites de latência
 - **Tier R3 — Peak-ready (capacidade reservada)**
   - Unidade: unidade + reserva de throughput (pico)
   - Faixa alvo: **US$ 0,08–0,25 / unidade**
   - SLA: 99,95% + suporte prioritário
 - **Tier R4 — Enterprise (multi-região + governança)**
   - Unidade: unidade (commit) + governança/auditoria
   - Faixa alvo: **US$ 0,25–0,60 / unidade**
   - SLA: 99,99% + suporte dedicado

---

# 3) Indústria, energia e mineração

## Empresas no Brasil (30+)
 - Petrobras
 - Vale
 - Gerdau
 - CSN
 - CSN Mineração
 - Usiminas
 - ArcelorMittal Brasil
 - Aperam South America
 - Braskem
 - Suzano
 - Klabin
 - Votorantim Cimentos
 - Embraer
 - WEG
 - Ambev
 - Raízen
 - Cosan
 - Ultrapar
 - Vibra Energia
 - Eletrobras
 - Cemig
 - Copel
 - Neoenergia
 - Engie Brasil Energia
 - Auren Energia
 - Randoncorp
 - Marcopolo
 - Fras-le
 - JBS
 - BRF
 - Marfrig
 - Minerva Foods

## Empresas internacionais (30+)
 - Shell
 - BP
 - ExxonMobil
 - Chevron
 - TotalEnergies
 - Equinor
 - Saudi Aramco
 - Petronas
 - BHP
 - Rio Tinto
 - Glencore
 - Anglo American
 - Freeport-McMoRan
 - Newmont
 - Barrick Gold
 - Caterpillar
 - Siemens
 - GE Vernova
 - Schneider Electric
 - ABB
 - Honeywell
 - Mitsubishi Heavy Industries
 - Toyota
 - Volkswagen
 - BMW
 - Tesla
 - Samsung Electronics
 - TSMC
 - Intel
 - Boeing
 - Airbus

## Modelos de pricing reais (padrões do setor)
 - **Seat (por engenheiro/analista/usuário)**
   - ferramentas de manutenção, reliability, EAM/CMMS, analytics, consoles de operação.
 - **Usage (por ativo monitorado / por sensor / por mês)**
   - predição de falha, condition monitoring, alarmes, otimização.
 - **Usage (por inspeção: imagem/vídeo)**
   - visão computacional para EPI, anomalias, qualidade, corrosão, detecção de vazamento.
 - **Usage (por job / simulação / otimização)**
   - execução de modelos de otimização, simulação de cenários, planejamento.
 - **SLA e capacidade reservada**
   - alto custo de downtime: contratos com 24/7, escalonamento, penalidades e “throughput” garantido.
 - **Risk-based (segurança / compliance / auditoria)**
   - aparece quando há exigência de rastreabilidade, trilha de auditoria e certificações.

## Unidade e faixa de preço (estimativa)
 - **Ativo monitorado**: **US$ 5–50 / ativo / mês** (variando por criticidade e volume)
 - **Inspeção por imagem**: **US$ 0,01–0,20 / imagem**
 - **Inspeção por minuto de vídeo**: **US$ 0,05–0,50 / minuto**
 - **Job de otimização/simulação**: **US$ 10–500 / job** (dependendo do tamanho do problema e SLA)
 - **Assento (engenharia/ops)**: **US$ 100–600 / assento / mês**

## Pricing tiers propostos (segmento: industrial)
 Regras do segmento:
 - valor percebido é função de **downtime evitado**, **segurança** e **rastreabilidade**
 - o mesmo “modelo” tem preço diferente conforme criticidade (planta vs. missão crítica)

 - **Tier I1 — Piloto (planta única)**
   - Unidade: inspeção (imagem/minuto) ou ativo/mês
   - Faixa alvo: **US$ 0,05–0,30 / inspeção** ou **US$ 10–25 / ativo / mês**
   - SLA: horário comercial
 - **Tier I2 — Operação (multi-planta)**
   - Unidade: inspeção (commit) + add-on de auditoria
   - Faixa alvo: **US$ 0,30–0,90 / inspeção**
   - SLA: 99,9% + escalonamento
 - **Tier I3 — Missão crítica (segurança/downtime)**
   - Unidade: inspeção + capacidade reservada
   - Faixa alvo: **US$ 0,90–2,50 / inspeção**
   - SLA: 99,95%+ + suporte 24/7
 - **Tier I4 — Regulatório (auditoria + integração dedicada)**
   - Unidade: inspeção (commit) + trilha/auditoria
   - Faixa alvo: **US$ 2,50–6,00 / inspeção**
   - SLA: 99,99% + governança + integrações

---

# 4) Saúde e ciências da vida

## Empresas no Brasil (30+)
 - Rede D'Or São Luiz
 - Hospital Israelita Albert Einstein
 - Hospital Sírio-Libanês
 - Hospital Moinhos de Vento
 - Hospital Alemão Oswaldo Cruz
 - Hospital Santa Catarina
 - Hospital São Camilo
 - Hospital Mater Dei
 - Hospital Pequeno Príncipe
 - Hapvida NotreDame Intermédica
 - Unimed (sistema Unimed)
 - Amil
 - SulAmérica Saúde
 - Bradesco Saúde
 - Porto Saúde
 - Seguros Unimed
 - Fleury
 - Dasa
 - Grupo Sabin
 - Hermes Pardini
 - Alliar
 - Oncoclínicas
 - Grupo Santa Joana
 - Rede São Cristóvão
 - Fiocruz
 - Instituto Butantan
 - Eurofarma
 - EMS
 - Aché Laboratórios
 - Hypera Pharma
 - Libbs
 - Rede de farmácias RD Saúde (RaiaDrogasil)

## Empresas internacionais (30+)
 - UnitedHealth Group
 - CVS Health
 - Kaiser Permanente
 - HCA Healthcare
 - Mayo Clinic
 - Cleveland Clinic
 - Cigna
 - Elevance Health
 - Humana
 - Pfizer
 - Johnson & Johnson
 - Roche
 - Novartis
 - Sanofi
 - GSK
 - AstraZeneca
 - Merck & Co.
 - AbbVie
 - Bayer
 - Eli Lilly
 - Thermo Fisher Scientific
 - Siemens Healthineers
 - GE HealthCare
 - Philips
 - Medtronic
 - Intuitive Surgical
 - Quest Diagnostics
 - LabCorp
 - Teladoc Health
 - Moderna
 - BioNTech

## Modelos de pricing reais (padrões do setor)
 - **Usage (por claim / conta / guia)**
   - automação de faturamento/RCM, validação, conciliação, auditoria de contas.
 - **Usage (por documento / por página)**
   - OCR e extração de prontuário, laudos, pedidos, autorizações.
 - **Usage (por minuto de áudio)**
   - transcrição, sumarização e triagem (contact center, telemedicina).
 - **Usage (por exame/estudo)**
   - quando há análise assistida por IA (imaging, patologia digital, triagem).
 - **Seat (por clínico/operador/analista)**
   - copilots e ferramentas de backoffice, revisão/auditoria clínica.
 - **SLA + compliance (add-on)**
   - logging, auditoria, retenção, controles de acesso, contratos e DPA.
 - **Risk-based (mais raro, mas existe)**
   - precificação ligada a redução de glosas, redução de erro, ou performance em métricas.

## Unidade e faixa de preço (estimativa)
 - **Claim/conta processada**: **US$ 0,05–0,50 / claim**
 - **Documento clínico**: **US$ 0,01–0,10 / página**
 - **Áudio**: **US$ 0,01–0,06 / minuto**
 - **Exame/estudo**: **US$ 0,50–20 / estudo** (varia muito por especialidade e responsabilidade)
 - **Assento (operação clínica/RCM)**: **US$ 80–500 / assento / mês**
 - **PMPM (por membro por mês)**: **US$ 0,05–2,00 / membro / mês** (mais comum em “plataformas” do que em API pura)

## Pricing tiers propostos (segmento: saúde)
 Regras do segmento:
 - ticket aumenta com **compliance**, **auditoria**, **responsabilidade** e **integração**
 - compradores aceitam commit quando há ganho claro em **tempo**, **qualidade** e **redução de glosa/erro**

 - **Tier H1 — Clínica/laboratório (self-serve)**
   - Unidade: página/claim
   - Faixa alvo: **US$ 0,05–0,20 / unidade**
   - SLA: 99,5–99,9%
 - **Tier H2 — Operação (SLA + logs)**
   - Unidade: unidade (commit)
   - Faixa alvo: **US$ 0,20–0,60 / unidade**
   - SLA: 99,9% + logs e retenção
 - **Tier H3 — Hospital/operadora (compliance forte)**
   - Unidade: unidade + auditoria
   - Faixa alvo: **US$ 0,60–2,00 / unidade**
   - SLA: 99,95% + suporte prioritário
 - **Tier H4 — Missão crítica (auditoria + integração dedicada)**
   - Unidade: unidade (commit) + onboarding
   - Faixa alvo: **US$ 2,00–6,00 / unidade**
   - SLA: 99,99% + governança + integração

---

# 5) Logística, mobilidade e delivery

## Empresas no Brasil (30+)
 - Correios
 - JSL
 - Simpar
 - Vamos
 - Movida
 - Localiza
 - Rumo
 - VLI
 - Tegma
 - Hidrovias do Brasil
 - Log-In Logística Intermodal
 - Santos Brasil
 - Wilson Sons
 - Sequoia Logística
 - Jadlog
 - Total Express
 - Loggi
 - Braspress
 - Rodonaves
 - Patrus Transportes
 - Expresso São Miguel
 - Tora Transportes
 - BBM Logística
 - CCR
 - EcoRodovias
 - Arteris
 - Azul Cargo Express
 - GOLLOG
 - LATAM Cargo (operação BR)
 - 99
 - Uber (operação BR)
 - iFood
 - Rappi (operação BR)

## Empresas internacionais (30+)
 - UPS
 - FedEx
 - DHL
 - DSV
 - Kuehne+Nagel
 - DB Schenker
 - Maersk
 - MSC
 - CMA CGM
 - COSCO Shipping
 - SF Express
 - Japan Post
 - Poste Italiane
 - Royal Mail
 - La Poste
 - Uber
 - Lyft
 - DiDi
 - Grab
 - Gojek
 - DoorDash
 - Deliveroo
 - Delivery Hero
 - Amazon Logistics
 - Flexport
 - C.H. Robinson
 - XPO Logistics
 - Ryder
 - J.B. Hunt
 - Expeditors

## Modelos de pricing reais (padrões do setor)
 - **Usage (por stop/parada, rota, remessa)**
   - roteirização, otimização, ETA, alocação.
 - **Usage (por evento)**
   - tracking, telemetria, anomalia, alertas e exceções.
 - **Seat (por operador/dispatcher)**
   - TMS, torres de controle e backoffice.
 - **SLA + capacidade reservada**
   - operações com picos, janelas de entrega e integrações críticas.
 - **Risk-based (SLA de entrega/penalidades)**
   - aparece em contratos com penalidades por atraso/downtime.

## Unidade e faixa de preço (estimativa)
 - **Otimização por stop/parada**: **US$ 0,01–0,10 / stop**
 - **Evento de tracking/anomalia**: **US$ 0,0005–0,01 / evento**
 - **Documento (POD/CT-e) por página**: **US$ 0,01–0,10 / página**
 - **Assento (ops)**: **US$ 50–250 / assento / mês**

## Pricing tiers propostos (segmento: logística)
 Regras do segmento:
 - valor vem de **eficiência**, **pontualidade** e **redução de exceções**
 - a unidade precisa ser simples: **stop/evento** (e não “IA abstrata”)

 - **Tier L1 — SMB (self-serve)**
   - Unidade: evento/stop
   - Faixa alvo: **US$ 0,005–0,03 / unidade**
   - SLA: best-effort
 - **Tier L2 — Operação (SLA operacional)**
   - Unidade: unidade (commit)
   - Faixa alvo: **US$ 0,03–0,09 / unidade**
   - SLA: 99,9% + limites de latência
 - **Tier L3 — Crítico (picos + escalonamento)**
   - Unidade: unidade + capacidade reservada
   - Faixa alvo: **US$ 0,09–0,25 / unidade**
   - SLA: 99,95% + suporte prioritário
 - **Tier L4 — Enterprise (multi-região + integrações)**
   - Unidade: unidade (commit) + integrações
   - Faixa alvo: **US$ 0,25–0,80 / unidade**
   - SLA: 99,99% + suporte dedicado

---

# 6) Mídia, entretenimento e creator economy

## Empresas no Brasil (30+)
 - Grupo Globo
 - Globoplay
 - TV Globo
 - GloboNews
 - SporTV
 - RecordTV
 - SBT
 - Band
 - RedeTV!
 - Jovem Pan
 - CNN Brasil
 - UOL
 - Terra
 - Folha de S.Paulo
 - O Estado de S. Paulo (Estadão)
 - Grupo Abril
 - Grupo RBS
 - NSC Comunicação
 - Grupo RIC
 - Grupo Massa
 - Omelete Company
 - Canaltech
 - KondZilla
 - Porta dos Fundos
 - CazéTV
 - Play9
 - Podpah
 - Flow Podcast
 - Endemol Shine Brasil
 - O2 Filmes
 - Conspiração Filmes
 - Gullane
 - Sato Company

## Empresas internacionais (30+)
 - Netflix
 - The Walt Disney Company
 - Warner Bros. Discovery
 - Paramount Global
 - Comcast (NBCUniversal)
 - Sony Group (Sony Pictures)
 - Amazon (Prime Video/Amazon Studios)
 - Apple (Apple TV+)
 - Alphabet (YouTube)
 - Meta
 - ByteDance (TikTok)
 - Spotify
 - Tencent
 - BBC
 - Sky Group
 - DAZN
 - Twitch
 - Epic Games
 - Electronic Arts
 - Take-Two Interactive
 - Nintendo
 - Valve
 - Microsoft Gaming (Xbox)
 - Riot Games
 - Activision Blizzard
 - The New York Times Company
 - Thomson Reuters
 - Bloomberg
 - News Corp
 - Pearson
 - Roku
 - iQIYI

## Modelos de pricing reais (padrões do setor)
 - **Usage (por minuto de vídeo / por hora de stream)**
   - análise, detecção, moderação, classificação, geração de evidência.
 - **Usage (por asset / por post)**
   - assets de social, imagens, snippets, shorts.
 - **Contrato por capacidade (canais, streams, monitoramento 24/7)**
   - comum quando a necessidade é vigilância contínua com cobertura definida.
 - **SLA por tempo de resposta**
   - tempo para detectar, gerar prova, emitir alerta ou acionar workflow.
 - **Seat (por moderador/analista)**
   - consoles de triagem, revisão humana, compliance e operações.
 - **Risk-based / performance-based (casos específicos)**
   - quando há promessa de “take-down success”, redução de incidente, ou cobertura com penalidades.
 - **Revenue-share (menos comum em infra)**
   - aparece em modelos de distribuição/monetização; raramente adequado para API de automação.

## Unidade e faixa de preço (estimativa)
 - **Minuto de vídeo analisado**: **US$ 0,01–0,30 / minuto**
 - **Asset (imagem/post) analisado**: **US$ 0,001–0,05 / asset**
 - **Canal/stream monitorado**: **US$ 500–10.000 / canal / mês** (dependendo de SLA e cobertura)
 - **Assento (operação/moderação)**: **US$ 50–300 / assento / mês**
 - **SLA de resposta (prioridade)**: adicional de **+10% a +80%** (ou mínimo mensal separado)

## Pricing tiers propostos (segmento: mídia/creator)
 Regras do segmento:
 - o valor vem de **tempo de resposta**, **prova verificável**, **redução de incidentes** e **proteção de marca/direitos**
 - o comprador aceita pagar mais quando o tier “compra” urgência (SLA) e rastreabilidade

 - **Tier M1 — Creator / agência pequena (self-serve)**
   - Unidade: asset ou minuto
   - Faixa alvo: **US$ 0,02–0,08 / minuto** (ou equivalente por asset)
   - SLA: best-effort
 - **Tier M2 — Operação profissional (SLA operacional)**
   - Unidade: minuto (commit mensal)
   - Faixa alvo: **US$ 0,08–0,20 / minuto**
   - SLA: 99,9% + prioridade
 - **Tier M3 — Direitos/brand safety (tempo de resposta)**
   - Unidade: minuto + SLA de resposta
   - Faixa alvo: **US$ 0,20–0,60 / minuto**
   - SLA: 99,95% + suporte prioritário
 - **Tier M4 — Broadcast/Studio (capacidade reservada + auditoria)**
   - Unidade: minuto (commit) + capacidade reservada
   - Faixa alvo: **US$ 0,60–1,50 / minuto**
   - SLA: 99,99% + governança + integração dedicada

---

## Recomendações de implementação (para manter preços separados por segmento)
- **Um pricing profile por segmento** (ex.: `finance_v1`, `retail_v1`, `industrial_v1`, etc.)
- Alternativa: usar `sector` como dimensão de contexto, evitando multiplicadores < 1 sem entitlement explícito

---

# Evolução do conceito (posicionamento e packaging)

## Nota de escopo
Este documento tem duas funções:
- **Benchmark por segmento** (seções 1–6): referência de mercado para humanos.
- **Packaging e posicionamento** (seção abaixo): como transformar “pay-per-execution” em proposta enterprise.

Ele **não** é a interface agent-facing. A interface agent-facing, no go-live, é **`GET /api/pricing` + `POST /api/pricing/quote` + checkout + PPO gate**.

## Princípios (modelo final)
- O produto não é “API de IA”. É **infra de execução autônoma com accountability** (rastro, auditoria, governança).
- **Pay-per-execution != pay-per-API call**: uma execução é um evento operacional/regulatório, não um request.
- Preço deve refletir:
  - risco coberto
  - urgência/SLA
  - auditoria/rastreabilidade
  - capacidade reservada (quando existir)

## Piso por classe de execução (faixas de referência)
Essas faixas são **referenciais para proposta comercial humana** (não expor como “tabela global” para agentes).

| Classe | Contexto típico | Piso saudável (USD / execução) |
|---|---|---|
| **Operational** | automação de backoffice com baixo risco | **0,20–1,00** |
| **SLA-backed** | operação com SLA e prioridade | **1,00–3,00** |
| **Regulated** | trilha/auditoria, compliance, políticas | **2,00–5,00** |
| **Critical (finance/PIX/risk)** | impacto financeiro + consequência legal | **5,00–20,00** |
| **Mission-critical** | capacidade reservada + penalidades fortes | **20,00–100+** |

## Commit + overage (modelo recomendado)
- **Commit** é um termo comercial (contrato), não um parâmetro controlado pelo agente.
- **Overage** (pay-per-execution) só é liberado quando:
  - o contrato define limites e política
  - a execução é “billable” e auditável

Sugestão de packaging (human-facing):

| Package | Segmentos alvo | Commit mínimo (ordem de grandeza) | Overage |
|---|---|---:|---|
| **Sovereign Starter** | varejo/SMB, creators/pro | **US$ 60k/ano** | sim |
| **Sovereign Scale** | fintech/e-commerce/logística | **US$ 600k/ano** | sim |
| **Sovereign Regulated** | bancos/saúde/seguro | **US$ 3M/ano** | sim |
| **Sovereign Mission** | PIX/infra crítica | **US$ 10M/ano** | sim |
| **Sovereign Deployment** | soberano/dedicado | **sob proposta** | sim |

---

# Superfície agent-facing (go-live: o que existe hoje)

## Regra operacional
- **Agentes não negociam pricing**.
- Agentes recebem **um catálogo do tenant** e pedem **quote** para uma execução específica.

## Endpoints reais
- **`GET /api/pricing`**
  - retorna operações, `basePriceCents`, multiplicadores, regras de moeda (ex.: PIX=BRL) e exemplos.
- **`POST /api/pricing/quote`**
  - retorna `finalPriceCents` para um `operation` + contexto (sector/country/clientType/units etc.).
- **`POST /api/checkout/create`**
  - compra unidades (PPO) para permitir execução.
- **`POST /api/agents/{agentId}/execute`**
  - consome o PPO (atualmente: **1 unit por execução**) e aplica o gate.

## O que agentes NÃO devem ver
- benchmark por segmento
- tabelas globais de tiers/ROI
- lógica de desconto (principalmente descontos por `plan`/`guaranteeWindow`)

## Invariantes e anti-bypass que já estão no go-live
- **Sem `x-api-key`, `GET /api/pricing` pode retornar 403** quando o public tenant não está configurado.
- **`proofMeta` é obrigatório no checkout** (campos mínimos para vincular pagamento à execução).
- **Multiplicadores que dão desconto (< 1)** não podem ser escolhidos livremente pelo cliente/agent (bloqueio server-side).
- **Invariante PPO**: `proofMeta.taskType` precisa bater com `lineItems.operation`.

## Padrão recomendado para budget por agente
1. Agente chama `POST /api/pricing/quote` e recebe `finalPriceCents`.
2. Compara com `maxCost`/budget local.
3. Se aceitar, cria checkout, obtém PPO e só então executa.

---

# Roadmap (não é go-live)
- Um endpoint dedicado de **contract/entitlement** (ex.: `GET /api/pricing/contract`) pode existir no futuro, mas **não está implementado hoje**.
- “Abuse policy” automática e detecção de comportamento podem ser adicionadas como camada de governança, mas devem ser tratadas como **roadmap**.