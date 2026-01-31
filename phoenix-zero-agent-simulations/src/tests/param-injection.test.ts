import { httpJson } from '../lib/http';

export async function paramInjectionTest(params: { baseUrl: string; apiKey: string; agentId: string }): Promise<{ ok: true }> {
  const execMissing = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/execute`,
    apiKey: params.apiKey,
    body: {}
  });
  if (execMissing.status !== 400) throw new Error(`EXPECTED_400_EXECUTE_MISSING got=${execMissing.status}`);

  const execWeird = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/execute`,
    apiKey: params.apiKey,
    body: { taskId: 123, taskType: { x: 1 } }
  });
  if (execWeird.status >= 500) throw new Error(`EXECUTE_WEIRD_5XX got=${execWeird.status}`);
  if (execWeird.status !== 400 && execWeird.status !== 403) throw new Error(`EXPECTED_400_OR_403_EXECUTE_WEIRD got=${execWeird.status}`);

  const gateWeird = await httpJson({
    method: 'GET',
    url: `${params.baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/gate?taskId=${encodeURIComponent('__proto__')}&taskType=${encodeURIComponent('protect_video')}&requireSignature=${encodeURIComponent('maybe')}`,
    apiKey: params.apiKey
  });
  if (gateWeird.status >= 500) throw new Error(`GATE_WEIRD_5XX got=${gateWeird.status}`);
  if (gateWeird.status !== 200 && gateWeird.status !== 400 && gateWeird.status !== 403) {
    throw new Error(`EXPECTED_200_OR_400_OR_403_GATE_WEIRD got=${gateWeird.status}`);
  }

  return { ok: true };
}
