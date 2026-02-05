import { createHash } from 'node:crypto';

import { recordDemoRequest } from '../../../lib/demo-requests';
import { fingerprintFromRequest } from '../../../lib/agent-fingerprint';
import { getClientIp, rateLimitOk } from '../../../lib/rate-limit';

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

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isValidEmail(email: string): boolean {
  const s = String(email || '').trim();
  if (!s) return false;
  if (s.length > 160) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

function safeTrunc(s: string, n: number): string {
  const x = String(s || '').trim();
  if (x.length <= n) return x;
  return x.slice(0, n);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const fp = fingerprintFromRequest(req);
  const riskBlockRaw = String(process.env.PHOENIX_ZERO_PUBLIC_DEMO_REQUEST_RISK_BLOCK_THRESHOLD || '').trim();
  const riskBlockThreshold = riskBlockRaw ? clampInt(envInt('PHOENIX_ZERO_PUBLIC_DEMO_REQUEST_RISK_BLOCK_THRESHOLD', 100), 0, 100) : null;
  const rpm = Math.max(1, envInt('PHOENIX_ZERO_PUBLIC_DEMO_REQUEST_RPM', 6));
  const rl = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_DEMO_REQUEST_RPM:ip:${ip}`, rpm });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reasonCode: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds) }) }
    );
  }

  if (fp.fp) {
    const rlFp = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_DEMO_REQUEST_RPM:fp:${fp.fp}`, rpm });
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
        company?: string;
        country?: string;
        monthlyVolume?: string;
        message?: string;
        source?: string;
      };

  if (!body || typeof body !== 'object') {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_JSON', message: 'Invalid JSON body' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const company = String(body.company || '').trim();
  const country = String(body.country || '').trim();
  const monthlyVolume = String(body.monthlyVolume || '').trim();
  const message = String(body.message || '').trim();
  const source = String(body.source || '').trim();

  const riskScore = clampInt(fp.agentScore + (country ? 0 : 6), 0, 100);
  if (typeof riskBlockThreshold === 'number' && riskScore >= riskBlockThreshold) {
    return Response.json(
      { ok: false, reasonCode: 'RISK_BLOCKED', message: 'Request blocked by risk policy' },
      { status: 403, headers: jsonUtf8Headers() }
    );
  }

  const missingFields: string[] = [];
  if (!name) missingFields.push('name');
  if (!email) missingFields.push('email');
  if (!company) missingFields.push('company');

  if (missingFields.length > 0) {
    return Response.json(
      { ok: false, reasonCode: 'MISSING_FIELDS', message: 'Missing required fields', missingFields },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  if (!isValidEmail(email)) {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_EMAIL', message: 'Invalid email' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  if (name.length > 120 || company.length > 160) {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_LENGTH', message: 'Field too long' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  try {
    const rec = await recordDemoRequest({
      name,
      email,
      company,
      country: country || undefined,
      monthlyVolume: monthlyVolume || undefined,
      message: message || undefined,
      source: source || undefined,
      ip,
      userAgent: req.headers.get('user-agent') || undefined,
      fpHash4: fp.fp ? sha256Hex(fp.fp).slice(0, 4) : undefined
    });

    console.log('[DEMO_REQUEST] created', {
      id: rec.id,
      company: safeTrunc(company, 80),
      emailHash4: sha256Hex(email.toLowerCase()).slice(0, 4),
      agentScore: fp.agentScore,
      riskScore,
      fpHash4: fp.fp ? sha256Hex(fp.fp).slice(0, 4) : null,
      ip
    });

    return Response.json(
      { ok: true, requestId: rec.id, createdAt: rec.createdAt },
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
