import Link from 'next/link';

export const metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function EnterpriseDemoPage() {
  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 34px)', lineHeight: 1.15 }}>Enterprise demo</h1>
          <Link href="/" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Back
          </Link>
        </div>

        <p style={{ marginTop: 10, marginBottom: 14, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.6, maxWidth: 920 }}>
          For an enterprise pilot, we run a short technical call. You bring a real flow, we validate integration, and we show a public proof per
          confirmed transaction (e.g. <code>/proofs</code> and <code>/verify/&lt;proofId&gt;</code>).
        </p>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
            <div>
              <div className="pz-field-label">Send by email</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                <li>Monthly volume (USDC) and number of transactions</li>
                <li>Current provider and settlement chains</li>
                <li>Your current ledger/reconciliation format</li>
              </ul>
            </div>

            <div>
              <div className="pz-field-label">Contact</div>
              <div style={{ marginTop: 6 }}>
                <a href="mailto:partnerships@phoenix-zero.com" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  partnerships@phoenix-zero.com
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
              <Link href="/proofs" className="pz-btn" style={{ textDecoration: 'none' }}>
                View proofs
              </Link>
              <Link href="/ppe" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
                AI agents (PPE)
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
