import { getPaymentProofById } from '../../../../lib/payment-proofs';
import { toPublicGuaranteeProof } from '../../../../lib/guarantee-proofs';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(_req: Request, ctx: { params: { proofId: string } }) {
  const proofId = String(ctx?.params?.proofId || '').trim();
  if (!proofId) {
    return Response.json({ ok: false, reason: 'Missing proofId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const raw = await getPaymentProofById(proofId);
  const proof = raw ? toPublicGuaranteeProof(raw) : null;
  if (!proof) {
    return Response.json({ ok: false, reason: 'Not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true, proof }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
