// app/for-ai-marketplaces/page.tsx
import { LiveDemoButton, RealDataDemoButton } from '@/components/demo';
import Link from 'next/link';

export const metadata = {
  title: 'Cryptographic Proof for Every Agent Settlement | Sovereign PPE for AI Marketplaces',
  description:
    'Agent-to-agent settlement runs with deterministic hashing and a public verify URL (/verify/<proofId>). Upload an execution batch file to generate proofs.',
};

export default function AIMarketplaceLanding() {
  const aiServiceLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Sovereign PPE',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Any',
    url: '/.well-known/ai-service.json',
    description: 'Pay-Per-Execution (PPE) service discovery and proof-gated execution for agents.',
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
          <div className="pz-kicker">Sovereign PPE</div>
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
            <div className="pz-kicker">For AI Marketplaces</div>
            <h1 style={{ margin: 0, fontSize: 'clamp(26px, 3.4vw, 44px)', lineHeight: 1.08, maxWidth: 860 }}>
              Cryptographic proof for every agent settlement.
            </h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.65, maxWidth: 920 }}>
              Sovereign PPE generates a public proof per settlement run.
              Third parties verify independently at <code>/verify/&lt;proofId&gt;</code>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <LiveDemoButton demoType="ai-marketplace" buttonText="Run end-to-end demo" />
            <a href="#real-data" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none' }}>
              Run with Real Data
            </a>
          </div>

          <div style={{ marginTop: 2, color: 'rgba(255,255,255,0.68)', fontSize: 12, lineHeight: 1.65, maxWidth: 920 }}>
            This demo uses the same production infrastructure and APIs.
          </div>

          {/* Problem/Solution Cards */}
          <div className="pz-split-single" style={{ marginTop: 8 }}>
            <div className="pz-split-panel">
              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">❌ The Problem</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>Your marketplace becomes the trust bottleneck for agent settlement evidence</li>
                  <li>Disputes fall back to internal logs and manual review</li>
                  <li>Counterparties cannot independently verify execution/settlement evidence</li>
                </ul>
              </div>

              <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div className="pz-field-label">✓ Our Solution</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                  <li>Submit an execution batch file → receive a proofId and verify URL</li>
                  <li>Integrity: SHA-256 hash of your exact file content</li>
                  <li>Verification is public — no access to your marketplace required</li>
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

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>After your demo</h2>
          <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div>- Public verify URL (<code>/verify/&lt;proofId&gt;</code>) to share with counterparties</div>
              <div>- JSON artifact (<code>/demos/ai-marketplace-report.json</code>) for your engineering team</div>
              <div>- SHA-256 hash binding the proof to your exact input file</div>
              <div>- 30-minute technical call to map your marketplace model to the template and agree proof semantics</div>
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

        {/* Watch Demo Section */}
        <section id="watch-demo" className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Overlay preview (UI template)</h2>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, lineHeight: 1.65, maxWidth: 920 }}>
            This is a static overlay template. It is not the live demo output.
            Use it to understand what a counterparty sees when you share a verify URL.
          </div>
          <div style={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, overflow: 'hidden', background: 'rgba(0,0,0,0.16)' }}>
            <iframe
              src="/demos/ai-marketplace-overlay.html"
              title="AI marketplace demo overlay"
              className="w-full"
              style={{ height: 520, border: 0 }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
            Overlay source:{' '}
            <a className="pz-link" href="/demos/ai-marketplace-overlay.html" target="_blank" rel="noreferrer">
              /demos/ai-marketplace-overlay.html
            </a>
          </div>
        </section>

        {/* Real Data Demo Section */}
        <section id="real-data" className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="pz-field-label">Live processing</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Upload an execution batch file (CSV/JSON, max 10MB)</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65, maxWidth: 920 }}>
              You provide the execution/settlement rows (IDs, batch IDs, costs, status). We hash the exact content and generate a proof for verification.
            </p>
          </div>

          <div className="pz-split-live">
            <div style={{ display: 'grid', gap: 10, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">Run</div>
              <RealDataDemoButton demoType="ai-marketplace" buttonText="Process My Agent Data" />
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>
                Modes:
                <br />
                - Transaction mode (≤ 1,000 rows): proof per execution
                <br />
                - Batch mode (&gt; 1,000 rows): one proof per batch + summary
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
              <div className="pz-field-label">Technical flow</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75, fontSize: 13 }}>
                <li>Data integrity: your file is hashed (SHA-256)</li>
                <li>Settlement run is created with your provided batch and execution IDs</li>
                <li>Settlement evidence is recorded deterministically</li>
                <li>We generate a proof and publish a verify URL</li>
              </ol>
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}>
                Privacy:
                <br />
                - Prefer pseudonymous IDs (execution_id, agent_id) rather than PII.
                <br />
                - Proof binds to hashes and batch IDs.
              </div>
            </div>
          </div>

          {/* Sample Data Download */}
          <div style={{ marginTop: 2, border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              <span style={{ opacity: 0.85 }}>💡</span> Template and required fields:{' '}
              <a href="/templates/ai_marketplace_enterprise.csv" download className="pz-link" style={{ marginLeft: 6 }}>
                Download enterprise agent execution template
              </a>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              Includes: settlement_batch_id, execution_id, agent_id, task_type, compute_units, memory_gb, hours_executed, cost_usd, token_type,
              settlement_status, settlement_window, jurisdiction, risk_rating, audit_trail_id, parent_task_id, resource_pool
            </div>
          </div>
        </section>

        {/* Output Artifact */}
        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(18px, 2.3vw, 26px)' }}>Outputs</h2>
          <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
            After a successful run, you receive:
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <div>- A <strong>proofId</strong> and a public <strong>verify URL</strong> at <code>/verify/&lt;proofId&gt;</code></div>
              <div>- A <strong>SHA-256</strong> hash binding the proof to the exact input file content</div>
              <div>
                - A JSON artifact saved at{' '}
                <a className="pz-link" href="/demos/ai-marketplace-report.json" target="_blank" rel="noreferrer">
                  /demos/ai-marketplace-report.json
                </a>
              </div>
            </div>
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
            Start with a self-serve run using your own execution batch.
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
