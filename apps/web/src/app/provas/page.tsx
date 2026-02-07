import { listPaymentProofs } from '../../lib/payment-proofs';
import { toPublicGuaranteeProof } from '../../lib/guarantee-proofs';
import Link from 'next/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function trunc(s: string, n: number): string {
  const x = String(s || '');
  if (x.length <= n) return x;
  return `${x.slice(0, n)}…`;
}

function displayTaskType(taskType: string): string {
  const t = String(taskType || '').trim();
  if (!t) return 'demo_execution';
  if (/^protect_/i.test(t)) return 'demo_execution';
  if (/^stamp_/i.test(t)) return 'demo_execution';
  return t;
}

function formatAmountMinorForDisplay(amountMinor: number, currency: string): string {
  const minor = typeof amountMinor === 'number' && Number.isFinite(amountMinor) ? Math.max(0, Math.trunc(amountMinor)) : 0;
  const code = String(currency || '').trim() || 'USD';
  try {
    const nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
    const digits = Math.max(0, Math.min(8, Math.trunc(nf.resolvedOptions().maximumFractionDigits ?? 2)));
    const major = minor / Math.pow(10, digits);
    const formatted = nf.format(major);
    return `${formatted} (${code})`;
  } catch {
    return `${minor} (${code})`;
  }
}

export default async function ProvasPage() {
  const raw = await listPaymentProofs({ status: 'paid_confirmed', limit: 20 });
  const proofs = raw
    .map((p) => toPublicGuaranteeProof(p))
    .filter((p) => {
      if (!p) return false;
      const provider = String((p as any).payment?.provider || '').toLowerCase();
      const currency = String((p as any).payment?.currency || '').toUpperCase();
      if (provider === 'pix') return false;
      if (currency === 'BRL') return false;
      return true;
    });

  return (
    <main
      style={{
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
        padding: 24,
        maxWidth: 980,
        margin: '0 auto',
        color: 'rgba(255,255,255,0.92)'
      }}
    >
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(1200px 600px at 15% 10%, rgba(109, 40, 217, 0.24), transparent 60%), #050814', zIndex: -1 }} />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>Phoenix ZerØ</div>
          <h1 style={{ margin: '6px 0 0 0', fontSize: 22 }}>Public Proofs</h1>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/" style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}>Home</Link>
          <Link href="/faq" style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', textDecoration: 'none' }}>FAQ</Link>
        </div>
      </div>

      <div style={{ marginTop: 12, opacity: 0.78, fontSize: 14, lineHeight: 1.6 }}>
        Showing the latest <strong>{proofs.length}</strong> confirmed proofs (<code>paid_confirmed</code>). Open a proof to view the full public proof.
      </div>

      <div style={{ marginTop: 8, opacity: 0.65, fontSize: 12, lineHeight: 1.6 }}>
        Tip: the canonical route is <Link href="/proofs" style={{ color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}>/proofs</Link>. This page exists for compatibility.
      </div>

      <section style={{ marginTop: 16, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', background: 'rgba(0,0,0,0.18)' }}>
        {proofs.length <= 0 ? (
          <div style={{ padding: 16, opacity: 0.85 }}>No public proofs yet.</div>
        ) : (
          <div>
            {proofs.map((p) => (
              <a
                key={p!.proofId}
                href={`/verify/${encodeURIComponent(p!.proofId)}`}
                style={{
                  display: 'block',
                  padding: 14,
                  borderTop: '1px solid rgba(255,255,255,0.10)',
                  color: 'inherit',
                  textDecoration: 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>{trunc(p!.proofId, 18)}</div>
                  <div style={{ opacity: 0.72, fontSize: 12 }}>{p!.verifiedAt}</div>
                </div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
                  <div>
                    <strong>{displayTaskType(p!.task.taskType)}</strong>
                    {p!.task.taskId ? <span style={{ opacity: 0.7 }}> — {trunc(p!.task.taskId, 16)}</span> : null}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    {formatAmountMinorForDisplay(p!.payment.amountCents, p!.payment.currency)}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  <span style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>digest: {trunc(p!.digestB64Url, 28)}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
