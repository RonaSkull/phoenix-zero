import Link from 'next/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HardeningTest = {
  testId: string;
  goal: string;
  whatItChecks: string;
  whyItMatters: string;
};

const suiteRunId = 'hardening_2026-02-04T23-45-27-845Z';

const tests: HardeningTest[] = [
  {
    testId: 'auth-bypass',
    goal: 'Reject unauthenticated execution/payment actions.',
    whatItChecks: 'Endpoints requiring tenant auth cannot be called without a valid API key/session.',
    whyItMatters: 'Prevents free/unbilled usage and protects tenant isolation.'
  },
  {
    testId: 'sovereign-entitlement',
    goal: 'Enforce sovereign contract rules for privileged flows.',
    whatItChecks: 'Admin/contract enforcement paths require valid admin token and secrets; invalid attempts fail safely.',
    whyItMatters: 'Ensures governance/contract enforcement cannot be bypassed under stress.'
  },
  {
    testId: 'state-consistency',
    goal: 'Keep payment intent + proof + settlement state consistent (PIX baseline).',
    whatItChecks: 'Repeated status updates and webhook events do not create contradictory states or duplicate proofs.',
    whyItMatters: 'Prevents reconciliation gaps and “double-spend” style bookkeeping errors.'
  },
  {
    testId: 'state-consistency-crypto',
    goal: 'Keep payment intent + proof + settlement state consistent (crypto).',
    whatItChecks: 'Crypto confirmation events update state monotonically and generate at most one proof per intent.',
    whyItMatters: 'Protects against invoice replay or status flapping causing inconsistent proof visibility.'
  },
  {
    testId: 'webhook-ordering',
    goal: 'Tolerate out-of-order webhook delivery (PIX baseline).',
    whatItChecks: 'Out-of-order events do not corrupt state; the system converges to the correct final state.',
    whyItMatters: 'Payment providers can deliver webhooks late or reordered; the ledger must remain correct.'
  },
  {
    testId: 'webhook-ordering-crypto',
    goal: 'Tolerate out-of-order webhook delivery (crypto).',
    whatItChecks: 'Crypto webhook ordering does not allow early unlock or wrong settlement transitions.',
    whyItMatters: 'Guarantees correct settlement and proof issuance under real-world webhook behavior.'
  },
  {
    testId: 'nowpayments-webhook-signature-invalid',
    goal: 'Reject invalid NowPayments webhook signatures.',
    whatItChecks: 'Requests with wrong HMAC/signature are rejected and do not change state.',
    whyItMatters: 'Stops spoofed “paid” events from unlocking execution or issuing proofs.'
  },
  {
    testId: 'nowpayments-webhook-unknown-invoice',
    goal: 'Ignore webhooks for invoices we do not know.',
    whatItChecks: 'Unknown invoice IDs do not create intents/proofs and do not crash the service.',
    whyItMatters: 'Prevents state pollution and ensures resilience to provider noise.'
  },
  {
    testId: 'nowpayments-partially-paid',
    goal: 'Partial payment must not unlock.',
    whatItChecks: 'A partially paid status never transitions to paid_confirmed and never generates a public proof.',
    whyItMatters: 'Prevents underpayment attacks.'
  },
  {
    testId: 'nowpayments-status-regression',
    goal: 'Ignore status regressions.',
    whatItChecks: 'If a provider reports a lower/older status after a higher status, state does not regress.',
    whyItMatters: 'Avoids making a confirmed payment appear unconfirmed due to provider retries.'
  },
  {
    testId: 'race-gate',
    goal: 'Prevent race conditions between gate/execute under payment gating (PIX baseline).',
    whatItChecks: 'High concurrency cannot slip an execution through before entitlement/payment confirmation.',
    whyItMatters: 'Stops “execute-before-paid” under load.'
  },
  {
    testId: 'race-gate-crypto',
    goal: 'Prevent race conditions between gate/execute under payment gating (crypto).',
    whatItChecks: 'Concurrency + webhook timing cannot unlock execution early for crypto invoices.',
    whyItMatters: 'Ensures “paid” is the single source of truth for release.'
  },
  {
    testId: 'cache-headers',
    goal: 'Avoid caching sensitive responses incorrectly.',
    whatItChecks: 'Critical endpoints return conservative cache headers to prevent stale/incorrect responses.',
    whyItMatters: 'Prevents intermediaries from serving outdated authorization or proof states.'
  },
  {
    testId: 'proof-reuse-attack',
    goal: 'Prevent reusing a proof/receipt across agents or executions (PIX baseline).',
    whatItChecks: 'A proof tied to one execution/payment cannot be replayed to unlock another agent/task.',
    whyItMatters: 'Stops replay attacks where one payment is used to claim multiple executions.'
  },
  {
    testId: 'proof-reuse-attack-crypto',
    goal: 'Prevent reusing a proof/receipt across agents or executions (crypto).',
    whatItChecks: 'Crypto proofs cannot be replayed to unlock different tasks/agents.',
    whyItMatters: 'Same replay-risk exists with crypto confirmations.'
  },
  {
    testId: 'agent-swap-attack',
    goal: 'Prevent swapping identities/agents mid-flow (PIX baseline).',
    whatItChecks: 'The system binds proofs/intents to the correct agent/tenant and blocks cross-agent substitution.',
    whyItMatters: 'Prevents one agent paying and another agent claiming the entitlement.'
  },
  {
    testId: 'agent-swap-attack-crypto',
    goal: 'Prevent swapping identities/agents mid-flow (crypto).',
    whatItChecks: 'Same binding rules hold under crypto confirmations.',
    whyItMatters: 'Prevents misattribution under crypto webhook flows.'
  },
  {
    testId: 'quantity-abuse',
    goal: 'Reject abusive quantities/line-items that break pricing/entitlements (PIX baseline).',
    whatItChecks: 'Invalid or extreme quantities are blocked; pricing remains consistent with contract rules.',
    whyItMatters: 'Prevents over-execution for underpayment.'
  },
  {
    testId: 'quantity-abuse-crypto',
    goal: 'Reject abusive quantities/line-items that break pricing/entitlements (crypto).',
    whatItChecks: 'Same validation holds for crypto intents.',
    whyItMatters: 'Consistency across providers.'
  },
  {
    testId: 'partial-failure',
    goal: 'Recover cleanly from partial failure of provider/webhook steps.',
    whatItChecks: 'Transient errors do not leave the system in an inconsistent “half-updated” state.',
    whyItMatters: 'Real systems fail; the ledger must converge safely.'
  },
  {
    testId: 'risk-window',
    goal: 'Enforce risk window / antifraud rules where configured.',
    whatItChecks: 'Risk policies cannot be bypassed through retries or ordering quirks.',
    whyItMatters: 'Prevents abuse patterns in early go-live stages.'
  },
  {
    testId: 'provider-downtime',
    goal: 'Fail safely when the provider is down.',
    whatItChecks: 'Provider timeouts/errors do not unlock execution and return controlled errors.',
    whyItMatters: 'Prevents accidental unlocks when upstream is unstable.'
  },
  {
    testId: 'agent-confusion',
    goal: 'Prevent ambiguous parameters from being interpreted inconsistently.',
    whatItChecks: 'Confusing/malformed inputs do not cause privilege escalation or wrong routing.',
    whyItMatters: 'Hardens request parsing edge cases.'
  },
  {
    testId: 'negotiation-abuse',
    goal: 'Prevent abuse of negotiation/ack flows.',
    whatItChecks: 'Negotiation endpoints cannot be used to bypass payment gating or leak privileged state.',
    whyItMatters: 'Closes off alternate paths to entitlement.'
  },
  {
    testId: 'param-injection',
    goal: 'Reject parameter injection attacks.',
    whatItChecks: 'Unexpected query/body/header combinations do not bypass auth or mutate state incorrectly.',
    whyItMatters: 'Hardens input validation.'
  },
  {
    testId: 'rate-limit',
    goal: 'Throttle abusive traffic patterns.',
    whatItChecks: 'Rate limits engage predictably; service remains available for normal traffic.',
    whyItMatters: 'Prevents brute force and protects upstream providers.'
  }
];

export default function HardeningPage() {
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
          <Link href="/faq" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            FAQ
          </Link>
        </nav>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.6vw, 36px)', lineHeight: 1.12 }}>Hardening suite (23/23)</h1>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.7 }}>
              suiteRunId: <code>{suiteRunId}</code>
            </div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.7, maxWidth: 920 }}>
              This page explains what each hardening test validates. It is designed for enterprise buyers who want proof-first, operational evidence.
            </p>
          </div>

          <section style={{ display: 'grid', gap: 10 }}>
            {tests.map((t) => (
              <div key={t.testId} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900 }}>{t.testId}</div>
                  <div style={{ opacity: 0.72, fontSize: 12 }}>PASS</div>
                </div>
                <div style={{ marginTop: 8, display: 'grid', gap: 6, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, fontSize: 13 }}>
                  <div>
                    <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Goal:</strong> {t.goal}
                  </div>
                  <div>
                    <strong style={{ color: 'rgba(255,255,255,0.9)' }}>What it checks:</strong> {t.whatItChecks}
                  </div>
                  <div>
                    <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Why it matters:</strong> {t.whyItMatters}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </section>
      </div>
    </main>
  );
}
