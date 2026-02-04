import { httpJson } from '../lib/http';

export type SignupOk = { ok: true; tenantId: string; apiKey: string; raw: any };
export type SignupErr = { ok: false; status: number; rawText: string; rawJson: any };
export type SignupResult = SignupOk | SignupErr;

function envInt(name: string, def: number): number {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.trunc(n));
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

function retryAfterMsFromHeaders(headers: Record<string, string>): number {
  const ra = String(headers?.['retry-after'] || '').trim();
  const sec = Number(ra);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.trunc(sec * 1000);
}

function isRetriableSignupStatus(status: number): boolean {
  if (status === 0) return true;
  if (status === 408) return true;
  if (status === 425) return true;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

export async function publicAgentSignup(baseUrl: string, params: { agentType: string; intendedUse: string; currency: string }): Promise<SignupResult> {
  const retries = Math.max(0, envInt('PHOENIX_ZERO_SIGNUP_RETRIES', 3));
  const backoffMs = Math.max(250, envInt('PHOENIX_ZERO_SIGNUP_BACKOFF_MS', 3000));

  for (let attempt = 0; attempt <= retries; attempt++) {
    const nonce = Math.random().toString(36).slice(2, 10);
    const body = {
      name: `Agent Signup ${nonce}`,
      email: `agent-${nonce}@example.com`,
      agentType: params.agentType,
      intendedUse: params.intendedUse,
      acceptsTermsVersion: '2026-01-v1',
      acceptsFixedPricing: true,
      billingMode: 'prepaid',
      currency: params.currency
    };

    const res = await httpJson({ method: 'POST', url: `${baseUrl}/api/public/agent-signup`, body });

    if (attempt < retries && isRetriableSignupStatus(res.status)) {
      const raMs = retryAfterMsFromHeaders(res.headers);
      const jitter = Math.trunc(Math.random() * 250);
      const delay = raMs > 0 ? raMs + jitter : backoffMs * Math.pow(2, attempt) + jitter;
      await sleepMs(delay);
      continue;
    }

    if (!res.ok || !res.json || typeof res.json !== 'object') {
      return { ok: false, status: res.status, rawText: res.text, rawJson: res.json };
    }

    const tenantId = String(res.json?.tenant?.tenantId || '').trim();
    const apiKey = String(res.json?.tenant?.apiKey || '').trim();
    if (!tenantId || !apiKey) {
      return { ok: false, status: res.status, rawText: res.text, rawJson: res.json };
    }

    return { ok: true, tenantId, apiKey, raw: res.json };
  }

  return { ok: false, status: 429, rawText: 'Rate limit exceeded', rawJson: { ok: false, reasonCode: 'RATE_LIMITED' } };
}
