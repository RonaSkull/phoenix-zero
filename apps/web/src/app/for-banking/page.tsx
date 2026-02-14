// app/for-banking/page.tsx
import { DemoPlayer, LiveDemoButton, ProofCard, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Cryptographic Audit Trail for Every Transaction Batch | Phoenix Zero for Digital Banks',
  description: 'Generate deterministic hashes and public verify URLs for reconciliation batches. Upload enterprise transaction batches to produce cryptographic audit trails.',
};

export default function BankingLanding() {
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
            <LiveDemoButton demoType="banking" buttonText="⚡ Sandbox Run (End-to-end)" />
            <a href="#real-data" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
              Run with Real Data
            </a>
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
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Enterprise pricing & scale</h2>
          <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            Volume-based tiers (indicative):
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div>- Starter: <strong>$15,000/month</strong> (≤ 10,000 batches/month)</div>
              <div>- Growth: <strong>$25,000/month</strong> (≤ 100,000 batches/month)</div>
              <div>- Enterprise: custom (100,000+ batches/month)</div>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              Includes: 99.95% uptime SLA and evidence packaging suitable for audits (proof URLs + deterministic hashing).
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Next step: technical validation</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
            Bring one reconciliation flow and one sample file.
            In a 30-minute call we validate: schema, proof semantics, and rollout plan.
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
