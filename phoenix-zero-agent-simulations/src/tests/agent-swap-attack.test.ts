import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid } from '../flows/checkout';
import { executeTask, ppoGateCheck } from '../flows/execute';
import { waitForAgentProofByPaymentId } from '../flows/proofs';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function agentSwapAttackTest(params: {
  baseUrl: string;
  apiKey: string;
  asaasWebhookSecret: string;
  agentA: string;
  agentB: string;
  taskType: string;
  operation: string;
}): Promise<{ paymentId: string; providerPaymentId: string; proofId: string }> {
  const taskId = `task_${b64Url(randomBytes(12))}`;

  const checkout = await checkoutCreate(params.baseUrl, {
    apiKey: params.apiKey,
    currency: 'BRL',
    providerHint: 'pix',
    operation: params.operation,
    units: 1,
    proofMeta: {
      agentId: params.agentA,
      taskId,
      taskType: params.taskType,
      taskInputHash: sha256Hex('hardening:agent-swap:input'),
      taskOutputHash: sha256Hex('hardening:agent-swap:output')
    }
  });

  if (!checkout.ok || checkout.json?.ok !== true) {
    throw new Error(`CHECKOUT_CREATE_FAILED status=${checkout.status}`);
  }

  const paymentId = String(checkout.json?.paymentId || '').trim();
  if (!paymentId) throw new Error('MISSING_PAYMENT_ID');

  const s0 = await checkoutStatus(params.baseUrl, { apiKey: params.apiKey, paymentId });
  const providerPaymentId = String(s0.json?.providerPaymentId || '').trim();
  if (!providerPaymentId) throw new Error('MISSING_PROVIDER_PAYMENT_ID');

  const evtPaid = `evt_paid_${Date.now()}_${b64Url(randomBytes(6))}`;
  const paid = await simulatePixWebhookPaid(params.baseUrl, {
    providerPaymentId,
    asaasWebhookSecret: params.asaasWebhookSecret,
    eventId: evtPaid
  });
  if (!paid.ok) throw new Error(`WEBHOOK_PAID_FAILED status=${paid.status}`);

  const waitedProof = await waitForAgentProofByPaymentId(params.baseUrl, {
    apiKey: params.apiKey,
    agentId: params.agentA,
    paymentId,
    waitMs: 20_000,
    pollMs: 750,
    requireStatus: 'paid_confirmed',
    limit: 50
  });
  if (!waitedProof.ok) throw new Error('PROOF_NOT_CREATED_AFTER_PAID');

  const proof = waitedProof.proof;
  const proofId = String(proof?.id || proof?.proofId || '').trim();
  const proofStatus = String(proof?.status || '').trim();
  if (!proofId) throw new Error('MISSING_PROOF_ID');
  if (proofStatus !== 'paid_confirmed') throw new Error(`PROOF_NOT_PAID_CONFIRM got=${proofStatus}`);

  const gateA = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentA, taskId, taskType: params.taskType });
  if (!gateA.ok || gateA.json?.allowed !== true) throw new Error('GATE_A_NOT_ALLOWED_AFTER_PAID');

  const gateB = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentB, taskId, taskType: params.taskType });
  if (!gateB.ok) throw new Error(`GATE_B_CHECK_FAILED status=${gateB.status}`);
  if (gateB.json?.allowed === true) throw new Error('AGENT_SWAP_ATTACK_PASSED_GATE');

  const execB = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentB, taskId, taskType: params.taskType });
  if (execB.status === 200) throw new Error('AGENT_SWAP_ATTACK_PASSED_EXECUTE');
  if (execB.status !== 403) throw new Error(`EXECUTE_B_EXPECTED_403 got=${execB.status}`);

  return { paymentId, providerPaymentId, proofId };
}
