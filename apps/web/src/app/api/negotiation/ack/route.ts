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
  const rpm = Math.max(1, envInt('PHOENIX_ZERO_PUBLIC_NEGOTIATION_ACK_RPM', 30));
  const rl = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_NEGOTIATION_ACK_RPM:ip:${ip}`, rpm });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reasonCode: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds) }) }
    );
  }

  const agentIntentHeader = String(req.headers.get('x-agent-intent') || '').trim().toLowerCase();
  const agentClassHeader = String(req.headers.get('x-agent-class') || '').trim().toLowerCase();

  const body = (await req.json().catch(() => null)) as
    | null
    | {
        agentType?: string;
        intent?: string;
        plan?: string;
        expectedVolume?: string;
        currency?: string;
      };

  if (!body || typeof body !== 'object') {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_JSON', message: 'Invalid JSON body' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  const agentType = String(body.agentType || '').trim().toLowerCase();
  const intent = String(body.intent || '').trim().toLowerCase();
  const plan = String(body.plan || 'public_fixed_v1').trim();
  const expectedVolume = String(body.expectedVolume || 'low_initial').trim();
  const currency = String(body.currency || 'USD').trim() || 'USD';

  const isBuyer =
    agentClassHeader === 'buyer' ||
    agentClassHeader === 'enterprise-buyer' ||
    agentType === 'buyer' ||
    agentType === 'enterprise_procurement' ||
    agentType === 'enterprise-buyer' ||
    agentIntentHeader === 'negotiate' ||
    intent.includes('confirm_terms') ||
    intent.includes('negotiate');

  if (!isBuyer) {
    return Response.json(
      {
        ok: false,
        reasonCode: 'NOT_APPLICABLE',
        message: 'Negotiation acknowledgement is only intended for buyer/procurement agents'
      },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  return Response.json(
    {
      ok: true,
      status: 'acknowledged',
      negotiationResult: 'accepted',
      pricingModel: 'fixed_table',
      discountApplied: false,
      legalPosture: 'standard_terms',
      commitment: {
        priceLocked: true,
        duration: 'per-transaction',
        volumeTiers: 'available_after_upgrade'
      },
      enterprisePath: {
        upgradeAvailable: true,
        contactRequired: false,
        automaticQualification: true
      },
      contextEcho: {
        plan,
        expectedVolume,
        currency
      },
      nextAction: 'proceed_to_checkout'
    },
    { status: 200, headers: jsonUtf8Headers() }
  );
}
