import Link from 'next/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function FAQPage() {
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
          <Link href="/" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Home
          </Link>
          <Link href="/proofs" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Proofs
          </Link>
          <Link href="/enterprise-demo" className="pz-btn" style={{ textDecoration: 'none' }}>
            Enterprise Demo
          </Link>
        </nav>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.6vw, 36px)', lineHeight: 1.12 }}>FAQ — Sovereign agent execution + proofs</h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.7, maxWidth: 920 }}>
              This FAQ is written for enterprise teams evaluating pay-per-execution infrastructure for autonomous agents, with verifiable proof URLs.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <details open>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                What is a “proof” in Phoenix ZerØ?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                A proof is a public, immutable JSON payload that represents a single confirmed payment + the task hashes it settles.
                Anyone can verify it by opening <code>/verify/&lt;proofId&gt;</code> or by fetching the JSON.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                What exactly can a third party verify?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                A verifier can check:
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
                  <li><strong>Payment attributes</strong>: provider, currency, amount (minor units)</li>
                  <li><strong>Task evidence</strong>: <code>taskInputHash</code> and <code>taskOutputHash</code></li>
                  <li><strong>Digest</strong>: a stable hash of the public proof JSON</li>
                  <li><strong>Optional signature fields</strong>: if present, signature metadata is exposed</li>
                </ul>
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                How does crypto settlement work?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                We create a payment intent and generate a crypto invoice via a provider (NowPayments). When the provider confirms the payment,
                a webhook updates the intent to <code>paid</code>, and Phoenix ZerØ generates a public proof.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                Do you store or process our content?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                No. Phoenix ZerØ is designed to store payment metadata, execution metadata, and cryptographic hashes.
                You can structure tasks so that sensitive inputs never leave your boundary.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                Can we verify a proof without your API?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                Yes. Proof verification is based on a self-contained JSON payload (plus deterministic hashing). You can archive the public JSON and
                independently verify the digest and fields. The <code>/verify/&lt;proofId&gt;</code> page is provided for convenience and sharing.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                What’s the minimal integration required?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                One authenticated HTTP request:
                <div style={{ marginTop: 8 }}>
                  <code>POST /api/agents/&lt;agentId&gt;/execute</code>
                </div>
                Use your API key from <Link href="/ppe/signup">/ppe/signup</Link> (header <code>x-api-key</code>) and send <code>taskId</code> + <code>taskType</code>.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                What happens on refund/chargeback?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                If the provider reports a refund/chargeback, Phoenix ZerØ can revert settlement state and the proof will no longer be public
                (<code>/verify</code> will show “not available”).
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                Which cryptos do you support?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                We default to an enterprise set (stablecoins + BTC/ETH) because it covers most volume. See the table on the homepage.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                Can we verify proofs from mobile?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                Yes. Proof URLs are public and can be shared via WhatsApp/Telegram/email. Open <code>/proofs</code> to see recent proofs
                or scan the QR codes on the homepage.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                What do you mean by “proof-first” and “ethical messaging”?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                We avoid claims we cannot prove (e.g. blanket ROI statements). Instead, we publish verifiable artifacts:
                proof URLs, public JSON, hardening coverage, and deterministic hashes.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                What is “hardening 23/23”?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                It is an automated test suite that checks webhook ordering, idempotency, and proof/settlement invariants. See <Link href="/hardening">/hardening</Link>
                for the detailed test list.
              </div>
            </details>

            <details>
              <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.88)', fontWeight: 800 }}>
                How do we integrate?
              </summary>
              <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7, fontSize: 13 }}>
                Start by getting an API key at <Link href="/ppe/signup">/ppe/signup</Link>.
                For agent execution, call <code>POST /api/agents/&lt;agentId&gt;/execute</code>.
                For crypto settlement, configure the NowPayments webhook secret.
              </div>
            </details>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
            <Link href="/proofs" className="pz-btn pz-btn-primary" style={{ textDecoration: 'none' }}>
              See proofs
            </Link>
            <Link href="/enterprise-demo" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.9 }}>
              Book a technical demo
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
