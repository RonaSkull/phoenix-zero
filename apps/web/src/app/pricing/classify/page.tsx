'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type ApiResponse = { ok: boolean; reason?: string; state?: any };

function PricingClassifyPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const sessionId = (sp.get('sessionId') || '').trim();

  const [state, setState] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const sourceVector = String(state?.sourceVector || '').trim();
  const isHybrid = sourceVector.toUpperCase() === 'HYBRID';

  const nextUrl = useMemo(() => {
    const mode = sourceVector.toLowerCase();
    const lock = mode === 'hybrid' ? '1' : '0';
    return `/pricing/protect?mode=${encodeURIComponent(mode)}&lock=${encodeURIComponent(lock)}&sessionId=${encodeURIComponent(sessionId)}`;
  }, [sessionId, sourceVector]);

  useEffect(() => {
    if (!sourceVector) return;
    if (isHybrid) return;
    const t = setTimeout(() => {
      router.replace(nextUrl);
    }, 650);
    return () => clearTimeout(t);
  }, [isHybrid, nextUrl, router, sourceVector]);

  useEffect(() => {
    if (!sessionId) return;

    (async () => {
      try {
        const res = await fetch(`/api/observe/state?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const j = (await res.json().catch(() => null)) as ApiResponse | null;
        if (j && j.ok && (j as any).state) setState((j as any).state);
      } catch {
      }
    })();
  }, [sessionId]);

  if (!sessionId) {
    return (
      <main className="pz-shell pz-shell--mono">
        <div className="pz-container">
          <div className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto' }}>
            <div style={{ color: 'rgba(255, 90, 90, 0.92)' }}>Missing sessionId</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix ZerØ</div>
          <div className="pz-rule" />
        </div>
        <div className="pz-subtitle">Classification</div>

        <div className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="pz-field-label">Source Vector</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{sourceVector || '—'}</div>
          </div>

          {sourceVector ? (
            <div style={{ display: 'grid', gap: 8, color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>
              {isHybrid ? (
                <>
                  <div>Hybrid signal asserted</div>
                  <div>Causal chain interrupted</div>
                  <div>Protection enforcement required</div>
                </>
              ) : sourceVector.toUpperCase() === 'LIVE' ? (
                <>
                  <div>Live signal confirmed</div>
                  <div>Latency behavior consistent</div>
                  <div>Live causal chain: intact</div>
                </>
              ) : (
                <>
                  <div>Recorded signal confirmed</div>
                  <div>Encoder signature detected</div>
                  <div>Frame sequence closed</div>
                </>
              )}
            </div>
          ) : (
            <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>Status: awaiting classification…</div>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {isHybrid ? (
              <>
                <button
                  type="button"
                  className="pz-btn"
                  disabled={!sourceVector || busy !== null}
                  onClick={() => {
                    setBusy('go');
                    router.push(nextUrl);
                  }}
                  style={{ opacity: !sourceVector || busy ? 0.7 : 1 }}
                >
                  {busy ? 'Processing…' : 'Proceed with enforced protection'}
                </button>
                <button
                  type="button"
                  className="pz-btn"
                  disabled={!sourceVector || busy !== null}
                  onClick={() => {
                    localStorage.removeItem('pz_observation_session');
                    router.push(`/pricing/terminated?sessionId=${encodeURIComponent(sessionId)}`);
                  }}
                  style={{ opacity: !sourceVector || busy ? 0.7 : 1 }}
                >
                  Terminate session
                </button>
              </>
            ) : (
              <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>
                Continuing…
              </div>
            )}
          </div>

          {state?.proofHash || state?.hash ? (
            <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.45, wordBreak: 'break-all' }}>
              Proof hash: {String(state.proofHash || state.hash)}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function PricingClassifyPage() {
  return (
    <Suspense>
      <PricingClassifyPageInner />
    </Suspense>
  );
}
