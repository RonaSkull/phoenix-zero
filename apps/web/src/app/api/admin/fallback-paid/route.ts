import { createHash, randomBytes } from 'node:crypto';

import { getPaymentProofByProviderPaymentId } from '../../../../lib/payment-proofs';
import { createPaymentIntent, getPaymentIntentById, updatePaymentIntentStatus, type CheckoutLineItem } from '../../../../lib/payments';
import { ensureSettlementForProof, getSettlementByProofId } from '../../../../lib/settlement/store';
import { requireAdminToken } from '../../../../lib/tenant-auth';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

type Body = {
  paymentId?: string;

  tenantId?: string;
  agentId?: string;

  taskType?: string;
  taskId?: string;

  units?: number;
  currency?: string;

  taskInputHash?: string;
  taskOutputHash?: string;
};

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const paidAt = nowIso();
  const sourceEventId = `admin:fallback-paid:${sha256Hex(`v1|${paidAt}|${randomBytes(18).toString('hex')}`)}`;

  const paymentIdFromBody = String(body.paymentId || '').trim();
  if (paymentIdFromBody) {
    const existing = await getPaymentIntentById(paymentIdFromBody);
    if (!existing) {
      return Response.json({ ok: false, reason: 'Payment not found' }, { status: 404, headers: jsonUtf8Headers() });
    }

    const updated = await updatePaymentIntentStatus({
      paymentId: paymentIdFromBody,
      status: 'paid',
      paidAt,
      sourceEventId,
      lastUpdatedBy: 'admin:fallback-paid'
    });
    if (!updated.ok) {
      return Response.json({ ok: false, reason: updated.reason }, { status: 400, headers: jsonUtf8Headers() });
    }

    const providerPaymentId = String(updated.intent.providerPaymentId || '').trim();
    const proof = providerPaymentId
      ? await getPaymentProofByProviderPaymentId({ provider: updated.intent.provider, providerPaymentId })
      : null;

    const settlement = proof ? await getSettlementByProofId(proof.id) : null;

    if (proof && !settlement) {
      await ensureSettlementForProof({ proof, paidAt, sourceEventId, lastUpdatedBy: 'admin:fallback-paid' }).catch(() => {
      });
    }

    return Response.json(
      {
        ok: true,
        mode: 'fallback_paid',
        paymentId: updated.intent.id,
        provider: updated.intent.provider,
        providerPaymentId: updated.intent.providerPaymentId,
        status: updated.intent.status,
        proofId: proof?.id || null,
        settlementId: (settlement || (proof ? await getSettlementByProofId(proof.id) : null))?.settlementId || null
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const tenantId = String(body.tenantId || '').trim();
  if (!tenantId) {
    return Response.json({ ok: false, reason: 'Missing tenantId or paymentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const agentId = String(body.agentId || '').trim();
  if (!agentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const taskType = String(body.taskType || '').trim();
  if (!taskType) {
    return Response.json({ ok: false, reason: 'Missing taskType' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const taskId = String(body.taskId || '').trim() || undefined;

  const unitsRaw = Number(body.units ?? NaN);
  const units = Number.isFinite(unitsRaw) ? Math.max(1, Math.min(1_000_000, Math.trunc(unitsRaw))) : 1;

  const currency = String(body.currency || '').trim() || 'USD';

  const taskInputHash = String(body.taskInputHash || '').trim() || `sha256:${sha256Hex(`in|${tenantId}|${agentId}|${taskId || ''}|${taskType}|${paidAt}`)}`;
  const taskOutputHash = String(body.taskOutputHash || '').trim() || `sha256:${sha256Hex(`out|${tenantId}|${agentId}|${taskId || ''}|${taskType}|${paidAt}`)}`;

  const lineItems: CheckoutLineItem[] = [
    {
      operation: taskType,
      product: taskType,
      units
    }
  ];

  const createRes = await createPaymentIntent({
    tenantId,
    pricingProfileId: 'default',
    currency,
    providerHint: 'crypto',
    lineItems,
    proofMeta: {
      agentId,
      taskId,
      taskType,
      taskInputHash,
      taskOutputHash
    }
  });

  if (!createRes.ok) {
    return Response.json({ ok: false, reason: createRes.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  const intent = createRes.intent;

  const updated = await updatePaymentIntentStatus({
    paymentId: intent.id,
    status: 'paid',
    provider: intent.provider,
    providerPaymentId: intent.providerPaymentId,
    paidAt,
    sourceEventId,
    lastUpdatedBy: 'admin:fallback-paid'
  });
  if (!updated.ok) {
    return Response.json({ ok: false, reason: updated.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  const providerPaymentId = String(updated.intent.providerPaymentId || '').trim();
  const proof = providerPaymentId ? await getPaymentProofByProviderPaymentId({ provider: updated.intent.provider, providerPaymentId }) : null;
  const settlement = proof ? await getSettlementByProofId(proof.id) : null;

  return Response.json(
    {
      ok: true,
      mode: 'fallback_paid',
      paymentId: updated.intent.id,
      provider: updated.intent.provider,
      providerPaymentId: updated.intent.providerPaymentId,
      status: updated.intent.status,
      proofId: proof?.id || null,
      settlementId: settlement?.settlementId || null
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
