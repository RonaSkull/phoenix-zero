import { requireTenant } from '../../../lib/tenant-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CacheEntry = {
  expiresAt: number;
  json: any;
};

type RateEntry = {
  windowStart: number;
  count: number;
};

const cache = new Map<string, CacheEntry>();
const rate = new Map<string, RateEntry>();

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

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
  const rpm = Math.max(1, getEnvInt('PHOENIX_ZERO_AUTH_PROXY_RPM', 120));
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

function cacheGet(key: string): any | null {
  const rec = cache.get(key);
  if (!rec) return null;
  if (nowMs() >= rec.expiresAt) {
    cache.delete(key);
    return null;
  }
  return rec.json;
}

function cacheSet(key: string, ttlSeconds: number, json: any) {
  cache.set(key, { expiresAt: nowMs() + ttlSeconds * 1000, json });
}

function inferType(u: URL): 'video' | 'image' | 'live' | null {
  const t = (u.searchParams.get('type') || '').trim().toLowerCase();
  if (t === 'video' || t === 'image' || t === 'live') return t;

  if ((u.searchParams.get('jobId') || '').trim()) return 'live';
  if ((u.searchParams.get('videoUrl') || '').trim()) return 'video';
  if ((u.searchParams.get('imageUrl') || '').trim()) return 'image';
  return null;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
      );
    }

    const u = new URL(req.url);
    const type = inferType(u);
    if (!type) {
      return Response.json(
        { ok: false, reason: 'Missing type (video|image|live) or required params' },
        { status: 400, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
      );
    }

    const rateRes = rateLimitOk(req);
    if (!rateRes.ok) {
      return Response.json(
        { ok: false, reason: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            ...corsHeaders(),
            'Cache-Control': 'no-store',
            'Retry-After': String(rateRes.retryAfterSeconds)
          }
        }
      );
    }

    const ttlSeconds = Math.max(0, getEnvInt('PHOENIX_ZERO_AUTH_PROXY_TTL_SECONDS', 30));

    const includeUpstream = (u.searchParams.get('includeUpstream') || '').trim() === '1';

    const videoUrl = (u.searchParams.get('videoUrl') || '').trim();
    const imageUrl = (u.searchParams.get('imageUrl') || '').trim();
    const proofUrl = (u.searchParams.get('proofUrl') || '').trim();
    const jobId = (u.searchParams.get('jobId') || '').trim();

    if (type === 'video' && (!videoUrl || !proofUrl)) {
      return Response.json(
        { ok: false, reason: 'Missing videoUrl or proofUrl' },
        { status: 400, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
      );
    }

    if (type === 'image' && (!imageUrl || !proofUrl)) {
      return Response.json(
        { ok: false, reason: 'Missing imageUrl or proofUrl' },
        { status: 400, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
      );
    }

    if (type === 'live' && !jobId) {
      return Response.json(
        { ok: false, reason: 'Missing jobId' },
        { status: 400, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
      );
    }

    const cacheKey =
      type === 'video'
        ? `video|${videoUrl}|${proofUrl}`
        : type === 'image'
          ? `image|${imageUrl}|${proofUrl}`
          : `live|${jobId}`;

    const cached = ttlSeconds > 0 ? cacheGet(cacheKey) : null;
    if (cached) {
      return Response.json(cached, {
        status: 200,
        headers: {
          ...corsHeaders(),
          'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
          'x-auth-proxy-cache': 'HIT'
        }
      });
    }

    const base = `${u.protocol}//${u.host}`;

    const fwdApiKey = (req.headers.get('x-api-key') || '').trim();
    const fwdAuth = (req.headers.get('authorization') || '').trim();
    const fwdCookie = (req.headers.get('cookie') || '').trim();

    const upstreamUrl =
      type === 'video'
        ? new URL(
            `/api/global-auth?videoUrl=${encodeURIComponent(videoUrl)}&proofUrl=${encodeURIComponent(proofUrl)}`,
            base
          ).toString()
        : type === 'image'
          ? new URL(
              `/api/global-image-auth?imageUrl=${encodeURIComponent(imageUrl)}&proofUrl=${encodeURIComponent(proofUrl)}`,
              base
            ).toString()
          : new URL(`/api/global-live-auth?jobId=${encodeURIComponent(jobId)}`, base).toString();

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        ...(fwdApiKey ? { 'x-api-key': fwdApiKey } : {}),
        ...(fwdAuth ? { Authorization: fwdAuth } : {}),
        ...(fwdCookie ? { Cookie: fwdCookie } : {})
      },
      cache: 'no-store'
    });
    const upstreamJson = (await upstreamRes.json().catch(() => null)) as any;

    if (!upstreamJson || upstreamJson.ok !== true) {
      return Response.json(
        {
          ok: false,
          reason: 'Upstream verification failed',
          type,
          upstreamOk: Boolean(upstreamJson?.ok),
          upstream: upstreamJson
        },
        { status: 502, headers: { ...corsHeaders(), 'Cache-Control': 'no-store', 'x-auth-proxy-cache': 'MISS' } }
      );
    }

    const normalized = {
      ok: true,
      type,
      verified: Boolean(upstreamJson?.verified),
      decision: upstreamJson?.decision,
      title: upstreamJson?.title,
      hint: upstreamJson?.hint,
      shareUrl: upstreamJson?.shareUrl,
      creatorId: upstreamJson?.creatorId,
      attestationOk: upstreamJson?.attestationOk,
      upstream: includeUpstream ? upstreamJson : undefined
    };

    if (ttlSeconds > 0) cacheSet(cacheKey, ttlSeconds, normalized);

    return Response.json(normalized, {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Cache-Control': `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}`,
        'x-auth-proxy-cache': 'MISS'
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
    );
  }
}
