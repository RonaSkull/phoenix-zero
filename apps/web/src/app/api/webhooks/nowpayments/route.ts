import { createHmac, timingSafeEqual } from 'node:crypto';

import { isWebhookEventProcessed, markWebhookEventProcessed } from '../../../../lib/payment-webhook-events';
import { findPaymentIntentByProviderPaymentId, updatePaymentIntentStatus, type NormalizedWebhookEvent } from '../../../../lib/payments';

export const runtime = 'nodejs';

function truncId(s: string, keep: number = 10): string {
  const v = String(s || '').trim();
  if (!v) return '';
  if (v.length <= keep) return v;
  return v.slice(0, keep);
}

function getClientIp(req: Request): string {
  const xff = String(req.headers.get('x-forwarded-for') || '').trim();
  if (xff) return xff.split(',')[0]?.trim() || 'unknown';
  const xrip = String(req.headers.get('x-real-ip') || '').trim();
  if (xrip) return xrip;
  const cf = String(req.headers.get('cf-connecting-ip') || '').trim();
  if (cf) return cf;
  return 'unknown';
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function canonicalNowPaymentsBody(body: any): string {
  if (!body || typeof body !== 'object') return '';
  const keys = Object.keys(body).sort();
  const sorted: Record<string, any> = {};
  for (const k of keys) sorted[k] = (body as any)[k];
  return JSON.stringify(sorted);
}

function safeEqHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(String(aHex || '').trim(), 'utf8');
  const b = Buffer.from(String(bHex || '').trim(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function paidAtFromBody(body: any): string | undefined {
  const t = String(
    body?.paid_at ||
      body?.paidAt ||
      body?.payment_date ||
      body?.paymentDate ||
      body?.actually_paid_at ||
      body?.created_at ||
      body?.createdAt ||
      ''
  ).trim();
  if (!t) return undefined;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export async function POST(req: Request) {
  const secret = String(process.env.NOWPAYMENTS_IPN_SECRET || '').trim();
  const raw = await req.text().catch(() => '');
  if (!raw) {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
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

  if (secret) {
    const got = String(req.headers.get('x-nowpayments-sig') || '').trim();
    const canonical = canonicalNowPaymentsBody(body);
    const expectedCanonical = canonical ? createHmac('sha512', secret).update(canonical, 'utf8').digest('hex') : '';
    const expectedRaw = createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
    const ok = (expectedCanonical && safeEqHex(got, expectedCanonical)) || safeEqHex(got, expectedRaw);
    if (!ok) {
      console.warn('[WEBHOOK_NOWPAYMENTS] unauthorized', { ip: getClientIp(req) });
      return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401, headers: jsonUtf8Headers() });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { ok: false, reason: 'Missing NOWPAYMENTS_IPN_SECRET' },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const normalized = body as NormalizedWebhookEvent;
  const providerPaymentId = String(
    normalized.providerPaymentId ||
      body.invoice_id ||
      body.payment_id ||
      body.id ||
      ''
  ).trim();

  const intent = providerPaymentId
    ? await findPaymentIntentByProviderPaymentId({ provider: 'crypto', providerPaymentId })
    : null;

  const paymentId = intent?.id ? String(intent.id) : '';

  const statusRaw = String(normalized.status || '').trim().toLowerCase();
  const paymentStatusRaw = String(body.payment_status || body.status || '').trim().toLowerCase();
  const statusFromNow =
    paymentStatusRaw === 'finished' || paymentStatusRaw === 'confirmed' || paymentStatusRaw === 'paid'
      ? 'paid'
      : paymentStatusRaw === 'failed' || paymentStatusRaw === 'refunded' || paymentStatusRaw === 'expired'
        ? 'failed'
        : '';

  const status =
    statusRaw === 'paid'
      ? 'paid'
      : statusRaw === 'failed'
        ? 'failed'
        : statusFromNow
          ? statusFromNow
          : 'pending';

  const eventId = String(body?.id || body?.ipn_id || body?.event_id || (providerPaymentId ? `${providerPaymentId}:${paymentStatusRaw || status}` : '')).trim();
  if (eventId) {
    const seen = await isWebhookEventProcessed({ provider: 'nowpayments', eventId });
    if (seen) {
      console.log('[WEBHOOK_NOWPAYMENTS] deduped', { eventId: truncId(eventId), providerPaymentId: truncId(providerPaymentId) });
      return Response.json({ ok: true, deduped: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }
  }

  console.log('[WEBHOOK_NOWPAYMENTS] received', {
    eventId: truncId(eventId),
    providerPaymentId: truncId(providerPaymentId),
    status,
    mapped: Boolean(paymentId)
  });

  if (!paymentId) {
    return Response.json(
      { ok: false, reason: 'Unknown payment (missing providerPaymentId mapping)' },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  const res = await updatePaymentIntentStatus({
    paymentId,
    status,
    provider: 'crypto',
    providerPaymentId,
    paidAt: paidAtFromBody(body),
    sourceEventId: eventId || undefined,
    lastUpdatedBy: 'webhook:nowpayments'
  });

  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  if (eventId) {
    await markWebhookEventProcessed({ provider: 'nowpayments', eventId });
  }

  const shouldRevert = paymentStatusRaw === 'refunded';
  if (shouldRevert && providerPaymentId) {
    await import('../../../../lib/payment-proofs')
      .then((m) => m.getPaymentProofByProviderPaymentId({ provider: 'crypto', providerPaymentId }))
      .then(async (proof) => {
        if (!proof) return;
        await import('../../../../lib/settlement/store').then((s) =>
          s.revertSettlement({ proofId: proof.id, sourceEventId: eventId || undefined, lastUpdatedBy: 'webhook:nowpayments' })
        );
      })
      .catch(() => {
      });
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
