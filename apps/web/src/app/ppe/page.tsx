import Link from 'next/link';

export default function PpeLandingPage() {
  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>

        <h1 style={{ marginTop: 18, marginBottom: 10, fontSize: 42, lineHeight: 1.1 }}>Pay-per-execution AI agents.</h1>
        <p style={{ marginTop: 0, marginBottom: 18, color: 'rgba(255,255,255,0.72)', fontSize: 16, lineHeight: 1.65 }}>
          Run AI agents securely. Execution is released only after payment confirmation.
        </p>

        <section className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="pz-field-label">What this is</div>
            <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              Phoenix Zero PPE is an API-first payment-gated execution layer for AI agents.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div className="pz-field-label">How it works</div>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
              <li>Request an execution via API</li>
              <li>A payment link is generated (PIX / crypto)</li>
              <li>Execution runs after confirmation</li>
              <li>Receive result + receipt/proof</li>
            </ol>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <div className="pz-field-label">Why this exists</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
              <li>No unpaid executions</li>
              <li>No human approval</li>
              <li>Fully automated</li>
              <li>Built for agents and developers</li>
            </ul>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 6 }}>
            <Link href="/pricing/observe" className="pz-btn" style={{ textDecoration: 'none' }}>
              Get an API key
            </Link>
            <Link href="/provas" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
              View proofs
            </Link>
          </div>

          <div style={{ display: 'grid', gap: 8, paddingTop: 10 }}>
            <div className="pz-field-label">FAQ</div>
            <div style={{ display: 'grid', gap: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Can agents call the API directly?</strong>
                <div>Yes. The API is designed for autonomous agents.</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>What happens if payment fails?</strong>
                <div>Execution is not released.</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Is this subscription-based?</strong>
                <div>No. Pay only for what you execute.</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Do you support crypto?</strong>
                <div>Yes. USDT/USDC via NowPayments.</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
