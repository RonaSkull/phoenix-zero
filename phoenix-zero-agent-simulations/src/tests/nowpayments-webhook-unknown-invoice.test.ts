import { randomBytes } from 'node:crypto';

import { canonicalJson, hmacSha512Hex, httpJson } from '../lib/http';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function nowPaymentsWebhookUnknownInvoiceTest(params: {
  baseUrl: string;
  nowPaymentsIpnSecret: string;
}): Promise<{ providerPaymentId: string; status: number }> {
  const secret = String(params.nowPaymentsIpnSecret || '').trim();
  if (!secret) throw new Error('Missing NOWPAYMENTS_IPN_SECRET');

  const providerPaymentId = `inv_unknown_${b64Url(randomBytes(10))}`;
  const eventId = `evt_unknown_${Date.now()}_${b64Url(randomBytes(6))}`;

  const body = {
    id: eventId,
    ipn_id: eventId,
    invoice_id: providerPaymentId,
    payment_status: 'finished',
    actually_paid_at: new Date().toISOString()
  };

  const raw = JSON.stringify(body);
  const canonical = canonicalJson(body);
  const sig = hmacSha512Hex(secret, canonical || raw);

  const res = await httpJson({
    method: 'POST',
    url: `${params.baseUrl}/api/webhooks/nowpayments`,
    headers: { 'x-nowpayments-sig': sig },
    body
  });

  if (res.status !== 400) throw new Error(`EXPECTED_400_UNKNOWN_PAYMENT got=${res.status}`);

  return { providerPaymentId, status: res.status };
}
