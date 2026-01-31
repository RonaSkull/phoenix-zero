import { randomBytes } from 'node:crypto';

import { httpJson, sha256Hex } from '../lib/http';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function negotiationAbuseTest(params: { baseUrl: string; apiKey: string; agentId: string }): Promise<{ ok: true }> {
  const taskId = `task_${b64Url(randomBytes(12))}`;

  const res = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/checkout/create`,
    apiKey: params.apiKey,
    body: {
      currency: 'BRL',
      providerHint: 'pix',
      lineItems: [
        { operation: 'protect_video', units: 1 },
        { operation: 'protect_image', units: 1 }
      ],
      proofMeta: {
        agentId: params.agentId,
        taskId,
        taskType: 'protect_video',
        taskInputHash: sha256Hex('negotiation:input'),
        taskOutputHash: sha256Hex('negotiation:output')
      }
    }
  });

  if (res.status !== 400) {
    throw new Error(`EXPECTED_400_MULTI_OP_WITH_PROOF_META got=${res.status}`);
  }

  return { ok: true };
}
