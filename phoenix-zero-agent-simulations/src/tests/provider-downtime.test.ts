import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid, waitForCheckoutPaid } from '../flows/checkout';
import { executeTask, ppoGateCheck } from '../flows/execute';
import { listAgentProofs } from '../flows/proofs';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

type Mode = 'provider_down' | 'provider_timeout' | 'webhook_never_arrives';

function mode(): Mode {
  const m = String(env('PHOENIX_ZERO_HARDENING_PROVIDER_DOWNTIME_MODE') || 'provider_down').trim().toLowerCase();
  if (m === 'provider_timeout') return 'provider_timeout';
  if (m === 'webhook_never_arrives') return 'webhook_never_arrives';
  return 'provider_down';
}

export async function providerDowntimeTest(params: {
  baseUrl: string;
  apiKey: string;
  asaasWebhookSecret: string;
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ mode: Mode; paymentId?: string; providerPaymentId?: string }> {
  const m = mode();
  const taskId = `task_${b64Url(randomBytes(12))}`;

  // 1) provider_down/provider_timeout: checkout/create deve falhar de forma controlada (400), sem crash.
  if (m === 'provider_down' || m === 'provider_timeout') {
    const res = await checkoutCreate(params.baseUrl, {
      apiKey: params.apiKey,
      currency: 'BRL',
      providerHint: 'pix',
      operation: params.operation,
      units: 1,
      proofMeta: {
        agentId: params.agentId,
        taskId,
        taskType: params.taskType,
        taskInputHash: sha256Hex('hardening:provider-downtime:input'),
        taskOutputHash: sha256Hex('hardening:provider-downtime:output')
      }
    });

    if (res.status === 200 && res.json?.ok === true) {
      throw new Error('CHECKOUT_CREATE_SHOULD_FAIL_ON_PROVIDER_DOWNTIME');
    }
    if (res.status < 400 || res.status >= 500) {
      throw new Error(`CHECKOUT_CREATE_UNEXPECTED_STATUS status=${res.status}`);
    }

    return { mode: m };
  }

  // 2) webhook_never_arrives: provider respondeu, mas liquidação não chega.
  const sim = env('PHOENIX_ZERO_SIMULATE_PROVIDER_DOWNTIME').toLowerCase();
  if (!sim.includes('asaas:ghost')) {
    throw new Error('MISSING_SIMULATION_FLAG: set PHOENIX_ZERO_SIMULATE_PROVIDER_DOWNTIME=asaas:ghost on the server before running webhook_never_arrives');
  }

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
      taskInputHash: sha256Hex('hardening:provider-downtime:input'),
      taskOutputHash: sha256Hex('hardening:provider-downtime:output')
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

  // não manda webhook: espera e valida que não vira paid
  await sleepMs(1500);
  const waited = await waitForCheckoutPaid(params.baseUrl, { apiKey: params.apiKey, paymentId, waitMs: 8000, pollMs: 1000 });
  if (waited.paid) {
    throw new Error('PAYMENT_SHOULD_NOT_BECOME_PAID_WITHOUT_WEBHOOK');
  }

  // não deve existir proof
  const proofs = await listAgentProofs(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
  const arr: any[] = Array.isArray(proofs.json?.proofs) ? proofs.json.proofs : [];
  const hasProof = arr.some((p) => String(p?.paymentId || '').trim() === paymentId);
  if (hasProof) {
    throw new Error('PPO_SHOULD_NOT_EXIST_WITHOUT_PAID_WEBHOOK');
  }

  // gate deve bloquear
  const gate = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (!gate.ok) throw new Error(`GATE_CHECK_FAILED status=${gate.status}`);
  if (gate.json?.allowed === true) throw new Error('GATE_ALLOWED_WITHOUT_PROOF');

  // execute deve falhar
  const exec = await executeTask(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (exec.status === 200) throw new Error('EXECUTE_ALLOWED_WITHOUT_PROOF');

  return { mode: m, paymentId, providerPaymentId };
}
