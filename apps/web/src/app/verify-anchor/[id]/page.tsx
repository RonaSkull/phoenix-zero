import { headers } from 'next/headers';

export const runtime = 'nodejs';

function requestBaseUrl(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  if (!host) return '';
  return `${proto}://${host}`;
}

type AnchorResponse = {
  ok: boolean;
  anchorId: string;
  verified: {
    ok: boolean;
    window: 'valid' | 'expired';
    now: string;
    createdAt?: string;
    expiresAt?: string;
    creatorId?: string;
    kind?: 'live' | 'vod';
    contentCommit?: { alg: 'sha256_b64url_v1'; value: string };
    coincidence: boolean;
    confidence: number;
  };
  record: {
    anchorId: string;
    createdAt: string;
    expiresAt: string;
    creatorId?: string;
    kind: 'live' | 'vod';
    contentCommit: { alg: 'sha256_b64url_v1'; value: string };
  };
};

type UiStatus = 'verified' | 'partial' | 'mismatch' | 'expired' | 'invalid' | 'not_verified';

function mapToUi(params: { data: AnchorResponse | null; hasContentCommit: boolean }): { status: UiStatus; title: string; hint: string; badge: string } {
  const d = params.data;
  if (!d || !d.ok) {
    return { status: 'invalid', title: 'Verificação indisponível', hint: 'Não foi possível carregar esta verificação neste momento.', badge: 'INDISPONÍVEL' };
  }

  const v = d.verified;
  if (v.window === 'expired') {
    return { status: 'expired', title: 'Verificação expirada', hint: 'A validade deste link expirou.', badge: 'EXPIRADA' };
  }

  if (!v.ok) {
    return { status: 'not_verified', title: 'Não verificado', hint: 'Não foi possível confirmar a autenticidade com as informações disponíveis.', badge: 'NÃO VERIFICADO' };
  }

  if (!params.hasContentCommit) {
    return {
      status: 'partial',
      title: 'Verificação parcial',
      hint: 'A prova de tempo está válida. Para confirmar o conteúdo, o emissor precisa fornecer a confirmação do conteúdo (ex.: link oficial ou QR).',
      badge: 'PARCIAL'
    };
  }

  if (!v.coincidence) {
    return { status: 'mismatch', title: 'Conteúdo não confere', hint: 'O emissor é válido, mas este conteúdo não corresponde a este link.', badge: 'NÃO CONFERE' };
  }

  return { status: 'verified', title: 'Autenticidade confirmada', hint: 'Este link confirma a autenticidade do conteúdo.', badge: 'VERIFICADO' };
}

function kindLabel(kind: AnchorResponse['verified']['kind'] | undefined): string {
  if (kind === 'live') return 'Ao vivo';
  if (kind === 'vod') return 'Conteúdo publicado';
  return '—';
}

function themeFor(status: UiStatus): {
  accent: string;
  surface: string;
  border: string;
  chipBg: string;
  chipBorder: string;
  chipFg: string;
} {
  if (status === 'verified') {
    return {
      accent: '#23C55E',
      surface: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.12)',
      chipBg: 'rgba(35,197,94,0.14)',
      chipBorder: 'rgba(35,197,94,0.28)',
      chipFg: '#BFF3D1'
    };
  }
  if (status === 'partial') {
    return {
      accent: '#F59E0B',
      surface: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.12)',
      chipBg: 'rgba(245,158,11,0.14)',
      chipBorder: 'rgba(245,158,11,0.28)',
      chipFg: '#FFE4B5'
    };
  }
  if (status === 'mismatch' || status === 'not_verified') {
    return {
      accent: '#EF4444',
      surface: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.12)',
      chipBg: 'rgba(239,68,68,0.14)',
      chipBorder: 'rgba(239,68,68,0.28)',
      chipFg: '#FFD1D1'
    };
  }
  if (status === 'expired') {
    return {
      accent: '#94A3B8',
      surface: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.12)',
      chipBg: 'rgba(148,163,184,0.14)',
      chipBorder: 'rgba(148,163,184,0.28)',
      chipFg: '#DFE6F2'
    };
  }
  return {
    accent: '#94A3B8',
    surface: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.12)',
    chipBg: 'rgba(148,163,184,0.14)',
    chipBorder: 'rgba(148,163,184,0.28)',
    chipFg: '#DFE6F2'
  };
}

function confidenceLabel(conf: number | undefined): string {
  if (typeof conf !== 'number' || !Number.isFinite(conf)) return '';
  if (conf >= 0.95) return 'Alto';
  if (conf >= 0.85) return 'Médio';
  return 'Baixo';
}

export default async function VerifyAnchorPage(props: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const anchorId = props.params.id;
  const sp = props.searchParams ?? {};
  const contentCommit = typeof sp.contentCommit === 'string' ? sp.contentCommit.trim() : '';
  const v = typeof sp.v === 'string' ? sp.v.trim() : '';
  const hasCommit = Boolean(contentCommit || v);

  const base = requestBaseUrl();
  const apiQuery = v ? `?v=${encodeURIComponent(v)}` : contentCommit ? `?contentCommit=${encodeURIComponent(contentCommit)}` : '';
  const apiPath = `/api/public-anchor/${encodeURIComponent(anchorId)}${apiQuery}`;

  let data: AnchorResponse | null = null;
  try {
    const url = base ? new URL(apiPath, base).toString() : apiPath;
    const res = await fetch(url, { cache: 'no-store' });
    data = (await res.json().catch(() => null)) as AnchorResponse | null;
  } catch {
  }

  const ui = mapToUi({ data, hasContentCommit: hasCommit });
  const t = themeFor(ui.status);

  const details = data?.verified;

  return (
    <main className="pz-shell pz-shell--vivid">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 980, margin: '0 auto', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch', minHeight: 0 }}>
            <section
              className="pz-card"
              style={{
                flex: '1 1 520px',
                background: t.surface,
                border: `1px solid ${t.border}`,
                boxSizing: 'border-box',
                minHeight: 0
              }}
            >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, color: '#B9C3D6', fontWeight: 700, letterSpacing: 0.2 }}>Phoenix ZerØ</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, letterSpacing: 0.2 }}>{ui.title}</div>
              </div>
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 999,
                  background: t.chipBg,
                  border: `1px solid ${t.chipBorder}`,
                  color: t.chipFg,
                  fontWeight: 900,
                  fontSize: 12,
                  letterSpacing: 0.4
                }}
              >
                {ui.badge}
              </div>
            </div>

            <div style={{ marginTop: 12, color: '#C7D0E6', fontSize: 14, lineHeight: 1.45 }}>{ui.hint}</div>

            <div style={{ marginTop: 16, height: 1, background: 'rgba(255,255,255,0.10)' }} />

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="pz-card--subtle" style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 12, color: '#B9C3D6', fontWeight: 700 }}>Emitido por</div>
                  <div style={{ marginTop: 6, fontWeight: 900, color: '#E7ECF5' }}>{details?.creatorId || '—'}</div>
                </div>
                <div className="pz-card--subtle" style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 12, color: '#B9C3D6', fontWeight: 700 }}>Tipo</div>
                  <div style={{ marginTop: 6, fontWeight: 900, color: '#E7ECF5' }}>{kindLabel(details?.kind)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="pz-card--subtle" style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 12, color: '#B9C3D6', fontWeight: 700 }}>Válido até</div>
                  <div style={{ marginTop: 6, fontWeight: 900, color: '#E7ECF5' }}>{details?.expiresAt || '—'}</div>
                </div>
                <div className="pz-card--subtle" style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 12, color: '#B9C3D6', fontWeight: 700 }}>Nível de confiança</div>
                  <div style={{ marginTop: 6, fontWeight: 900, color: '#E7ECF5' }}>{hasCommit ? confidenceLabel(details?.confidence) || '—' : '—'}</div>
                </div>
              </div>
            </div>
          </section>

          <aside
            className="pz-card"
            style={{
              flex: '1 1 320px',
              background: t.surface,
              border: `1px solid ${t.border}`,
              boxSizing: 'border-box',
              minHeight: 0
            }}
          >
            <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Informações</div>

            <div style={{ marginTop: 12, display: 'grid', gap: 10, color: '#B9C3D6', fontSize: 13 }}>
              <div className="pz-card--subtle">
                <div style={{ fontSize: 12, color: '#B9C3D6', fontWeight: 700 }}>Identificador</div>
                <div style={{ marginTop: 6, fontWeight: 900, color: '#E7ECF5', wordBreak: 'break-all' }}>{anchorId}</div>
              </div>

              <div className="pz-card--subtle">
                <div style={{ fontSize: 12, color: '#B9C3D6', fontWeight: 700 }}>Atualizado em</div>
                <div style={{ marginTop: 6, fontWeight: 900, color: '#E7ECF5' }}>{details?.now || '—'}</div>
              </div>

              <details className="pz-json-modal" style={{ marginTop: 2 }}>
                <summary style={{ cursor: 'pointer' }}>
                  <span className="pz-link pz-json-modal-closed">Ver JSON técnico</span>
                  <span className="pz-link pz-json-modal-open">Fechar</span>
                </summary>
                <div className="pz-json-modal-content">
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      color: '#C7D0E6',
                      fontSize: 12,
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word'
                    }}
                  >
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          </aside>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'center', color: '#8FA0BF', fontSize: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: t.accent, display: 'inline-block' }} />
              <span>Um link público que prova se um conteúdo é autêntico.</span>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
