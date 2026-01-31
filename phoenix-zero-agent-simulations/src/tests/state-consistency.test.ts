import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/http';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid, simulatePixWebhookRefund, waitForCheckoutPaid } from '../flows/checkout';
import { ppoGateCheck } from '../flows/execute';
import { listAgentProofs } from '../flows/proofs';
import { fetchGuaranteeProof, fetchVerifyPageHtml } from '../flows/verify';

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

async function waitForCheckoutStatus(params: {
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

async function waitForPublicProofGone(params: {
  baseUrl: string;
  proofId: string;
  waitMs: number;
  pollMs?: number;
}): Promise<{ ok: boolean; gp: any; html: any }> {
  const deadline = Date.now() + Math.max(0, Math.trunc(params.waitMs));
  const pollMs = Math.max(250, Math.trunc(params.pollMs ?? 750));

  let gp = await fetchGuaranteeProof(params.baseUrl, params.proofId);
  let html = await fetchVerifyPageHtml(params.baseUrl, params.proofId);

  const htmlLooksRevoked = (text: string): boolean => {
    const t = String(text || '').toLowerCase();
    return t.includes('proof not available') || t.includes('não está disponível publicamente') || t.includes('não está disponível publicamente');
  };

  const isGone = (): boolean => {
    const gpGone = Number(gp?.status) === 404;
    const htmlGone = Number(html?.status) === 404 || (Number(html?.status) === 200 && htmlLooksRevoked(html?.text));
    return gpGone && htmlGone;
  };

  while (Date.now() <= deadline) {
    if (isGone()) return { ok: true, gp, html };
    await sleepMs(pollMs);
    gp = await fetchGuaranteeProof(params.baseUrl, params.proofId);
    html = await fetchVerifyPageHtml(params.baseUrl, params.proofId);
  }

  return { ok: isGone(), gp, html };
}

export async function stateConsistencyTest(params: {
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
      taskInputHash: sha256Hex('hardening:state-consistency:input'),
      taskOutputHash: sha256Hex('hardening:state-consistency:output')
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

  const waitedPaid = await waitForCheckoutPaid(params.baseUrl, { apiKey: params.apiKey, paymentId, waitMs: 20_000, pollMs: 750 });
  if (!waitedPaid.ok || !waitedPaid.paid) {
    const got = String(waitedPaid.last.json?.status || '').trim();
    throw new Error(`CHECKOUT_NOT_PAID status=${waitedPaid.last.status} got=${got}`);
  }

  const proofs1 = await listAgentProofs(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
  const proofsArr1: any[] = Array.isArray(proofs1.json?.proofs) ? proofs1.json.proofs : [];
  const proof1 = proofsArr1.find((p) => String(p?.paymentId || '').trim() === paymentId) || null;
  const proofId = String(proof1?.id || proof1?.proofId || '').trim();
  const proofStatus = String(proof1?.status || '').trim();
  if (!proofId) throw new Error('MISSING_PROOF_AFTER_PAID');
  if (proofStatus !== 'paid_confirmed') throw new Error(`PROOF_NOT_PAID_CONFIRM_AFTER_PAID got=${proofStatus}`);

  const gp1 = await fetchGuaranteeProof(params.baseUrl, proofId);
  if (!gp1.ok || gp1.json?.ok !== true) throw new Error(`GUARANTEE_PROOF_NOT_OK_AFTER_PAID status=${gp1.status}`);

  const html1 = await fetchVerifyPageHtml(params.baseUrl, proofId);
  if (!html1.ok) throw new Error(`VERIFY_PAGE_NOT_OK_AFTER_PAID status=${html1.status}`);

  const gate1 = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (!gate1.ok || gate1.json?.allowed !== true) {
    throw new Error(`GATE_NOT_ALLOWED_AFTER_PAID status=${gate1.status}`);
  }

  const evtRefund = `evt_refund_${Date.now()}_${b64Url(randomBytes(6))}`;
  const refund = await simulatePixWebhookRefund(params.baseUrl, {
    providerPaymentId,
    asaasWebhookSecret: params.asaasWebhookSecret,
    eventId: evtRefund
  });
  if (!refund.ok) throw new Error(`WEBHOOK_REFUND_FAILED status=${refund.status}`);

  const waitedFailed = await waitForCheckoutStatus({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    paymentId,
    desired: 'failed',
    waitMs: 20_000,
    pollMs: 750
  });
  if (!waitedFailed.ok) {
    const got = String(waitedFailed.last.json?.status || '').trim();
    throw new Error(`CHECKOUT_NOT_FAILED_AFTER_REFUND status=${waitedFailed.last.status} got=${got}`);
  }

  await sleepMs(500);

  const gone = await waitForPublicProofGone({ baseUrl: params.baseUrl, proofId, waitMs: 12_000, pollMs: 800 });
  if (!gone.ok) {
    throw new Error(`PUBLIC_PROOF_EXPECTED_404_AFTER_REFUND got=gp:${gone.gp.status} html:${gone.html.status}`);
  }

  const proofs2 = await listAgentProofs(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, limit: 50 });
  const proofsArr2: any[] = Array.isArray(proofs2.json?.proofs) ? proofs2.json.proofs : [];
  const proof2 = proofsArr2.find((p) => String(p?.id || p?.proofId || '').trim() === proofId) || null;
  const proofStatus2 = String(proof2?.status || '').trim();
  if (proofStatus2 === 'paid_confirmed') throw new Error('PROOF_NOT_REVOKED_AFTER_REFUND');

  const gate2 = await ppoGateCheck(params.baseUrl, { apiKey: params.apiKey, agentId: params.agentId, taskId, taskType: params.taskType });
  if (!gate2.ok) throw new Error(`GATE_CHECK_FAILED_AFTER_REFUND status=${gate2.status}`);
  if (gate2.json?.allowed === true) throw new Error('GATE_ALLOWED_AFTER_REFUND');

  return { paymentId, providerPaymentId, proofId };
}
