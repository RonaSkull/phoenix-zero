import { httpJson } from '../lib/http';

export async function listAgentSettlements(
  baseUrl: string,
  params: { apiKey: string; agentId: string; limit?: number }
): Promise<{ ok: boolean; status: number; json: any }> {
  const limit = typeof params.limit === 'number' && Number.isFinite(params.limit) ? params.limit : 200;
  return httpJson({
    method: 'GET',
    url: `${baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/settlements?limit=${encodeURIComponent(String(limit))}`,
    apiKey: params.apiKey
  });
}

export async function adminAdvanceSettlements(
  baseUrl: string,
  params: { adminToken: string; nowMs?: number; limit?: number }
): Promise<{ ok: boolean; status: number; json: any }> {
  const headers: Record<string, string> = { 'x-admin-token': String(params.adminToken || '').trim() };
  const body: any = {};
  if (typeof params.nowMs === 'number' && Number.isFinite(params.nowMs)) body.nowMs = params.nowMs;
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) body.limit = params.limit;

  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/admin/settlement/advance`,
    headers,
    body
  });
}
