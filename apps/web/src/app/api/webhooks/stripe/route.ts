import { createHmac, timingSafeEqual } from 'node:crypto';

import { isWebhookEventProcessed, markWebhookEventProcessed } from '../../../../lib/payment-webhook-events';
import { updatePaymentIntentStatus, type NormalizedWebhookEvent } from '../../../../lib/payments';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function safeEqHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(String(aHex || '').trim(), 'utf8');
  const b = Buffer.from(String(bHex || '').trim(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyStripeSignature(params: { rawBody: string; signatureHeader: string; secret: string }): boolean {
  const header = String(params.signatureHeader || '').trim();
  if (!header) return false;

  const parts = header.split(',').map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith('t='));
  const t = tPart ? tPart.slice(2).trim() : '';
  if (!t) return false;

  const v1s = parts
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3).trim())
    .filter(Boolean);
  if (v1s.length <= 0) return false;

  const signedPayload = `${t}.${params.rawBody}`;
  const expected = createHmac('sha256', params.secret).update(signedPayload, 'utf8').digest('hex');
  return v1s.some((sig) => safeEqHex(sig, expected));
}

function paidAtFromStripeEvent(body: any): string | undefined {
  const created = body?.created;
  if (typeof created === 'number' && Number.isFinite(created) && created > 0) {
    return new Date(created * 1000).toISOString();
  }
  return undefined;
}

function inferNormalizedFromStripeEvent(body: any): {
  eventId: string;
  paymentId: string;
  providerPaymentId?: string;
  status: 'paid' | 'failed' | 'pending';
  paidAt?: string;
  shouldRevert: boolean;
} | null {
  const eventId = String(body?.id || '').trim();
  if (!eventId) return null;

  const type = String(body?.type || '').trim();
  const obj = body?.data?.object || null;
  const paymentId = String(obj?.metadata?.paymentId || obj?.metadata?.payment_id || '').trim();
  if (!paymentId) return null;

  const providerPaymentId = String(obj?.id || '').trim() || undefined;

  const paidTypes = new Set(['payment_intent.succeeded', 'checkout.session.completed', 'charge.succeeded']);
  const failedTypes = new Set([
    'payment_intent.payment_failed',
    'charge.failed',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.funds_withdrawn',
    'charge.dispute.closed'
  ]);

  const status: 'paid' | 'failed' | 'pending' = paidTypes.has(type) ? 'paid' : failedTypes.has(type) ? 'failed' : 'pending';
  const shouldRevert = type === 'charge.refunded' || type.startsWith('charge.dispute.');
  const paidAt = paidAtFromStripeEvent(body);

  return { eventId, paymentId, providerPaymentId, status, paidAt, shouldRevert };
}

export async function POST(req: Request) {
  const raw = await req.text().catch(() => '');
  if (!raw) {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (secret) {
    const sig = String(req.headers.get('stripe-signature') || '').trim();
    const ok = verifyStripeSignature({ rawBody: raw, signatureHeader: sig, secret });
    if (!ok) {
      return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401, headers: jsonUtf8Headers() });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { ok: false, reason: 'Missing STRIPE_WEBHOOK_SECRET' },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const body = ((): any => {
    try {
      return JSON.parse(raw) as any;
    } catch {
      return null;
    }
  })();
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const normalized = body as NormalizedWebhookEvent;
  const isNormalized = Boolean(String(normalized?.paymentId || '').trim());

  let eventId = '';
  let paymentId = '';
  let providerPaymentId: string | undefined = undefined;
  let status: 'paid' | 'failed' | 'pending' = 'pending';
  let paidAt: string | undefined = undefined;
  let shouldRevert = false;

  if (isNormalized) {
    paymentId = String(normalized.paymentId || '').trim();
    providerPaymentId = String(normalized.providerPaymentId || '').trim() || undefined;
    const statusRaw = String(normalized.status || '').trim().toLowerCase();
    status = statusRaw === 'paid' ? 'paid' : statusRaw === 'failed' ? 'failed' : 'pending';
    eventId = String((normalized as any).eventId || providerPaymentId || '').trim();
    paidAt = String((normalized as any).paidAt || '').trim() || undefined;
  } else {
    const inferred = inferNormalizedFromStripeEvent(body);
    if (!inferred) {
      return Response.json({ ok: false, reason: 'Unsupported Stripe payload (missing metadata.paymentId)' }, { status: 400, headers: jsonUtf8Headers() });
    }
    eventId = inferred.eventId;
    paymentId = inferred.paymentId;
    providerPaymentId = inferred.providerPaymentId;
    status = inferred.status;
    paidAt = inferred.paidAt;
    shouldRevert = inferred.shouldRevert;
  }

  if (eventId) {
    const seen = await isWebhookEventProcessed({ provider: 'stripe', eventId });
    if (seen) {
      return Response.json({ ok: true, deduped: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }
  }

  const res = await updatePaymentIntentStatus({
    paymentId,
    status,
    provider: 'card',
    providerPaymentId,
    paidAt,
    sourceEventId: eventId || undefined,
    lastUpdatedBy: 'webhook:stripe'
  });

  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  if (shouldRevert && providerPaymentId) {
    await import('../../../../lib/payment-proofs')
      .then((m) => m.getPaymentProofByProviderPaymentId({ provider: 'card', providerPaymentId }))
      .then(async (proof) => {
        if (!proof) return;
        await import('../../../../lib/settlement/store').then((s) =>
          s.revertSettlement({ proofId: proof.id, sourceEventId: eventId || undefined, lastUpdatedBy: 'webhook:stripe' })
        );
      })
      .catch(() => {
      });
  }

  if (eventId) {
    await markWebhookEventProcessed({ provider: 'stripe', eventId });
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
