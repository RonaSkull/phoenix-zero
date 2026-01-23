'use client';

import { useMemo } from 'react';

export default function LiveChallengePage() {
  const jobId = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('jobId');
    } catch {
      return null;
    }
  }, []);

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Desafio ao vivo</h1>

      {!jobId ? (
        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 12 }}>
          Falta o parametro <code>jobId</code>.
        </div>
      ) : null}

      {jobId ? (
        <div style={{ padding: 12, border: '1px solid #ddd', borderRadius: 12, display: 'grid', gap: 10 }}>
          <div style={{ color: '#666' }}>
            Sessao: <code>{jobId}</code>
          </div>

          <div style={{ color: '#666' }}>Esta pagina foi desativada no modo Q-STEP puro.</div>
        </div>
      ) : null}
    </main>
  );
}
