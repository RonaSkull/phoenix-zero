import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulateNowPaymentsWebhook, waitForCheckoutPaid } from '../flows/checkout';
import { ppoGateCheck } from '../flows/execute';
import { waitForAgentProofByPaymentId } from '../flows/proofs';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function nowPaymentsStatusRegressionIgnoredTest(params: {
  baseUrl: string;
  apiKey: string;
  nowPaymentsIpnSecret: string;
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ paymentId: string; providerPaymentId: string; proofId: string }> {
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
      taskInputHash: sha256Hex('hardening:nowpayments-status-regression:input'),
      taskOutputHash: sha256Hex('hardening:nowpayments-status-regression:output')
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
  const paid = await simulateNowPaymentsWebhook(params.baseUrl, {
    providerPaymentId,
    nowPaymentsIpnSecret: params.nowPaymentsIpnSecret,
    eventId: evtPaid,
    paymentStatus: 'finished',
    extra: { actually_paid_at: new Date().toISOString() }
  });
  if (!paid.ok) throw new Error(`WEBHOOK_PAID_FAILED status=${paid.status}`);

  const waitedPaid = await waitForCheckoutPaid(params.baseUrl, { apiKey: params.apiKey, paymentId, waitMs: 20_000, pollMs: 750 });
  if (!waitedPaid.ok || !waitedPaid.paid) {
    const got = String(waitedPaid.last.json?.status || '').trim();
    throw new Error(`CHECKOUT_NOT_PAID status=${waitedPaid.last.status} got=${got}`);
  }

  const proofRes = await waitForAgentProofByPaymentId(params.baseUrl, {
    apiKey: params.apiKey,
    agentId: params.agentId,
    paymentId,
    waitMs: 20_000,
    pollMs: 750,
    requireStatus: 'paid_confirmed'
  });
  if (!proofRes.ok) throw new Error('PROOF_NOT_CREATED_AFTER_PAID');
  const proofId = String(proofRes.proof?.id || (proofRes.proof as any)?.proofId || '').trim();
  if (!proofId) throw new Error('MISSING_PROOF_ID');

  const evtRegress = `evt_regress_${Date.now()}_${b64Url(randomBytes(6))}`;
  const regress = await simulateNowPaymentsWebhook(params.baseUrl, {
    providerPaymentId,
    nowPaymentsIpnSecret: params.nowPaymentsIpnSecret,
    eventId: evtRegress,
    paymentStatus: 'confirming'
  });
  if (!regress.ok) throw new Error(`WEBHOOK_REGRESSION_FAILED status=${regress.status}`);

  const s1 = await checkoutStatus(params.baseUrl, { apiKey: params.apiKey, paymentId });
  const status = String(s1.json?.status || '').trim().toLowerCase();
  if (!s1.ok) throw new Error(`CHECKOUT_STATUS_FAILED status=${s1.status}`);
  if (status !== 'paid') throw new Error(`STATUS_REGRESSED_FROM_PAID got=${status}`);

  const gate = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (!gate.ok) throw new Error(`GATE_CHECK_FAILED status=${gate.status}`);
  if (gate.json?.allowed !== true) throw new Error('GATE_NOT_ALLOWED_AFTER_PAID');

  return { paymentId, providerPaymentId, proofId };
}
