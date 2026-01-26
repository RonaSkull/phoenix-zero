import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { getPaymentProofById, updatePaymentProofAntifraud } from '../../../../../lib/payment-proofs';
import { isAntifraudEventProcessed, markAntifraudEventProcessed } from '../../../../../lib/antifraud/events';
import { ensureSettlementForProof } from '../../../../../lib/settlement/store';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type Body = {
  source?: string;
  eventId?: string;
  proofId?: string;
  decision?: 'clear' | 'review' | 'blocked';
  reason?: string;
};

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const source = String(body?.source || 'admin').trim() || 'admin';
  const eventId = String(body?.eventId || '').trim() || undefined;
  const proofId = String(body?.proofId || '').trim();
  const decision = String(body?.decision || '').trim().toLowerCase();
  const reason = String(body?.reason || '').trim() || undefined;

  if (!proofId) {
    return Response.json({ ok: false, reason: 'Missing proofId' }, { status: 400, headers: jsonUtf8Headers() });
  }
  if (decision !== 'clear' && decision !== 'review' && decision !== 'blocked') {
    return Response.json({ ok: false, reason: 'Invalid decision' }, { status: 400, headers: jsonUtf8Headers() });
  }

  if (eventId) {
    const seen = await isAntifraudEventProcessed({ source, eventId });
    if (seen) {
      return Response.json({ ok: true, deduped: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }
  }

  const updated = await updatePaymentProofAntifraud({ id: proofId, decision: decision as any, reason });
  if (!updated) {
    return Response.json({ ok: false, reason: 'Payment proof not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  const proof = (await getPaymentProofById(proofId)) || updated;
  const settlement = await ensureSettlementForProof({
    proof,
    sourceEventId: eventId,
    lastUpdatedBy: `antifraud:${source}`
  });

  if (eventId) {
    await markAntifraudEventProcessed({ source, eventId });
  }

  return Response.json(
    {
      ok: true,
      proofId,
      decision,
      reason: reason || null,
      settlementId: settlement?.settlementId || null
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
