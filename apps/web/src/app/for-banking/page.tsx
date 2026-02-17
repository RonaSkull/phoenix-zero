// app/for-banking/page.tsx
import { DemoPlayer, LiveDemoButton, ProofCard, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Cryptographic Audit Trail for Every Transaction Batch | Phoenix Zero for Digital Banks',
  description: 'Generate deterministic hashes and public verify URLs for reconciliation batches. Upload enterprise transaction batches to produce cryptographic audit trails.',
};

export default function BankingLanding() {
  const aiServiceLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Phoenix Zero PPE',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    url: 'https://phoenix-zero-web.onrender.com',
    description: 'Pay-Per-Execution (PPE) service discovery and payment-gated execution for agents.',
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'aiServiceDiscovery', value: '/.well-known/ai-service.json' },
      { '@type': 'PropertyValue', name: 'capabilities', value: '/api/capabilities' },
      { '@type': 'PropertyValue', name: 'pricing', value: '/api/pricing' },
      { '@type': 'PropertyValue', name: 'compatibility', value: '/api/compatibility' },
      { '@type': 'PropertyValue', name: 'agentIntegrationContract', value: '/api/docs/agent-integration-contract' },
      { '@type': 'PropertyValue', name: 'goLiveContract', value: '/api/docs/go-live-contract' }
    ]
  };

  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aiServiceLd) }} />
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
            <div className="pz-kicker">For Digital Banks</div>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.4vw, 44px)', lineHeight: 1.08, maxWidth: 860 }}>
              Cryptographic audit trail for every transaction batch.
            </h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.65, maxWidth: 920 }}>
              Submit a reconciliation batch file and receive a proofId + verify URL.
              Auditors verify independently at <code>/verify/&lt;proofId&gt;</code>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <LiveDemoButton demoType="banking" buttonText="Run end-to-end demo" />
            <a href="#real-data" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
              Run with Real Data
            </a>
          </div>

          <div style={{ marginTop: 2, color: 'rgba(255,255,255,0.68)', fontSize: 12, lineHeight: 1.65, maxWidth: 920 }}>
            This demo uses the same production infrastructure and APIs. For demo purposes only, payment confirmation is simulated.
          </div>

          {/* Problem/Solution Cards */}
          <div className="pz-split-single" style={{ marginTop: 8 }}>
            <div className="pz-split-panel">
              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">❌ The Problem</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>Reconciliation depends on manual exports and trust in internal logs</li>
                  <li>Exceptions are slow to triage and hard to prove externally</li>
                  <li>Audit evidence is not independently verifiable</li>
                </ul>
              </div>

              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">✓ Our Solution</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>Submit a batch file → receive a proofId and verify URL</li>
                  <li>Integrity: SHA-256 hash of your exact file content</li>
                  <li>Verification is public — no access to your bank systems required</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>AI agent integration</h2>
          <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            For agent-native operation and machine-readable discovery:
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div>
                <a className="pz-link" href="/.well-known/ai-service.json">/.well-known/ai-service.json</a>
              </div>
              <div>
                <a className="pz-link" href="/api/capabilities">/api/capabilities</a>
              </div>
              <div>
                <a className="pz-link" href="/api/pricing">/api/pricing</a>
              </div>
              <div>
                <a className="pz-link" href="/api/docs/agent-integration-contract">/api/docs/agent-integration-contract</a>
              </div>
              <div>
                <a className="pz-link" href="/api/docs/go-live-contract">/api/docs/go-live-contract</a>
              </div>
            </div>
          </div>
        </section>

        {/* Real Data Demo Section */}
        <section id="real-data" className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="pz-field-label">Live processing</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Upload a reconciliation batch file (CSV/JSON, max 10MB)</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
              You provide transaction rows (batch ID, account IDs, amounts, status, audit IDs). We hash the exact content and generate a proof.
            </p>
          </div>

          <div className="pz-split-live">
            <div style={{ display: 'grid', gap: 10, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">Run</div>
              <RealDataDemoButton demoType="banking" buttonText="Process My Transaction Batch" />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>
                Modes:
                <br />
                - Transaction mode (≤ 1,000 rows): proof per transaction
                <br />
                - Batch mode (&gt; 1,000 rows): one proof per batch + summary
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">Technical flow</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: 13 }}>
                <li>Data integrity: your file is hashed (SHA-256)</li>
                <li>Reconciliation run is created with your provided batch IDs</li>
                <li>Payment event is confirmed (sandbox run uses controlled confirmation)</li>
                <li>We generate a proof and publish a verify URL</li>
              </ol>
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>
                Privacy:
                <br />
                - Prefer account IDs and audit IDs over personal data.
                <br />
                - Proof binds to hashes and batch IDs.
              </div>
            </div>
          </div>

          {/* Sample Data Download */}
          <div style={{ marginTop: 2, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              <span style={{ opacity: 0.85 }}>💡</span> Template and required fields:{' '}
              <a href="/templates/banking_enterprise.csv" download className="pz-link" style={{ marginLeft: 6 }}>
                Download enterprise reconciliation template
              </a>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Includes: settlement_batch_id, reconciliation_id, account_id, transaction_date, transaction_type, amount_usd, asset, currency_pair, exchange_rate,
              counterparty_name, reference_number, settlement_status, settlement_window, jurisdiction, risk_rating, compliance_check, audit_trail_id
            </div>
          </div>
        </section>

        {/* Demo Video Section */}
        <section id="watch-demo" className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>See Automated Reconciliation In Action</h2>
          <DemoPlayer src="/demos/banking-demo.mp4" title="Digital Bank BC/Febraban Reconciliation Demo" poster="/demo-thumbnails/banking.jpg" />
        </section>

        {/* Proof Example */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>What the CFO Sees</h2>
          <ProofCard
            proofId="ppo_BANKING_RECON_001"
            title="BC/Febraban Reconciliation Ready"
            description="Monthly reconciliation that used to take 3 days now takes 2 minutes. Every transaction is born audit-ready for BC compliance."
            metrics={[
              { label: 'Time Saved', value: '90%' },
              { label: 'Transactions', value: '15K+' },
            ]}
          />
        </section>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>After your demo</h2>
          <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div>- Public verify URL (<code>/verify/&lt;proofId&gt;</code>) to share with auditors</div>
              <div>- JSON artifact (<code>/demos/banking-report.json</code>) for your engineering team</div>
              <div>- SHA-256 hash binding the proof to your exact input file</div>
              <div>- 30-minute technical call to map your reconciliation model to the template and agree proof semantics</div>
              <div>- Production rollout: 48 hours (same APIs used in the demo)</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 2 }}>
            <Link href="/enterprise-demo" className="pz-btn pz-btn-primary" style={{ textDecoration: 'none' }}>
              Schedule technical call
            </Link>
            <Link href="/proofs" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.9 }}>
              See proofs
            </Link>
          </div>
        </section>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Enterprise pricing & scale</h2>
          <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            Go-live pricing (Option 1):
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div>- Capacity starts at <strong>$15,000/month</strong> (Platform Access)</div>
              <div>- Activation Fee starts at <strong>$12,000</strong> (one-time)</div>
              <div>- Higher tiers, rate limits, and contractual overage are available upon request</div>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              Source of truth: <a className="pz-link" href="/api/packaging">/api/packaging</a>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Next step</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
            Start with a self-serve run using your own reconciliation batch.
            If you want help mapping your data model to the template and defining proof semantics, use the Enterprise Demo entrypoint.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 2 }}>
            <Link href="/enterprise-demo" className="pz-btn pz-btn-primary" style={{ textDecoration: 'none' }}>
              Request quote
            </Link>
            <a href="/api/packaging" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.9 }}>
              View packaging
            </a>
            <Link href="/ppe" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.9 }}>
              API overview
            </Link>
            <Link href="/faq" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.9 }}>
              FAQ
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
