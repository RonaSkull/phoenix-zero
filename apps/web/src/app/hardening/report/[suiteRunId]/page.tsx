import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  HARDENING_REPORT_LAST_UPDATED_ISO,
  HARDENING_SUITE_RUN_ID,
  hardeningReport,
  hardeningReportHashSha3_256
} from '../../../../lib/hardening-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function HardeningReportPage(props: { params: { suiteRunId: string } }) {
  const suiteRunId = String(props?.params?.suiteRunId || '').trim();
  if (!suiteRunId) notFound();
  if (suiteRunId !== HARDENING_SUITE_RUN_ID) notFound();

  const report = hardeningReport();
  const hash = hardeningReportHashSha3_256();

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
          <Link href="/hardening" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Hardening
          </Link>
          <Link href="/" className="pz-btn pz-btn-ghost" style={{ textDecoration: 'none', opacity: 0.85 }}>
            Home
          </Link>
        </nav>

        <section className="pz-card-flat" style={{ maxWidth: 980, width: '100%', margin: '14px auto 0 auto', display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 3.6vw, 36px)', lineHeight: 1.12 }}>Hardening report</h1>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.7 }}>
              suiteRunId: <code>{suiteRunId}</code>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.7 }}>
              Report Hash: <code>{hash}</code>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.7 }}>
              Last updated: <code>{HARDENING_REPORT_LAST_UPDATED_ISO}</code>
            </div>
          </div>

          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#0b1020',
              color: '#e5e7eb',
              padding: 14,
              borderRadius: 12,
              margin: 0,
              border: '1px solid rgba(255,255,255,0.12)'
            }}
          >
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
