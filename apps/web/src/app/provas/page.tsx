import { listPaymentProofs } from '../../lib/payment-proofs';
import { toPublicGuaranteeProof } from '../../lib/guarantee-proofs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function trunc(s: string, n: number): string {
  const x = String(s || '');
  if (x.length <= n) return x;
  return `${x.slice(0, n)}…`;
}

export default async function ProvasPage() {
  const raw = await listPaymentProofs({ status: 'paid_confirmed', limit: 20 });
  const proofs = raw.map((p) => toPublicGuaranteeProof(p)).filter(Boolean);

  return (
    <main style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial', padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>Phoenix Zero</div>
          <h1 style={{ margin: '6px 0 0 0', fontSize: 22 }}>Provas públicas</h1>
        </div>
        <a href="/" style={{ fontSize: 14 }}>Home</a>
      </div>

      <div style={{ marginTop: 12, opacity: 0.8, fontSize: 14 }}>
        Últimas {proofs.length} provas confirmadas (paid_confirmed). IDs completos só em /verify.
      </div>

      <section style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {proofs.length <= 0 ? (
          <div style={{ padding: 16 }}>Nenhuma prova pública ainda.</div>
        ) : (
          <div>
            {proofs.map((p) => (
              <a
                key={p!.proofId}
                href={`/verify/${encodeURIComponent(p!.proofId)}`}
                style={{ display: 'block', padding: 14, borderTop: '1px solid #e5e7eb', color: 'inherit', textDecoration: 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>{trunc(p!.proofId, 18)}</div>
                  <div style={{ opacity: 0.75, fontSize: 12 }}>{p!.verifiedAt}</div>
                </div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
                  <div>
                    <strong>{p!.task.taskType}</strong>
                    {p!.task.taskId ? <span style={{ opacity: 0.7 }}> — {trunc(p!.task.taskId, 16)}</span> : null}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    {p!.payment.amountCents} cents ({p!.payment.currency})
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  digest: {trunc(p!.digestB64Url, 28)}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
