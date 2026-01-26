import { requireTenant } from '../../../../../../lib/tenant-auth';
import { contestSlash } from '../../../../../../lib/slashing/store';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type Body = {
  slashId?: string;
  contestProofId?: string;
  sourceEventId?: string;
  nowMs?: number;
};

export async function POST(req: Request, ctx: { params: { agentId: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const agentId = String(ctx?.params?.agentId || '').trim();
  if (!agentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const slashId = String(body?.slashId || '').trim();
  const contestProofId = String(body?.contestProofId || '').trim() || undefined;
  const sourceEventId = String(body?.sourceEventId || '').trim() || undefined;
  const nowMs = body && typeof body.nowMs === 'number' && Number.isFinite(body.nowMs) ? body.nowMs : undefined;

  if (!slashId) {
    return Response.json({ ok: false, reason: 'Missing slashId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const out = await contestSlash({
    tenantId: auth.ctx.tenantId,
    agentId,
    slashId,
    contestProofId,
    sourceEventId,
    lastUpdatedBy: 'agent',
    nowMs
  });

  if (!out) {
    return Response.json({ ok: false, reason: 'Slash not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  return Response.json(
    { ok: true, slash: out },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
