'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type ApiResponse = { ok: boolean; reason?: string; state?: any };

function bar(value01: number): string {
  const v = Math.max(0, Math.min(1, Number(value01) || 0));
  const full = Math.round(v * 8);
  return '▓'.repeat(full) + '░'.repeat(Math.max(0, 8 - full));
}

export default function PricingObservePage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>('');
  const [state, setState] = useState<any | null>(null);
  const startedRef = useRef(false);

  const isComplete = useMemo(() => {
    if (!state) return false;
    const sourceVector = String(state.sourceVector || '').trim();
    const confidence = Number(state.confidence || 0);
    return state.state === 'CLASSIFIED' && !!sourceVector && confidence >= 70;
  }, [state]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const stored = (localStorage.getItem('pz_observation_session') || '').trim();
        if (stored) {
          setSessionId(stored);
          return;
        }
        const res = await fetch('/api/observe/start', { method: 'POST' });
        const j = (await res.json().catch(() => null)) as ApiResponse | null;
        const sid = String((j as any)?.state?.sessionId || '').trim();
        if (sid) {
          localStorage.setItem('pz_observation_session', sid);
          setSessionId(sid);
        }
      } catch {
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/observe/state?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const j = (await res.json().catch(() => null)) as ApiResponse | null;
        if (!cancelled && j && j.ok && (j as any).state) setState((j as any).state);
      } catch {
      }
    }

    const t0 = setTimeout(poll, 50);
    const id = setInterval(poll, 280);

    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearInterval(id);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!isComplete || !sessionId) return;
    router.replace(`/pricing/classify?sessionId=${encodeURIComponent(sessionId)}`);
  }, [isComplete, router, sessionId]);

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>
        <div className="pz-subtitle">Observation Mode</div>

        <div className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'grid', gap: 16 }}>
          <div style={{ border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, height: 220, display: 'grid', placeItems: 'center', color: '#8FA0BF' }}>
            SIGNAL INGESTION ACTIVE
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div className="pz-field-label">SYSTEM STATE</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
              <div style={{ color: '#8FA0BF' }}>Source Vector</div>
              <div style={{ fontWeight: 800 }}>{String(state?.sourceVector || '—')}</div>

              <div style={{ color: '#8FA0BF' }}>Detection Confidence</div>
              <div style={{ fontWeight: 800 }}>{Number.isFinite(Number(state?.confidence ?? NaN)) ? `${Number(state?.confidence).toFixed(1)}%` : '—'}</div>

              <div style={{ color: '#8FA0BF' }}>Temporal Flow</div>
              <div style={{ fontWeight: 800 }}>{bar(Number(state?.temporalFlow || 0))}</div>

              <div style={{ color: '#8FA0BF' }}>Causal Integrity</div>
              <div style={{ fontWeight: 800 }}>{bar(Number(state?.causalIntegrity || 0))}</div>

              <div style={{ color: '#8FA0BF' }}>Synthetic Probability</div>
              <div style={{ fontWeight: 800 }}>{bar(1 - Number(state?.syntheticProbability || 0))}</div>
            </div>

            <div style={{ color: '#8FA0BF', fontSize: 12, lineHeight: 1.55 }}>
              Status: Observation in progress
              <br />
              User interaction locked
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
