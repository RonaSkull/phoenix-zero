import { createHmac, createHash } from 'node:crypto';

export type HttpJsonRes = {
  ok: boolean;
  status: number;
  url: string;
  json: any;
  text: string;
  headers: Record<string, string>;
};

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function envInt(name: string, def: number): number {
  const raw = env(name);
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.trunc(n));
}

function envInt0(name: string, def: number): number {
  const raw = env(name);
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.trunc(n));
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

function isRetriableStatus(status: number): boolean {
  if (status === 408) return true;
  if (status === 425) return true;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

export function stripTrailingSlashes(s: string): string {
  return String(s || '').replace(/\/+$/g, '');
}

export function baseUrlFromEnv(): string {
  return stripTrailingSlashes(env('PHOENIX_ZERO_BASE_URL') || 'https://phoenix-zero-web.onrender.com');
}

export async function readJsonSafe(res: Response): Promise<{ json: any; text: string }> {
  const text = await res.text().catch(() => '');
  try {
    return { json: text ? JSON.parse(text) : null, text };
  } catch {
    return { json: null, text };
  }
}

export async function httpJson(params: {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
}): Promise<HttpJsonRes> {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8'
  };

  if (params.apiKey) headers['x-api-key'] = params.apiKey;

  for (const [k, v] of Object.entries(params.headers || {})) {
    const kk = String(k || '').trim();
    const vv = String(v ?? '').trim();
    if (!kk || !vv) continue;
    headers[kk] = vv;
  }

  const timeoutMs = Math.max(1000, Math.trunc(params.timeoutMs ?? envInt('PHOENIX_ZERO_HTTP_TIMEOUT_MS', 120_000)));
  const defaultRetries = envInt0('PHOENIX_ZERO_HTTP_RETRIES', 4);
  const retries = Math.max(0, Math.trunc(params.retries ?? defaultRetries));
  const maxAttempts = params.method === 'GET' ? retries + 1 : 1;
  const baseBackoffMs = envInt('PHOENIX_ZERO_HTTP_RETRY_BACKOFF_MS', 750);

  let lastErr: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(params.url, {
        method: params.method,
        headers,
        body: params.method === 'POST' ? JSON.stringify(params.body ?? {}) : undefined,
        signal: ac.signal
      });

      const out = await readJsonSafe(res);

      const headerObj: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headerObj[key.toLowerCase()] = value;
      });

      const payload: HttpJsonRes = {
        ok: res.ok,
        status: res.status,
        url: params.url,
        json: out.json,
        text: out.text,
        headers: headerObj
      };

      if (params.method === 'GET' && attempt + 1 < maxAttempts && isRetriableStatus(res.status)) {
        const jitter = Math.trunc(Math.random() * 200);
        const delay = baseBackoffMs * Math.pow(2, attempt) + jitter;
        await sleepMs(delay);
        continue;
      }

      return payload;
    } catch (err: any) {
      lastErr = err;
      const name = String(err?.name || '').trim();
      const msg = String(err?.message || err || '').trim();
      const shouldRetry = params.method === 'GET' && attempt + 1 < maxAttempts && (name === 'AbortError' || name === 'TypeError' || Boolean(msg));

      if (shouldRetry) {
        const jitter = Math.trunc(Math.random() * 200);
        const delay = baseBackoffMs * Math.pow(2, attempt) + jitter;
        await sleepMs(delay);
        continue;
      }

      return {
        ok: false,
        status: 0,
        url: params.url,
        json: null,
        text: msg || name || 'FETCH_ERROR',
        headers: {}
      };
    } finally {
      clearTimeout(t);
    }
  }

  return {
    ok: false,
    status: 0,
    url: params.url,
    json: null,
    text: String(lastErr?.message || lastErr || 'FETCH_ERROR'),
    headers: {}
  };
}

export async function httpText(params: {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
  retries?: number;
}): Promise<{ ok: boolean; status: number; url: string; text: string }> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.headers || {})) {
    const kk = String(k || '').trim();
    const vv = String(v ?? '').trim();
    if (!kk || !vv) continue;
    headers[kk] = vv;
  }

  const timeoutMs = Math.max(1000, Math.trunc(params.timeoutMs ?? envInt('PHOENIX_ZERO_HTTP_TIMEOUT_MS', 120_000)));
  const defaultRetries = envInt0('PHOENIX_ZERO_HTTP_RETRIES', 4);
  const retries = Math.max(0, Math.trunc(params.retries ?? defaultRetries));
  const maxAttempts = params.method === 'GET' ? retries + 1 : 1;
  const baseBackoffMs = envInt('PHOENIX_ZERO_HTTP_RETRY_BACKOFF_MS', 750);

  let lastErr: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(params.url, {
        method: params.method,
        headers,
        body: params.method === 'POST' ? JSON.stringify(params.body ?? {}) : undefined,
        signal: ac.signal
      });

      const text = await res.text().catch(() => '');
      const payload = { ok: res.ok, status: res.status, url: params.url, text };

      if (params.method === 'GET' && attempt + 1 < maxAttempts && isRetriableStatus(res.status)) {
        const jitter = Math.trunc(Math.random() * 200);
        const delay = baseBackoffMs * Math.pow(2, attempt) + jitter;
        await sleepMs(delay);
        continue;
      }

      return payload;
    } catch (err: any) {
      lastErr = err;
      const name = String(err?.name || '').trim();
      const msg = String(err?.message || err || '').trim();
      const shouldRetry = params.method === 'GET' && attempt + 1 < maxAttempts && (name === 'AbortError' || name === 'TypeError' || Boolean(msg));

      if (shouldRetry) {
        const jitter = Math.trunc(Math.random() * 200);
        const delay = baseBackoffMs * Math.pow(2, attempt) + jitter;
        await sleepMs(delay);
        continue;
      }

      return { ok: false, status: 0, url: params.url, text: msg || name || 'FETCH_ERROR' };
    } finally {
      clearTimeout(t);
    }
  }

  return { ok: false, status: 0, url: params.url, text: String(lastErr?.message || lastErr || 'FETCH_ERROR') };
}

export function canonicalJson(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj).sort();
  const out: Record<string, any> = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

export function hmacSha512Hex(secret: string, raw: string): string {
  return createHmac('sha512', String(secret || '').trim()).update(String(raw || ''), 'utf8').digest('hex');
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}
