# Phoenix Zero — Infraestrutura de Confiança para a Era Pós-Deepfake

## Proposta
Phoenix Zero é uma infraestrutura de autenticidade: você marca conteúdo com prova criptográfica e qualquer cópia pode ser verificada fora da plataforma.

O diferencial é que a cobrança e a liberação são **agentic**: o sistema cobra sob demanda, confirma pagamento por webhook com hardening e libera automaticamente os endpoints de valor.

## Problema
- Deepfakes virais destroem reputação em minutos.
- Plataformas não garantem origem.
- Investigações são lentas e caras.
- Criadores, marcas e governos não conseguem provar autoria com confiança operacional.

## Solução
Um sistema onde:
- o criador (ou o operador) **gera prova** (assinatura + watermark / hybrid) associada ao conteúdo.
- qualquer parte consegue **verificar** a autenticidade com custo previsível.
- agentes autônomos **cobram e liberam acesso** sem humano no loop.
- cada evento de pagamento/uso é registrado em um **usage ledger**.

## O que já está pronto hoje
- Pix (Asaas) + Crypto (NowPayments).
- Webhooks com hardening mínimo:
  - validação de token/assinatura
  - idempotência por eventId
  - reconciliação por providerPaymentId (não confia em paymentId do corpo)
- Billing link:
  - pagou → BillingAccount vira paid/grace
  - evento payment_received registrado no ledger
- Guardrail de produto:
  - endpoints de valor exigem BillingAccount ativo
  - caso contrário retornam 402 Payment required
- Pricebook versionado:
  - mudanças com histórico (versionId, reason, createdBy)

## Modelo de receita (agentic)
Pay-per-protection, com preço dinâmico por contexto:
- tipo de conteúdo (vídeo/áudio/imagem/live)
- duração/tamanho
- exposição e persistência
- nível de prova (social/legal/forensic)
- janela de garantia (7d/30d/1y)

O agente precifica em tempo real:
- “Esse vídeo no TikTok com janela 30d e nível legal custa R$ 49.”

## ICPs e exemplos
- Creators: proteção por post/live.
- Políticos: mitigação de deepfake eleitoral (relatório forense).
- Marcas e bancos: conteúdo com prova jurídica e auditoria.

## Por que isso escala
- remove gargalos de venda manual e cobrança humana.
- transforma cada interação em receita auditável.
- controla acesso por guardrail e billing state.

## Próximos passos
- Domínio + HTTPS em produção (webhooks reais).
- Stripe real com validação de assinatura.
- Observabilidade e export do ledger por tenant.
