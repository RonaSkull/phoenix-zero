# Phoenix Zero — Roadmap (organizado por partes)

Este roadmap lista tudo o que você mencionou como “produto completo”, mas dividido em entregas pequenas e verificáveis.

## Parte 1 — Concluir testes reais (agora)
- [x] WhatsApp (download e verify)
- [x] TikTok (download e verify)
- [x] Instagram (download e verify)
- [x] YouTube (download e verify)
- [ ] LinkedIn (download e verify)
- [x] Calibrar parâmetros (por rede): `repeatPerBit`, `brightnessDelta`, `rois`, `madThreshold`

## Parte 2 — Presets oficiais
- [x] Implementar `presets` por duração
- [x] Implementar `presets` por plataforma (baseado em dados reais)
- [ ] Script de benchmark/relatório por preset

## Parte 3 — UX e produto
- [ ] Página /dashboard (histórico de stamps/verificações)
- [ ] Exportar/baixar proof + vídeo com UX clara
- [ ] “1 clique”: resultado ✅/❌ com explicação curta

## Parte 4 — Modelo de identidade/chaves
- [ ] Como distribuir `publicKey` do criador
- [ ] Rotação/revogação
- [ ] Prova de posse/conta verificada (opcional)

## Parte 5 — SDK para desenvolvedores
- [ ] SDK Node.js (arquivo) — stamp/verify por arquivo
- [ ] SDK Web (chama backend)
- [ ] SDK React Native (limitação: sem ffmpeg puro JS; precisa bridge)
- [ ] SDK Python (wrapper CLI/HTTP)
- [ ] Docs + exemplos

## Parte 6 — Integrações com plataformas
- Importante: upload/download automáticos geralmente violam ToS e quebram com 2FA.
- O caminho viável é:
  - guias oficiais + automação somente do lado local (stamp/verify)
  - opcionalmente “helpers” para organizar downloads

## Parte 7 — Robustez avançada
- [ ] ECC explícito (Reed-Solomon/Hamming) no payload
- [ ] ROI adaptativo (evitar áreas problemáticas)
- [ ] Multi-canal (Y + cromas) se necessário
- [ ] Métricas por plataforma (taxa de sucesso, falsos positivos)

## Parte 8 — Áudio e imagem
- [ ] Watermark em imagem
- [ ] Fingerprint para imagem
- [ ] Watermark em áudio (mais complexo; útil em vídeos com áudio preservado)

