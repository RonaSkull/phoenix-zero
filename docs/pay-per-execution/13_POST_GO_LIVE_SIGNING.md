# PPE — Post‑Go‑Live: assinatura criptográfica (catálogo + discovery)

Este documento define uma proposta **pós go‑live** para assinatura criptográfica de:

- `GET /.well-known/ai-service.json`
- `GET /api/pricing`

Objetivo: permitir que agentes externos detectem adulteração por proxies/replicações e façam pinning de uma chave canônica.

## 1) Status

- **Não é bloqueante** para go‑live.
- Deve ser implementado apenas após estabilizar o contrato público.

## 2) Modelo proposto (v0.1)

### 2.1 Algoritmo

- Ed25519

### 2.2 Chave

- `keyId`: string curta (ex.: `pz_ed25519_2026_01`)
- `publicKeyB64Url`: chave pública em Base64URL (sem padding)

### 2.3 Canonicalização

Assinar o corpo JSON **canonicalizado**.

Regras recomendadas:

- Ordenação determinística de chaves (lexicográfica)
- Arrays preservam ordem
- Sem whitespace

## 3) Formato de resposta (não-breaking)

Adicionar campos opcionais sem quebrar consumidores atuais:

```json
{
  "ok": true,
  "...": "...",
  "signature": {
    "alg": "ed25519",
    "keyId": "pz_ed25519_2026_01",
    "publicKeyB64Url": "...",
    "signatureB64Url": "...",
    "canonical": "json_sorted_keys_v1"
  }
}
```

## 4) Checklist de implementação (quando for fazer)

- Gerar par de chaves Ed25519 (offline)
- Guardar **private key** apenas como secret no Render
- Publicar `publicKeyB64Url` e `keyId` no payload assinado
- Assinar apenas:
  - `/.well-known/ai-service.json`
  - `/api/pricing`
- Adicionar teste unitário de:
  - canonicalização
  - verificação da assinatura
- Adicionar validação cruzada no `scripts/external-agent-client.ts` (apenas leitura)

## 5) Ameaças cobertas

- Proxy/replicação alterando endpoints/capabilities
- Cache envenenado com catalog/pricing adulterado

## 6) Limitações

- Não impede forks; apenas permite que agentes apliquem política de confiança.
- Não substitui TLS.
