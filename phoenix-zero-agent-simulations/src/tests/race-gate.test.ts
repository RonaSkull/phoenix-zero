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

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

export async function raceGateTest(params: {
  baseUrl: string;
  apiKey: string;
  asaasWebhookSecret?: string;
  nowPaymentsIpnSecret?: string;
  providerHint?: 'pix' | 'crypto';
  agentId: string;
  taskType: string;
  operation: string;
  gateN?: number;
  executeN?: number;
}): Promise<{ paymentId: string; providerPaymentId: string }> {
  const gateN = Math.max(1, Math.min(500, Math.trunc(Number(params.gateN ?? 100))));
  const executeN = Math.max(0, Math.min(200, Math.trunc(Number(params.executeN ?? 20))));

  const providerHint: 'pix' | 'crypto' = params.providerHint || 'pix';
  const currency = providerHint === 'crypto' ? 'USD' : 'BRL';

  if (providerHint === 'pix' && !String(params.asaasWebhookSecret || '').trim()) {
    throw new Error('Missing ASAAS_WEBHOOK_SECRET');
  }
  if (providerHint === 'crypto' && !String(params.nowPaymentsIpnSecret || '').trim()) {
    throw new Error('Missing NOWPAYMENTS_IPN_SECRET');
  }

  const taskId = `task_${b64Url(randomBytes(12))}`;

  const checkout = await checkoutCreate(params.baseUrl, {
    apiKey: params.apiKey,
    currency,
    providerHint,
    operation: params.operation,
    units: Math.max(1, executeN),
    proofMeta: {
      agentId: params.agentId,
      taskId,
      taskType: params.taskType,
      taskInputHash: sha256Hex('hardening:race-gate:input'),
      taskOutputHash: sha256Hex('hardening:race-gate:output')
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

  const concurrent: Array<Promise<any>> = [];
  concurrent.push(
    providerHint === 'crypto'
      ? simulateNowPaymentsWebhookPaid(params.baseUrl, {
          providerPaymentId,
          nowPaymentsIpnSecret: String(params.nowPaymentsIpnSecret || '').trim(),
          eventId: evtPaid
        })
      : simulatePixWebhookPaid(params.baseUrl, {
          providerPaymentId,
          asaasWebhookSecret: String(params.asaasWebhookSecret || '').trim() || undefined,
          eventId: evtPaid
        })
  );

  for (let i = 0; i < gateN; i += 1) {
    concurrent.push(ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType }));
  }

  for (let i = 0; i < executeN; i += 1) {
    concurrent.push(executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType }));
  }

  const results = await Promise.allSettled(concurrent);

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const res = r.value;
    if (!res || typeof res !== 'object') continue;
    const status = Number(res.status);
    if (Number.isFinite(status) && status >= 500) {
      throw new Error(`RACE_5XX status=${status}`);
    }
  }

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

  await sleepMs(750);

  const after: Array<Promise<any>> = [];
  after.push(ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType }));
  for (let i = 0; i < Math.max(1, Math.min(50, executeN)); i += 1) {
    after.push(executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType }));
  }

  const afterResults = await Promise.all(after);
  const gateAfter = afterResults[0];
  if (!gateAfter?.ok) throw new Error(`GATE_AFTER_REFUND_FAILED status=${gateAfter?.status}`);
  if (gateAfter.json?.allowed === true) throw new Error('GATE_ALLOWED_AFTER_REFUND');

  for (let i = 1; i < afterResults.length; i += 1) {
    const ex = afterResults[i];
    if (!ex || typeof ex !== 'object') continue;
    if (Number(ex.status) === 200) throw new Error('EXECUTE_ALLOWED_AFTER_REFUND');
    if (Number(ex.status) >= 500) throw new Error(`EXECUTE_5XX_AFTER_REFUND status=${ex.status}`);
  }

  return { paymentId, providerPaymentId };
}
