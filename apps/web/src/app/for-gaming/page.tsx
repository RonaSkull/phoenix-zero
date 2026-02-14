// app/for-gaming/page.tsx
import { LiveDemoButton, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Fraud-Proof Tournament Payouts | Phoenix Zero for Gaming',
  description: 'Every payout generates a public proof showing exactly who won and how much they received. Upload your tournament data and see cryptographic verification.',
};

export default function GamingLanding() {
  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix ZerØ</div>
          <div className="pz-rule" />
        </div>

        <nav style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <Link href="/enterprise-demo" className="pz-btn" style={{ textDecoration: 'none' }}>
            Enterprise Demo
          </Link>
          <Link href="/proofs" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
            Proofs
          </Link>
          <Link href="/" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', marginLeft: 'auto', opacity: 0.85 }}>
            Back
          </Link>
        </nav>

        {/* Hero Section */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="pz-kicker">For Gaming & Esports</div>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.4vw, 44px)', lineHeight: 1.08, maxWidth: 860 }}>
              Fraud-Proof Tournament Payouts
            </h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.65, maxWidth: 920 }}>
              Phoenix Zero Sovereign emits a public proof per crypto payout. Upload your tournament results and generate verifiable proof for every winner.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <LiveDemoButton demoType="gaming" buttonText="⚡ Quick Demo (Simulated)" />
            <a href="#real-data" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
              🏆 Try with Tournament Data
            </a>
          </div>

          {/* Problem/Solution Cards */}
          <div className="pz-split-single" style={{ marginTop: 8 }}>
            <div className="pz-split-panel">
              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">❌ The Problem</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>Players dispute results and payouts without independently verifiable evidence</li>
                  <li>Incident response becomes screenshots, logs, and trust-based arguments</li>
                  <li>Partners and sponsors demand stronger integrity guarantees</li>
                </ul>
              </div>

              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">✓ Our Solution</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>Upload tournament CSV/JSON → get cryptographic proof in 60s</li>
                  <li>Each payout emits a public verify URL (no trust required)</li>
                  <li>Players verify independently — complete payout transparency</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Real Data Demo Section */}
        <section id="real-data" className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="pz-field-label">🔥 Live Tournament Data Processing</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Upload Your Tournament Results</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
              See how your actual tournament data transforms into cryptographic payout proofs. No mock data — your real winners and prizes hashed and verified.
            </p>
          </div>

          <div className="pz-split-live">
            <div style={{ display: 'grid', gap: 10, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">🚀 Run with Real Tournament Data</div>
              <RealDataDemoButton demoType="gaming" buttonText="Process My Tournament Data" />
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">What Happens Next?</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: 13 }}>
                <li>Your tournament CSV/JSON is hashed (SHA-256)</li>
                <li>Sovereign checkout created for mass payout</li>
                <li>Payment confirmed → payouts execute with proof</li>
                <li>Public verify URLs generated — players verify wins</li>
              </ol>
            </div>
          </div>

          {/* Sample Data Download */}
          <div style={{ marginTop: 2, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              <span style={{ opacity: 0.85 }}>💡</span> Don't have tournament data ready?{' '}
              <a href="/templates/gaming_enterprise.csv" download className="pz-link" style={{ marginLeft: 6 }}>
                Download enterprise tournament payout template
              </a>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Includes: settlement_batch_id, payout_id, player_id, player_wallet, tournament_id, placement, prize_amount_usd, platform_fee_usd, net_payout_usd,
              token_type, payout_status, settlement_status, settlement_window, jurisdiction, risk_rating, match_id, anti_cheat_flag, audit_trail_id
            </div>
          </div>
        </section>

        {/* Watch Demo Section */}
        <section id="watch-demo" className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Watch the Overlay (Recorded Demo Template)</h2>
          <div style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden', background: 'rgba(0,0,0,0.16)' }}>
            <iframe
              src="/demos/gaming-overlay.html"
              title="Gaming demo overlay"
              className="w-full"
              style={{ height: 520, border: 0 }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
            Overlay source:{' '}
            <a className="pz-link" href="/demos/gaming-overlay.html" target="_blank" rel="noreferrer">
              /demos/gaming-overlay.html
            </a>
          </div>
        </section>

        {/* Output Artifact */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>What You Get</h2>
          <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            After you run the live demo, you receive:
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div>- A <strong>proofId</strong> and a public <strong>verify URL</strong></div>
              <div>
                - A JSON artifact saved at{' '}
                <a className="pz-link" href="/demos/gaming-report.json" target="_blank" rel="noreferrer">
                  /demos/gaming-report.json
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Ready to Become a Trust Institution?</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
            Bring one real payout flow. We validate the proof semantics end-to-end in a short technical call.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 2 }}>
            <Link href="/contact" className="pz-btn pz-btn-primary" style={{ textDecoration: 'none' }}>
              Schedule Enterprise Demo
            </Link>
            <a href="/docs/enterprise-demos" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.9 }}>
              View Documentation
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
