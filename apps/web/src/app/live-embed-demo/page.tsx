'use client';

import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';

export default function LiveEmbedDemoPage() {
  const [mounted, setMounted] = useState(false);
  const [jobId, setJobId] = useState('');
  const [base, setBase] = useState('');

  useEffect(() => {
    setMounted(true);
    try {
      setBase(window.location.origin);
      const url = new URL(window.location.href);
      const q = url.searchParams.get('jobId') || '';
      if (q) setJobId(q);
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      const w = window as any;
      if (w && w.PhoenixZeroLiveEmbed && typeof w.PhoenixZeroLiveEmbed.runAll === 'function') {
        w.PhoenixZeroLiveEmbed.runAll();
      }
    } catch {
    }
  }, [jobId]);

  const snippet = useMemo(() => {
    const b = base || '';
    return `<div data-phoenix-zero-live-embed data-api-base="${b}" data-job-id="${jobId}"></div>\n<script src="${b}/phoenix-zero-live-embed.js" defer></script>`;
  }, [base, jobId]);

  return (
    <main style={{ maxWidth: 920, padding: 16 }}>
      <h1>Live Embed Demo</h1>

      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 700 }}>jobId</label>
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="cole o jobId aqui"
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 10 }}
          />
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Dica: crie uma sessão em <a href="/live-stream" target="_blank" rel="noreferrer">/live-stream</a>.
          </div>
        </div>

        <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 12 }}>
          {mounted ? (
            <div
              key={jobId || 'empty'}
              data-phoenix-zero-live-embed
              data-api-base=""
              data-job-id={jobId}
              style={{ display: 'inline-block' }}
            />
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Snippet</div>
          <textarea
            value={snippet}
            readOnly
            style={{ width: '100%', minHeight: 110, padding: 10, border: '1px solid #d1d5db', borderRadius: 10 }}
          />
        </div>
      </div>

      <Script src="/phoenix-zero-live-embed.js" strategy="afterInteractive" />
    </main>
  );
}
