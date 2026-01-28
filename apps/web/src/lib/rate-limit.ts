type RateEntry = {
  windowStart: number;
  count: number;
};

const g = globalThis as unknown as { __phoenixZeroRateLimit?: Map<string, RateEntry> };
const rate = g.__phoenixZeroRateLimit ?? (g.__phoenixZeroRateLimit = new Map<string, RateEntry>());

function nowMs(): number {
  return Date.now();
}

function getEnvInt(name: string, fallback: number): number {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

export function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = (h.get('x-forwarded-for') || '').trim();
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  const realIp = (h.get('x-real-ip') || '').trim();
  if (realIp) return realIp;
  const cf = (h.get('cf-connecting-ip') || '').trim();
  if (cf) return cf;
  return 'unknown';
}

export function rateLimitOk(params: {
  key: string;
  rpm: number;
}): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const rpm = Math.max(1, Math.floor(params.rpm));
  const windowMs = 60_000;
  const now = nowMs();

  const rec = rate.get(params.key);
  if (!rec || now - rec.windowStart >= windowMs) {
    rate.set(params.key, { windowStart: now, count: 1 });
    return { ok: true };
  }

  if (rec.count >= rpm) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - rec.windowStart)) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  rec.count += 1;
  rate.set(params.key, rec);
  return { ok: true };
}

export function rateLimitTenantApi(params: {
  req: Request;
  tenantId: string;
  apiKeyHash?: string;
  envRpmName: string;
  defaultRpm: number;
  ipEnvRpmName?: string;
  ipDefaultRpm?: number;
}): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const rpm = Math.max(1, getEnvInt(params.envRpmName, params.defaultRpm));
  const authKey = params.apiKeyHash ? `apiKey:${params.apiKeyHash}` : `tenant:${params.tenantId}`;

  const hit = rateLimitOk({ key: `${params.envRpmName}:${authKey}`, rpm });
  if (!hit.ok) return hit;

  const ipEnv = params.ipEnvRpmName ? String(params.ipEnvRpmName).trim() : '';
  if (ipEnv) {
    const ipRpm = Math.max(0, getEnvInt(ipEnv, params.ipDefaultRpm ?? 0));
    if (ipRpm > 0) {
      const ip = getClientIp(params.req);
      const hitIp = rateLimitOk({ key: `${ipEnv}:ip:${ip}`, rpm: ipRpm });
      if (!hitIp.ok) return hitIp;
    }
  }

  return { ok: true };
}
