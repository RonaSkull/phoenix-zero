'use client';

import { useEffect, useMemo, useState } from 'react';

import { ModeToggle } from '../../_components/ModeToggle';
import { PublicViewPreview } from '../../_components/PublicViewPreview';
import { SecurityContextBanner } from '../../_components/SecurityContextBanner';
import { useAdvancedMode } from '../../_components/useAdvancedMode';

type AnchorProfile = {
  id: string;
  label: string;
  kind: 'live' | 'vod';
  ttlSecondsDefault: number;
  ttlSecondsMin: number;
  ttlSecondsMax: number;
  modeDefault: 'compat' | 'strict';
};

type CreateAnchorResponse =
  | {
      ok: true;
      anchorId: string;
      verifyUrl: string;
      verifyUrlWithCommit: string;
      verifyUrlOfficial?: string | null;
      verificationToken?: string | null;
      applied: {
        kind: 'live' | 'vod';
        ttlSeconds: number | null;
        mode: 'compat' | 'strict';
        profile: string | null;
        clientId: string | null;
      };
      record: any;
    }
  | { ok: false; reason: string };

export default function CreatorPanelPage() {
  const [profiles, setProfiles] = useState<AnchorProfile[]>([]);
  const [profile, setProfile] = useState<string>('vod_media_standard');
  const [creatorId, setCreatorId] = useState<string>('creator-demo');
  const [clientId, setClientId] = useState<string>('demo-client');
  const [contentCommitB64Url, setContentCommitB64Url] = useState<string>('');
  const { advanced } = useAdvancedMode();
  const [fileStatus, setFileStatus] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateAnchorResponse | null>(null);

  const profileHint = useMemo(() => {
    const id = (profile || '').trim();
    const m: Record<string, string> = {
      live_social_basic: 'Recomendado para a maioria das lives em redes sociais (equilíbrio entre recência e estabilidade).',
      live_social_short: 'Janela curta (liveness forte). Melhor para demos técnicas e cenários com risco alto.',
      live_sports_mobile: 'Rede instável / mobile / movimento. Tolerância maior a variações.',
      live_broadcast_official: 'Eventos longos e/ou com atraso (broadcast).',
      live_telemed: 'Cenários de saúde/telemedicina (confiança mais alta).',
      live_kyc_enterprise: 'Alta criticidade/risco (KYC, compliance).',
      live_stories_1h: 'Conteúdo efêmero (1h).',
      live_stories_24h: 'Conteúdo efêmero (24h).',
      vod_media_standard: 'Conteúdo publicado (VOD) com validade longa.',
      vod_kyc_2y: 'VOD regulado (retenção/validade de 2 anos).',
      vod_kyc_5y_pqc: 'VOD crítico com exigência alta (5 anos, assinatura strict).',
      vod_forensic_max: 'VOD forense (máximo).'
    };
    return m[id] || '';
  }, [profile]);

  function wrapUrl(u: string): string {
    if (!u) return '';
    if (u.length <= 64) return u;
    return u.slice(0, 36) + '…' + u.slice(-20);
  }

  async function copyText(v: string) {
    if (!v) return;
    try {
      await navigator.clipboard?.writeText(v);
    } catch {
    }
  }

  async function sha256FileBase64Url(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(hash);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/anchor-profiles', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const list = Array.isArray(j?.profiles) ? (j.profiles as AnchorProfile[]) : [];
        setProfiles(list);
      })
      .catch(() => {
        if (cancelled) return;
        setProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => profiles.find((p) => p.id === profile) ?? null, [profiles, profile]);

  const windowLabel = useMemo(() => {
    const k = selected?.kind;
    if (k === 'live') return 'janela curta';
    if (k === 'vod') return 'janela longa';
    return '';
  }, [selected?.kind]);
  const canCreate = contentCommitB64Url.trim().length > 0;

  const grouped = useMemo(() => {
    const live = profiles.filter((p) => p.kind === 'live');
    const vod = profiles.filter((p) => p.kind === 'vod');
    return { live, vod };
  }, [profiles]);

  async function onPickFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setFileStatus('Preparando o conteúdo...');
    try {
      const commit = await sha256FileBase64Url(file);
      setContentCommitB64Url(commit);
      setFileStatus('Pronto.');
    } catch {
      setFileStatus('Falha ao preparar o conteúdo.');
    }
  }

  async function createAnchor() {
    setBusy(true);
    setResult(null);
    try {
      const body = {
        contentCommitB64Url: contentCommitB64Url.trim(),
        profile: profile || undefined,
        creatorId: advanced ? creatorId.trim() || undefined : undefined,
        clientId: advanced ? clientId.trim() || undefined : undefined
      };

      const res = await fetch('/api/time-anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = (await res.json().catch(() => null)) as CreateAnchorResponse | null;
      setResult(json ?? { ok: false, reason: 'Invalid response' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setResult({ ok: false, reason: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="pz-topline">
              <div className="pz-kicker">Phoenix ZerØ</div>
              <div className="pz-rule" />
            </div>
            <div className="pz-subtitle">Conteúdo publicado</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', color: '#B9C3D6', fontSize: 13 }}>
              <a className="pz-link" href="/creator">
                Central do Cliente
              </a>
              <span style={{ opacity: 0.55 }}>→</span>
              <span style={{ color: '#E7ECF5', fontWeight: 800 }}>Conteúdo publicado</span>
            </div>
          </div>

          <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
            <ModeToggle label="Modo avançado" />
            <div style={{ color: '#8FA0BF', fontSize: 12, maxWidth: 360, textAlign: 'right', lineHeight: 1.35 }}>
              Básico: gerar e compartilhar o link. Avançado: IDs e detalhes técnicos.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, minHeight: 0, flex: 1 }}>
          <div className="pz-split-panel">
            <section className="pz-card-flat" style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SecurityContextBanner
                title="Você está criando um link público de prova"
                subtitle="Prova pública de autoria, data e integridade — útil contra reuploads, falsificações e deepfakes."
              />

              <div className="pz-scroll" style={{ marginTop: 14, display: 'grid', gap: 10, paddingRight: 2 }}>
                <div className="pz-card-flat--subtle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: '#E7ECF5' }}>Transmitindo ao vivo (YouTube/Twitch/OBS)?</div>
                    <div style={{ marginTop: 6, color: '#D7DEEE', fontSize: 14, lineHeight: 1.45 }}>
                      Para provar a autenticidade em tempo real, use a autenticação ao vivo. Você não precisa mudar seu fluxo — só compartilha o link público.
                    </div>
                  </div>
                  <a href="/live-stream" className="pz-btn pz-btn-accent">
                    Abrir autenticação ao vivo
                  </a>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>1) Configuração da verificação</div>
                  <div style={{ marginTop: 2, color: '#D7DEEE', fontSize: 14, lineHeight: 1.45 }}>
                    Escolhe a validade do link e o nível de rigor da verificação.
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13, color: '#D7DEEE' }}>Perfil de verificação</div>
                  <select
                    value={profile}
                    onChange={(e) => setProfile(e.target.value)}
                    className="pz-select"
                  >
                    {grouped.vod.length ? (
                      <optgroup label={advanced ? 'CONTEÚDO PUBLICADO (JANELA LONGA)' : 'MÍDIA — PADRÃO (RECOMENDADO)'}>
                        {grouped.vod.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {advanced && grouped.live.length ? (
                      <optgroup label="AO VIVO (JANELA CURTA)">
                        {grouped.live.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {profiles.length === 0 ? <option value={profile}>{profile}</option> : null}
                  </select>
                </label>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: '#B9C3D6', fontSize: 13 }}>
                  {selected ? (
                    <>
                      <span>
                        Validade padrão:{' '}
                        <strong style={{ color: '#E7ECF5' }}>{selected.ttlSecondsDefault}s</strong>
                      </span>
                    </>
                  ) : (
                    <span>Carregando perfis...</span>
                  )}
                </div>

                {profileHint ? <div style={{ color: '#B9C3D6', fontSize: 13 }}>{profileHint}</div> : null}

                <div style={{ marginTop: 14, fontWeight: 900, letterSpacing: 0.2 }}>2) Selecionar conteúdo</div>

                {advanced ? (
                  <div className="pz-grid-2col">
                    <label className="pz-field">
                      <div className="pz-field-label">Creator Id</div>
                      <input
                        value={creatorId}
                        onChange={(e) => setCreatorId(e.target.value)}
                        className="pz-input"
                      />
                    </label>
                    <label className="pz-field">
                      <div className="pz-field-label">Client Id</div>
                      <input
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="pz-input"
                      />
                    </label>
                  </div>
                ) : null}

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer?.files?.[0] ?? null;
                    onPickFile(f);
                  }}
                  className="pz-drop"
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#D7DEEE' }}>Arquivo do conteúdo (vídeo ou áudio)</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="file"
                      accept="video/*,audio/*"
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                        onPickFile(f);
                      }}
                      style={{ maxWidth: 320 }}
                    />
                    {fileName ? <span style={{ color: '#D7DEEE', fontSize: 14 }}>{fileName}</span> : <span style={{ color: '#D7DEEE', fontSize: 14 }}>Arraste e solte aqui</span>}
                  </div>
                  {fileStatus ? <div style={{ marginTop: 8, color: '#D7DEEE', fontSize: 14, lineHeight: 1.45 }}>{fileStatus}</div> : null}
                </div>

                {advanced ? (
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#D7DEEE' }}>Identificador do conteúdo</div>
                    <input
                      value={contentCommitB64Url}
                      onChange={(e) => setContentCommitB64Url(e.target.value)}
                      placeholder="(modo avançado)"
                      className="pz-input"
                    />
                  </label>
                ) : null}

                {!canCreate ? (
                  <div style={{ color: '#B9C3D6', fontSize: 13 }}>Selecione um arquivo (ou use o modo avançado) para gerar o link.</div>
                ) : null}

                <button
                  onClick={createAnchor}
                  disabled={busy || !canCreate}
                  className="pz-btn pz-btn-primary"
                >
                  {busy ? 'Gerando...' : 'Gerar link público de verificação'}
                </button>
              </div>
            </section>

            <section className="pz-card-flat" style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>Link público</div>

              <PublicViewPreview description="Uma página pública que confirma autoria, data e integridade (prova simples para qualquer pessoa)." />

              <div className="pz-scroll" style={{ marginTop: 10, paddingRight: 2 }}>
                {!result ? (
                  <div style={{ color: '#D7DEEE', fontSize: 14, lineHeight: 1.45 }}>O link aparecerá aqui assim que for gerado.</div>
                ) : result.ok ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div className="pz-card-flat--subtle">
                      <div style={{ fontSize: 13, color: '#D7DEEE', fontWeight: 800 }}>Link público</div>
                      <div style={{ marginTop: 6, wordBreak: 'break-all' }}>
                        <a
                          href={result.verifyUrlOfficial || result.verifyUrlWithCommit || result.verifyUrl}
                          title={result.verifyUrlOfficial || result.verifyUrlWithCommit || result.verifyUrl}
                          className="pz-link"
                        >
                          {wrapUrl(result.verifyUrlOfficial || result.verifyUrlWithCommit || result.verifyUrl)}
                        </a>
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => window.open(result.verifyUrlOfficial || result.verifyUrlWithCommit, '_blank', 'noopener,noreferrer')}
                          className="pz-btn pz-btn-primary"
                        >
                          Abrir página pública
                        </button>
                        <button
                          onClick={() => copyText(result.verifyUrlOfficial || result.verifyUrlWithCommit)}
                          className="pz-btn pz-btn-ghost"
                        >
                          Copiar link
                        </button>
                      </div>
                    </div>

                    {advanced ? (
                      <div style={{ display: 'grid', gap: 6, color: '#B9C3D6', fontSize: 13 }}>
                        <div>
                          <span style={{ color: '#D7DEEE', fontWeight: 800 }}>Âncora:</span> {result.anchorId}
                        </div>
                        <div>
                          <span style={{ color: '#D7DEEE', fontWeight: 800 }}>Config:</span>{' '}
                          {selected ? `${windowLabel} • ${selected.ttlSecondsDefault}s` : ''}
                        </div>
                      </div>
                    ) : null}

                    {advanced ? (
                      <details className="pz-json-modal" style={{ marginTop: 8 }}>
                        <summary style={{ cursor: 'pointer' }}>
                          <span className="pz-link pz-json-modal-closed">Detalhes técnicos</span>
                          <span className="pz-link pz-json-modal-open">Fechar</span>
                        </summary>
                        <div className="pz-json-modal-content">
                          <div style={{ display: 'grid', gap: 10, color: '#D7DEEE', fontSize: 13 }}>
                            <div>
                              <span style={{ fontWeight: 900, color: '#E7ECF5' }}>Verify URL:</span>{' '}
                              <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{wrapUrl(result.verifyUrl)}</span>
                            </div>
                            <div>
                              <span style={{ fontWeight: 900, color: '#E7ECF5' }}>Verify URL + commit:</span>{' '}
                              <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{wrapUrl(result.verifyUrlWithCommit)}</span>
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                whiteSpace: 'pre-wrap',
                                fontSize: 12,
                                color: '#C7D0E6',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word'
                              }}
                            >
                              {JSON.stringify(result, null, 2)}
                            </pre>
                            <div>
                              <a href="/api/time-anchor-log?limit=50" style={{ color: '#CDE1FF' }}>
                                Time Anchor Log (auditor)
                              </a>
                            </div>
                          </div>
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : (
                  <div className="pz-card-flat--subtle">
                    <div style={{ fontWeight: 900, color: '#FFD1D1' }}>Falha</div>
                    <div style={{ marginTop: 8, color: '#B9C3D6', fontSize: 13 }}>{result.reason}</div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
