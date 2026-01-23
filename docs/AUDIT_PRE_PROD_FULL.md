# Auditoria Pré-Produção (baseada em TREE_FULL.md + snippets fornecidos)

Fonte de dados:
- `docs/TREE_FULL.md`
- Trechos de conteúdo fornecidos pelo usuário em "CONTEÚDO RELEVANTE"

---

---

# A) BLOQUEADORES DE PRODUÇÃO
- `apps/web/src/app/api/phoenix-zero/verify-by-url/route.ts`: allowlist/SSRF ausente (snippet).
- `apps/web/src/app/api/live-stream/route.ts`: não limpa `tmp/` após uso (snippet) + evidência direta de muitos artefatos em `apps/web/tmp/**`.
- `apps/web/src/app/api/share-link/route.ts`: rate limiting ausente (snippet).
- `apps/web/src/app/api/phoenix-zero/verify-watermarked/route.ts`: upload sem validação explícita de MIME/tamanho (snippet).
- `keys/phoenix-zero-sphincs.json`: chave privada presente (snippet).
- Evidência direta na árvore: `apps/web/tmp/live-stream/**/secrets.json` (segredo persistido em diretório runtime).
- `.env.example` foi citado no snippet, mas NÃO aparece na árvore => bloqueador de previsibilidade/configuração de deploy.

# B) O que pode ser removido sem impacto
- Apenas com segurança para o **artefato de produção** (não do repo), com base na árvore:
  - `.pw-profile/**`
  - `apps/web/tmp/**`
  - `apps/web/.next/**`
  - `apps/web/.next-dev/**`
  - `apps/web/.next-prod/**`
  - `playwright-artifacts/**`
  - `playwright-report/**`
  - `test-results/**`

# C) Checklist final de deploy
1) Excluir do artefato: `.pw-profile/**`, `apps/web/tmp/**`, `.next*`, artefatos de teste e caches.
2) Remover segredos do workspace/artefato: `keys/phoenix-zero-sphincs.json` e `apps/web/tmp/**/secrets.json`; rotacionar se exposto.
3) SSRF hardening: allowlist/bloqueio IP privado/redirects em `verify-by-url`.
4) Upload hardening: limites tamanho/MIME/timeouts e evitar `arrayBuffer()` para arquivos grandes em `verify-watermarked`.
5) Anti-abuso: rate limiting em `share-link`.
6) Live: cleanup/TTL/quotas do `apps/web/tmp/**` + monitoramento de disco.
7) Configuração: restaurar/fornecer template `.env.example` (citado no snippet, ausente na árvore) e definir variáveis obrigatórias (JWT_SECRET etc.).
