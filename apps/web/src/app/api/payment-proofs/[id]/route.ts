import { requireTenant } from '../../../../lib/tenant-auth';
import { getPaymentProofById } from '../../../../lib/payment-proofs';
import { rateLimitTenantApi } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const rl = rateLimitTenantApi({
    req,
    tenantId: auth.ctx.tenantId,
    apiKeyHash: auth.ctx.apiKeyHash,
    envRpmName: 'PHOENIX_ZERO_PPE_PAYMENT_PROOF_RPM',
    defaultRpm: 240,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_PAYMENT_PROOF_IP_RPM',
    ipDefaultRpm: 0
  });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reason: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
    );
  }

  const id = String(ctx?.params?.id || '').trim();
  if (!id) return Response.json({ ok: false, reason: 'Missing id' }, { status: 400, headers: jsonUtf8Headers() });

  const proof = await getPaymentProofById(id);
  if (!proof || proof.tenantId !== auth.ctx.tenantId) {
    return Response.json({ ok: false, reason: 'Not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true, proof }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
