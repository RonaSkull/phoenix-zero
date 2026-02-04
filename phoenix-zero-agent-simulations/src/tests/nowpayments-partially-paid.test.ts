import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulateNowPaymentsWebhook } from '../flows/checkout';
import { ppoGateCheck } from '../flows/execute';
import { listAgentProofs } from '../flows/proofs';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function nowPaymentsPartiallyPaidDoesNotUnlockTest(params: {
  baseUrl: string;
  apiKey: string;
  nowPaymentsIpnSecret: string;
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ paymentId: string; providerPaymentId: string }> {
  if (!String(params.nowPaymentsIpnSecret || '').trim()) throw new Error('Missing NOWPAYMENTS_IPN_SECRET');

  const taskId = `task_${b64Url(randomBytes(12))}`;

  const checkout = await checkoutCreate(params.baseUrl, {
    apiKey: params.apiKey,
    currency: 'USD',
    providerHint: 'crypto',
    operation: params.operation,
    units: 1,
    proofMeta: {
      agentId: params.agentId,
      taskId,
      taskType: params.taskType,
      taskInputHash: sha256Hex('hardening:nowpayments-partially-paid:input'),
      taskOutputHash: sha256Hex('hardening:nowpayments-partially-paid:output')
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

  const evt = `evt_partial_${Date.now()}_${b64Url(randomBytes(6))}`;
  const partial = await simulateNowPaymentsWebhook(params.baseUrl, {
    providerPaymentId,
    nowPaymentsIpnSecret: params.nowPaymentsIpnSecret,
    eventId: evt,
    paymentStatus: 'partially_paid',
    extra: { actually_paid_at: new Date().toISOString() }
  });
  if (!partial.ok) throw new Error(`WEBHOOK_PARTIAL_FAILED status=${partial.status}`);

  const s1 = await checkoutStatus(params.baseUrl, { apiKey: params.apiKey, paymentId });
  const status = String(s1.json?.status || '').trim().toLowerCase();
  if (!s1.ok) throw new Error(`CHECKOUT_STATUS_FAILED status=${s1.status}`);
  if (status !== 'pending') throw new Error(`EXPECTED_PENDING_AFTER_PARTIALLY_PAID got=${status}`);

  const proofs = await listAgentProofs(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
  if (!proofs.ok) throw new Error(`LIST_PROOFS_FAILED status=${proofs.status}`);
  const arr: any[] = Array.isArray(proofs.json?.proofs) ? proofs.json.proofs : [];
  const found = arr.find((p) => String(p?.paymentId || '').trim() === paymentId) || null;
  if (found) throw new Error('PROOF_CREATED_ON_PARTIALLY_PAID');

  const gate = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (!gate.ok) throw new Error(`GATE_CHECK_FAILED status=${gate.status}`);
  if (gate.json?.allowed === true) throw new Error('GATE_ALLOWED_ON_PARTIALLY_PAID');

  return { paymentId, providerPaymentId };
}
