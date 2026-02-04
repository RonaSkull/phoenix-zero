import { requireAdminToken } from '../../../../../lib/tenant-auth';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function asaasBaseUrl(): string {
  const env = String(process.env.ASAAS_API_BASE || '').trim();
  if (env) {
    const lower = env.toLowerCase();
    const looksLikeApiHost = lower.includes('api.asaas.com') || lower.includes('api-sandbox.asaas.com');
    if (looksLikeApiHost) return env.replace(/\/+$/g, '').replace(/\/v3$/i, '');
  }
  const mode = String(process.env.ASAAS_ENV || '').trim().toLowerCase();
  if (mode === 'sandbox') return 'https://api-sandbox.asaas.com';
  return 'https://api.asaas.com';
}

function clip(s: string, n: number): string {
  const v = String(s || '');
  if (v.length <= n) return v;
  return v.slice(0, n) + '…';
}

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const key = String(process.env.ASAAS_API_KEY || '');
  const keyTrim = key.trim();
  const base = asaasBaseUrl();
  const url = `${base}/v3/myAccount`;

  const diagnostics = {
    ASAAS_ENV: String(process.env.ASAAS_ENV || ''),
    ASAAS_API_BASE: String(process.env.ASAAS_API_BASE || ''),
    resolvedBase: base,
    hasKey: Boolean(keyTrim),
    keyLength: key.length,
    keyTrimLength: keyTrim.length,
    keyStartsWith: keyTrim.slice(0, 12),
    keyEndsWith: keyTrim.slice(-6),
    hasNewline: /\r|\n/.test(key),
    hasQuotes: /^['\"]|['\"]$/.test(keyTrim)
  };

  if (!keyTrim) {
    return Response.json(
      { ok: false, reason: 'Missing ASAAS_API_KEY', diagnostics },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'phoenix-zero/1.0 (+https://phoenix-zero-web.onrender.com)',
        access_token: keyTrim
      },
      redirect: 'manual'
    });

    const text = await res.text().catch(() => '');
    const ct = String(res.headers.get('content-type') || '');

    return Response.json(
      {
        ok: res.ok,
        status: res.status,
        url,
        contentType: ct,
        bodySnippet: clip(text, 800),
        diagnostics
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: 'FETCH_ERROR', error: msg, url, diagnostics },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
