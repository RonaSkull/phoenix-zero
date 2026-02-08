import Link from 'next/link';

import { HARDENING_REPORT_LAST_UPDATED_ISO, HARDENING_SUITE_RUN_ID, hardeningReportHashSha3_256 } from '../../lib/hardening-report';

export const metadata = {
  robots: {
    index: false,
    follow: false
  }
};

export default function EnterpriseDemoPage() {
  const hardeningReportHref = `/hardening/report/${encodeURIComponent(HARDENING_SUITE_RUN_ID)}`;
  const reportHash = hardeningReportHashSha3_256();

  return (
    <main className="pz-shell pz-shell--mono pz-shell--scroll">
      <div className="pz-grid" />
      <div className="pz-glow" />

      <div className="pz-container" style={{ paddingTop: 14, paddingBottom: 18 }}>
        <div className="pz-topline">
          <div className="pz-kicker">Phoenix ZerØ</div>
          <div className="pz-rule" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.4vw, 34px)', lineHeight: 1.15 }}>Enterprise demo</h1>
          <Link href="/" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Back
          </Link>
        </div>

        <p style={{ marginTop: 10, marginBottom: 14, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.6, maxWidth: 920 }}>
          For an enterprise pilot, we run a short technical call. You bring a real flow, we validate integration, and we show a public proof per
          confirmed transaction (e.g. <code>/proofs</code> and <code>/verify/&lt;proofId&gt;</code>).
        </p>

        <section
          className="pz-card-flat"
          style={{ maxWidth: 980, width: '100%', margin: '0 auto 14px auto', display: 'grid', gap: 10, padding: 12 }}
        >
          <div style={{ display: 'grid', gap: 8, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, fontSize: 13 }}>
            <div style={{ fontWeight: 900, color: 'rgba(255,255,255,0.92)' }}>Verifiable technical facts</div>
            <div>
              Hardening: <strong>23/23</strong> passed — suiteRunId: <code>{HARDENING_SUITE_RUN_ID}</code>
            </div>
            <div>
              Canonical report JSON: <Link href={hardeningReportHref}>{hardeningReportHref}</Link>
            </div>
            <div>
              Report hash (SHA3-256): <code>{reportHash}</code>
            </div>
            <div>
              Last updated: <code>{HARDENING_REPORT_LAST_UPDATED_ISO}</code>
            </div>
            <div>
              Webhooks (NowPayments): signature validated via <code>x-nowpayments-sig</code> (HMAC-SHA512)
            </div>
            <div>SLA: 99.95% uptime (30-day history)</div>
            <div>Wind-down: 90 days migration + full ledger export</div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
            <Link href="/proofs" className="pz-btn" style={{ textDecoration: 'none' }}>
              View proofs
            </Link>
            <Link href="/hardening" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.9 }}>
              View hardening
            </Link>
            <Link href="/ppe" className="pz-btn" style={{ textDecoration: 'none', opacity: 0.85 }}>
              AI agents (PPE)
            </Link>
          </div>
        </section>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65 }}>
            <div>
              <div className="pz-field-label">Bring your real flow</div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                <li>One end-to-end reconciliation case you care about</li>
                <li>Your settlement chain(s) and provider(s)</li>
                <li>What you want the public proof to attest</li>
              </ul>
            </div>

            <div>
              <div className="pz-field-label">Contact</div>
              <div style={{ marginTop: 6 }}>
                <a href="mailto:partnerships@phoenix-zero.com" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  partnerships@phoenix-zero.com
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
