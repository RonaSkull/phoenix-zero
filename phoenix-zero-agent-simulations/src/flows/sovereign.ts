import { httpJson } from '../lib/http';

export async function getPricingContract(baseUrl: string, params: { apiKey: string; agentId: string }) {
  const qp = new URLSearchParams();
  qp.set('agentId', String(params.agentId || '').trim());

  return httpJson({
    method: 'GET',
    url: `${baseUrl}/api/pricing/contract?${qp.toString()}`,
    apiKey: params.apiKey
  });
}

export async function adminUpsertSovereignContract(
  baseUrl: string,
  params: { adminToken: string; contract: any }
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/admin/sovereign-contracts`,
    headers: { 'x-admin-token': String(params.adminToken || '').trim() },
    body: { contract: params.contract }
  });
}

export async function adminDeleteSovereignContract(
  baseUrl: string,
  params: { adminToken: string; tenantId: string; agentId: string }
): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const qp = new URLSearchParams();
  qp.set('tenantId', String(params.tenantId || '').trim());
  qp.set('agentId', String(params.agentId || '').trim());

  return httpJson({
    method: 'DELETE',
    url: `${baseUrl}/api/admin/sovereign-contracts?${qp.toString()}`,
    headers: { 'x-admin-token': String(params.adminToken || '').trim() }
  });
}
