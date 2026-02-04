import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import {
  checkoutCreate,
  checkoutStatus,
  simulateNowPaymentsWebhookPaid,
  simulatePixWebhookPaid,
  waitForCheckoutPaid
} from '../flows/checkout';
import { executeTask } from '../flows/execute';
import { adminDeleteSovereignContract, adminUpsertSovereignContract } from '../flows/sovereign';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function quantityAbuseTest(params: {
  baseUrl: string;
  apiKey: string;
  tenantId?: string;
  adminToken?: string;
  asaasWebhookSecret?: string;
  nowPaymentsIpnSecret?: string;
  providerHint?: 'pix' | 'crypto';
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ paymentId: string; providerPaymentId: string }> {
  const taskId = `task_${b64Url(randomBytes(12))}`;

  const providerHint: 'pix' | 'crypto' = params.providerHint || 'pix';
  const currency = providerHint === 'crypto' ? 'USD' : 'BRL';

  if (providerHint === 'pix' && !String(params.asaasWebhookSecret || '').trim()) {
    throw new Error('Missing ASAAS_WEBHOOK_SECRET');
  }
  if (providerHint === 'crypto' && !String(params.nowPaymentsIpnSecret || '').trim()) {
    throw new Error('Missing NOWPAYMENTS_IPN_SECRET');
  }

  const tenantId = String(params.tenantId || '').trim() || undefined;
  const adminToken = String(params.adminToken || '').trim() || undefined;

  const contractId = `ct_${b64Url(randomBytes(12))}`;
  const now = new Date().toISOString();

  try {
    if (tenantId && adminToken) {
      const upsert = await adminUpsertSovereignContract(params.baseUrl, {
        adminToken,
        contract: {
          contractId,
          tenantId,
          agentId: params.agentId,
          status: 'active',
          effectiveAt: now,
          expiresAt: null,
          defaultExecutionClassId: 'default',
          executionClasses: [
            {
              classId: 'default',
              currency: 'USD',
              pricePerExecutionCents: 100,
              allowedTaskTypes: [params.taskType],
              maxDailyExecutions: 0,
              maxMonthlyExecutions: 0
            }
          ]
        }
      });
      if (!upsert.ok && upsert.status !== 404) {
        throw new Error(`ADMIN_UPSERT_CONTRACT_FAILED status=${upsert.status}`);
      }
    }

    const checkout = await checkoutCreate(params.baseUrl, {
      apiKey: params.apiKey,
      currency,
      providerHint,
      operation: params.operation,
      units: 1,
      proofMeta: {
        agentId: params.agentId,
        taskId,
        taskType: params.taskType,
        taskInputHash: sha256Hex('hardening:quantity-abuse:input'),
        taskOutputHash: sha256Hex('hardening:quantity-abuse:output')
      }
    });

    if (!checkout.ok || checkout.json?.ok !== true) {
      const raw = checkout.json != null ? JSON.stringify(checkout.json) : checkout.text || '';
      const detail = raw.length > 500 ? raw.slice(0, 500) + '…' : raw;
      throw new Error(`CHECKOUT_CREATE_FAILED status=${checkout.status} detail=${detail}`);
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

    const waited = await waitForCheckoutPaid(params.baseUrl, { apiKey: params.apiKey, paymentId, waitMs: 20_000, pollMs: 750 });
    if (!waited.ok || !waited.paid) throw new Error('CHECKOUT_NOT_PAID');

    const exec1 = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
    if (exec1.status !== 200) throw new Error(`EXECUTE_1_NOT_ALLOWED status=${exec1.status}`);

    const exec2 = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
    if (exec2.status === 200) throw new Error('QUANTITY_ABUSE_PASSED');

    return { paymentId, providerPaymentId };
  } finally {
    if (tenantId && adminToken) {
      await adminDeleteSovereignContract(params.baseUrl, {
        adminToken,
        tenantId,
        agentId: params.agentId
      }).catch(() => {
      });
    }
  }
}
