import { requireTenant } from '../../../../../lib/tenant-auth';
import { computeAgentLedger } from '../../../../../lib/agent-ledger';
import { rateLimitTenantApi } from '../../../../../lib/rate-limit';

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

  const rl = rateLimitTenantApi({
    req,
    tenantId: auth.ctx.tenantId,
    apiKeyHash: auth.ctx.apiKeyHash,
    envRpmName: 'PHOENIX_ZERO_PPE_LEDGER_RPM',
    defaultRpm: 240,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_LEDGER_IP_RPM',
    ipDefaultRpm: 0
  });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reason: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
    );
  }

  const agentId = String(ctx?.params?.agentId || '').trim();
  if (!agentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') || '500');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 500;

  const ledger = await computeAgentLedger({ tenantId: auth.ctx.tenantId, agentId, limit });

  return Response.json(
    { ok: true, ledger },
    {
      status: 200,
      headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' })
    }
  );
}
