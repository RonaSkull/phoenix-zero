import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulateNowPaymentsWebhook } from '../flows/checkout';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function nowPaymentsWebhookSignatureInvalidTest(params: {
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
      taskInputHash: sha256Hex('hardening:nowpayments-webhook-signature-invalid:input'),
      taskOutputHash: sha256Hex('hardening:nowpayments-webhook-signature-invalid:output')
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

  const evt1 = `evt_sig_missing_${Date.now()}_${b64Url(randomBytes(6))}`;
  const missingSig = await simulateNowPaymentsWebhook(params.baseUrl, {
    providerPaymentId,
    eventId: evt1,
    paymentStatus: 'finished',
    omitSignature: true
  });
  if (missingSig.status !== 401) throw new Error(`EXPECTED_401_MISSING_SIG got=${missingSig.status}`);

  const evt2 = `evt_sig_invalid_${Date.now()}_${b64Url(randomBytes(6))}`;
  const invalidSig = await simulateNowPaymentsWebhook(params.baseUrl, {
    providerPaymentId,
    nowPaymentsIpnSecret: params.nowPaymentsIpnSecret,
    eventId: evt2,
    paymentStatus: 'finished',
    signatureOverride: 'deadbeef'
  });
  if (invalidSig.status !== 401) throw new Error(`EXPECTED_401_INVALID_SIG got=${invalidSig.status}`);

  const s1 = await checkoutStatus(params.baseUrl, { apiKey: params.apiKey, paymentId });
  const status = String(s1.json?.status || '').trim().toLowerCase();
  if (!s1.ok) throw new Error(`CHECKOUT_STATUS_FAILED status=${s1.status}`);
  if (status !== 'pending') throw new Error(`STATUS_CHANGED_AFTER_UNAUTHORIZED_WEBHOOK got=${status}`);

  return { paymentId, providerPaymentId };
}
