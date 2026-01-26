import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';
import { activateBillingAccount } from './billing-accounts';
import { getTenantById } from './tenants';
import { recordUsage } from './usage-ledger';
import {
  calculateFinalPrice,
  getCommissionProfile,
  getPricingProfile,
  getPricingProfileVersion,
  getTaxProfile,
  type PricingContext,
  type PricingProfile
} from './pricing';

export type PaymentProvider = 'pix' | 'card' | 'crypto';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

export type CheckoutLineItem = {
  operation?: string;
  product?: string;
  clientType?: string;
  sector?: string;
  country?: string;
  reach?: string;
  exposure?: string;
  persistence?: string;
  guaranteeWindow?: string;
  proofGrade?: string;
  authenticityLevel?: string;
  riskProfile?: string;
  plan?: string;
  units?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  pages?: number;
};

export type PaymentIntent = {
  id: string;
  createdAt: string;
  updatedAt: string;

  tenantId: string;

  provider: PaymentProvider;
  status: PaymentStatus;

  currency: string;
  amountCents: number;

  pricingProfileId: string;
  pricingVersionId?: string;

  providerPaymentId?: string;
  checkoutUrl?: string;
  instructions?: string;

  lineItems: CheckoutLineItem[];

  proofMeta?: {
    agentId: string;
    taskId?: string;
    taskType: string;
    taskInputHash: string;
    taskOutputHash: string;
    agentEd25519PublicKeyB64Url?: string;
    agentEd25519SignatureB64Url?: string;

    customerContact?: {
      whatsappNumber?: string;
      telegramChatId?: string;
    };
  };

  breakdown: {
    lineTotalsCents: number[];
  };
};

type PaymentsDbV1 = {
  version: 1;
  intents: Record<string, PaymentIntent>;
};

type PaymentsDbV2 = {
  version: 2;
  intents: Record<string, PaymentIntent>;
  asaasCustomerByTenantId: Record<string, string>;
};

type PaymentsDb = PaymentsDbV2;

function nowIso(): string {
  return new Date().toISOString();
}

export async function findPaymentIntentByProviderPaymentId(params: {
  provider: PaymentProvider;
  providerPaymentId: string;
}): Promise<PaymentIntent | null> {
  const provider = params.provider;
  const providerPaymentId = String(params.providerPaymentId || '').trim();
  if (!providerPaymentId) return null;
  const db = await loadDb();
  for (const intent of Object.values(db.intents || {})) {
    if (!intent) continue;
    if (intent.provider !== provider) continue;
    if (String(intent.providerPaymentId || '').trim() !== providerPaymentId) continue;
    return intent;
  }
  return null;
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'payment-intents.json');
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<PaymentsDb> {
  const kvKey = 'payment-intents';
  const jsonFromPg = postgresEnabled() ? await readKvJson<any>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<any>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  let normalized: PaymentsDb;
  if (!json || (json.version !== 1 && json.version !== 2)) {
    normalized = { version: 2, intents: {}, asaasCustomerByTenantId: {} };
  } else if (json.version === 2) {
    normalized = {
      version: 2,
      intents: typeof json.intents === 'object' && json.intents ? json.intents : {},
      asaasCustomerByTenantId:
        typeof json.asaasCustomerByTenantId === 'object' && json.asaasCustomerByTenantId ? json.asaasCustomerByTenantId : {}
    };
  } else {
    const v1 = json as PaymentsDbV1;
    normalized = {
      version: 2,
      intents: typeof v1.intents === 'object' && v1.intents ? v1.intents : {},
      asaasCustomerByTenantId: {}
    };
  }

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveDb(db: PaymentsDb): Promise<void> {
  const kvKey = 'payment-intents';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function paymentsPixProvider(): string {
  return String(process.env.PAYMENTS_PIX_PROVIDER || '').trim().toLowerCase();
}

function paymentsCryptoProvider(): string {
  return String(process.env.PAYMENTS_CRYPTO_PROVIDER || '').trim().toLowerCase();
}

function asaasBaseUrl(): string {
  const env = String(process.env.ASAAS_API_BASE || '').trim();
  if (env) return env;
  const mode = String(process.env.ASAAS_ENV || '').trim().toLowerCase();
  if (mode === 'sandbox') return 'https://api-sandbox.asaas.com';
  return 'https://api.asaas.com';
}

function asaasApiKey(): string {
  return String(process.env.ASAAS_API_KEY || '').trim();
}

function asaasCustomerCpfCnpj(): string | null {
  const env = String(process.env.ASAAS_CUSTOMER_CPF_CNPJ || '').trim();
  if (env) return env;
  const mode = String(process.env.ASAAS_ENV || '').trim().toLowerCase();
  if (mode === 'sandbox') return '11144477735';
  return null;
}

async function asaasFetch(path: string, init: RequestInit): Promise<Response> {
  const key = asaasApiKey();
  const url = `${asaasBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    access_token: key
  };
  const extra = (init.headers || {}) as any;
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'string') headers[k] = v;
  }
  return fetch(url, { ...init, headers });
}

async function ensureAsaasCustomerId(params: {
  tenantId: string;
  tenantName: string;
}): Promise<{ ok: true; customerId: string } | { ok: false; reason: string }> {
  const db = await loadDb();
  const cached = db.asaasCustomerByTenantId[params.tenantId];
  if (cached) return { ok: true, customerId: cached };

  const cpfCnpj = asaasCustomerCpfCnpj();

  const res = await asaasFetch('/v3/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: params.tenantName || params.tenantId,
      externalReference: params.tenantId,
      ...(cpfCnpj ? { cpfCnpj } : {})
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return { ok: false, reason: `Asaas customer create failed (${res.status}): ${txt || res.statusText}` };
  }
  const json = (await res.json().catch(() => null)) as any;
  const customerId = String(json?.id || '').trim();
  if (!customerId) return { ok: false, reason: 'Asaas customer create failed (missing id)' };

  db.asaasCustomerByTenantId[params.tenantId] = customerId;
  await saveDb(db);
  return { ok: true, customerId };
}

function moneyToBrl(valueCents: number): string {
  const cents = Math.max(0, Math.trunc(valueCents));
  const v = cents / 100;
  return v.toFixed(2);
}

async function createAsaasPixCharge(params: {
  tenantId: string;
  tenantName: string;
  amountCents: number;
  description: string;
  externalReference: string;
}): Promise<{ ok: true; providerPaymentId: string; checkoutUrl?: string; instructions?: string } | { ok: false; reason: string }> {
  const customer = await ensureAsaasCustomerId({ tenantId: params.tenantId, tenantName: params.tenantName });
  if (!customer.ok) return customer;

  const mode = String(process.env.ASAAS_ENV || '').trim().toLowerCase();
  const amountCents = mode === 'sandbox' ? Math.max(500, Math.trunc(params.amountCents)) : Math.trunc(params.amountCents);

  const dueDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await asaasFetch('/v3/payments', {
    method: 'POST',
    body: JSON.stringify({
      customer: customer.customerId,
      billingType: 'PIX',
      value: Number(moneyToBrl(amountCents)),
      dueDate,
      description: params.description,
      externalReference: params.externalReference
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return { ok: false, reason: `Asaas payment create failed (${res.status}): ${txt || res.statusText}` };
  }
  const json = (await res.json().catch(() => null)) as any;
  const providerPaymentId = String(json?.id || '').trim();
  if (!providerPaymentId) return { ok: false, reason: 'Asaas payment create failed (missing id)' };

  const invoiceUrl = String(json?.invoiceUrl || '').trim() || undefined;

  const qrRes = await asaasFetch(`/v3/payments/${encodeURIComponent(providerPaymentId)}/pixQrCode`, { method: 'GET' });
  let instructions = invoiceUrl ? `Invoice: ${invoiceUrl}` : undefined;
  if (qrRes.ok) {
    const qrJson = (await qrRes.json().catch(() => null)) as any;
    const payload = String(qrJson?.payload || '').trim();
    if (payload) instructions = `${instructions ? instructions + '\n' : ''}Pix payload: ${payload}`;
  }

  return { ok: true, providerPaymentId, checkoutUrl: invoiceUrl, instructions };
}

function nowPaymentsApiBaseUrl(): string {
  const env = String(process.env.NOWPAYMENTS_API_BASE || '').trim();
  if (env) return env;
  return 'https://api.nowpayments.io';
}

function nowPaymentsApiKey(): string {
  return String(process.env.NOWPAYMENTS_API_KEY || '').trim();
}

async function nowPaymentsFetch(path: string, init: RequestInit): Promise<Response> {
  const key = nowPaymentsApiKey();
  const url = `${nowPaymentsApiBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'x-api-key': key
  };
  const extra = (init.headers || {}) as any;
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'string') headers[k] = v;
  }
  return fetch(url, { ...init, headers });
}

async function createNowPaymentsInvoice(params: {
  priceAmount: number;
  priceCurrency: string;
  payCurrency?: string;
  orderId: string;
  orderDescription: string;
}): Promise<{ ok: true; providerPaymentId: string; checkoutUrl?: string; instructions?: string } | { ok: false; reason: string }> {
  const apiKey = nowPaymentsApiKey();
  if (!apiKey) return { ok: false, reason: 'NOWPAYMENTS_API_KEY is not set' };

  const publicBaseRaw = String(process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim();
  const publicBase = publicBaseRaw ? publicBaseRaw.replace(/\/+$/g, '') : '';
  const ipnCallbackUrl = publicBase ? `${publicBase}/api/webhooks/nowpayments` : undefined;
  const successUrl = publicBase ? `${publicBase}/checkout/${encodeURIComponent(params.orderId)}` : undefined;
  const cancelUrl = publicBase ? `${publicBase}/checkout/${encodeURIComponent(params.orderId)}` : undefined;

  const payload: Record<string, any> = {
    price_amount: params.priceAmount,
    price_currency: params.priceCurrency,
    pay_currency: params.payCurrency,
    order_id: params.orderId,
    order_description: params.orderDescription
  };
  if (ipnCallbackUrl) payload.ipn_callback_url = ipnCallbackUrl;
  if (successUrl) payload.success_url = successUrl;
  if (cancelUrl) payload.cancel_url = cancelUrl;

  const res = await nowPaymentsFetch('/v1/invoice', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return { ok: false, reason: `NowPayments invoice create failed (${res.status}): ${txt || res.statusText}` };
  }

  const json = (await res.json().catch(() => null)) as any;
  const providerPaymentId = String(json?.id || json?.invoice_id || '').trim();
  const invoiceUrl = String(json?.invoice_url || json?.invoiceUrl || json?.url || '').trim() || undefined;

  if (!providerPaymentId) return { ok: false, reason: 'NowPayments invoice create failed (missing id)' };
  const instructions = invoiceUrl ? `Invoice: ${invoiceUrl}` : undefined;
  return { ok: true, providerPaymentId, checkoutUrl: invoiceUrl, instructions };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clampNonNegativeInt(n: unknown, max: number): number {
  const x = Number(n ?? NaN);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(x)));
}

function normalizeProvider(v: unknown): PaymentProvider {
  const t = String(v || '').trim().toLowerCase();
  if (t === 'pix') return 'pix';
  if (t === 'card') return 'card';
  if (t === 'crypto') return 'crypto';
  return 'pix';
}

function productToDefaultOperation(product: string): string {
  const p = String(product || '').trim().toLowerCase();
  if (p === 'video' || p === 'video_protection') return 'protect_video';
  if (p === 'image' || p === 'image_protection') return 'protect_image';
  if (p === 'audio' || p === 'audio_protection') return 'protect_audio';
  if (p === 'live' || p === 'live_protection') return 'protect_live';
  if (p === 'document' || p === 'report' || p === 'document_protection') return 'protect_report';
  return 'protect_video';
}

async function resolvePricingProfile(params: {
  pricingProfileId: string;
  pricingVersionId?: string;
  currencyFallback: string;
}): Promise<PricingProfile> {
  const id = String(params.pricingProfileId || '').trim() || 'default';
  const v = String(params.pricingVersionId || '').trim();
  if (v) {
    const byVersion = await getPricingProfileVersion(id, v);
    if (byVersion) return byVersion;
  }
  return getPricingProfile(id, params.currencyFallback);
}

async function computeTotalCents(params: {
  tenantId: string;
  currency: string;
  pricingProfileId: string;
  pricingVersionId?: string;
  lineItems: CheckoutLineItem[];
}): Promise<{ ok: true; amountCents: number; lineTotalsCents: number[] } | { ok: false; reason: string }> {
  const tenant = await getTenantById(params.tenantId);
  if (!tenant) return { ok: false, reason: 'Tenant not found' };

  const currency = (params.currency || tenant.currency || 'USD').trim() || 'USD';

  const pricingProfile = await resolvePricingProfile({
    pricingProfileId: params.pricingProfileId,
    pricingVersionId: params.pricingVersionId,
    currencyFallback: currency
  });
  const commissionProfile = await getCommissionProfile(tenant.commissionProfile);
  const taxProfile = await getTaxProfile(tenant.taxProfile);

  const lineTotalsCents: number[] = [];
  let total = 0;

  for (const li of params.lineItems) {
    const product = String(li?.product || 'video');
    const opInput = String(li?.operation || '').trim();
    const opFromProduct = productToDefaultOperation(product);

    let operation = opInput || opFromProduct;
    if (opInput && typeof pricingProfile.basePriceCentsByOp[operation] !== 'number') {
      operation = productToDefaultOperation(operation);
    }

    const unitsInput = Number(li?.units ?? NaN);
    const units = Number.isFinite(unitsInput) ? clampInt(unitsInput, 1, 1_000_000) : 1;

    const scope: PricingContext = {
      tenantId: params.tenantId,
      operation,
      product: (li?.product || undefined) as any,
      clientType: (li?.clientType || tenant.clientType || 'unknown').trim(),
      sector: (li?.sector || tenant.sector || 'unknown').trim(),
      country: (li?.country || tenant.country || 'unknown').trim(),
      currency,
      reach: (li?.reach || 'unknown').trim(),
      exposure: (li?.exposure || 'unknown').trim(),
      persistence: (li?.persistence || 'unknown').trim(),
      guaranteeWindow: (li?.guaranteeWindow || 'unknown').trim(),
      proofGrade: (li?.proofGrade || 'unknown').trim(),
      authenticityLevel: (li?.authenticityLevel || 'unknown').trim(),
      riskProfile: (li?.riskProfile || 'unknown').trim(),
      plan: (li?.plan || 'unknown').trim(),
      units,
      durationSeconds: clampNonNegativeInt(li?.durationSeconds, 172800),
      sizeBytes: clampNonNegativeInt(li?.sizeBytes, 1_000_000_000),
      pages: clampNonNegativeInt(li?.pages, 10_000)
    };

    const basePriceCentsRaw = pricingProfile.basePriceCentsByOp[operation];
    const basePriceCents =
      typeof basePriceCentsRaw === 'number' && Number.isFinite(basePriceCentsRaw)
        ? Math.max(0, Math.trunc(basePriceCentsRaw))
        : 0;

    const quote = calculateFinalPrice({
      scope,
      basePriceCents,
      pricingProfile,
      commissionProfile,
      taxProfile
    });

    const lineTotal = Math.max(0, Math.trunc(quote.finalPriceCents));
    lineTotalsCents.push(lineTotal);
    total += lineTotal;
  }

  return { ok: true, amountCents: Math.max(0, Math.trunc(total)), lineTotalsCents };
}

export async function createPaymentIntent(params: {
  tenantId: string;
  pricingProfileId: string;
  pricingVersionId?: string;
  currency: string;
  providerHint?: string;
  lineItems: CheckoutLineItem[];
  proofMeta?: {
    agentId?: string;
    taskId?: string;
    taskType?: string;
    taskInputHash?: string;
    taskOutputHash?: string;
    agentEd25519PublicKeyB64Url?: string;
    agentEd25519SignatureB64Url?: string;

    customerContact?: {
      whatsappNumber?: string;
      telegramChatId?: string;
    };
  };
}): Promise<{ ok: true; intent: PaymentIntent } | { ok: false; reason: string }> {
  try {
    const tenantId = String(params.tenantId || '').trim();
    if (!tenantId) return { ok: false, reason: 'Missing tenantId' };

    const tenant = await getTenantById(tenantId);
    if (!tenant) return { ok: false, reason: 'Tenant not found' };

    const pricingProfileId = String(params.pricingProfileId || '').trim() || tenant.pricingProfile || 'default';
    const pricingVersionId = String(params.pricingVersionId || '').trim() || undefined;

    const currency = (params.currency || tenant.currency || 'USD').trim() || 'USD';

    const items = Array.isArray(params.lineItems) ? params.lineItems.filter(Boolean) : [];
    if (items.length <= 0) return { ok: false, reason: 'Missing lineItems' };

    const computed = await computeTotalCents({
      tenantId,
      currency,
      pricingProfileId,
      pricingVersionId,
      lineItems: items
    });
    if (!computed.ok) return computed;

    const provider = normalizeProvider(params.providerHint);

    let amountCents = computed.amountCents;

    const id = `pay_${b64Url(randomBytes(12))}`;
    const createdAt = nowIso();

    let providerPaymentId = `${provider}_${b64Url(randomBytes(12))}`;
    let checkoutUrl: string | undefined = `/checkout/${id}`;
    let instructions: string | undefined =
      provider === 'pix'
        ? 'Send PIX to complete payment (provider integration pending)'
        : provider === 'card'
          ? 'Complete card payment (provider integration pending)'
          : 'Complete crypto payment (provider integration pending)';

    if (provider === 'pix' && paymentsPixProvider() === 'asaas' && asaasApiKey()) {
      const mode = String(process.env.ASAAS_ENV || '').trim().toLowerCase();
      const amountCentsForCharge = mode === 'sandbox' ? Math.max(500, Math.trunc(amountCents)) : Math.trunc(amountCents);
      const asaas = await createAsaasPixCharge({
        tenantId,
        tenantName: tenant.name,
        amountCents: amountCentsForCharge,
        description: `Phoenix Zero payment ${id}`,
        externalReference: id
      });
      if (!asaas.ok) return { ok: false, reason: asaas.reason };
      providerPaymentId = asaas.providerPaymentId;
      checkoutUrl = asaas.checkoutUrl;
      instructions = asaas.instructions;

      amountCents = amountCentsForCharge;
    }

    if (provider === 'crypto' && paymentsCryptoProvider() === 'nowpayments' && nowPaymentsApiKey()) {
      const invoice = await createNowPaymentsInvoice({
        priceAmount: computed.amountCents / 100,
        priceCurrency: currency,
        orderId: id,
        orderDescription: `Phoenix Zero payment ${id}`
      });
      if (!invoice.ok) return { ok: false, reason: invoice.reason };
      providerPaymentId = invoice.providerPaymentId;
      checkoutUrl = invoice.checkoutUrl;
      instructions = invoice.instructions;
    }

    const intent: PaymentIntent = {
      id,
      createdAt,
      updatedAt: createdAt,
      tenantId,
      provider,
      status: 'pending',
      currency,
      amountCents,
      pricingProfileId,
      pricingVersionId,
      providerPaymentId,
      checkoutUrl,
      instructions,
      lineItems: items,
      proofMeta:
        params.proofMeta &&
        String(params.proofMeta.agentId || '').trim() &&
        String(params.proofMeta.taskType || '').trim() &&
        String(params.proofMeta.taskInputHash || '').trim() &&
        String(params.proofMeta.taskOutputHash || '').trim()
          ? {
              agentId: String(params.proofMeta.agentId || '').trim(),
              taskId: String(params.proofMeta.taskId || '').trim() || undefined,
              taskType: String(params.proofMeta.taskType || '').trim(),
              taskInputHash: String(params.proofMeta.taskInputHash || '').trim(),
              taskOutputHash: String(params.proofMeta.taskOutputHash || '').trim(),
              agentEd25519PublicKeyB64Url: String(params.proofMeta.agentEd25519PublicKeyB64Url || '').trim() || undefined,
              agentEd25519SignatureB64Url: String(params.proofMeta.agentEd25519SignatureB64Url || '').trim() || undefined,
              customerContact:
                params.proofMeta.customerContact &&
                (String(params.proofMeta.customerContact.whatsappNumber || '').trim() ||
                  String(params.proofMeta.customerContact.telegramChatId || '').trim())
                  ? {
                      whatsappNumber: String(params.proofMeta.customerContact.whatsappNumber || '').trim() || undefined,
                      telegramChatId: String(params.proofMeta.customerContact.telegramChatId || '').trim() || undefined
                    }
                  : undefined
            }
          : undefined,
      breakdown: { lineTotalsCents: computed.lineTotalsCents }
    };

    const db = await loadDb();
    db.intents[intent.id] = intent;
    await saveDb(db);

    return { ok: true, intent };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

export async function getPaymentIntentById(id: string): Promise<PaymentIntent | null> {
  const key = String(id || '').trim();
  if (!key) return null;
  const db = await loadDb();
  return db.intents[key] || null;
}

export async function revalidatePaymentIntentFromProvider(params: {
  paymentId: string;
}): Promise<{ ok: true; intent: PaymentIntent } | { ok: false; reason: string }> {
  try {
    const paymentId = String(params.paymentId || '').trim();
    if (!paymentId) return { ok: false, reason: 'Missing paymentId' };

    const db = await loadDb();
    const existing = db.intents[paymentId];
    if (!existing) return { ok: false, reason: 'Payment not found' };
    if (existing.status !== 'pending') return { ok: true, intent: existing };

    const providerPaymentId = String(existing.providerPaymentId || '').trim();
    if (!providerPaymentId) return { ok: true, intent: existing };

    if (existing.provider === 'pix' && paymentsPixProvider() === 'asaas' && asaasApiKey()) {
      const res = await asaasFetch(`/v3/payments/${encodeURIComponent(providerPaymentId)}`, { method: 'GET' });
      if (!res.ok) return { ok: true, intent: existing };
      const json = (await res.json().catch(() => null)) as any;
      const asaasStatusRaw = String(json?.status || '').trim().toUpperCase();
      const status: PaymentStatus =
        asaasStatusRaw === 'RECEIVED' || asaasStatusRaw === 'CONFIRMED'
          ? 'paid'
          : asaasStatusRaw === 'OVERDUE' || asaasStatusRaw === 'REFUNDED' || asaasStatusRaw === 'CHARGEBACK_REQUESTED'
            ? 'failed'
            : 'pending';

      if (status !== 'pending') {
        const updated = await updatePaymentIntentStatus({
          paymentId,
          status,
          provider: 'pix',
          providerPaymentId,
          lastUpdatedBy: 'status:asaas'
        });
        if (!updated.ok) return { ok: false, reason: updated.reason };
        return { ok: true, intent: updated.intent };
      }
    }

    return { ok: true, intent: existing };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

export async function updatePaymentIntentStatus(params: {
  paymentId: string;
  status: PaymentStatus;
  provider?: PaymentProvider;
  providerPaymentId?: string;
  paidAt?: string;
  sourceEventId?: string;
  lastUpdatedBy?: string;
}): Promise<{ ok: true; intent: PaymentIntent } | { ok: false; reason: string }> {
  try {
    const paymentId = String(params.paymentId || '').trim();
    if (!paymentId) return { ok: false, reason: 'Missing paymentId' };

    const statusRaw = String(params.status || '').trim().toLowerCase();
    const status: PaymentStatus =
      statusRaw === 'paid' || statusRaw === 'paid_confirmed'
        ? 'paid'
        : statusRaw === 'failed'
          ? 'failed'
          : 'pending';

    const db = await loadDb();
    const existing = db.intents[paymentId];
    if (!existing) return { ok: false, reason: 'Payment not found' };

    const wasPaid = existing.status === 'paid';
    if (!wasPaid && status === 'paid') {
      const activated = await activateBillingAccount(existing.tenantId);
      if (!activated.ok) return { ok: false, reason: `Billing activation failed: ${activated.reason}` };

      const startedAtMs = Date.now();
      const req = new Request('http://localhost/internal/payment_received', { method: 'POST' });
      await recordUsage({
        req,
        tenantId: existing.tenantId,
        op: 'payment_received',
        ok: true,
        httpStatus: 200,
        startedAtMs,
        valueEvent: 'payment_received',
        pilUnits: 1,
        finalPriceCents: existing.amountCents,
        currency: existing.currency,
        meta: {
          paymentId: existing.id,
          provider: params.provider || existing.provider,
          providerPaymentId: String(params.providerPaymentId || existing.providerPaymentId || '').trim() || undefined
        }
      });
    }

    const next: PaymentIntent = {
      ...existing,
      updatedAt: nowIso(),
      status,
      provider: params.provider || existing.provider,
      providerPaymentId: String(params.providerPaymentId || existing.providerPaymentId || '').trim() || existing.providerPaymentId
    };

    db.intents[paymentId] = next;
    await saveDb(db);

    if (!wasPaid && status === 'paid') {
      await import('./payment-proofs')
        .then(async (m) => {
          const proof = await m.ensurePaymentProofForIntent(next);
          if (!proof) return;

          await import('./settlement/store')
            .then((s) =>
              s.ensureSettlementForProof({
                proof,
                paidAt: String(params.paidAt || '').trim() || undefined,
                sourceEventId: String(params.sourceEventId || '').trim() || undefined,
                lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system'
              })
            )
            .catch((e) => {
              const message = e instanceof Error ? e.message : String(e);
              console.warn('[SETTLEMENT] ensure failed', { paymentId: next.id, proofId: proof.id, message });
            });

          await import('./customer-notify')
            .then((n) => n.notifyCustomerForPaidProof({ proofId: proof.id }))
            .catch((e) => {
              const message = e instanceof Error ? e.message : String(e);
              console.warn('[CUSTOMER_NOTIFY] failed', { paymentId: next.id, proofId: proof.id, message });
            });
        })
        .catch((e) => {
          const message = e instanceof Error ? e.message : String(e);
          console.warn('[PPO] ensure failed', { paymentId: next.id, provider: next.provider, providerPaymentId: next.providerPaymentId, message });
        });
    }
    return { ok: true, intent: next };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

export type NormalizedWebhookEvent = {
  paymentId: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  amountCents?: number;
  currency?: string;
  providerPaymentId?: string;
};
