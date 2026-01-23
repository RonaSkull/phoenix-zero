import { updatePaymentIntentStatus, type NormalizedWebhookEvent } from '../../../../lib/payments';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as null | NormalizedWebhookEvent;
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const paymentId = String(body.paymentId || '').trim();
  const status = String(body.status || '').trim().toLowerCase();

  const res = await updatePaymentIntentStatus({
    paymentId,
    status: status === 'paid' ? 'paid' : status === 'failed' ? 'failed' : 'pending',
    provider: 'card',
    providerPaymentId: String(body.providerPaymentId || '').trim() || undefined
  });

  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
