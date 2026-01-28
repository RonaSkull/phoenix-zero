import { requireTenant } from '../../../../../lib/tenant-auth';
import { checkPpoGate } from '../../../../../lib/ppo-gate';
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
    envRpmName: 'PHOENIX_ZERO_PPE_GATE_RPM',
    defaultRpm: 300,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_GATE_IP_RPM',
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
  const taskId = String(url.searchParams.get('taskId') || '').trim() || undefined;
  const taskType = String(url.searchParams.get('taskType') || '').trim() || undefined;
  const requireSignatureRaw = (url.searchParams.get('requireSignature') || '').trim().toLowerCase();
  const requireSignature =
    requireSignatureRaw === ''
      ? undefined
      : requireSignatureRaw === '1' || requireSignatureRaw === 'true' || requireSignatureRaw === 'yes' || requireSignatureRaw === 'on'
        ? true
        : requireSignatureRaw === '0' || requireSignatureRaw === 'false' || requireSignatureRaw === 'no' || requireSignatureRaw === 'off'
          ? false
          : undefined;

  const limitRaw = Number(url.searchParams.get('limit') || '500');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 500;

  const decision = await checkPpoGate({
    tenantId: auth.ctx.tenantId,
    agentId,
    taskId,
    taskType,
    requireSignature,
    limit
  });

  const { ok: _ok, ...rest } = decision as any;
  return Response.json({ ok: true, ...rest }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
