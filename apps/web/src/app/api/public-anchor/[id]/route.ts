import { getTimeAnchor, resolveTimeAnchorVerificationToken, verifyTimeAnchor } from '../../../../lib/time-anchors';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

type RateEntry = {
  windowStart: number;
  count: number;
};

const g = globalThis as unknown as { __phoenixZeroPublicAnchorRate?: Map<string, RateEntry> };
const rate = g.__phoenixZeroPublicAnchorRate ?? (g.__phoenixZeroPublicAnchorRate = new Map<string, RateEntry>());

function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = (h.get('x-forwarded-for') || '').trim();
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  const realIp = (h.get('x-real-ip') || '').trim();
  if (realIp) return realIp;
  const cf = (h.get('cf-connecting-ip') || '').trim();
  if (cf) return cf;
  return 'unknown';
}

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function nowMs(): number {
  return Date.now();
}

function rateLimitOk(req: Request): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const rpm = Math.max(1, getEnvInt('PHOENIX_ZERO_PUBLIC_ANCHOR_RPM', 600));
  const windowMs = 60_000;
  const ip = getClientIp(req);
  const now = nowMs();

  const rec = rate.get(ip);
  if (!rec || now - rec.windowStart >= windowMs) {
    rate.set(ip, { windowStart: now, count: 1 });
    return { ok: true };
  }

  if (rec.count >= rpm) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - rec.windowStart)) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  rec.count += 1;
  rate.set(ip, rec);
  return { ok: true };
}

function isBase64UrlLike(s: string): boolean {
  if (!s) return false;
  if (s.length < 16 || s.length > 256) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
}

function isTokenLike(s: string): boolean {
  if (!s) return false;
  if (s.length < 6 || s.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const startedAtMs = Date.now();
  let ok = false;
  let httpStatus = 500;
  try {
    const rateRes = rateLimitOk(req);
    if (!rateRes.ok) {
      httpStatus = 429;
      return Response.json(
        { ok: false, reason: 'Rate limit exceeded' },
        {
          status: 429,
          headers: jsonUtf8Headers({
            'Cache-Control': 'no-store',
            'Retry-After': String(rateRes.retryAfterSeconds)
          })
        }
      );
    }

    const anchorId = (ctx?.params?.id || '').trim();
    if (!anchorId) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing anchorId' }, { status: 400, headers: jsonUtf8Headers() });
    }

    if (anchorId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(anchorId)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid anchorId' }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }

    const u = new URL(req.url);
    const contentCommit = (u.searchParams.get('contentCommit') || '').trim();

    const v = (u.searchParams.get('v') || '').trim();
    let resolvedCommit = contentCommit;
    if (!resolvedCommit && v) {
      if (!isTokenLike(v)) {
        httpStatus = 400;
        return Response.json(
          { ok: false, reason: 'Invalid verification token' },
          { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
      const t = await resolveTimeAnchorVerificationToken({ anchorId, token: v });
      if (!t.ok) {
        httpStatus = 400;
        return Response.json(
          { ok: false, reason: 'Invalid verification token' },
          { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
      resolvedCommit = t.contentCommitB64Url;
    }

    if (resolvedCommit && !isBase64UrlLike(resolvedCommit)) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Invalid contentCommit (expected base64url-like string)' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const record = await getTimeAnchor(anchorId);
    if (!record) {
      httpStatus = 404;
      return Response.json({ ok: false, reason: 'Not found' }, { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }

    const verified = await verifyTimeAnchor({ anchorId, contentCommitB64Url: resolvedCommit || undefined });

    ok = true;
    httpStatus = 200;
    return Response.json(
      {
        ok: true,
        anchorId,
        verified,
        record
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } finally {
    void recordUsage({ req, tenantId: null, op: 'public_anchor_get', ok, httpStatus, startedAtMs });
  }
}
