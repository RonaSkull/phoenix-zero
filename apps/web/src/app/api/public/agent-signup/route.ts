import { createHash } from 'node:crypto';

import { computeClientRiskScore, fingerprintFromRequest } from '../../../../lib/agent-fingerprint';
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
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function parseBlocklist(raw: string): Set<string> {
  const out = new Set<string>();
  const parts = String(raw || '')
    .split(/[\s,;\n\r\t]+/g)
    .map((p) => String(p || '').trim().toLowerCase())
    .filter(Boolean);
  for (const p of parts) out.add(p);
  return out;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const fp = fingerprintFromRequest(req);
  const riskBlockRaw = String(process.env.PHOENIX_ZERO_PUBLIC_SIGNUP_RISK_BLOCK_THRESHOLD || '').trim();
  const riskBlockThreshold = riskBlockRaw ? Math.max(0, Math.min(100, envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_RISK_BLOCK_THRESHOLD', 100))) : null;
  const rpm = Math.max(1, envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_RPM', 6));
  const rl = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_SIGNUP_RPM:ip:${ip}`, rpm });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reasonCode: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds) }) }
    );
  }

  if (fp.fp) {
    const rlFp = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_SIGNUP_RPM:fp:${fp.fp}`, rpm });
    if (!rlFp.ok) {
      return Response.json(
        { ok: false, reasonCode: 'RATE_LIMITED', message: 'Rate limit exceeded' },
        { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rlFp.retryAfterSeconds) }) }
      );
    }
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
        company?: string;
        country?: string;
        walletAddress?: string;
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
  const company = String(body.company || '').trim();
  const country = String(body.country || '').trim();
  const walletAddress = String(body.walletAddress || '').trim();

  const scamWalletsRaw = String(process.env.PHOENIX_ZERO_SCAM_WALLETS || '').trim();
  if (walletAddress && scamWalletsRaw) {
    const scamWallets = parseBlocklist(scamWalletsRaw);
    if (scamWallets.has(walletAddress.trim().toLowerCase())) {
      return Response.json(
        { ok: false, reasonCode: 'SCAM_WALLET_BLOCKED', message: 'Wallet blocked by policy' },
        { status: 403, headers: jsonUtf8Headers() }
      );
    }
  }

  const kycStatus: 'none' | 'light' = company || country || walletAddress ? 'light' : 'none';
  const clientRiskScore = computeClientRiskScore({
    agentScore: fp.agentScore,
    kycStatus,
    company: company || undefined,
    country: country || undefined,
    walletAddress: walletAddress || undefined
  });

  if (typeof riskBlockThreshold === 'number' && clientRiskScore >= riskBlockThreshold) {
    return Response.json(
      { ok: false, reasonCode: 'RISK_BLOCKED', message: 'Request blocked by risk policy' },
      { status: 403, headers: jsonUtf8Headers() }
    );
  }

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
      companyName: company || undefined,
      clientType: 'self_signup',
      sector: 'self_signup',
      country: country || 'unknown',
      walletAddress: walletAddress || undefined,
      kycStatus,
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
      emailHash4: sha256Hex(email.toLowerCase()).slice(0, 4),
      agentType: agentType.slice(0, 64),
      intendedUse: intendedUse.slice(0, 120),
      acceptsTermsVersion: acceptsTermsVersion.slice(0, 32),
      acceptsFixedPricing,
      agentScore: fp.agentScore,
      riskScore: clientRiskScore,
      fpHash4: fp.fp ? sha256Hex(fp.fp).slice(0, 4) : null,
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
            maxCheckoutsPerDay:
              clientRiskScore >= 80
                ? Math.max(1, Math.floor(envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_MAX_CHECKOUTS_PER_DAY', 10) / 2))
                : envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_MAX_CHECKOUTS_PER_DAY', 10),
            maxAmountCents:
              clientRiskScore >= 80
                ? Math.max(100, Math.floor(envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_MAX_AMOUNT_CENTS', 5000) / 2))
                : envInt('PHOENIX_ZERO_PUBLIC_SIGNUP_MAX_AMOUNT_CENTS', 5000),
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
