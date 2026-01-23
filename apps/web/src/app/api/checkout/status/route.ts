import { requireTenant } from '../../../../lib/tenant-auth';
import { getPaymentIntentById } from '../../../../lib/payments';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const u = new URL(req.url);
  const paymentId = String(u.searchParams.get('paymentId') || '').trim();
  if (!paymentId) {
    return Response.json({ ok: false, reason: 'Missing paymentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const intent = await getPaymentIntentById(paymentId);
  if (!intent) {
    return Response.json({ ok: false, reason: 'Payment not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  if (intent.tenantId !== auth.ctx.tenantId) {
    return Response.json({ ok: false, reason: 'Forbidden' }, { status: 403, headers: jsonUtf8Headers() });
  }

  return Response.json(
    {
      ok: true,
      paymentId: intent.id,
      provider: intent.provider,
      status: intent.status,
      amountCents: intent.amountCents,
      currency: intent.currency,
      providerPaymentId: intent.providerPaymentId
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
