# Premium (futuro)

## Objetivo
Lista interna de melhorias Premium/Enterprise para manter a visão de produto e evitar dispersão durante o MVP.

## Produto
### Multi-tenant (times/organizações)
- Organizações, membros, permissões
- Separação por ambiente (dev/staging/prod)

### Branding / White-label
- Domínio próprio
- Logo/cores
- Páginas públicas personalizadas (mensagens, layout, CTA)

### Experiência de cliente
- Central do cliente com onboarding guiado por setor (mídia, governo, saúde, etc.)
- Templates por caso de uso

## Evidence Vault (retenção + provas jurídicas)
### Retenção automática
- Períodos: 30d / 90d / 1y / 5y / 10y
- Políticas de expiração (lifecycle) e notificações de expiração
- Backup redundante (multi-região) (Enterprise)

### Pacote jurídico (1 clique)
- ZIP com:
  - evidence.json (manifest)
  - job.json / session metadata
  - arquivos originais (vídeo/áudio/imagem) + proofs
  - hashes + assinatura do manifest
- PDF (fase 2): relatório executivo + anexos técnicos

### Cadeia de custódia (Enterprise)
- Audit logs (quem baixou, quando, IP)
- Trilhas de auditoria exportáveis

### API de recuperação (Enterprise)
- Endpoints para listar e baixar pacotes
- Webhooks (evidenceReady, expiringSoon)

## Segurança / Compliance
- API keys por cliente + quotas
- Rate-limit por cliente
- Logs e trilhas de auditoria por cliente
- Políticas de retenção e privacidade (GDPR/CCPA)

## Operação
- Dashboard de uso e custos
- Status page / incident reports
- SLA (Enterprise)

## Integrações
- Plugin OBS
- Integração YouTube/Twitch (painel)
- SDK/Embed estável e versionado

## Anti-fraude avançado
- Scores e explicações
- Detecção de replay/anomalias com timeline
- Evidências complementares (telemetria)
