import { requireTenant } from '../../../../lib/tenant-auth';
import { getPaymentIntentById, revalidatePaymentIntentFromProvider } from '../../../../lib/payments';
import { rateLimitTenantApi } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

const revalidateCooldownByPaymentId = new Map<string, number>();

function getEnvInt(name: string, fallback: number): number {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parseIsoMs(maybe: string | undefined): number | null {
  if (!maybe) return null;
  const t = Date.parse(maybe);
  if (!Number.isFinite(t)) return null;
  return t;
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const rl = rateLimitTenantApi({
    req,
    tenantId: auth.ctx.tenantId,
    apiKeyHash: auth.ctx.apiKeyHash,
    envRpmName: 'PHOENIX_ZERO_PPE_CHECKOUT_STATUS_RPM',
    defaultRpm: 240,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_CHECKOUT_STATUS_IP_RPM',
    ipDefaultRpm: 0
  });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reason: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
    );
  }

  const u = new URL(req.url);
  const paymentId = String(u.searchParams.get('paymentId') || '').trim();
  if (!paymentId) {
    return Response.json({ ok: false, reason: 'Missing paymentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const intent = await getPaymentIntentById(paymentId);
  if (!intent) {
    return Response.json({ ok: false, reason: 'Payment not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  if (intent.tenantId !== auth.ctx.tenantId) {
    return Response.json({ ok: false, reason: 'Forbidden' }, { status: 403, headers: jsonUtf8Headers() });
  }

  let effective = intent;

  if (effective.status === 'pending') {
    const now = Date.now();
    const last = revalidateCooldownByPaymentId.get(paymentId) ?? 0;
    const cooldownMs = Math.max(250, getEnvInt('PHOENIX_ZERO_CHECKOUT_STATUS_REVALIDATE_COOLDOWN_MS', 10_000));

    const updatedAtMs = parseIsoMs(effective.updatedAt) ?? parseIsoMs(effective.createdAt) ?? null;
    const ageMs = updatedAtMs !== null ? Math.max(0, now - updatedAtMs) : 0;
    const afterMs = Math.max(250, getEnvInt('PHOENIX_ZERO_CHECKOUT_STATUS_REVALIDATE_AFTER_MS', 15_000));

    if (ageMs >= afterMs && now - last >= cooldownMs) {
      revalidateCooldownByPaymentId.set(paymentId, now);
      const r = await revalidatePaymentIntentFromProvider({ paymentId });
      if (r.ok) effective = r.intent;
    }
  }

  return Response.json(
    {
      ok: true,
      paymentId: effective.id,
      provider: effective.provider,
      status: effective.status,
      amountCents: effective.amountCents,
      currency: effective.currency,
      providerPaymentId: effective.providerPaymentId
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
