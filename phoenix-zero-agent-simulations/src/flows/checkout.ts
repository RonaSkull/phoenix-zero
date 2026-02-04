import { canonicalJson, hmacSha512Hex, httpJson } from '../lib/http';

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

export async function checkoutCreate(baseUrl: string, params: {
  apiKey: string;
  currency: string;
  providerHint: 'pix' | 'crypto';
  operation: string;
  units: number;
  proofMeta: {
    agentId: string;
    taskId: string;
    taskType: string;
    taskInputHash: string;
    taskOutputHash: string;
  };
}) {
  const currency = params.providerHint === 'pix' ? 'BRL' : params.currency;
  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/checkout/create`,
    apiKey: params.apiKey,
    body: {
      currency,
      providerHint: params.providerHint,
      lineItems: [{ operation: params.operation, units: params.units }],
      proofMeta: params.proofMeta
    }
  });
}

export async function checkoutStatus(baseUrl: string, params: { apiKey: string; paymentId: string }) {
  return httpJson({
    method: 'GET',
    url: `${baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(params.paymentId)}`,
    apiKey: params.apiKey
  });
}

export async function waitForCheckoutPaid(baseUrl: string, params: { apiKey: string; paymentId: string; waitMs: number; pollMs?: number }) {
  const waitMs = Math.max(0, Math.trunc(params.waitMs));
  const pollMs = Math.max(750, Math.trunc(params.pollMs ?? 3000));
  const deadline = Date.now() + waitMs;

  while (Date.now() <= deadline) {
    const res = await checkoutStatus(baseUrl, { apiKey: params.apiKey, paymentId: params.paymentId });
    const status = String(res.json?.status || '').trim().toLowerCase();
    if (res.ok && status === 'paid') {
      return { ok: true, paid: true, last: res };
    }
    if (res.ok && status && status !== 'pending') {
      return { ok: true, paid: false, last: res };
    }
    await sleepMs(pollMs);
  }

  const last = await checkoutStatus(baseUrl, { apiKey: params.apiKey, paymentId: params.paymentId });
  return { ok: last.ok, paid: String(last.json?.status || '').trim().toLowerCase() === 'paid', last };
}

export async function simulatePixWebhookPaid(baseUrl: string, params: {
  providerPaymentId: string;
  asaasWebhookSecret?: string;
  eventId: string;
}) {
  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/pix`,
    headers: params.asaasWebhookSecret ? { 'asaas-access-token': params.asaasWebhookSecret } : undefined,
    body: {
      id: params.eventId,
      event: { id: params.eventId },
      provider: 'pix',
      providerPaymentId: params.providerPaymentId,
      status: 'paid',
      payment: {
        id: params.providerPaymentId,
        status: 'CONFIRMED',
        confirmedDate: new Date().toISOString()
      }
    }
  });
}

export async function simulatePixWebhookRefund(baseUrl: string, params: {
  providerPaymentId: string;
  asaasWebhookSecret?: string;
  eventId: string;
}) {
  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/pix`,
    headers: params.asaasWebhookSecret ? { 'asaas-access-token': params.asaasWebhookSecret } : undefined,
    body: {
      id: params.eventId,
      event: { id: params.eventId },
      provider: 'pix',
      providerPaymentId: params.providerPaymentId,
      status: 'failed',
      payment: {
        id: params.providerPaymentId,
        status: 'REFUNDED',
        confirmedDate: new Date().toISOString()
      }
    }
  });
}

export async function simulateNowPaymentsWebhookPaid(baseUrl: string, params: {
  providerPaymentId: string;
  nowPaymentsIpnSecret: string;
  eventId: string;
}) {
  const body = {
    id: params.eventId,
    ipn_id: params.eventId,
    invoice_id: params.providerPaymentId,
    payment_status: 'finished',
    actually_paid_at: new Date().toISOString()
  };

  const raw = JSON.stringify(body);
  const canonical = canonicalJson(body);
  const sig = hmacSha512Hex(params.nowPaymentsIpnSecret, canonical || raw);

  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/nowpayments`,
    headers: { 'x-nowpayments-sig': sig },
    body
  });
}

export async function simulateNowPaymentsWebhook(baseUrl: string, params: {
  providerPaymentId: string;
  nowPaymentsIpnSecret?: string;
  eventId: string;
  paymentStatus: string;
  signatureOverride?: string;
  omitSignature?: boolean;
  extra?: Record<string, any>;
}) {
  const body = {
    id: params.eventId,
    ipn_id: params.eventId,
    invoice_id: params.providerPaymentId,
    payment_status: params.paymentStatus,
    ...(params.extra || {})
  };

  const raw = JSON.stringify(body);
  const canonical = canonicalJson(body);

  const headers: Record<string, string> = {};
  if (!params.omitSignature) {
    const sig =
      typeof params.signatureOverride === 'string'
        ? params.signatureOverride
        : params.nowPaymentsIpnSecret
          ? hmacSha512Hex(params.nowPaymentsIpnSecret, canonical || raw)
          : '';
    if (sig) headers['x-nowpayments-sig'] = sig;
  }

  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/nowpayments`,
    headers: Object.keys(headers).length ? headers : undefined,
    body
  });
}

export async function simulateNowPaymentsWebhookRefund(baseUrl: string, params: {
  providerPaymentId: string;
  nowPaymentsIpnSecret: string;
  eventId: string;
}) {
  const body = {
    id: params.eventId,
    ipn_id: params.eventId,
    invoice_id: params.providerPaymentId,
    payment_status: 'refunded',
    actually_paid_at: new Date().toISOString()
  };

  const raw = JSON.stringify(body);
  const canonical = canonicalJson(body);
  const sig = hmacSha512Hex(params.nowPaymentsIpnSecret, canonical || raw);

  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/nowpayments`,
    headers: { 'x-nowpayments-sig': sig },
    body
  });
}
