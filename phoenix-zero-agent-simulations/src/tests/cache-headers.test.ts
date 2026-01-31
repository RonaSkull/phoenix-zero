import { httpJson } from '../lib/http';

function header(res: any, name: string): string {
  const h = (res && typeof res === 'object' ? (res as any).headers : null) || {};
  return String(h[String(name || '').toLowerCase()] || '').trim();
}

export async function cacheHeadersTest(params: { baseUrl: string; apiKey: string; agentId: string }): Promise<{ ok: true }> {
  const gate = await httpJson({ method: 'GET', url: `${params.baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/gate`, apiKey: params.apiKey });
  if (gate.status !== 200) throw new Error(`GATE_NOT_200 got=${gate.status}`);
  const ccGate = header(gate, 'cache-control').toLowerCase();
  if (!ccGate.includes('no-store')) throw new Error(`GATE_CACHE_CONTROL_NOT_NOSTORE got=${ccGate || '(empty)'}`);

  const pricing = await httpJson({ method: 'GET', url: `${params.baseUrl}/api/pricing`, apiKey: params.apiKey });
  if (pricing.status !== 200) throw new Error(`PRICING_NOT_200 got=${pricing.status}`);
  const ccPricing = header(pricing, 'cache-control').toLowerCase();
  if (!ccPricing.includes('no-store')) throw new Error(`PRICING_CACHE_CONTROL_NOT_NOSTORE got=${ccPricing || '(empty)'}`);

  return { ok: true };
}
