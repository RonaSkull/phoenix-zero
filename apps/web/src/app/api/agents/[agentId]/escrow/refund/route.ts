import { requireTenant } from '../../../../../../lib/tenant-auth';
import { refundEscrow } from '../../../../../../lib/escrow/store';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type Body = {
  escrowId?: string;
  sourceEventId?: string;
  nowMs?: number;
};

export async function POST(req: Request, ctx: { params: { agentId: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const payerAgentId = String(ctx?.params?.agentId || '').trim();
  if (!payerAgentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const escrowId = String(body?.escrowId || '').trim();
  const sourceEventId = String(body?.sourceEventId || '').trim() || undefined;
  const nowMs = body && typeof body.nowMs === 'number' && Number.isFinite(body.nowMs) ? body.nowMs : undefined;

  if (!escrowId) {
    return Response.json({ ok: false, reason: 'Missing escrowId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const escrow = await refundEscrow({
    tenantId: auth.ctx.tenantId,
    payerAgentId,
    escrowId,
    sourceEventId,
    lastUpdatedBy: 'agent',
    nowMs
  });

  if (!escrow) {
    return Response.json({ ok: false, reason: 'Escrow not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true, escrow }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
