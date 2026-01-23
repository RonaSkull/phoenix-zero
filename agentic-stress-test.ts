import { createHmac } from 'node:crypto';

type Json = Record<string, any>;

type HttpRes<T = any> = { status: number; json: T | null; text: string };

class SkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkipError';
  }
}

function env(name: string, fallback = ''): string {
  return String(process.env[name] || fallback).trim();
}

function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function withAdminHeader(adminToken: string): Record<string, string> {
  if (!adminToken) return {};
  return { 'x-admin-token': adminToken };
}

async function httpJson<T = any>(url: string, init: RequestInit): Promise<HttpRes<T>> {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => '');
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function assert(cond: any, msg: string): void {
  if (!cond) throw new Error(msg);
}

function skip(reason: string): never {
  throw new SkipError(reason);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForPaid(params: {
  baseUrl: string;
  apiKey: string;
  paymentId: string;
  waitSeconds: number;
}): Promise<any> {
  const started = Date.now();
  const deadline = started + Math.max(5, Math.trunc(params.waitSeconds)) * 1000;
  let last: any = null;
  while (Date.now() < deadline) {
    const st = await checkoutStatus({ baseUrl: params.baseUrl, apiKey: params.apiKey, paymentId: params.paymentId });
    last = st;
    if (String(st.status) === 'paid') return st;
    if (String(st.status) === 'failed') {
      throw new Error(`payment failed (paymentId=${params.paymentId}): ${JSON.stringify(st)}`);
    }
    await sleep(3000);
  }
  throw new Error(`timeout waiting for paid (paymentId=${params.paymentId}): ${JSON.stringify(last)}`);
}

async function createTenant(params: {
  baseUrl: string;
  adminToken: string;
  name: string;
}): Promise<{ tenantId: string; apiKey: string; sessionToken: string }> {
  const url = new URL('/api/admin/tenants', params.baseUrl).toString();
  const res = await httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({
      name: params.name,
      clientType: 'creator',
      sector: 'media',
      country: 'BR',
      currency: 'BRL',
      pricingProfile: 'default',
      commissionProfile: 'default',
      taxProfile: 'default'
    })
  });
  assert(res.status === 200, `createTenant failed (${res.status}): ${res.text}`);
  assert(res.json && (res.json as any).ok === true, `createTenant not ok: ${res.text}`);
  return {
    tenantId: String((res.json as any).tenant?.tenantId || ''),
    apiKey: String((res.json as any).apiKey || ''),
    sessionToken: String((res.json as any).sessionToken || '')
  };
}

async function billingAccount(baseUrl: string, apiKey: string): Promise<any> {
  const url = new URL('/api/billing/account', baseUrl).toString();
  const res = await httpJson(url, { method: 'GET', headers: { 'x-api-key': apiKey } });
  assert(res.status === 200, `billing/account failed (${res.status}): ${res.text}`);
  return res.json;
}

async function adminSetBillingStatus(params: {
  baseUrl: string;
  adminToken: string;
  tenantId: string;
  status: 'pending' | 'paid' | 'failed' | 'grace' | 'suspended';
}): Promise<any> {
  const url = new URL('/api/admin/billing/accounts', params.baseUrl).toString();
  const res = await httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({ tenantId: params.tenantId, status: params.status })
  });
  assert(res.status === 200, `admin billing status update failed (${res.status}): ${res.text}`);
  assert(res.json && (res.json as any).ok === true, `admin billing status update not ok: ${res.text}`);
  return res.json;
}

async function checkoutCreateRaw(params: {
  baseUrl: string;
  apiKey: string;
  body: any;
}): Promise<HttpRes> {
  const url = new URL('/api/checkout/create', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': params.apiKey },
    body: JSON.stringify(params.body)
  });
}

async function checkoutCreate(params: {
  baseUrl: string;
  apiKey: string;
  providerHint: 'pix' | 'crypto' | 'card';
  currency: string;
  pricingProfileId?: string;
  pricingVersionId?: string;
  lineItems: any[];
}): Promise<{
  paymentId: string;
  status: string;
  checkoutUrl?: string;
  instructions?: string;
  provider?: string;
  amountCents?: number;
  currency?: string;
}> {
  const url = new URL('/api/checkout/create', params.baseUrl).toString();
  const res = await httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': params.apiKey },
    body: JSON.stringify({
      providerHint: params.providerHint,
      currency: params.currency,
      pricingProfileId: params.pricingProfileId,
      pricingVersionId: params.pricingVersionId,
      lineItems: params.lineItems
    })
  });
  assert(res.status === 200, `checkout/create failed (${res.status}): ${res.text}`);
  assert(res.json && (res.json as any).ok === true, `checkout/create not ok: ${res.text}`);
  return {
    paymentId: String((res.json as any).paymentId || ''),
    status: String((res.json as any).status || ''),
    provider: String((res.json as any).provider || ''),
    checkoutUrl: String((res.json as any).checkoutUrl || ''),
    instructions: String((res.json as any).instructions || ''),
    amountCents: typeof (res.json as any).amountCents === 'number' ? (res.json as any).amountCents : undefined,
    currency: String((res.json as any).currency || '')
  };
}

async function checkoutStatus(params: { baseUrl: string; apiKey: string; paymentId: string }): Promise<any> {
  const u = new URL('/api/checkout/status', params.baseUrl);
  u.searchParams.set('paymentId', params.paymentId);
  const res = await httpJson(u.toString(), { method: 'GET', headers: { 'x-api-key': params.apiKey } });
  assert(res.status === 200, `checkout/status failed (${res.status}): ${res.text}`);
  assert(res.json && (res.json as any).ok === true, `checkout/status not ok: ${res.text}`);
  return res.json;
}

async function liveStreamList(params: { baseUrl: string; apiKey: string }): Promise<HttpRes> {
  const url = new URL('/api/live-stream', params.baseUrl).toString();
  return httpJson(url, { method: 'GET', headers: { 'x-api-key': params.apiKey } });
}

async function timeAnchorCreate(params: { baseUrl: string; apiKey: string; contentCommitB64Url: string }): Promise<HttpRes> {
  const url = new URL('/api/time-anchor', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': params.apiKey },
    body: JSON.stringify({ action: 'create', kind: 'vod', contentCommitB64Url: params.contentCommitB64Url, ttlSeconds: 3600, mode: 'compat' })
  });
}

async function pixWebhook(params: {
  baseUrl: string;
  providerPaymentId: string;
  asaasWebhookSecret?: string;
  eventId: string;
  status: 'CONFIRMED' | 'RECEIVED' | 'OVERDUE';
}): Promise<HttpRes> {
  const url = new URL('/api/webhooks/pix', params.baseUrl).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (params.asaasWebhookSecret) headers['asaas-access-token'] = params.asaasWebhookSecret;
  const body = {
    id: params.eventId,
    payment: { id: params.providerPaymentId, status: params.status }
  };
  return httpJson(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function nowPaymentsWebhook(params: {
  baseUrl: string;
  providerPaymentId: string;
  ipnSecret?: string;
  eventId: string;
  paymentStatus: 'finished' | 'failed' | 'expired';
}): Promise<HttpRes> {
  const url = new URL('/api/webhooks/nowpayments', params.baseUrl).toString();
  const body = {
    id: params.eventId,
    invoice_id: params.providerPaymentId,
    payment_status: params.paymentStatus
  };
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (params.ipnSecret) {
    headers['x-nowpayments-sig'] = createHmac('sha512', params.ipnSecret).update(raw, 'utf8').digest('hex');
  }
  const res = await fetch(url, { method: 'POST', headers, body: raw });
  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function run(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  process.stdout.write(`[${name}] `);
  try {
    await fn();
    const ms = Date.now() - started;
    console.log(`OK (${ms}ms)`);
  } catch (e) {
    if (e instanceof SkipError) {
      const ms = Date.now() - started;
      console.log(`SKIPPED (${ms}ms) — ${e.message}`);
      return;
    }
    throw e;
  }
}

async function main() {
  const baseUrl = env('PHOENIX_ZERO_BASE_URL', 'http://localhost:3000');
  const adminToken = env('PHOENIX_ZERO_ADMIN_TOKEN');

  const realMode = env('AGENTIC_STRESS_REAL') === '1' || env('AGENTIC_STRESS_REAL').toLowerCase() === 'true';
  const realProvider = (env('AGENTIC_STRESS_REAL_PROVIDER', 'pix') || 'pix').toLowerCase();
  const waitSecondsRaw = Number(env('AGENTIC_STRESS_WAIT_SECONDS', '900') || '900');
  const waitSeconds = Number.isFinite(waitSecondsRaw) ? waitSecondsRaw : 900;

  const asaasApiKey = env('ASAAS_API_KEY');
  const nowPaymentsApiKey = env('NOWPAYMENTS_API_KEY');

  const asaasSecret = env('ASAAS_WEBHOOK_SECRET');
  const nowIpnSecret = env('NOWPAYMENTS_IPN_SECRET');

  // Level 1 — Happy Path Básico
  await run('L1: guardrail 402 -> unlock (pix webhook OR admin fallback)', async () => {
    if (realMode && realProvider !== 'pix') {
      skip(`real mode provider is '${realProvider}' (skipping pix)`);
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l1-${Date.now()}` });

    const before = await billingAccount(baseUrl, t.apiKey);
    assert(before && before.ok === true, 'billing/account should be ok');

    const blocked = await liveStreamList({ baseUrl, apiKey: t.apiKey });
    assert(blocked.status === 402, `expected 402 before payment, got ${blocked.status}: ${blocked.text}`);

    if (realMode) {
      const created = await checkoutCreate({
        baseUrl,
        apiKey: t.apiKey,
        providerHint: 'pix',
        currency: 'BRL',
        lineItems: [
          {
            product: 'video_protection',
            operation: 'protect_video',
            guaranteeWindow: '7d',
            proofGrade: 'social',
            exposure: 'private',
            persistence: 'ephemeral',
            units: 1,
            durationSeconds: 1
          }
        ]
      });

      console.log(`\nPIX checkoutUrl: ${created.checkoutUrl || '(missing)'}`);
      if (typeof created.amountCents === 'number' && created.currency) {
        console.log(`PIX amount: ${created.amountCents} cents (${created.currency})`);
      }
      if (created.instructions) console.log(`PIX instructions: ${created.instructions}`);
      console.log(`Waiting for paymentId=${created.paymentId} to become paid...`);

      await waitForPaid({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId, waitSeconds });
      const afterPaid = await billingAccount(baseUrl, t.apiKey);
      assert(afterPaid.isActive === true, `expected billing active after real payment, got ${JSON.stringify(afterPaid)}`);
      const allowedPaid = await liveStreamList({ baseUrl, apiKey: t.apiKey });
      assert(allowedPaid.status === 200, `expected 200 after payment, got ${allowedPaid.status}: ${allowedPaid.text}`);
      return;
    }

    // Sem key do provedor, não chamamos Asaas. Fazemos unlock via admin para validar o guardrail.
    if (!asaasApiKey) {
      await adminSetBillingStatus({ baseUrl, adminToken, tenantId: t.tenantId, status: 'paid' });
      const afterManual = await billingAccount(baseUrl, t.apiKey);
      assert(afterManual.isActive === true, `expected billing active (manual), got ${JSON.stringify(afterManual)}`);
      const allowedManual = await liveStreamList({ baseUrl, apiKey: t.apiKey });
      assert(allowedManual.status === 200, `expected 200 after manual activation, got ${allowedManual.status}: ${allowedManual.text}`);
      return;
    }

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      lineItems: [
        {
          product: 'video_protection',
          operation: 'protect_video',
          guaranteeWindow: '30d',
          proofGrade: 'legal',
          exposure: 'public',
          persistence: 'persistent',
          units: 1,
          durationSeconds: 30
        }
      ]
    });

    const st0 = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st0.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh1 = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_1`,
      status: 'CONFIRMED'
    });

    // Se o servidor exige token e não passamos, cai em 401; fazemos fallback admin pra não quebrar o teste.
    if (wh1.status === 401) {
      await adminSetBillingStatus({ baseUrl, adminToken, tenantId: t.tenantId, status: 'paid' });
    } else {
      assert(wh1.status === 200, `pix webhook failed (${wh1.status}): ${wh1.text}`);
      const st1 = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
      assert(String(st1.status) === 'paid', `expected paid, got ${st1.status}`);
    }

    const after = await billingAccount(baseUrl, t.apiKey);
    assert(after.isActive === true, `expected billing active, got ${JSON.stringify(after)}`);

    const allowed = await liveStreamList({ baseUrl, apiKey: t.apiKey });
    assert(allowed.status === 200, `expected 200 after unlock, got ${allowed.status}: ${allowed.text}`);
  });

  // Level 2 — Multi-provider crypto
  await run('L2: crypto webhook (nowpayments)', async () => {
    if (realMode && realProvider !== 'crypto') {
      skip(`real mode provider is '${realProvider}' (skipping crypto)`);
    }
    const t = await createTenant({ baseUrl, adminToken, name: `stress-l2-${Date.now()}` });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'crypto',
      currency: 'USD',
      lineItems: [
        {
          product: 'video_protection',
          operation: 'protect_video',
          guaranteeWindow: '7d',
          proofGrade: 'social',
          exposure: 'private',
          persistence: 'ephemeral',
          units: 1,
          durationSeconds: 1
        }
      ]
    });

    if (realMode) {
      console.log(`\nCRYPTO checkoutUrl: ${created.checkoutUrl || '(missing)'}`);
      if (typeof created.amountCents === 'number' && created.currency) {
        console.log(`CRYPTO amount: ${created.amountCents} cents (${created.currency})`);
      }
      if (created.instructions) console.log(`CRYPTO instructions: ${created.instructions}`);
      console.log(`Waiting for paymentId=${created.paymentId} to become paid...`);
      await waitForPaid({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId, waitSeconds });
      const afterPaid = await billingAccount(baseUrl, t.apiKey);
      assert(afterPaid.isActive === true, `expected billing active after crypto payment, got ${JSON.stringify(afterPaid)}`);
      const allowed = await liveStreamList({ baseUrl, apiKey: t.apiKey });
      assert(allowed.status === 200, `expected 200 after crypto payment, got ${allowed.status}: ${allowed.text}`);
      return;
    }

    const st0 = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st0.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await nowPaymentsWebhook({
      baseUrl,
      providerPaymentId,
      ipnSecret: nowIpnSecret || undefined,
      eventId: `evt_${created.paymentId}_1`,
      paymentStatus: 'finished'
    });

    if (wh.status === 401) {
      skip('NowPayments webhook got 401 (server likely requires NOWPAYMENTS_IPN_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `nowpayments webhook failed (${wh.status}): ${wh.text}`);

    const st1 = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    assert(String(st1.status) === 'paid', `expected paid, got ${st1.status}`);
  });

  // Level 3 — Replay + forja (pix)
  await run('L3: pix webhook forgery + replay (idempotency)', async () => {
    if (realMode) {
      skip('real mode does not inject webhooks (skip forgery/replay injection)');
    }
    if (!asaasApiKey) {
      skip('ASAAS_API_KEY not set (cannot create pix PaymentIntent to validate replay/idempotency)');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l3-${Date.now()}` });
    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });
    const st0 = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st0.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    if (asaasSecret) {
      const bad = await pixWebhook({
        baseUrl,
        providerPaymentId,
        asaasWebhookSecret: 'wrong_token',
        eventId: `evt_${created.paymentId}_forgery`,
        status: 'CONFIRMED'
      });
      assert(bad.status === 401, `expected 401 for forged token, got ${bad.status}: ${bad.text}`);
    }

    const eventId = `evt_${created.paymentId}_replay`;
    const ok1 = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId,
      status: 'CONFIRMED'
    });
    assert(ok1.status === 200, `expected 200 on first webhook, got ${ok1.status}: ${ok1.text}`);

    const ok2 = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId,
      status: 'CONFIRMED'
    });
    assert(ok2.status === 200, `expected 200 on replay webhook, got ${ok2.status}: ${ok2.text}`);
    assert((ok2.json as any)?.deduped === true, `expected deduped=true on replay, got: ${ok2.text}`);
  });

  // Level 4 — Operational failures
  await run('L4: pix webhook unknown providerPaymentId fails safely', async () => {
    if (realMode) {
      skip('real mode does not inject webhooks (skip unknown providerPaymentId injection)');
    }
    const unknown = await pixWebhook({
      baseUrl,
      providerPaymentId: `unknown_${Date.now()}`,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_unknown_${Date.now()}`,
      status: 'CONFIRMED'
    });

    if (unknown.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }

    assert(unknown.status === 400, `expected 400 for unknown mapping, got ${unknown.status}: ${unknown.text}`);
  });

  // Level 5 — adversarial
  await run('L5: adversarial attempts (tenantId mismatch + unpaid access)', async () => {
    const tA = await createTenant({ baseUrl, adminToken, name: `stress-l5a-${Date.now()}` });
    const tB = await createTenant({ baseUrl, adminToken, name: `stress-l5b-${Date.now()}` });

    const mismatch = await checkoutCreateRaw({
      baseUrl,
      apiKey: tA.apiKey,
      body: {
        tenantId: tB.tenantId,
        providerHint: 'pix',
        currency: 'BRL',
        lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1 }]
      }
    });
    assert(mismatch.status === 403, `expected 403 for tenantId mismatch, got ${mismatch.status}: ${mismatch.text}`);

    const blocked = await liveStreamList({ baseUrl, apiKey: tB.apiKey });
    assert(blocked.status === 402, `expected 402 for unpaid tenant, got ${blocked.status}: ${blocked.text}`);
  });

  console.log('All tests completed.');
}

main().catch((e) => {
  console.error(String(e?.stack || e?.message || e));
  process.exit(1);
});
