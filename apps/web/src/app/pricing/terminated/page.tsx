'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PricingTerminatedPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      router.replace('/pricing/observe');
    }, 1200);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container">
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>
        <div className="pz-subtitle">Session Terminated</div>

        <div className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'grid', gap: 12 }}>
          <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>Session closed.</div>
          <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>Returning to observation.</div>
        </div>
      </div>
    </main>
  );
}
