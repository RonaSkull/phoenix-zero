import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid, simulatePixWebhookRefund } from '../flows/checkout';
import { ppoGateCheck } from '../flows/execute';
import { listAgentProofs } from '../flows/proofs';

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

async function waitForProofByPaymentId(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  paymentId: string;
  waitMs: number;
  pollMs?: number;
}): Promise<any | null> {
  const deadline = Date.now() + Math.max(0, Math.trunc(params.waitMs));
  const pollMs = Math.max(250, Math.trunc(params.pollMs ?? 750));

  while (Date.now() <= deadline) {
    const proofs = await listAgentProofs(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
    const arr: any[] = Array.isArray(proofs.json?.proofs) ? proofs.json.proofs : [];
    const found = arr.find((p) => String(p?.paymentId || '').trim() === params.paymentId) || null;
    if (found) return found;
    await sleepMs(pollMs);
  }

  return null;
}

async function waitForStatus(params: {
  baseUrl: string;
  apiKey: string;
  paymentId: string;
  desired: 'pending' | 'paid' | 'failed';
  waitMs: number;
  pollMs?: number;
}): Promise<{ ok: boolean; last: any } > {
  const deadline = Date.now() + Math.max(0, Math.trunc(params.waitMs));
  const pollMs = Math.max(250, Math.trunc(params.pollMs ?? 750));

  let last = await checkoutStatus(params.baseUrl, { apiKey: params.apiKey, paymentId: params.paymentId });
  while (Date.now() <= deadline) {
    const status = String(last.json?.status || '').trim().toLowerCase();
    if (last.ok && status === params.desired) return { ok: true, last };
    await sleepMs(pollMs);
    last = await checkoutStatus(params.baseUrl, { apiKey: params.apiKey, paymentId: params.paymentId });
  }

  const status = String(last.json?.status || '').trim().toLowerCase();
  return { ok: last.ok && status === params.desired, last };
}

export async function webhookOutOfOrderTest(params: {
  baseUrl: string;
  apiKey: string;
  asaasWebhookSecret: string;
  agentId: string;
  taskType: string;
  operation: string;
}): Promise<{ paymentId: string; providerPaymentId: string; proofId: string }> {
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
      taskInputHash: sha256Hex('hardening:webhook-ordering:input'),
      taskOutputHash: sha256Hex('hardening:webhook-ordering:output')
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

  const evtPaid1 = `evt_paid_${Date.now()}_${b64Url(randomBytes(6))}`;
  const paid1 = await simulatePixWebhookPaid(params.baseUrl, {
    providerPaymentId,
    asaasWebhookSecret: params.asaasWebhookSecret,
    eventId: evtPaid1
  });
  if (!paid1.ok) throw new Error(`WEBHOOK_PAID_1_FAILED status=${paid1.status}`);

  const proofAfterPaid = await waitForProofByPaymentId({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    agentId: params.agentId,
    paymentId,
    waitMs: 20_000,
    pollMs: 750
  });
  const proofId = String(proofAfterPaid?.id || proofAfterPaid?.proofId || '').trim();
  if (!proofId) throw new Error('MISSING_PROOF_AFTER_PAID');

  const evtFailed = `evt_failed_${Date.now()}_${b64Url(randomBytes(6))}`;
  const failed = await simulatePixWebhookRefund(params.baseUrl, {
    providerPaymentId,
    asaasWebhookSecret: params.asaasWebhookSecret,
    eventId: evtFailed
  });
  if (!failed.ok) throw new Error(`WEBHOOK_FAILED_FAILED status=${failed.status}`);

  const evtPaidStale = `evt_paid_${Date.now()}_${b64Url(randomBytes(6))}`;
  const paidStale = await simulatePixWebhookPaid(params.baseUrl, {
    providerPaymentId,
    asaasWebhookSecret: params.asaasWebhookSecret,
    eventId: evtPaidStale
  });
  if (!paidStale.ok) throw new Error(`WEBHOOK_PAID_STALE_FAILED status=${paidStale.status}`);

  const failedDup = await simulatePixWebhookRefund(params.baseUrl, {
    providerPaymentId,
    asaasWebhookSecret: params.asaasWebhookSecret,
    eventId: evtFailed
  });
  if (!failedDup.ok) throw new Error(`WEBHOOK_FAILED_DUP_FAILED status=${failedDup.status}`);

  const waitedFailed = await waitForStatus({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    paymentId,
    desired: 'failed',
    waitMs: 20_000,
    pollMs: 750
  });
  if (!waitedFailed.ok) {
    const got = String(waitedFailed.last.json?.status || '').trim();
    throw new Error(`FINAL_STATUS_NOT_FAILED status=${waitedFailed.last.status} got=${got}`);
  }

  await sleepMs(500);

  const proofs = await listAgentProofs(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
  const proofsArr: any[] = Array.isArray(proofs.json?.proofs) ? proofs.json.proofs : [];
  const proof = proofsArr.find((p) => String(p?.id || p?.proofId || '').trim() === proofId) || null;
  const proofStatus = String(proof?.status || '').trim();
  if (!proof) throw new Error('MISSING_PROOF');
  if (proofStatus === 'paid_confirmed') throw new Error('PROOF_REGRESSED_TO_PAID_CONFIRM');

  const gate = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (!gate.ok) throw new Error(`GATE_CHECK_FAILED status=${gate.status}`);
  if (gate.json?.allowed === true) throw new Error('GATE_ALLOWED_AFTER_FAILED_FINAL');

  return { paymentId, providerPaymentId, proofId };
}
