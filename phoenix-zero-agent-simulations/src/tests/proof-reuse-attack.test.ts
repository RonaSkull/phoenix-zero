import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import {
  checkoutCreate,
  checkoutStatus,
  simulateNowPaymentsWebhookPaid,
  simulateNowPaymentsWebhookRefund,
  simulatePixWebhookPaid,
  simulatePixWebhookRefund
} from '../flows/checkout';
import { executeTask, ppoGateCheck } from '../flows/execute';
import { listAgentProofs, waitForAgentProofByPaymentId } from '../flows/proofs';

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function proofReuseAttackTest(params: {
  baseUrl: string;
  apiKey: string;
  asaasWebhookSecret?: string;
  nowPaymentsIpnSecret?: string;
  providerHint?: 'pix' | 'crypto';
  agentA: string;
  agentB: string;
  taskType: string;
  operation: string;
}): Promise<{ paymentId: string; providerPaymentId: string; proofId: string }> {
  const taskId = `task_${b64Url(randomBytes(12))}`;

  const providerHint: 'pix' | 'crypto' = params.providerHint || 'pix';
  const currency = providerHint === 'crypto' ? 'USD' : 'BRL';

  if (providerHint === 'pix' && !String(params.asaasWebhookSecret || '').trim()) {
    throw new Error('Missing ASAAS_WEBHOOK_SECRET');
  }
  if (providerHint === 'crypto' && !String(params.nowPaymentsIpnSecret || '').trim()) {
    throw new Error('Missing NOWPAYMENTS_IPN_SECRET');
  }

  const checkout = await checkoutCreate(params.baseUrl, {
    apiKey: params.apiKey,
    currency,
    providerHint,
    operation: params.operation,
    units: 2,
    proofMeta: {
      agentId: params.agentA,
      taskId,
      taskType: params.taskType,
      taskInputHash: sha256Hex('hardening:proof-reuse:input'),
      taskOutputHash: sha256Hex('hardening:proof-reuse:output')
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
  const paid = providerHint === 'crypto'
    ? await simulateNowPaymentsWebhookPaid(params.baseUrl, {
        providerPaymentId,
        nowPaymentsIpnSecret: String(params.nowPaymentsIpnSecret || '').trim(),
        eventId: evtPaid
      })
    : await simulatePixWebhookPaid(params.baseUrl, {
        providerPaymentId,
        asaasWebhookSecret: String(params.asaasWebhookSecret || '').trim() || undefined,
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

  const proofPaid = waitedProof.proof;
  const proofId = String(proofPaid?.id || proofPaid?.proofId || '').trim();
  const proofStatus = String(proofPaid?.status || '').trim();
  if (!proofId) throw new Error('MISSING_PROOF_ID');
  if (proofStatus !== 'paid_confirmed') throw new Error(`PROOF_NOT_PAID_CONFIRM got=${proofStatus}`);

  const gateA = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentA, taskId, taskType: params.taskType });
  if (!gateA.ok || gateA.json?.allowed !== true) throw new Error('GATE_A_NOT_ALLOWED_AFTER_PAID');

  const evtRefund = `evt_refund_${Date.now()}_${b64Url(randomBytes(6))}`;
  const refund = providerHint === 'crypto'
    ? await simulateNowPaymentsWebhookRefund(params.baseUrl, {
        providerPaymentId,
        nowPaymentsIpnSecret: String(params.nowPaymentsIpnSecret || '').trim(),
        eventId: evtRefund
      })
    : await simulatePixWebhookRefund(params.baseUrl, {
        providerPaymentId,
        asaasWebhookSecret: String(params.asaasWebhookSecret || '').trim() || undefined,
        eventId: evtRefund
      });
  if (!refund.ok) throw new Error(`WEBHOOK_REFUND_FAILED status=${refund.status}`);

  const deadline = Date.now() + 15_000;
  let proofStatusAfter = '';
  while (Date.now() <= deadline) {
    const proofsAfter = await listAgentProofs(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentA, limit: 50 });
    const proofsAfterArr: any[] = Array.isArray(proofsAfter.json?.proofs) ? proofsAfter.json.proofs : [];
    const proofAfter = proofsAfterArr.find((p) => String(p?.id || p?.proofId || '').trim() === proofId) || null;
    proofStatusAfter = String(proofAfter?.status || '').trim();
    if (proofStatusAfter && proofStatusAfter !== 'paid_confirmed') break;
    await sleepMs(750);
  }
  if (proofStatusAfter === 'paid_confirmed') throw new Error('PROOF_NOT_REVOKED_AFTER_REFUND');

  const gateB = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentB, taskId, taskType: params.taskType });
  if (!gateB.ok) throw new Error(`GATE_B_CHECK_FAILED status=${gateB.status}`);
  if (gateB.json?.allowed === true) throw new Error('PROOF_REUSE_ATTACK_PASSED');

  const execB = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentB, taskId, taskType: params.taskType });
  if (execB.status === 200) throw new Error('EXECUTE_B_ALLOWED_WITH_REUSED_PROOF');
  if (execB.status !== 403) throw new Error(`EXECUTE_B_EXPECTED_403 got=${execB.status}`);

  const gateAfterRefund = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentA, taskId, taskType: params.taskType });
  if (!gateAfterRefund.ok) throw new Error(`GATE_AFTER_REFUND_FAILED status=${gateAfterRefund.status}`);
  if (gateAfterRefund.json?.allowed === true) throw new Error('GATE_ALLOWED_AFTER_REFUND');

  return { paymentId, providerPaymentId, proofId };
}
