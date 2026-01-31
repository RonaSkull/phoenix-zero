import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid, waitForCheckoutPaid } from '../flows/checkout';
import { executeTask, ppoGateCheck } from '../flows/execute';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function envMode(): 'A' | 'B' | 'C' {
  const raw = String(process.env.PHOENIX_ZERO_HARDENING_PARTIAL_FAILURE_MODE || '').trim().toUpperCase();
  if (raw === 'B') return 'B';
  if (raw === 'C') return 'C';
  return 'A';
}

export async function partialFailureTest(params: {
  baseUrl: string;
  apiKey: string;
  asaasWebhookSecret: string;
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ mode: 'A' | 'B' | 'C'; paymentId: string; providerPaymentId: string }> {
  const mode = envMode();
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
      taskInputHash: sha256Hex('hardening:partial-failure:input'),
      taskOutputHash: sha256Hex('hardening:partial-failure:output')
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

  const gate0 = await ppoGateCheck(params.baseUrl, {
    apiKey: params.apiKey,
    agentId: params.agentId,
    taskId,
    taskType: params.taskType
  });
  if (!gate0.ok || gate0.json?.allowed !== true) throw new Error(`GATE_NOT_ALLOWED_BEFORE_EXEC status=${gate0.status}`);

  const execFail = await executeTask(params.baseUrl, {
    apiKey: params.apiKey,
    agentId: params.agentId,
    taskId,
    taskType: params.taskType,
    simulateFailure: true
  } as any);
  if (execFail.status !== 500) throw new Error(`EXPECTED_500_ON_SIMULATED_FAILURE got=${execFail.status}`);

  const gateAfterFail = await ppoGateCheck(params.baseUrl, {
    apiKey: params.apiKey,
    agentId: params.agentId,
    taskId,
    taskType: params.taskType
  });
  if (!gateAfterFail.ok) throw new Error(`GATE_CHECK_FAILED_AFTER_FAILURE status=${gateAfterFail.status}`);

  if (mode === 'A' || mode === 'C') {
    if (gateAfterFail.json?.allowed !== true) throw new Error('PPO_SHOULD_NOT_BE_CONSUMED_ON_FAILURE');

    const execOk = await executeTask(params.baseUrl, {
      apiKey: params.apiKey,
      agentId: params.agentId,
      taskId,
      taskType: params.taskType
    });
    if (execOk.status !== 200) throw new Error(`EXECUTE_AFTER_FAILURE_NOT_ALLOWED status=${execOk.status}`);

    const gateAfterOk = await ppoGateCheck(params.baseUrl, {
      apiKey: params.apiKey,
      agentId: params.agentId,
      taskId,
      taskType: params.taskType
    });
    if (!gateAfterOk.ok) throw new Error(`GATE_CHECK_FAILED_AFTER_SUCCESS status=${gateAfterOk.status}`);
    if (gateAfterOk.json?.allowed === true) throw new Error('PPO_SHOULD_BE_CONSUMED_AFTER_SUCCESS');
  } else {
    if (gateAfterFail.json?.allowed === true) throw new Error('PPO_SHOULD_BE_CONSUMED_ON_FAILURE');
  }

  return { mode, paymentId, providerPaymentId };
}
