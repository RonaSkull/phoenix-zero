import { notFound } from 'next/navigation';

import { getPaymentProofById } from '../../../lib/payment-proofs';
import { toPublicGuaranteeProof } from '../../../lib/guarantee-proofs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function trunc(s: string, n: number): string {
  const x = String(s || '');
  if (x.length <= n) return x;
  return `${x.slice(0, n)}…`;
}

function formatAmountMinorForDisplay(amountMinor: number, currency: string): string {
  const minor = typeof amountMinor === 'number' && Number.isFinite(amountMinor) ? Math.max(0, Math.trunc(amountMinor)) : 0;
  const code = String(currency || '').trim() || 'USD';
  try {
    const nf = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code });
    const digits = Math.max(0, Math.min(8, Math.trunc(nf.resolvedOptions().maximumFractionDigits ?? 2)));
    const major = minor / Math.pow(10, digits);
    const formatted = nf.format(major);
    return `${formatted} (${code})`;
  } catch {
    return `${minor} (${code})`;
  }
}

export default async function VerifyProofPage(props: { params: { proofId: string } }) {
  const proofId = String(props?.params?.proofId || '').trim();
  if (!proofId) notFound();

  const raw = await getPaymentProofById(proofId);
  const proof = raw ? toPublicGuaranteeProof(raw) : null;
  if (!proof) notFound();

  return (
    <main style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial', padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>Phoenix Zero</div>
          <h1 style={{ margin: '6px 0 0 0', fontSize: 22 }}>Proof Verified</h1>
        </div>
        <a href="/provas" style={{ fontSize: 14 }}>Ver últimas provas</a>
      </div>

      <section style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div><strong>proofId:</strong> {proof.proofId}</div>
          <div><strong>verifiedAt:</strong> {proof.verifiedAt}</div>
          <div>
            <strong>payment:</strong> {proof.payment.provider} — {formatAmountMinorForDisplay(proof.payment.amountCents, proof.payment.currency)}
          </div>
          <div><strong>taskType:</strong> {proof.task.taskType}</div>
          {proof.task.taskId ? <div><strong>taskId:</strong> {proof.task.taskId}</div> : null}
          <div><strong>taskInputHash:</strong> {proof.task.taskInputHash}</div>
          <div><strong>taskOutputHash:</strong> {proof.task.taskOutputHash}</div>
          <div>
            <strong>digest:</strong> {proof.digestB64Url}
            <span style={{ opacity: 0.7 }}> ({trunc(proof.digestB64Url, 22)})</span>
          </div>
          {proof.signature?.verified !== undefined ? (
            <div><strong>signatureVerified:</strong> {String(proof.signature.verified)}</div>
          ) : null}
          {proof.signature?.payloadHashB64Url ? (
            <div><strong>signaturePayloadHash:</strong> {proof.signature.payloadHashB64Url}</div>
          ) : null}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Public JSON</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0b1020', color: '#e5e7eb', padding: 16, borderRadius: 12 }}>
          {JSON.stringify(proof, null, 2)}
        </pre>
      </section>
    </main>
  );
}
