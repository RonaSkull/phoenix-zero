import { httpJson } from '../lib/http';

function envBool(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

export async function rateLimitTest(params: { baseUrl: string; apiKey: string; agentId: string; n?: number }): Promise<{ ok: true; observed429: boolean }> {
  const defaultN = envBool('PHOENIX_ZERO_HARDENING_EXPECT_429') ? 500 : 75;
  const n = Math.max(50, Math.min(2000, Math.trunc(Number(params.n ?? defaultN))));

  let observed429 = false;
  for (let i = 0; i < n; i += 1) {
    const r = await httpJson({
      method: 'GET',
      url: `${params.baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/gate`,
      apiKey: params.apiKey,
      retries: 0
    });
    if (r.status === 429) {
      observed429 = true;
      break;
    }
    if (r.status !== 200 && r.status !== 403) {
      throw new Error(`UNEXPECTED_STATUS got=${r.status}`);
    }
  }

  if (envBool('PHOENIX_ZERO_HARDENING_EXPECT_429') && !observed429) {
    throw new Error('RATE_LIMIT_DID_NOT_TRIGGER');
  }

  return { ok: true, observed429 };
}
