// app/for-banking/page.tsx
import { DemoPlayer, LiveDemoButton, ProofCard, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'BC/Febraban Reconciliation in 1 Click | Phoenix Zero for Digital Banks',
  description: 'Every transaction automatically generates BC/Febraban compliant audit trails. Upload your transaction batch and see cryptographic verification.',
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
              BC/Febraban Reconciliation in 1 Click
            </h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.65, maxWidth: 920 }}>
              Your digital bank spends <span style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 800 }}>$500k/year</span> on manual reconciliation.
              Upload your transaction batch and see cryptographic audit trails in seconds.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <LiveDemoButton demoType="banking" buttonText="⚡ Quick Demo (Simulated)" />
            <a href="#real-data" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
              🏦 Try with Transaction Data
            </a>
          </div>

          {/* Problem/Solution Cards */}
          <div className="pz-split-single" style={{ marginTop: 8 }}>
            <div className="pz-split-panel">
              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">❌ The Problem</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>3 days per month reconciling PIX and crypto transactions</li>
                  <li>Manual exports, spreadsheet juggling, error-prone submissions</li>
                  <li>One mistake = regulatory headache and BC penalties</li>
                </ul>
              </div>

              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">✓ Our Solution</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>Upload transaction batch → get cryptographic audit trail in 60s</li>
                  <li>Every transaction auto-generates BC/Febraban proof</li>
                  <li>90% cost reduction, zero reconciliation errors</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Real Data Demo Section */}
        <section id="real-data" className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="pz-field-label">🔥 Live Transaction Batch Processing</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Upload Your Transaction Batch</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
              See how your actual transaction data transforms into BC/Febraban compliant audit trails. No mock data — your real transactions hashed and verified.
            </p>
          </div>

          <div className="pz-split-live">
            <div style={{ display: 'grid', gap: 10, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">🚀 Run with Real Transaction Data</div>
              <RealDataDemoButton demoType="banking" buttonText="Process My Transaction Batch" />
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">What Happens Next?</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: 13 }}>
                <li>Your transaction CSV/JSON is hashed (SHA-256)</li>
                <li>Sovereign checkout created for batch reconciliation</li>
                <li>Payment confirmed → reconciliation executes with proof</li>
                <li>BC/Febraban proof generated — auditors verify</li>
              </ol>
            </div>
          </div>

          {/* Sample Data Download */}
          <div style={{ marginTop: 2, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              <span style={{ opacity: 0.85 }}>💡</span> Don't have transaction data ready?{' '}
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

        {/* CTA */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Ready for 90% Cost Reduction?</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
            Join leading digital banks that turned 3-day reconciliation processes into single API calls.
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
