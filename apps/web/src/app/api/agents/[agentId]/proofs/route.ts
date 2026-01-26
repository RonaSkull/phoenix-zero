import { requireTenant } from '../../../../../lib/tenant-auth';
import { listPaymentProofsByAgent } from '../../../../../lib/payment-proofs';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request, ctx: { params: { agentId: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const agentId = String(ctx?.params?.agentId || '').trim();
  if (!agentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') || '200');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200;

  const proofs = await listPaymentProofsByAgent({ tenantId: auth.ctx.tenantId, agentId, limit });

  const totalsByTask: Record<string, number> = {};
  let totalValueCents = 0;
  let paidCount = 0;

  for (const p of proofs) {
    totalsByTask[p.taskType] = (totalsByTask[p.taskType] || 0) + 1;
    if (p.status === 'paid_confirmed') {
      totalValueCents += p.amountCents;
      paidCount += 1;
    }
  }

  const currency = proofs.find((p) => p.currency)?.currency || auth.ctx.tenant.currency || 'USD';

  return Response.json(
    {
      ok: true,
      agentId,
      totalProofs: proofs.length,
      paidProofs: paidCount,
      totalValueCents,
      currency,
      tasks: Object.entries(totalsByTask)
        .sort((a, b) => b[1] - a[1])
        .map(([taskType, count]) => ({ taskType, count })),
      proofs
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
