import { createHash } from 'node:crypto';

import { recordDemoRequest } from '../../../../lib/demo-requests';
import { fingerprintFromRequest } from '../../../../lib/agent-fingerprint';
import { getClientIp, rateLimitOk } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

const VALID_SOVEREIGN_USE_CASES = new Set([
  'crypto_settlement_assurance',
  'crypto_reconciliation_export',
  'public_proof_verification_links',
  'crypto_webhook_hardening',
  'payout_integrity_anti_replay',
  'agent_executable_payment_gating'
]);

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

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
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

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const fp = fingerprintFromRequest(req);
  const riskBlockRaw = String(process.env.PHOENIX_ZERO_PUBLIC_SOVEREIGN_SIGNUP_RISK_BLOCK_THRESHOLD || '').trim();
  const riskBlockThreshold = riskBlockRaw ? clampInt(envInt('PHOENIX_ZERO_PUBLIC_SOVEREIGN_SIGNUP_RISK_BLOCK_THRESHOLD', 100), 0, 100) : null;
  const rpm = Math.max(1, envInt('PHOENIX_ZERO_PUBLIC_SOVEREIGN_SIGNUP_RPM', 6));

  const rl = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_SOVEREIGN_SIGNUP_RPM:ip:${ip}`, rpm });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reasonCode: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds) }) }
    );
  }

  if (fp.fp) {
    const rlFp = rateLimitOk({ key: `PHOENIX_ZERO_PUBLIC_SOVEREIGN_SIGNUP_RPM:fp:${fp.fp}`, rpm });
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
        companyName?: string;
        contactEmail?: string;
        contactName?: string;
        country?: string;
        useCase?: string;
        monthlyVolume?: string;
        message?: string;
        source?: string;
        acceptsTermsVersion?: string;
      };

  if (!body || typeof body !== 'object') {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_JSON', message: 'Invalid JSON body' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  const companyName = String(body.companyName || '').trim();
  const contactEmail = String(body.contactEmail || '').trim();
  const contactName = String(body.contactName || '').trim();
  const country = String(body.country || '').trim();
  const useCase = String(body.useCase || '').trim();
  const useCaseNormalized = useCase.trim().toLowerCase();
  const monthlyVolume = String(body.monthlyVolume || '').trim();
  const message = String(body.message || '').trim();
  const source = String(body.source || 'sovereign_signup').trim();
  const acceptsTermsVersion = String(body.acceptsTermsVersion || '').trim();

  const riskScore = clampInt(fp.agentScore + (country ? 0 : 6), 0, 100);
  if (typeof riskBlockThreshold === 'number' && riskScore >= riskBlockThreshold) {
    return Response.json(
      { ok: false, reasonCode: 'RISK_BLOCKED', message: 'Request blocked by risk policy' },
      { status: 403, headers: jsonUtf8Headers() }
    );
  }

  const missingFields: string[] = [];
  if (!companyName) missingFields.push('companyName');
  if (!contactEmail) missingFields.push('contactEmail');
  if (!useCase) missingFields.push('useCase');

  if (missingFields.length > 0) {
    return Response.json(
      { ok: false, reasonCode: 'MISSING_FIELDS', message: 'Missing required fields', missingFields },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  if (!isValidEmail(contactEmail)) {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_EMAIL', message: 'Invalid email' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  if (!VALID_SOVEREIGN_USE_CASES.has(useCaseNormalized)) {
    return Response.json(
      {
        ok: false,
        reasonCode: 'INVALID_USE_CASE',
        message: 'Invalid useCase',
        validUseCases: Array.from(VALID_SOVEREIGN_USE_CASES.values())
      },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  if (companyName.length > 160 || contactName.length > 120 || useCase.length > 200) {
    return Response.json(
      { ok: false, reasonCode: 'INVALID_LENGTH', message: 'Field too long' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  const evidence = {
    kind: 'sovereign_signup',
    companyName,
    contactName: contactName || undefined,
    contactEmail,
    country: country || undefined,
    useCase,
    useCaseNormalized,
    monthlyVolume: monthlyVolume || undefined,
    message: message || undefined,
    acceptsTermsVersion: acceptsTermsVersion || undefined
  };

  try {
    const rec = await recordDemoRequest({
      name: safeTrunc(contactName || 'sovereign_contact', 120),
      email: safeTrunc(contactEmail, 160),
      company: safeTrunc(companyName, 160),
      country: country || undefined,
      monthlyVolume: monthlyVolume || undefined,
      message: JSON.stringify(evidence),
      source: source || 'sovereign_signup',
      ip,
      userAgent: req.headers.get('user-agent') || undefined,
      fpHash4: fp.fp ? sha256Hex(fp.fp).slice(0, 4) : undefined
    });

    console.log('[SOVEREIGN_SIGNUP] received', {
      id: rec.id,
      company: safeTrunc(companyName, 80),
      emailHash4: sha256Hex(contactEmail.toLowerCase()).slice(0, 4),
      agentScore: fp.agentScore,
      riskScore,
      fpHash4: fp.fp ? sha256Hex(fp.fp).slice(0, 4) : null,
      ip
    });

    return Response.json(
      {
        ok: true,
        status: 'pending_review',
        requestId: rec.id,
        createdAt: rec.createdAt,
        useCase: useCaseNormalized,
        nextSteps: ['We will contact you to schedule a technical demo and discuss an enterprise contract.']
      },
      { status: 200, headers: jsonUtf8Headers() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reasonCode: 'INTERNAL_ERROR', message: msg },
      { status: 500, headers: jsonUtf8Headers() }
    );
  }
}
