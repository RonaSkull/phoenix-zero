import Link from 'next/link';

export const metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function PpeLandingPage() {
  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Sovereign PPE</div>
          <div className="pz-rule" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4.2vw, 40px)', lineHeight: 1.12 }}>Enterprise agent execution.</h1>
          <Link href="/" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Back
          </Link>
        </div>

        <p style={{ marginTop: 10, marginBottom: 14, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.6 }}>
          Run AI agents securely. Execution is released only after payment confirmation.
          Go-live commercial model is Activation Fee + Platform Access.
        </p>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="pz-field-label">What this is</div>
              <div style={{ color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
                Sovereign PPE is an API-first payment-gated execution layer for AI agents.
                <span style={{ opacity: 0.92 }}> Humans can use this page to get started; agents use the HTTP API directly.</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="pz-field-label">How it works</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                <li>Request an execution via API</li>
                <li>A crypto payment link is generated</li>
                <li>Execution runs after confirmation</li>
                <li>Receive result + receipt/proof</li>
              </ol>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <div className="pz-field-label">Why this exists</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.78)', lineHeight: 1.75 }}>
                <li>No unpaid executions</li>
                <li>Governance and controlled approvals (agent-assisted by default)</li>
                <li>Automation with verifiable receipts</li>
                <li>Built for agents and developers</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 2 }}>
            <Link href="/ppe/signup" className="pz-btn" style={{ textDecoration: 'none' }}>
              Get an API key
            </Link>
            <Link href="/proofs" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
              View proofs
            </Link>
          </div>

          <details style={{ marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>How to test with your API key</summary>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, fontSize: 13 }}>
              <div style={{ opacity: 0.9 }}>Use the tenant API key in header <code style={{ opacity: 0.9 }}>x-api-key</code>.</div>
              <div style={{ marginTop: 10, opacity: 0.9 }}>
                Operational contract: <a href="/api/docs/go-live-contract" target="_blank" rel="noreferrer">/api/docs/go-live-contract</a>
              </div>
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Agent integration contract: <a href="/api/docs/agent-integration-contract" target="_blank" rel="noreferrer">/api/docs/agent-integration-contract</a>
              </div>
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Agent trust model: <a href="/api/docs/agent-trust-model" target="_blank" rel="noreferrer">/api/docs/agent-trust-model</a>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0b1020', color: '#e5e7eb', padding: 14, borderRadius: 12, marginTop: 10 }}>
{`curl -s -X POST https://YOUR_BASE_URL/api/checkout/create \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "x-idempotency-key: YOUR_REQUEST_KEY" \
  -d '{
    "currency":"USD",
    "providerHint":"crypto",
    "lineItems":[{"operation":"reconcile_psp","units":1}],
    "proofMeta":{
      "agentId":"ag_demo",
      "taskId":"task_demo",
      "taskType":"reconcile_psp",
      "taskInputHash":"demo",
      "taskOutputHash":"demo"
    }
  }'`}</pre>
              <div style={{ marginTop: 10, opacity: 0.9 }}>
                Then poll status:
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0b1020', color: '#e5e7eb', padding: 14, borderRadius: 12, marginTop: 10 }}>
{`curl -s "https://YOUR_BASE_URL/api/checkout/status?paymentId=PAYMENT_ID" \
  -H "x-api-key: YOUR_API_KEY"`}</pre>
            </div>
          </details>

          <details style={{ marginTop: 2 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>Use cases</summary>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                <li>Paid automation workflows</li>
                <li>Agent execution marketplaces</li>
                <li>Spend-controlled agent tools (budget + cooldown + signatures)</li>
                <li>Proof of execution receipts</li>
                <li>Content authenticity proofs (phase 2)</li>
              </ul>
            </div>
          </details>

          <details style={{ marginTop: 2 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>Pricing</summary>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              Go-live pricing is Activation Fee + Platform Access. Machine-readable catalog: <a href="/api/packaging" target="_blank" rel="noreferrer">/api/packaging</a>
            </div>
          </details>

          <details style={{ marginTop: 2 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>FAQ</summary>
            <div style={{ display: 'grid', gap: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, marginTop: 10 }}>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Can agents call the API directly?</strong>
                <div>Yes. The API is designed for autonomous agents.</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Is this page for humans or agents?</strong>
                <div>Both. Humans use it as a starting point; agents integrate via HTTP.</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>What happens if payment fails?</strong>
                <div>Execution is not released.</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Do you store my data?</strong>
                <div>Only execution metadata required for billing and proof.</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Is this subscription-based?</strong>
                <div>Go-live model is Activation Fee + Platform Access (monthly).</div>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Do you support crypto?</strong>
                <div>Yes (beta). Via NowPayments.</div>
              </div>
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
