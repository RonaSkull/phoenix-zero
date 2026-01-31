import Link from 'next/link';

export const metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function PpeLandingPage() {
  return (
    <main className="pz-shell pz-shell--mono">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 20, paddingBottom: 24 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix Zero</div>
          <div className="pz-rule" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 4.2vw, 40px)', lineHeight: 1.12 }}>Pay-per-execution AI agents.</h1>
          <Link href="/" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Back
          </Link>
        </div>

        <p style={{ marginTop: 10, marginBottom: 14, color: 'rgba(255,255,255,0.72)', fontSize: 15, lineHeight: 1.6 }}>
          Run AI agents securely. Execution is released only after payment confirmation.
        </p>

        <section className="pz-card-flat" style={{ maxWidth: 860, width: '100%', margin: '0 auto', display: 'grid', gap: 12 }}>
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 2 }}>
            <Link href="/pricing/observe" className="pz-btn" style={{ textDecoration: 'none' }}>
              Get an API key
            </Link>
            <Link href="/provas" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
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
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0b1020', color: '#e5e7eb', padding: 14, borderRadius: 12, marginTop: 10 }}>
{`curl -s -X POST https://phoenix-zero-web.onrender.com/api/checkout/create \
  -H "content-type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "currency":"BRL",
    "providerHint":"pix",
    "lineItems":[{"operation":"video_protection","units":1}],
    "proofMeta":{
      "agentId":"ag_demo",
      "taskId":"task_demo",
      "taskType":"video_protection",
      "taskInputHash":"demo",
      "taskOutputHash":"demo"
    }
  }'`}</pre>
              <div style={{ marginTop: 10, opacity: 0.9 }}>
                Then poll status:
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0b1020', color: '#e5e7eb', padding: 14, borderRadius: 12, marginTop: 10 }}>
{`curl -s "https://phoenix-zero-web.onrender.com/api/checkout/status?paymentId=PAYMENT_ID" \
  -H "x-api-key: YOUR_API_KEY"`}</pre>
            </div>
          </details>

          <details style={{ marginTop: 2 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>Use cases</summary>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                <li>Paid automation workflows</li>
                <li>Agent execution marketplaces</li>
                <li>Proof of execution receipts</li>
                <li>Content authenticity proofs (phase 2)</li>
              </ul>
            </div>
          </details>

          <details style={{ marginTop: 2 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 700 }}>Pricing</summary>
            <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
              Transparent. Per execution. No hidden fees.
            </div>
          </details>

          <div style={{ display: 'grid', gap: 8, paddingTop: 6 }}>
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
                <strong style={{ color: 'rgba(255,255,255,0.88)' }}>Do you store my data?</strong>
                <div>Only execution metadata required for billing and proof.</div>
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
