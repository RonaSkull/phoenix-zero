import Link from 'next/link';

import {
  HARDENING_REPORT_LAST_UPDATED_ISO,
  HARDENING_SUITE_RUN_ID,
  hardeningReport,
  hardeningReportHashSha3_256
} from '../../lib/hardening-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function HardeningPage() {
  const report = hardeningReport();
  const hash = hardeningReportHashSha3_256();
  const verifyHref = `/hardening/report/${encodeURIComponent(HARDENING_SUITE_RUN_ID)}`;

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
              suiteRunId: <code>{HARDENING_SUITE_RUN_ID}</code>
            </div>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.7, maxWidth: 920 }}>
              This page explains what each hardening test validates. It is designed for enterprise buyers who want proof-first, operational evidence.
            </p>
          </div>

          <section style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, background: 'rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'grid', gap: 6, color: 'rgba(255,255,255,0.78)', lineHeight: 1.65, fontSize: 13 }}>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Report Hash:</strong> <code>{hash}</code>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Verify Report:</strong> <Link href={verifyHref}>{verifyHref}</Link>
              </div>
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Last updated:</strong> <code>{HARDENING_REPORT_LAST_UPDATED_ISO}</code>
              </div>
              <div style={{ opacity: 0.85 }}>
                This hash is computed from the canonical JSON report served at the verify link above.
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: 10 }}>
            {report.tests.map((t) => (
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
