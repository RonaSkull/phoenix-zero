import { requireTenant } from '../../../../lib/tenant-auth';
import { createPaymentIntent, type CheckoutLineItem } from '../../../../lib/payments';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function POST(req: Request) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as
    | null
    | {
        tenantId?: string;
        pricingProfileId?: string;
        pricingVersionId?: string;
        currency?: string;
        providerHint?: string;
        lineItems?: CheckoutLineItem[];
      };

  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const tenantId = String(body.tenantId || auth.ctx.tenantId).trim();
  if (tenantId !== auth.ctx.tenantId) {
    return Response.json({ ok: false, reason: 'tenantId mismatch' }, { status: 403, headers: jsonUtf8Headers() });
  }

  const pricingProfileId = String(body.pricingProfileId || auth.ctx.tenant.pricingProfile || 'default').trim() || 'default';
  const pricingVersionId = String(body.pricingVersionId || '').trim() || undefined;
  const currency = String(body.currency || auth.ctx.tenant.currency || 'USD').trim() || 'USD';

  const lineItems = Array.isArray(body.lineItems) ? body.lineItems : [];

  const out = await createPaymentIntent({
    tenantId,
    pricingProfileId,
    pricingVersionId,
    currency,
    providerHint: String(body.providerHint || '').trim() || undefined,
    lineItems
  });

  if (!out.ok) {
    return Response.json({ ok: false, reason: out.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  const intent = out.intent;
  return Response.json(
    {
      ok: true,
      paymentId: intent.id,
      status: intent.status,
      provider: intent.provider,
      amountCents: intent.amountCents,
      currency: intent.currency,
      checkoutUrl: intent.checkoutUrl,
      instructions: intent.instructions,
      pricing: {
        pricingProfileId: intent.pricingProfileId,
        pricingVersionId: intent.pricingVersionId
      }
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
