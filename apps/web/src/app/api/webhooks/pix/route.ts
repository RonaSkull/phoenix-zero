import { isWebhookEventProcessed, markWebhookEventProcessed } from '../../../../lib/payment-webhook-events';
import { findPaymentIntentByProviderPaymentId, updatePaymentIntentStatus, type NormalizedWebhookEvent } from '../../../../lib/payments';

export const runtime = 'nodejs';

function truncId(s: string, keep: number = 8): string {
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

function paidAtFromBody(body: any): string | undefined {
  const t = String(
    body?.payment?.confirmedDate ||
      body?.payment?.paymentDate ||
      body?.payment?.clientPaymentDate ||
      body?.payment?.dateCreated ||
      body?.event?.payment?.confirmedDate ||
      body?.event?.payment?.paymentDate ||
      body?.event?.payment?.clientPaymentDate ||
      body?.event?.payment?.dateCreated ||
      ''
  ).trim();
  return t || undefined;
}

export async function POST(req: Request) {
  const expectedToken = String(process.env.ASAAS_WEBHOOK_SECRET || '').trim();
  if (expectedToken) {
    const got = String(req.headers.get('asaas-access-token') || '').trim();
    if (!got || got !== expectedToken) {
      console.warn('[WEBHOOK_ASAAS] unauthorized', { ip: getClientIp(req) });
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
      console.log('[WEBHOOK_ASAAS] deduped', { eventId: truncId(eventId), providerPaymentId: truncId(providerPaymentId) });
      return Response.json({ ok: true, deduped: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }
  }

  console.log('[WEBHOOK_ASAAS] received', {
    eventId: truncId(eventId),
    providerPaymentId: truncId(providerPaymentId),
    status,
    mapped: Boolean(paymentId)
  });

  if (!paymentId) {
    if (eventId) {
      await markWebhookEventProcessed({ provider: 'asaas', eventId }).catch(() => {});
    }
    return Response.json(
      {
        ok: true,
        ignored: true,
        reason: 'Unknown payment (missing providerPaymentId mapping)',
        providerPaymentId,
        asaasPaymentId,
        asaasStatusRaw,
        normalizedStatus: status,
        eventId
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const res = await updatePaymentIntentStatus({
    paymentId,
    status,
    provider: 'pix',
    providerPaymentId,
    paidAt: paidAtFromBody(body),
    sourceEventId: eventId || undefined,
    lastUpdatedBy: 'webhook:asaas'
  });

  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  if (eventId) {
    await markWebhookEventProcessed({ provider: 'asaas', eventId });
  }

  const shouldRevert = asaasStatusRaw === 'REFUNDED' || asaasStatusRaw === 'CHARGEBACK_REQUESTED';
  if (shouldRevert && providerPaymentId) {
    await import('../../../../lib/payment-proofs')
      .then((m) => m.getPaymentProofByProviderPaymentId({ provider: 'pix', providerPaymentId }))
      .then(async (proof) => {
        if (!proof) return;
        await import('../../../../lib/settlement/store').then((s) =>
          s.revertSettlement({ proofId: proof.id, sourceEventId: eventId || undefined, lastUpdatedBy: 'webhook:asaas' })
        );
      })
      .catch(() => {
      });
  }

  return Response.json(
    {
      ok: true,
      updated: true,
      paymentId,
      providerPaymentId,
      normalizedStatus: status,
      eventId
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
