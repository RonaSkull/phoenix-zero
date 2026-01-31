import { httpJson } from '../lib/http';

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

export async function listAgentProofs(baseUrl: string, params: { apiKey: string; agentId: string; limit?: number }) {
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 50))));
  return httpJson({
    method: 'GET',
    url: `${baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/proofs?limit=${encodeURIComponent(String(limit))}`,
    apiKey: params.apiKey
  });
}

export async function waitForAgentProofByPaymentId(
  baseUrl: string,
  params: {
    apiKey: string;
    agentId: string;
    paymentId: string;
    waitMs: number;
    pollMs?: number;
    limit?: number;
    requireStatus?: string;
  }
): Promise<{ ok: true; proof: any } | { ok: false; last?: any }> {
  const paymentId = String(params.paymentId || '').trim();
  const requireStatus = String(params.requireStatus || '').trim();
  const waitMs = Math.max(0, Math.trunc(params.waitMs));
  const pollMs = Math.max(750, Math.trunc(params.pollMs ?? 1500));
  const deadline = Date.now() + waitMs;

  while (Date.now() <= deadline) {
    const res = await listAgentProofs(baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: params.limit });
    const arr: any[] = Array.isArray(res.json?.proofs) ? res.json.proofs : [];
    const proof = arr.find((p) => String(p?.paymentId || '').trim() === paymentId) || null;
    if (res.ok && proof) {
      const status = String(proof?.status || '').trim();
      if (!requireStatus || status === requireStatus) return { ok: true, proof };
    }
    await sleepMs(pollMs);
  }

  const last = await listAgentProofs(baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: params.limit });
  return { ok: false, last };
}
