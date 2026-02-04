import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid, waitForCheckoutPaid } from '../flows/checkout';
import { executeTask } from '../flows/execute';
import { adminAdvanceSettlements, listAgentSettlements } from '../flows/settlements';

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

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function parseIsoMs(v: unknown): number {
  const ms = Date.parse(String(v || ''));
  return Number.isFinite(ms) ? ms : NaN;
}

export async function riskWindowTest(params: {
  baseUrl: string;
  apiKey: string;
  asaasWebhookSecret: string;
  adminToken: string;
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ paymentId: string; providerPaymentId: string; settlementId: string; riskWindowEndsAt: string }> {
  const taskId = `task_${b64Url(randomBytes(12))}`;

  const checkout = await checkoutCreate(params.baseUrl, {
    apiKey: params.apiKey,
    currency: 'BRL',
    providerHint: 'pix',
    operation: params.operation,
    units: 1,
    proofMeta: {
      agentId: params.agentId,
      taskId,
      taskType: params.taskType,
      taskInputHash: sha256Hex('hardening:risk-window:input'),
      taskOutputHash: sha256Hex('hardening:risk-window:output')
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

  const waited = await waitForCheckoutPaid(params.baseUrl, { apiKey: params.apiKey, paymentId, waitMs: 20_000, pollMs: 750 });
  if (!waited.ok || !waited.paid) throw new Error('CHECKOUT_NOT_PAID');

  const exec1 = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (exec1.status !== 200) throw new Error(`EXECUTE_NOT_ALLOWED status=${exec1.status}`);

  const settleWaitMs = Math.max(1_000, Math.trunc(Number(env('PHOENIX_ZERO_HARDENING_RISK_WINDOW_WAIT_MS') || '8000')));
  const pollMs = 750;
  const deadline = Date.now() + settleWaitMs;

  let latest: any = null;
  while (Date.now() <= deadline) {
    const s = await listAgentSettlements(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
    const arr: any[] = Array.isArray(s.json?.settlements) ? s.json.settlements : [];
    latest = arr.find((x) => String(x?.paymentId || '').trim() === paymentId) || arr[0] || null;
    if (latest) break;
    await sleepMs(pollMs);
  }

  if (!latest) throw new Error('MISSING_SETTLEMENT');

  const settlementId = String(latest?.settlementId || '').trim();
  const riskWindowEndsAt = String(latest?.riskWindowEndsAt || '').trim();
  const dueMs = parseIsoMs(riskWindowEndsAt);

  if (!settlementId) throw new Error('MISSING_SETTLEMENT_ID');
  if (!riskWindowEndsAt || !Number.isFinite(dueMs)) throw new Error('MISSING_RISK_WINDOW_ENDS_AT');

  const statusEarly = String(latest?.status || '').trim();
  if (statusEarly === 'settled') throw new Error('SETTLEMENT_SETTLED_TOO_EARLY');

  const advancedEarly = await adminAdvanceSettlements(params.baseUrl, {
    adminToken: params.adminToken,
    nowMs: dueMs - 1,
    limit: 5000
  });
  if (!advancedEarly.ok) throw new Error(`ADVANCE_EARLY_FAILED status=${advancedEarly.status}`);

  const afterEarly = await listAgentSettlements(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
  const arrAfterEarly: any[] = Array.isArray(afterEarly.json?.settlements) ? afterEarly.json.settlements : [];
  const sAfterEarly = arrAfterEarly.find((x) => String(x?.settlementId || '').trim() === settlementId) || null;
  const statusAfterEarly = String(sAfterEarly?.status || '').trim();
  if (statusAfterEarly === 'settled') throw new Error('SETTLEMENT_SETTLED_WITHIN_RISK_WINDOW');

  const advancedLate = await adminAdvanceSettlements(params.baseUrl, {
    adminToken: params.adminToken,
    nowMs: dueMs + 1,
    limit: 5000
  });
  if (!advancedLate.ok) throw new Error(`ADVANCE_LATE_FAILED status=${advancedLate.status}`);

  const afterLate = await listAgentSettlements(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
  const arrAfterLate: any[] = Array.isArray(afterLate.json?.settlements) ? afterLate.json.settlements : [];
  const sAfterLate = arrAfterLate.find((x) => String(x?.settlementId || '').trim() === settlementId) || null;
  const statusAfterLate = String(sAfterLate?.status || '').trim();

  if (statusAfterLate !== 'settled') {
    throw new Error(`SETTLEMENT_NOT_SETTLED_AFTER_RISK_WINDOW got=${statusAfterLate || 'null'}`);
  }

  return { paymentId, providerPaymentId, settlementId, riskWindowEndsAt };
}
