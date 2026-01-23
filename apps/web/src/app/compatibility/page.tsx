'use client';

import { useEffect, useMemo, useState } from 'react';

type Platform = { key: string; ua: string };

type InspectResult = {
  ok: boolean;
  id?: string;
  shareUrl?: string;
  httpStatus?: number;
  tags?: {
    ogTitle?: string;
    ogDesc?: string;
    ogImage?: string;
    ogImages?: string[];
    twitterCard?: string;
    twitterImage?: string;
    twitterImages?: string[];
  };
  ogImageHead?: {
    status?: number | null;
    contentType?: string | null;
  };
  ogImagesHead?: Array<{
    url: string;
    status: number | null;
    contentType: string | null;
    cacheControl: string | null;
    contentLength: string | null;
  }>;
  reason?: string;
};

export default function CompatibilityPage() {
  const [base, setBase] = useState('');
  const [shareId, setShareId] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [results, setResults] = useState<Record<string, InspectResult>>({});
  const [loading, setLoading] = useState(false);

  const effectiveBase = useMemo(() => {
    if (base.trim()) return base.trim();
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }, [base]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/compatibility?action=platforms', { cache: 'no-store' }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as any;
      if (json?.ok && Array.isArray(json.platforms)) {
        setPlatforms(json.platforms);
      }
    })();
  }, []);

  async function createShareLink() {
    setLoading(true);
    setResults({});
    try {
      const b = effectiveBase;
      const u = new URL('/api/compatibility', window.location.origin);
      u.searchParams.set('action', 'makeShare');
      u.searchParams.set('videoUrl', `${b}/demo/assets/v1/watermarked.mp4`);
      u.searchParams.set('proofUrl', `${b}/demo/assets/v1/proof.json`);

      const resp = await fetch(u.toString(), { cache: 'no-store' });
      const json = (await resp.json().catch(() => null)) as any;
      if (json?.ok && typeof json.id === 'string') {
        setShareId(json.id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function runChecks() {
    if (!shareId) return;
    setLoading(true);
    try {
      const nextResults: Record<string, InspectResult> = {};
      for (const p of platforms) {
        const u = new URL('/api/compatibility', window.location.origin);
        u.searchParams.set('action', 'inspect');
        u.searchParams.set('id', shareId);
        u.searchParams.set('ua', p.ua);
        const res = await fetch(u.toString(), { cache: 'no-store' }).catch(() => null);
        const json = (await res?.json().catch(() => null)) as InspectResult | null;
        nextResults[p.key] = json || { ok: false, reason: 'Request failed' };
      }
      setResults(nextResults);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 980, padding: 16 }}>
      <h1>Compatibilidade de Link Preview</h1>

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 700 }}>Base URL (opcional)</label>
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="http://localhost:3001"
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 10 }}
          />
          <div style={{ fontSize: 12, color: '#6b7280' }}>Usado para montar os URLs do demo (vídeo e prova).</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={createShareLink}
            disabled={loading}
            style={{ padding: '10px 12px', borderRadius: 10, border: 0, fontWeight: 700, background: '#111827', color: '#fff' }}
          >
            Gerar share link (demo)
          </button>

          <button
            onClick={runChecks}
            disabled={loading || !shareId}
            style={{ padding: '10px 12px', borderRadius: 10, border: 0, fontWeight: 700, background: '#f3f4f6', color: '#111827' }}
          >
            Rodar checks
          </button>

          {shareId ? (
            <a href={`/s/${encodeURIComponent(shareId)}`} target="_blank" rel="noreferrer">
              Abrir /s/{shareId}
            </a>
          ) : null}
        </div>

        {platforms.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {platforms.map((p) => {
              const r = results[p.key];
              const hasImages = Array.isArray(r?.tags?.ogImages) ? (r?.tags?.ogImages?.length || 0) > 0 : Boolean(r?.tags?.ogImage);
              const allHeadOk = Array.isArray(r?.ogImagesHead)
                ? r?.ogImagesHead?.every((x) => x && x.status === 200)
                : r?.ogImageHead?.status === 200;
              const ok = Boolean(r?.ok && r.httpStatus === 200 && hasImages && allHeadOk);
              return (
                <div key={p.key} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <strong>{p.key}</strong>
                    <span style={{ fontWeight: 700, color: ok ? '#065f46' : '#92400e' }}>{ok ? 'OK' : 'WARN'}</span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>{p.ua}</div>

                  {r ? (
                    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                      <div>HTTP: {r.httpStatus ?? '-'}</div>
                      <div>og:title: {r.tags?.ogTitle || '-'}</div>
                      <div>
                        og:image:
                        {r.tags?.ogImage ? (
                          <>
                            {' '}
                            <a href={r.tags.ogImage} target="_blank" rel="noreferrer">
                              abrir
                            </a>
                            {Array.isArray(r.tags?.ogImages) && r.tags.ogImages.length > 1 ? ` (+${r.tags.ogImages.length - 1})` : null}
                          </>
                        ) : (
                          '-'
                        )}
                      </div>
                      <div>
                        og:image HEAD:
                        {Array.isArray(r.ogImagesHead) && r.ogImagesHead.length ? (
                          <span>
                            {' '}
                            {r.ogImagesHead.filter((x) => x.status === 200).length}/{r.ogImagesHead.length} ok
                          </span>
                        ) : (
                          <span>
                            {' '}
                            {r.ogImageHead?.status ?? '-'} / {r.ogImageHead?.contentType ?? '-'}
                          </span>
                        )}
                      </div>
                      {r.shareUrl ? (
                        <div>
                          shareUrl: <a href={r.shareUrl} target="_blank" rel="noreferrer">abrir</a>
                        </div>
                      ) : null}
                      {r.reason ? <div style={{ color: '#7f1d1d' }}>{r.reason}</div> : null}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, color: '#6b7280' }}>Sem resultado ainda.</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>Carregando plataformas…</div>
        )}
      </div>
    </main>
  );
}
