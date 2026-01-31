import { httpJson } from '../lib/http';

export async function ppoGateCheck(baseUrl: string, params: { apiKey: string; agentId: string; taskId?: string; taskType?: string }) {
  const qp = new URLSearchParams();
  if (params.taskId) qp.set('taskId', params.taskId);
  if (params.taskType) qp.set('taskType', params.taskType);

  const suffix = qp.size ? `?${qp.toString()}` : '';

  return httpJson({
    method: 'GET',
    url: `${baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/gate${suffix}`,
    apiKey: params.apiKey
  });
}

export async function executeTask(
  baseUrl: string,
  params: { apiKey: string; agentId: string; taskId: string; taskType: string; requireSignature?: boolean }
): Promise<{ ok: boolean; status: number; json: any }> {
  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/agents/${encodeURIComponent(params.agentId)}/execute`,
    apiKey: params.apiKey,
    body: {
      taskId: params.taskId,
      taskType: params.taskType,
      requireSignature: params.requireSignature === true,
      simulateFailure: (params as any).simulateFailure === true
    }
  });
}
