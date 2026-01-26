import { requireTenant } from '../../../../../lib/tenant-auth';
import { listSlashesByAgent } from '../../../../../lib/slashing/store';

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

  const slashes = await listSlashesByAgent({ tenantId: auth.ctx.tenantId, agentId, limit });

  return Response.json(
    { ok: true, agentId, slashes },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
