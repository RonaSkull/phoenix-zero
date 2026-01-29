import { createTenant } from '../../../../lib/tenants';
import { getClientIp, rateLimitOk } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  };
}

function envInt(name: string, def: number): number {
  const raw = String(process.env[name] || '').trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rpm = Math.max(1, envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_RPM', 6));
  const rl = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_SIGNUP_RPM:ip:${ip}`, rpm });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reasonCode: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds) }) }
    );
  }

  const body = (await req.json().catch(() => null)) as
    | null
    | {
        name?: string;
        email?: string;
        agentType?: string;
        intendedUse?: string;
        acceptsTermsVersion?: string;
        acceptsFixedPricing?: boolean;
        billingMode?: string;
        currency?: string;
      };

  if (!body || typeof body !== 'object') {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_JSON', message: 'Invalid JSON body' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const agentType = String(body.agentType || '').trim();
  const intendedUse = String(body.intendedUse || '').trim();
  const acceptsTermsVersion = String(body.acceptsTermsVersion || '').trim();
  const acceptsFixedPricing = Boolean(body.acceptsFixedPricing);
  const billingMode = String(body.billingMode || '').trim();
  const currency = String(body.currency || 'USD').trim() || 'USD';

  const missingFields: string[] = [];
  if (!name) missingFields.push('name');
  if (!email) missingFields.push('email');
  if (!agentType) missingFields.push('agentType');
  if (!intendedUse) missingFields.push('intendedUse');
  if (!acceptsTermsVersion) missingFields.push('acceptsTermsVersion');
  if (!acceptsFixedPricing) missingFields.push('acceptsFixedPricing');

  if (missingFields.length > 0) {
    return Response.json(
      {
        ok: false,
        reasonCode: 'MISSING_FIELDS',
        message: 'Missing required fields',
        missingFields
      },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  if (billingMode && billingMode.toLowerCase() !== 'prepaid') {
    return Response.json(
      { ok: false, reasonCode: 'FIXED_PRICE_ONLY', message: 'Only prepaid fixed pricing is supported for public signup' },
      { status: 403, headers: jsonUtf8Headers() }
    );
  }

  try {
    const created = await createTenant({
      name,
      clientType: 'self_signup',
      sector: 'self_signup',
      country: 'unknown',
      currency,
      pricingProfile: 'default',
      commissionProfile: 'default',
      taxProfile: 'default'
    });

    if (!created.ok) {
      return Response.json(
        { ok: false, reasonCode: 'SIGNUP_FAILED', message: created.reason },
        { status: 400, headers: jsonUtf8Headers() }
      );
    }

    console.log('[PUBLIC_SIGNUP] created', {
      tenantId: created.tenant.tenantId,
      name,
      email: email.slice(0, 64),
      agentType: agentType.slice(0, 64),
      intendedUse: intendedUse.slice(0, 120),
      acceptsTermsVersion: acceptsTermsVersion.slice(0, 32),
      acceptsFixedPricing,
      ip
    });

    return Response.json(
      {
        ok: true,
        tenant: {
          tenantId: created.tenant.tenantId,
          apiKey: created.apiKey,
          profile: created.tenant.pricingProfile,
          limits: {
            maxCheckoutsPerDay: envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_MAX_CHECKOUTS_PER_DAY', 10),
            maxAmountCents: envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_MAX_AMOUNT_CENTS', 5000),
            allowedOperations: ['protect_video']
          }
        },
        nextSteps: [
          'Use x-api-key in requests',
          'Call /api/pricing',
          'Call /api/compatibility before checkout'
        ]
      },
      { status: 200, headers: jsonUtf8Headers() }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reasonCode: 'INTERNAL_ERROR', message },
      { status: 500, headers: jsonUtf8Headers() }
    );
  }
}
