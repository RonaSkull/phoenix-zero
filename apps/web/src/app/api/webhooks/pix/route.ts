import { isWebhookEventProcessed, markWebhookEventProcessed } from '../../../../lib/payment-webhook-events';
import { findPaymentIntentByProviderPaymentId, updatePaymentIntentStatus, type NormalizedWebhookEvent } from '../../../../lib/payments';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function POST(req: Request) {
  const expectedToken = String(process.env.ASAAS_WEBHOOK_SECRET || '').trim();
  if (expectedToken) {
    const got = String(req.headers.get('asaas-access-token') || '').trim();
    if (!got || got !== expectedToken) {
      return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401, headers: jsonUtf8Headers() });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { ok: false, reason: 'Missing ASAAS_WEBHOOK_SECRET' },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const body = (await req.json().catch(() => null)) as null | any;
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const asaasPaymentId = String(body?.payment?.id || body?.event?.payment?.id || '').trim();
  const asaasStatusRaw = String(body?.payment?.status || body?.event?.payment?.status || '').trim().toUpperCase();

  const normalized = body as NormalizedWebhookEvent;
  const providerPaymentId = String(normalized.providerPaymentId || asaasPaymentId || '').trim();

  const intent = providerPaymentId
    ? await findPaymentIntentByProviderPaymentId({ provider: 'pix', providerPaymentId })
    : null;

  const paymentId = intent?.id ? String(intent.id) : '';

  const statusRaw = String(normalized.status || '').trim().toLowerCase();
  const statusFromAsaas =
    asaasStatusRaw === 'RECEIVED' || asaasStatusRaw === 'CONFIRMED'
      ? 'paid'
      : asaasStatusRaw === 'OVERDUE' || asaasStatusRaw === 'REFUNDED' || asaasStatusRaw === 'CHARGEBACK_REQUESTED'
        ? 'failed'
        : '';

  const status =
    statusRaw === 'paid'
      ? 'paid'
      : statusRaw === 'failed'
        ? 'failed'
        : statusFromAsaas
          ? statusFromAsaas
          : 'pending';

  const eventId = String(
    body?.id ||
      body?.eventId ||
      body?.event?.id ||
      (providerPaymentId ? `${providerPaymentId}:${String(body?.event || asaasStatusRaw || status)}` : '')
  ).trim();

  if (eventId) {
    const seen = await isWebhookEventProcessed({ provider: 'asaas', eventId });
    if (seen) {
      return Response.json({ ok: true, deduped: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }
  }

  if (!paymentId) {
    if (eventId) {
      await markWebhookEventProcessed({ provider: 'asaas', eventId });
    }
    return Response.json(
      { ok: true, ignored: true, reason: 'Unknown payment (missing providerPaymentId mapping)' },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const res = await updatePaymentIntentStatus({ paymentId, status, provider: 'pix', providerPaymentId });

  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  if (eventId) {
    await markWebhookEventProcessed({ provider: 'asaas', eventId });
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
