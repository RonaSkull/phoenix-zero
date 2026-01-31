import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate } from '../flows/checkout';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function agentConfusionTest(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  operation: string;
  taskType: string;
}): Promise<{ ok: true }> {
  const taskId = `task_${b64Url(randomBytes(12))}`;

  const bad = await checkoutCreate(params.baseUrl, {
    apiKey: params.apiKey,
    currency: 'BRL',
    providerHint: 'pix',
    operation: params.operation,
    units: 1,
    proofMeta: {
      agentId: params.agentId,
      taskId,
      taskType: params.taskType === 'protect_video' ? 'protect_image' : 'protect_video',
      taskInputHash: sha256Hex('confusion:input'),
      taskOutputHash: sha256Hex('confusion:output')
    }
  });

  if (bad.status !== 400) {
    throw new Error(`EXPECTED_400_TASKTYPE_MISMATCH got=${bad.status}`);
  }

  return { ok: true };
}
