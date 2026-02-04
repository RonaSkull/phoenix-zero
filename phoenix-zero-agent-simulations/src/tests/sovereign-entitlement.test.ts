import { randomBytes } from 'node:crypto';

import { httpJson, sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulateNowPaymentsWebhookPaid, waitForCheckoutPaid } from '../flows/checkout';
import { executeTask, ppoGateCheck } from '../flows/execute';
import { getPricingContract, adminDeleteSovereignContract, adminUpsertSovereignContract } from '../flows/sovereign';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function clip(s: string, maxLen: number): string {
  const t = String(s || '');
  if (t.length <= maxLen) return t;
  return t.slice(0, Math.max(0, maxLen)) + '…';
}

export async function sovereignEntitlementTest(params: {
  baseUrl: string;
  apiKey: string;
  tenantId: string;
  adminToken: string;
  nowPaymentsIpnSecret?: string;
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ ok: true; enforcementObserved: 'on' | 'off'; adminSovereignEndpointAvailable?: boolean }> {
  const adminToken = String(params.adminToken || '').trim();
  if (!adminToken) throw new Error('Missing PHOENIX_ZERO_ADMIN_TOKEN (required for sovereignEntitlementTest)');

  const taskId = `task_${b64Url(randomBytes(12))}`;

  const fallback = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/admin/fallback-paid`,
    headers: { 'x-admin-token': adminToken },
    body: {
      tenantId: params.tenantId,
      agentId: params.agentId,
      taskType: params.taskType,
      taskId,
      units: 5,
      currency: 'BRL',
      taskInputHash: `sha256:${sha256Hex('sovereign:input')}`,
      taskOutputHash: `sha256:${sha256Hex('sovereign:output')}`
    }
  });

  if (!fallback.ok || fallback.json?.ok !== true) {
    const nowPaymentsIpnSecret = String(params.nowPaymentsIpnSecret || '').trim();
    if (!nowPaymentsIpnSecret) {
      const detail = fallback.json != null ? clip(JSON.stringify(fallback.json), 500) : clip(fallback.text || '', 500);
      throw new Error(`FALLBACK_PAID_FAILED status=${fallback.status} detail=${detail}`);
    }

    const checkout = await checkoutCreate(params.baseUrl, {
      apiKey: params.apiKey,
      currency: 'USD',
      providerHint: 'crypto',
      operation: params.operation,
      units: 5,
      proofMeta: {
        agentId: params.agentId,
        taskId,
        taskType: params.taskType,
        taskInputHash: `sha256:${sha256Hex('sovereign:input')}`,
        taskOutputHash: `sha256:${sha256Hex('sovereign:output')}`
      }
    });

    if (!checkout.ok || checkout.json?.ok !== true) {
      const detail = checkout.json != null ? clip(JSON.stringify(checkout.json), 500) : clip(checkout.text || '', 500);
      throw new Error(`CHECKOUT_CREATE_FAILED status=${checkout.status} detail=${detail}`);
    }

    const paymentId = String(checkout.json?.paymentId || '').trim();
    if (!paymentId) throw new Error('MISSING_PAYMENT_ID');

    const s0 = await checkoutStatus(params.baseUrl, { apiKey: params.apiKey, paymentId });
    const providerPaymentId = String(s0.json?.providerPaymentId || '').trim();
    if (!providerPaymentId) throw new Error('MISSING_PROVIDER_PAYMENT_ID');

    const evtPaid = `evt_paid_${Date.now()}_${b64Url(randomBytes(6))}`;
    const paid = await simulateNowPaymentsWebhookPaid(params.baseUrl, {
      providerPaymentId,
      nowPaymentsIpnSecret,
      eventId: evtPaid
    });
    if (!paid.ok) throw new Error(`NOWPAYMENTS_WEBHOOK_PAID_FAILED status=${paid.status}`);

    const waited = await waitForCheckoutPaid(params.baseUrl, { apiKey: params.apiKey, paymentId, waitMs: 20_000, pollMs: 750 });
    if (!waited.ok || !waited.paid) {
      const got = String(waited.last.json?.status || '').trim();
      throw new Error(`CHECKOUT_NOT_PAID status=${waited.last.status} got=${got}`);
    }
  }

  const gate = await ppoGateCheck(params.baseUrl, {
    apiKey: params.apiKey,
    agentId: params.agentId,
    taskId,
    taskType: params.taskType
  });
  if (!gate.ok || gate.json?.allowed !== true) {
    throw new Error(`GATE_NOT_ALLOWED status=${gate.status} reason=${String(gate.json?.reason || '')}`);
  }

  const contract0 = await getPricingContract(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId });
  if (contract0.status !== 404) {
    throw new Error(`EXPECTED_NO_CONTRACT_404 got=${contract0.status}`);
  }

  const quote0 = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/pricing/quote`,
    apiKey: params.apiKey,
    body: { operation: params.operation, agentId: params.agentId, taskType: params.taskType, executionClassId: 'default' }
  });

  const exec0 = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });

  let enforcementObserved: 'on' | 'off' = 'off';
  if (exec0.status === 403) {
    const rc = String(exec0.json?.reasonCode || exec0.json?.reason || '').trim();
    if (rc !== 'NO_CONTRACT') {
      throw new Error(`EXPECTED_NO_CONTRACT got=${rc || 'empty'}`);
    }
    enforcementObserved = 'on';

    if (quote0.status !== 403) {
      throw new Error(`EXPECTED_QUOTE_NO_CONTRACT_403 got=${quote0.status}`);
    }
    const qrc = String(quote0.json?.reasonCode || quote0.json?.reason || '').trim();
    if (qrc !== 'NO_CONTRACT') {
      throw new Error(`EXPECTED_QUOTE_NO_CONTRACT got=${qrc || 'empty'}`);
    }
  } else if (exec0.status === 200 && exec0.json?.ok === true) {
    enforcementObserved = 'off';
  } else {
    throw new Error(`UNEXPECTED_EXEC_STATUS got=${exec0.status}`);
  }

  const contractId = `ct_${b64Url(randomBytes(12))}`;
  const classId = 'default';
  const now = new Date().toISOString();

  try {
    const upsert = await adminUpsertSovereignContract(params.baseUrl, {
      adminToken,
      contract: {
        contractId,
        tenantId: params.tenantId,
        agentId: params.agentId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        defaultExecutionClassId: classId,
        executionClasses: [
          {
            classId,
            currency: 'USD',
            pricePerExecutionCents: 100,
            allowedTaskTypes: [params.taskType],
            maxDailyExecutions: 1,
            maxMonthlyExecutions: 0
          }
        ]
      }
    });

    if (upsert.status === 404) {
      return { ok: true, enforcementObserved, adminSovereignEndpointAvailable: false };
    }

    if (!upsert.ok || upsert.json?.ok !== true) {
      throw new Error(`ADMIN_UPSERT_CONTRACT_FAILED status=${upsert.status}`);
    }

    const contract1 = await getPricingContract(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId });
    if (!contract1.ok || contract1.json?.ok !== true) {
      throw new Error(`GET_PRICING_CONTRACT_FAILED status=${contract1.status}`);
    }

    const quote1 = await httpJson({
      method: 'POST',
      url: `${params.baseUrl}/api/pricing/quote`,
      apiKey: params.apiKey,
      body: { operation: params.operation, agentId: params.agentId, taskType: params.taskType, executionClassId: classId }
    });
    if (enforcementObserved === 'on') {
      if (quote1.status !== 200) throw new Error(`EXPECTED_QUOTE_OK_200 got=${quote1.status}`);
      if (quote1.json?.ok !== true) throw new Error(`EXPECTED_QUOTE_OK_TRUE got=${String(quote1.json?.ok)}`);
    }

    const exec1 = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
    if (!exec1.ok || exec1.json?.ok !== true) {
      throw new Error(`EXEC_AFTER_CONTRACT_FAILED status=${exec1.status}`);
    }

    const quote2 = await httpJson({
      method: 'POST',
      url: `${params.baseUrl}/api/pricing/quote`,
      apiKey: params.apiKey,
      body: { operation: params.operation, agentId: params.agentId, taskType: params.taskType, executionClassId: classId }
    });

    const exec2 = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
    if (enforcementObserved === 'on') {
      if (exec2.status !== 403) throw new Error(`EXPECTED_DAILY_LIMIT_403 got=${exec2.status}`);
      const rc = String(exec2.json?.reasonCode || exec2.json?.reason || '').trim();
      if (rc !== 'DAILY_EXECUTION_LIMIT') throw new Error(`EXPECTED_DAILY_EXECUTION_LIMIT got=${rc || 'empty'}`);

      if (quote2.status !== 403) throw new Error(`EXPECTED_QUOTE_DAILY_LIMIT_403 got=${quote2.status}`);
      const qrc = String(quote2.json?.reasonCode || quote2.json?.reason || '').trim();
      if (qrc !== 'DAILY_EXECUTION_LIMIT') throw new Error(`EXPECTED_QUOTE_DAILY_EXECUTION_LIMIT got=${qrc || 'empty'}`);
    }

    return { ok: true, enforcementObserved };
  } finally {
    await adminDeleteSovereignContract(params.baseUrl, {
      adminToken,
      tenantId: params.tenantId,
      agentId: params.agentId
    }).catch(() => {
    });
  }
}
