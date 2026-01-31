import { httpJson } from '../lib/http';

export async function authBypassTest(params: { baseUrl: string; agentId: string }): Promise<{ ok: true }> {
  const gate = await httpJson({ method: 'GET', url: `${params.baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/gate` });
  if (gate.status !== 401) throw new Error(`EXPECTED_401_GATE got=${gate.status}`);

  const exec = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/execute`,
    body: { taskId: 'task_x', taskType: 'protect_video' }
  });
  if (exec.status !== 401) throw new Error(`EXPECTED_401_EXECUTE got=${exec.status}`);

  const checkoutCreate = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/checkout/create`,
    body: { currency: 'BRL', providerHint: 'pix', lineItems: [{ operation: 'protect_video', units: 1 }] }
  });
  if (checkoutCreate.status !== 401) throw new Error(`EXPECTED_401_CHECKOUT_CREATE got=${checkoutCreate.status}`);

  const checkoutStatus = await httpJson({ method: 'GET', url: `${params.baseUrl}/api/checkout/status?paymentId=pay_nonexistent` });
  if (checkoutStatus.status !== 401) throw new Error(`EXPECTED_401_CHECKOUT_STATUS got=${checkoutStatus.status}`);

  return { ok: true };
}
