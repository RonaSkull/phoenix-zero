import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>

        <nav style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <Link href="/enterprise-demo" className="pz-btn" style={{ textDecoration: 'none' }}>
            Enterprise Demo
          </Link>
          <Link href="/demo" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Demo
          </Link>
          <Link href="/provas" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
            Proofs
          </Link>
          <Link href="/ai-agents" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            AI Agents
          </Link>
          <Link href="/tools/watermark" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Tools
          </Link>
        </nav>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4.2vw, 44px)', lineHeight: 1.12 }}>
              Crypto settlement + reconciliation — with a verifiable proof per transaction.
            </h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.65, maxWidth: 920 }}>
              Reduce operational loss and manual reconciliation for crypto payment flows. Every confirmed payment can produce a public proof that can be
              verified at <code>/verify/&lt;proofId&gt;</code>.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 6 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div className="pz-field-label">What you get</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                <li>Public audit trail: proofs page + JSON verification</li>
                <li>Webhook ordering + idempotency hardening</li>
                <li>Settlement state with revert on refund events</li>
              </ul>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="pz-field-label">Proofs</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                Public proofs live at <Link href="/provas">/provas</Link>. A single proof can be verified at <code>/verify/&lt;proofId&gt;</code>.
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="pz-field-label">Evidence</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                Hardening suite: <strong>23/23</strong>. suiteRunId: <code>hardening_2026-02-04T23-45-27-845Z</code>.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 2 }}>
            <Link href="/enterprise-demo" className="pz-btn pz-btn-primary" style={{ textDecoration: 'none' }}>
              Book a technical demo
            </Link>
            <Link href="/provas" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.9 }}>
              View public proofs
            </Link>
          </div>

          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>Developer entry (PPE)</summary>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, fontSize: 13 }}>
              If you are integrating agent execution, go to <Link href="/ppe">/ppe</Link> to get an API key and test the pay-per-execution flow.
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
