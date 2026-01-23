'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PricingWizardPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pricing/observe');
  }, [router]);

  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />
      <div className="pz-container">
        <div className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto' }}>
          <div style={{ color: '#8FA0BF', fontSize: 13, lineHeight: 1.55 }}>Redirecting…</div>
        </div>
      </div>
    </main>
  );
}
