import {
  createShareLinkForTenant,
  mapDecisionToCard,
  updateShareLinkCacheForTenant
} from '../../../lib/share-links';
import { requireTenant } from '../../../lib/tenant-auth';
import { recordUsage } from '../../../lib/usage-ledger';

export const runtime = 'nodejs';

type RateEntry = {
  windowStart: number;
  count: number;
};

const g = globalThis as unknown as { __phoenixZeroShareLinkRate?: Map<string, RateEntry> };
const rate = g.__phoenixZeroShareLinkRate ?? (g.__phoenixZeroShareLinkRate = new Map<string, RateEntry>());

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
  const rpm = Math.max(1, getEnvInt('PHOENIX_ZERO_SHARE_LINK_RPM', 60));
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

function rewriteToPublicBase(params: { url: string; requestBase: string; publicBase: string }): string {
  try {
    const input = new URL(params.url);
    const req = new URL(params.requestBase);
    const pub = new URL(params.publicBase);
    if (input.protocol === req.protocol && input.host === req.host) {
      input.protocol = pub.protocol;
      input.host = pub.host;
      return input.toString();
    }
    return params.url;
  } catch {
    return params.url;
  }
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    tenantId = auth.ctx.tenantId;

    const rateRes = rateLimitOk(req);
    if (!rateRes.ok) {
      httpStatus = 429;
      return Response.json(
        { ok: false, reason: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateRes.retryAfterSeconds),
            'Content-Type': 'application/json; charset=utf-8'
          }
        }
      );
    }

    const body = (await req.json().catch(() => null)) as null | { videoUrl?: string; proofUrl?: string };
    const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl : '';
    const proofUrl = typeof body?.proofUrl === 'string' ? body.proofUrl : '';

    if (!videoUrl || !proofUrl) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing videoUrl or proofUrl' },
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const u = new URL(req.url);
    const base = `${u.protocol}//${u.host}`;

    const publicBase = (process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim();
    const shareBase = publicBase || base;

    const storedVideoUrl = publicBase ? rewriteToPublicBase({ url: videoUrl, requestBase: base, publicBase }) : videoUrl;
    const storedProofUrl = publicBase ? rewriteToPublicBase({ url: proofUrl, requestBase: base, publicBase }) : proofUrl;

    const rec = await createShareLinkForTenant({ tenantId: auth.ctx.tenantId, videoUrl: storedVideoUrl, proofUrl: storedProofUrl });
    const shareUrl = new URL(`/s/${encodeURIComponent(rec.id)}`, shareBase).toString();

    let cachedOk = false;
    let cachedDecision: string | undefined;
    let cachedIdentityStatus: string | undefined;
    let cachedCreatorId: string | undefined;
    let cachedAttOk = false;

    try {
      const fwdApiKey = (req.headers.get('x-api-key') || '').trim();
      const fwdAuth = (req.headers.get('authorization') || '').trim();
      const fwdCookie = (req.headers.get('cookie') || '').trim();

      const res = await fetch(new URL('/api/phoenix-zero/verify-by-url', base), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fwdApiKey ? { 'x-api-key': fwdApiKey } : {}),
          ...(fwdAuth ? { Authorization: fwdAuth } : {}),
          ...(fwdCookie ? { Cookie: fwdCookie } : {})
        },
        body: JSON.stringify({ videoUrl, proofUrl })
      });
      const json = (await res.json().catch(() => null)) as any;
      cachedOk = Boolean(json?.ok);
      cachedDecision = typeof json?.decision === 'string' ? json.decision : undefined;
      cachedIdentityStatus = typeof json?.identity?.status === 'string' ? json.identity.status : undefined;
      cachedCreatorId = typeof json?.meta?.creatorId === 'string' ? json.meta.creatorId : undefined;
      cachedAttOk = json?.attestation?.ok === true;
    } catch {
    }

    const mapped = mapDecisionToCard({
      ok: cachedOk,
      decision: cachedDecision,
      identityStatus: cachedIdentityStatus,
      attestationOk: cachedAttOk
    });

    await updateShareLinkCacheForTenant({
      tenantId: auth.ctx.tenantId,
      id: rec.id,
      cache: {
        at: new Date().toISOString(),
        ok: cachedOk,
        decision: cachedDecision,
        title: mapped.title,
        hint: mapped.hint,
        creatorId: cachedCreatorId,
        attestationOk: cachedAttOk
      }
    });

    ok = true;
    httpStatus = 200;
    return Response.json({
      ok: true,
      id: rec.id,
      shareUrl,
      shareBase,
      cache: {
        ok: cachedOk,
        decision: cachedDecision,
        title: mapped.title,
        hint: mapped.hint,
        creatorId: cachedCreatorId,
        attestationOk: cachedAttOk
      }
    }, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } finally {
    void recordUsage({ req, tenantId, op: 'share_link_create', ok, httpStatus, startedAtMs });
  }
}
