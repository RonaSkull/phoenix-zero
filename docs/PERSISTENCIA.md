# Persistência (Phoenix Zero)

Este documento explica **como a persistência funciona hoje** no projeto `redessociaisvideo3s`, e esclarece o que significava o “banco futuro” nos resumos antigos.

## 1) Resumo executivo

O backend (`apps/web`) suporta **dois modos de persistência**:

- **Modo A — Postgres (produção / Neon) (recomendado)**
  - Ativado quando `DATABASE_URL` está configurada.
  - O sistema usa uma tabela KV (`phoenix_zero_kv`) para armazenar JSONs por chave.

- **Modo B — Arquivos JSON (fallback / dev)**
  - Usado quando `DATABASE_URL` **não** está configurada.
  - Os dados são gravados em arquivos JSON dentro do diretório retornado por `PHOENIX_ZERO_TMP_DIR` (ou um fallback do sistema operacional).

## 2) O que era o “banco futuro”

Quando o projeto dizia “**Banco futuro: PostgreSQL (não implementado ainda)**”, isso significava:

- O sistema estava **gravando estado em JSON** (ex.: `payment-intents.json`, `payment-proofs.json`), e a ideia era “no futuro” migrar para um banco para:
  - evitar perda de estado em restart
  - suportar múltiplas instâncias
  - simplificar operação

Hoje esse “banco futuro” **já foi implementado** como um armazenamento KV em Postgres, controlado por `DATABASE_URL`.

## 3) Como o modo Postgres funciona (KV)

### 3.1 Tabela

Quando `DATABASE_URL` está setada, o backend cria (se não existir) a tabela:

- `phoenix_zero_kv(key text primary key, value jsonb, updated_at timestamptz)`

Implementação:

- `apps/web/src/lib/pg-kv.ts`
  - `readKvJson(key)`
  - `writeKvJson(key, value)`

### 3.2 Quais “DBs lógicas” viram chaves KV

Os módulos principais persistem seus “bancos lógicos” (JSON) sob chaves KV. Exemplos (não exaustivo):

- `payment-intents`
- `payment-proofs`
- `payment-webhook-events`
- `tenants`
- `tenant-sessions`
- `billing-accounts`
- `settlements`
- `escrow`
- `slashing`

Cada módulo tenta:

1) **Ler do Postgres** (se `DATABASE_URL` existe)
2) Se não houver Postgres, **ler do arquivo JSON**

Se for lido do arquivo e `DATABASE_URL` estiver habilitada, o módulo pode **seedar** o estado no Postgres (uma escrita inicial) para migração suave.

## 4) Como o modo JSON (fallback) funciona

### 4.1 Diretório de tmp

O diretório é resolvido por:

- `apps/web/src/lib/tmp-dir.ts`

Regras:

1) Se `PHOENIX_ZERO_TMP_DIR` estiver setado, usa ele.
2) Caso contrário, usa um fallback baseado no `tmpdir()` do sistema.

### 4.2 Arquivos

Em modo JSON, você verá arquivos como:

- `payment-intents.json`
- `payment-proofs.json`
- `payment-webhook-events.json`
- `billing-accounts.json`
- `tenants.json`
- `settlements.json`
- `escrow.json`
- `slashing.json`

## 5) Render + Neon: configuração recomendada

No `render.yaml`, o serviço já está preparado para:

- `DATABASE_URL` (secrets via Render)
- `PGSSLMODE=require`
- `PHOENIX_ZERO_TMP_DIR=/tmp/phoenix-zero/tmp` (mantido como fallback)

Recomendação:

- Em produção, **use `DATABASE_URL` apontando para Neon**.
- Mantenha `PGSSLMODE=require`.

## 6) Implicações práticas

- **Com Postgres (Neon)**:
  - Reinícios e redeploys não apagam estado.
  - Múltiplas instâncias têm uma fonte de verdade compartilhada.

- **Com JSON apenas**:
  - Em produção, você dependeria de “disco persistente” para não perder estado.
  - Se houver múltiplas instâncias, pode haver divergência de estado (cada instância com seus arquivos).

## 7) Observação importante (modelo de dados)

O uso atual de Postgres é **KV (JSONB)**, não um schema relacional completo.

Isso é intencional para:

- manter migração simples (equivalente ao JSON)
- manter baixo custo de implementação

Um “futuro banco” mais avançado, se necessário, seria:

- schema relacional (tabelas normalizadas)
- ou append-only log (event sourcing)
- ou ambos, dependendo do requisito de auditoria/escala
