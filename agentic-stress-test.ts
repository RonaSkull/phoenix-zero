import { createHmac, randomBytes } from 'node:crypto';

import { bytesToBase64Url, ed25519KeyPairFromPrivateKey, signPhoenixZeroPayload } from '@phoenix-zero/core';

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

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function newTaskId(): string {
  return `task_${b64Url(randomBytes(12))}`;
}

function newAgentSigningKey(): { privateKey: Uint8Array; publicKeyB64Url: string } {
  const priv = randomBytes(32);
  const kp = ed25519KeyPairFromPrivateKey(priv);
  return { privateKey: kp.privateKey, publicKeyB64Url: bytesToBase64Url(kp.publicKey) };
}

function makeSignedProofMeta(params: {
  tenantId: string;
  agentId: string;
  taskType: string;
  taskInputHash: string;
  taskOutputHash: string;
  key: { privateKey: Uint8Array; publicKeyB64Url: string };
}): {
  agentId: string;
  taskId: string;
  taskType: string;
  taskInputHash: string;
  taskOutputHash: string;
  agentEd25519PublicKeyB64Url: string;
  agentEd25519SignatureB64Url: string;
} {
  const taskId = newTaskId();
  const payload = {
    v: 1 as const,
    kind: 'ppo_meta' as const,
    tenantId: params.tenantId,
    agentId: params.agentId,
    taskId,
    taskType: params.taskType,
    taskInputHash: params.taskInputHash,
    taskOutputHash: params.taskOutputHash
  };
  const sig = signPhoenixZeroPayload({ payload, privateKey: params.key.privateKey });

  return {
    agentId: params.agentId,
    taskId,
    taskType: params.taskType,
    taskInputHash: params.taskInputHash,
    taskOutputHash: params.taskOutputHash,
    agentEd25519PublicKeyB64Url: params.key.publicKeyB64Url,
    agentEd25519SignatureB64Url: sig
  };
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
  proofMeta?: {
    agentId?: string;
    taskId?: string;
    taskType?: string;
    taskInputHash?: string;
    taskOutputHash?: string;
    agentEd25519PublicKeyB64Url?: string;
    agentEd25519SignatureB64Url?: string;
  };
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
      lineItems: params.lineItems,
      proofMeta: params.proofMeta
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

async function agentSettlements(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  limit?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/settlements`, params.baseUrl);
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    url.searchParams.set('limit', String(params.limit));
  }
  return httpJson(url.toString(), { method: 'GET', headers: { 'x-api-key': params.apiKey } });
}

async function agentBalance(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  limit?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/balance`, params.baseUrl);
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    url.searchParams.set('limit', String(params.limit));
  }
  return httpJson(url.toString(), { method: 'GET', headers: { 'x-api-key': params.apiKey } });
}

async function adminAdvanceSettlement(params: {
  baseUrl: string;
  adminToken: string;
  nowMs?: number;
  limit?: number;
}): Promise<HttpRes> {
  const url = new URL('/api/admin/settlement/advance', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({ nowMs: params.nowMs, limit: params.limit })
  });
}

async function adminRevertSettlement(params: {
  baseUrl: string;
  adminToken: string;
  proofId?: string;
  settlementId?: string;
  sourceEventId?: string;
}): Promise<HttpRes> {
  const url = new URL('/api/admin/settlement/revert', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({
      proofId: params.proofId,
      settlementId: params.settlementId,
      sourceEventId: params.sourceEventId
    })
  });
}

async function adminAntifraudEvent(params: {
  baseUrl: string;
  adminToken: string;
  source?: string;
  eventId?: string;
  proofId: string;
  decision: 'clear' | 'review' | 'blocked';
  reason?: string;
}): Promise<HttpRes> {
  const url = new URL('/api/admin/antifraud/event', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({
      source: params.source,
      eventId: params.eventId,
      proofId: params.proofId,
      decision: params.decision,
      reason: params.reason
    })
  });
}

async function adminCreateSlash(params: {
  baseUrl: string;
  adminToken: string;
  proofId: string;
  reason: 'invalid_signature' | 'replay_attack' | 'antifraud_block' | 'sla_violation' | 'ledger_inconsistency';
  penaltyCents?: number;
  idempotencyKey?: string;
  contestWindowMs?: number;
  sourceEventId?: string;
  nowMs?: number;
}): Promise<HttpRes> {
  const url = new URL('/api/admin/slashing/create', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({
      proofId: params.proofId,
      reason: params.reason,
      penaltyCents: params.penaltyCents,
      idempotencyKey: params.idempotencyKey,
      contestWindowMs: params.contestWindowMs,
      sourceEventId: params.sourceEventId,
      nowMs: params.nowMs
    })
  });
}

async function adminAdvanceSlashes(params: {
  baseUrl: string;
  adminToken: string;
  nowMs?: number;
  limit?: number;
}): Promise<HttpRes> {
  const url = new URL('/api/admin/slashing/advance', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({ nowMs: params.nowMs, limit: params.limit })
  });
}

async function agentSlashes(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  limit?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/slashing`, params.baseUrl);
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    url.searchParams.set('limit', String(params.limit));
  }
  return httpJson(url.toString(), { method: 'GET', headers: { 'x-api-key': params.apiKey } });
}

async function agentContestSlash(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  slashId: string;
  contestProofId?: string;
  sourceEventId?: string;
  nowMs?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/slashing/contest`, params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': params.apiKey },
    body: JSON.stringify({
      slashId: params.slashId,
      contestProofId: params.contestProofId,
      sourceEventId: params.sourceEventId,
      nowMs: params.nowMs
    })
  });
}

async function agentEscrowCreate(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  payeeAgentId: string;
  currency: string;
  amountCents: number;
  memo?: string;
  idempotencyKey?: string;
  ttlMs?: number;
  sourceEventId?: string;
  nowMs?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/escrow/create`, params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': params.apiKey },
    body: JSON.stringify({
      payeeAgentId: params.payeeAgentId,
      currency: params.currency,
      amountCents: params.amountCents,
      memo: params.memo,
      idempotencyKey: params.idempotencyKey,
      ttlMs: params.ttlMs,
      sourceEventId: params.sourceEventId,
      nowMs: params.nowMs
    })
  });
}

async function agentEscrowRelease(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  escrowId: string;
  sourceEventId?: string;
  nowMs?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/escrow/release`, params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': params.apiKey },
    body: JSON.stringify({
      escrowId: params.escrowId,
      sourceEventId: params.sourceEventId,
      nowMs: params.nowMs
    })
  });
}

async function agentEscrowRefund(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  escrowId: string;
  sourceEventId?: string;
  nowMs?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/escrow/refund`, params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': params.apiKey },
    body: JSON.stringify({
      escrowId: params.escrowId,
      sourceEventId: params.sourceEventId,
      nowMs: params.nowMs
    })
  });
}

async function adminAdvanceEscrows(params: {
  baseUrl: string;
  adminToken: string;
  nowMs?: number;
  limit?: number;
}): Promise<HttpRes> {
  const url = new URL('/api/admin/escrow/advance', params.baseUrl).toString();
  return httpJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...withAdminHeader(params.adminToken)
    },
    body: JSON.stringify({ nowMs: params.nowMs, limit: params.limit })
  });
}

async function agentReputation(params: {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  limit?: number;
}): Promise<HttpRes> {
  const url = new URL(`/api/agents/${encodeURIComponent(params.agentId)}/reputation`, params.baseUrl);
  if (typeof params.limit === 'number' && Number.isFinite(params.limit)) {
    url.searchParams.set('limit', String(params.limit));
  }
  return httpJson(url.toString(), { method: 'GET', headers: { 'x-api-key': params.apiKey } });
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
    console.log('Error:', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

async function main() {
  const baseUrl = env('PHOENIX_ZERO_BASE_URL', 'http://localhost:3000').replace(/\/+$/g, '');
  const adminToken = env('PHOENIX_ZERO_ADMIN_TOKEN');

  const realMode = env('AGENTIC_STRESS_REAL') === '1' || env('AGENTIC_STRESS_REAL').toLowerCase() === 'true';
  const realProvider = (env('AGENTIC_STRESS_REAL_PROVIDER', 'pix') || 'pix').toLowerCase();
  const waitSecondsRaw = Number(env('AGENTIC_STRESS_WAIT_SECONDS', '900') || '900');
  const waitSeconds = Number.isFinite(waitSecondsRaw) ? waitSecondsRaw : 900;

  const asaasApiKey = env('ASAAS_API_KEY');
  const nowPaymentsApiKey = env('NOWPAYMENTS_API_KEY');
  void nowPaymentsApiKey;

  const asaasSecret = env('ASAAS_WEBHOOK_SECRET');
  const nowIpnSecret = env('NOWPAYMENTS_IPN_SECRET');

  const proofMeta = {
    agentId: 'agent://agentic-stress-test-v1',
    taskType: 'payment_smoke',
    taskInputHash: 'sha256:stress_input_v1',
    taskOutputHash: 'sha256:stress_output_v1'
  };

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
        proofMeta,
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
      proofMeta,
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
      proofMeta,
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
      proofMeta,
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

    assert(unknown.status === 200, `expected 200 for unknown mapping, got ${unknown.status}: ${unknown.text}`);
    assert((unknown.json as any)?.ignored === true, `expected ignored=true for unknown mapping, got: ${unknown.text}`);
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

  // Level 6 — Payment Proof Object (PPO)
  await run('L6: payment proofs (PPO) are created and queryable', async () => {
    const t = await createTenant({ baseUrl, adminToken, name: `stress-l6-${Date.now()}` });
    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st0 = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st0.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_ppo_1`,
      status: 'CONFIRMED'
    });

    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const url = new URL(`/api/agents/${encodeURIComponent(proofMeta.agentId)}/proofs`, baseUrl);
    const res = await httpJson(url.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(res.status === 200, `agents proofs failed (${res.status}): ${res.text}`);
    assert(res.json && (res.json as any).ok === true, `agents proofs not ok: ${res.text}`);
    const proofs = (res.json as any).proofs as any[];
    assert(Array.isArray(proofs) && proofs.length >= 1, `expected >=1 proof, got: ${res.text}`);

    const ledgerUrl = new URL(`/api/agents/${encodeURIComponent(proofMeta.agentId)}/ledger`, baseUrl);
    const ledgerRes = await httpJson(ledgerUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(ledgerRes.status === 200, `agents ledger failed (${ledgerRes.status}): ${ledgerRes.text}`);
    assert(ledgerRes.json && (ledgerRes.json as any).ok === true, `agents ledger not ok: ${ledgerRes.text}`);
    assert(
      Number((ledgerRes.json as any)?.ledger?.totalProofs || 0) >= 1,
      `expected ledger.totalProofs >= 1, got: ${ledgerRes.text}`
    );
    assert(
      Number((ledgerRes.json as any)?.ledger?.paidProofs || 0) >= 1,
      `expected ledger.paidProofs >= 1, got: ${ledgerRes.text}`
    );
  });

  // Level 7 — Signed PPO + Gate
  await run('L7: signed PPO is verified and gate allows execution for taskId', async () => {
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic signed PPO tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l7-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l7';
    const signedMeta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l7_sanity',
      taskInputHash: 'sha256:l7_input',
      taskOutputHash: 'sha256:l7_output',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: signedMeta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st0 = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st0.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l7_1`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const p = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(p, `expected proof in response, got: ${proofsRes.text}`);
    assert(String(p.taskId || '') === signedMeta.taskId, `expected PPO.taskId to match, got: ${JSON.stringify(p)}`);
    assert(
      String(p.agentEd25519PublicKeyB64Url || '') === signedMeta.agentEd25519PublicKeyB64Url,
      `expected PPO agentEd25519PublicKeyB64Url to match, got: ${JSON.stringify(p)}`
    );
    assert(p.agentEd25519SignatureVerified === true, `expected agentEd25519SignatureVerified=true, got: ${JSON.stringify(p)}`);

    const gateUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/gate`, baseUrl);
    gateUrl.searchParams.set('taskId', signedMeta.taskId);
    gateUrl.searchParams.set('requireSignature', '1');
    const gateRes = await httpJson(gateUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(gateRes.status === 200, `gate failed (${gateRes.status}): ${gateRes.text}`);
    assert((gateRes.json as any)?.allowed === true, `expected allowed=true, got: ${gateRes.text}`);

    const ledgerUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/ledger`, baseUrl);
    const ledgerRes = await httpJson(ledgerUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(ledgerRes.status === 200, `agents ledger failed (${ledgerRes.status}): ${ledgerRes.text}`);
    assert((ledgerRes.json as any)?.ledger?.rootHashB64Url, `expected ledger.rootHashB64Url, got: ${ledgerRes.text}`);
  });

  // Level 8 — Cross-tenant read isolation (proofId must not leak)
  await run('L8: PPO is not readable by another tenant', async () => {
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic signed PPO tests');
    }

    const tA = await createTenant({ baseUrl, adminToken, name: `stress-l8a-${Date.now()}` });
    const tB = await createTenant({ baseUrl, adminToken, name: `stress-l8b-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l8';
    const signedMeta = makeSignedProofMeta({
      tenantId: tA.tenantId,
      agentId,
      taskType: 'l8_cross',
      taskInputHash: 'sha256:l8_input',
      taskOutputHash: 'sha256:l8_output',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: tA.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: signedMeta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });
    const st0 = await checkoutStatus({ baseUrl, apiKey: tA.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st0.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l8_1`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': tA.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const p = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(p?.id, `expected proof with id, got: ${proofsRes.text}`);

    const byIdUrl = new URL(`/api/payment-proofs/${encodeURIComponent(String(p.id))}`, baseUrl);
    const byIdAsOther = await httpJson(byIdUrl.toString(), { method: 'GET', headers: { 'x-api-key': tB.apiKey } });
    assert(byIdAsOther.status === 404, `expected 404 for other tenant, got ${byIdAsOther.status}: ${byIdAsOther.text}`);
  });

  // Level 9 — Multi-agent isolation
  await run('L9: multiple agents produce isolated ledgers and root hashes', async () => {
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic signed PPO tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l9-${Date.now()}` });
    const keyA = newAgentSigningKey();
    const keyB = newAgentSigningKey();

    const agentA = 'agent://agentic-l9-a';
    const agentB = 'agent://agentic-l9-b';

    const metaA = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId: agentA,
      taskType: 'l9_task_a',
      taskInputHash: 'sha256:l9a_in',
      taskOutputHash: 'sha256:l9a_out',
      key: keyA
    });
    const metaB = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId: agentB,
      taskType: 'l9_task_b',
      taskInputHash: 'sha256:l9b_in',
      taskOutputHash: 'sha256:l9b_out',
      key: keyB
    });

    const createdA = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: metaA,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });
    const createdB = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: metaB,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const stA = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: createdA.paymentId });
    const stB = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: createdB.paymentId });
    const ppidA = String(stA.providerPaymentId || '').trim();
    const ppidB = String(stB.providerPaymentId || '').trim();
    assert(ppidA && ppidB, 'missing providerPaymentId(s)');

    const whA = await pixWebhook({
      baseUrl,
      providerPaymentId: ppidA,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${createdA.paymentId}_l9_a`,
      status: 'CONFIRMED'
    });
    const whB = await pixWebhook({
      baseUrl,
      providerPaymentId: ppidB,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${createdB.paymentId}_l9_b`,
      status: 'CONFIRMED'
    });
    if (whA.status === 401 || whB.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(whA.status === 200 && whB.status === 200, `pix webhook failed: A=${whA.status} B=${whB.status}`);

    const ledgerAUrl = new URL(`/api/agents/${encodeURIComponent(agentA)}/ledger`, baseUrl);
    const ledgerBUrl = new URL(`/api/agents/${encodeURIComponent(agentB)}/ledger`, baseUrl);
    const ledgerARes = await httpJson(ledgerAUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    const ledgerBRes = await httpJson(ledgerBUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(ledgerARes.status === 200 && ledgerBRes.status === 200, `ledger fetch failed: A=${ledgerARes.status} B=${ledgerBRes.status}`);

    const rootA = String((ledgerARes.json as any)?.ledger?.rootHashB64Url || '');
    const rootB = String((ledgerBRes.json as any)?.ledger?.rootHashB64Url || '');
    assert(rootA && rootB, 'missing root hashes');
    assert(rootA !== rootB, 'expected different root hashes for different agents');

    const gateA = new URL(`/api/agents/${encodeURIComponent(agentA)}/gate`, baseUrl);
    gateA.searchParams.set('taskId', metaA.taskId);
    gateA.searchParams.set('requireSignature', '1');
    const gateB = new URL(`/api/agents/${encodeURIComponent(agentB)}/gate`, baseUrl);
    gateB.searchParams.set('taskId', metaB.taskId);
    gateB.searchParams.set('requireSignature', '1');

    const gateARes = await httpJson(gateA.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    const gateBRes = await httpJson(gateB.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert((gateARes.json as any)?.allowed === true, `expected gate allowed for agent A, got: ${gateARes.text}`);
    assert((gateBRes.json as any)?.allowed === true, `expected gate allowed for agent B, got: ${gateBRes.text}`);
  });

  // Level 10 — Adversarial (replay scope + invalid signature)
  await run('L10: replay and invalid signature are blocked by gate', async () => {
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic signed PPO tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l10-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l10';

    // Valid signed PPO
    const goodMeta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l10_good',
      taskInputHash: 'sha256:l10_in',
      taskOutputHash: 'sha256:l10_out',
      key
    });

    const createdGood = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: goodMeta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });
    const stGood = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: createdGood.paymentId });
    const ppidGood = String(stGood.providerPaymentId || '').trim();
    assert(ppidGood, 'missing providerPaymentId');

    const whGood = await pixWebhook({
      baseUrl,
      providerPaymentId: ppidGood,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${createdGood.paymentId}_l10_good`,
      status: 'CONFIRMED'
    });
    if (whGood.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(whGood.status === 200, `pix webhook failed (${whGood.status}): ${whGood.text}`);

    // Replay attempt: wrong taskId should not pass gate
    const gateReplay = new URL(`/api/agents/${encodeURIComponent(agentId)}/gate`, baseUrl);
    gateReplay.searchParams.set('taskId', `task_replay_${Date.now()}`);
    gateReplay.searchParams.set('requireSignature', '1');
    const replayRes = await httpJson(gateReplay.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(replayRes.status === 200, `gate replay failed (${replayRes.status}): ${replayRes.text}`);
    assert((replayRes.json as any)?.allowed === false, `expected allowed=false for replay, got: ${replayRes.text}`);

    // Invalid signature PPO should be blocked
    const badMeta = {
      ...makeSignedProofMeta({
        tenantId: t.tenantId,
        agentId,
        taskType: 'l10_bad_sig',
        taskInputHash: 'sha256:l10_bad_in',
        taskOutputHash: 'sha256:l10_bad_out',
        key
      }),
      agentEd25519SignatureB64Url: `tampered_${Date.now()}`
    };

    const createdBad = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: badMeta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });
    const stBad = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: createdBad.paymentId });
    const ppidBad = String(stBad.providerPaymentId || '').trim();
    assert(ppidBad, 'missing providerPaymentId');

    const whBad = await pixWebhook({
      baseUrl,
      providerPaymentId: ppidBad,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${createdBad.paymentId}_l10_bad`,
      status: 'CONFIRMED'
    });
    assert(whBad.status === 200, `pix webhook failed (${whBad.status}): ${whBad.text}`);

    const gateBad = new URL(`/api/agents/${encodeURIComponent(agentId)}/gate`, baseUrl);
    gateBad.searchParams.set('taskId', String((badMeta as any).taskId));
    gateBad.searchParams.set('requireSignature', '1');
    const gateBadRes = await httpJson(gateBad.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert((gateBadRes.json as any)?.allowed === false, `expected allowed=false for invalid sig, got: ${gateBadRes.text}`);
  });

  // Level 11 — Enforcement: execution must be blocked without PPO
  await run('L11: execution is blocked without PPO', async () => {
    const t = await createTenant({ baseUrl, adminToken, name: `stress-l11-${Date.now()}` });
    const agentId = 'agent://agentic-l11';
    const taskId = newTaskId();

    const url = new URL(`/api/agents/${encodeURIComponent(agentId)}/execute`, baseUrl);
    const res = await httpJson(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': t.apiKey },
      body: JSON.stringify({ taskId, taskType: 'l11_execute', requireSignature: true })
    });

    assert(res.status === 403, `expected 403 when no PPO exists, got ${res.status}: ${res.text}`);
    assert((res.json as any)?.reason === 'PPO_GATE_BLOCKED', `expected PPO_GATE_BLOCKED, got: ${res.text}`);
  });

  // Level 12 — Enforcement: wrong taskId blocked; correct taskId allowed
  await run('L12: execution requires matching PPO (taskId + signature)', async () => {
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic signed PPO tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l12-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l12';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l12_execute',
      taskInputHash: 'sha256:l12_in',
      taskOutputHash: 'sha256:l12_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const ppid = String(st.providerPaymentId || '').trim();
    assert(ppid, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId: ppid,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l12`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    // Wrong taskId must be blocked
    const urlWrong = new URL(`/api/agents/${encodeURIComponent(agentId)}/execute`, baseUrl);
    const wrong = await httpJson(urlWrong.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': t.apiKey },
      body: JSON.stringify({ taskId: newTaskId(), taskType: 'l12_execute', requireSignature: true })
    });
    assert(wrong.status === 403, `expected 403 for wrong taskId, got ${wrong.status}: ${wrong.text}`);

    // Correct taskId must be allowed
    const urlOk = new URL(`/api/agents/${encodeURIComponent(agentId)}/execute`, baseUrl);
    const ok = await httpJson(urlOk.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'x-api-key': t.apiKey },
      body: JSON.stringify({ taskId: String((meta as any).taskId), taskType: 'l12_execute', requireSignature: true })
    });
    assert(ok.status === 200, `expected 200 for correct taskId, got ${ok.status}: ${ok.text}`);
    assert((ok.json as any)?.executed === true, `expected executed=true, got: ${ok.text}`);
  });

  await run('L13: settlement is created on paid and becomes available after advance (pix)', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for /api/admin/settlement/advance)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic settlement tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l13-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l13';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l13_settlement',
      taskInputHash: 'sha256:l13_in',
      taskOutputHash: 'sha256:l13_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const eventId = `evt_${created.paymentId}_l13_1`;
    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    assert(s0.status === 200, `settlements list failed (${s0.status}): ${s0.text}`);
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);
    assert(String(set0.status) === 'pending', `expected pending settlement, got: ${JSON.stringify(set0)}`);
    assert(String(set0.sourceEventId || '') === eventId, `expected sourceEventId=${eventId}, got: ${JSON.stringify(set0)}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);

    const adv = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1 });
    assert(adv.status === 200, `admin advance failed (${adv.status}): ${adv.text}`);

    const s1 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    assert(s1.status === 200, `settlements list failed (${s1.status}): ${s1.text}`);
    const settlements1 = ((s1.json as any)?.settlements || []) as any[];
    const set1 = settlements1.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(String(set1?.status) === 'settled', `expected settled, got: ${JSON.stringify(set1)}`);

    const b1 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId });
    assert(b1.status === 200, `balance failed (${b1.status}): ${b1.text}`);
    const balances = ((b1.json as any)?.balances || []) as any[];
    const brl = balances.find((x) => String(x?.currency || '').trim() === 'BRL');
    const amt = typeof created.amountCents === 'number' ? created.amountCents : undefined;
    assert(typeof amt === 'number', `missing amountCents in checkoutCreate response: ${JSON.stringify(created)}`);
    assert(Number(brl?.availableCents || 0) === amt, `expected availableCents=${amt}, got: ${JSON.stringify(balances)}`);
  });

  await run('L14: card settlement stays pending until risk window ends, then advances', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for /api/admin/settlement/advance)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic settlement tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l14-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l14';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l14_card',
      taskInputHash: 'sha256:l14_in',
      taskOutputHash: 'sha256:l14_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'card',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const stripeUrl = new URL('/api/webhooks/stripe', baseUrl).toString();
    const stripeRes = await httpJson(stripeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ paymentId: created.paymentId, providerPaymentId, status: 'paid' })
    });
    assert(stripeRes.status === 200, `stripe webhook failed (${stripeRes.status}): ${stripeRes.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    assert(s0.status === 200, `settlements list failed (${s0.status}): ${s0.text}`);
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);
    assert(String(set0.provider) === 'card', `expected provider=card, got: ${JSON.stringify(set0)}`);
    assert(String(set0.status) === 'pending', `expected pending settlement, got: ${JSON.stringify(set0)}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);

    const advEarly = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs - 1000 });
    assert(advEarly.status === 200, `admin advance (early) failed (${advEarly.status}): ${advEarly.text}`);

    const s1 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements1 = ((s1.json as any)?.settlements || []) as any[];
    const set1 = settlements1.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(String(set1?.status) === 'pending', `expected still pending, got: ${JSON.stringify(set1)}`);

    const advLate = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1000 });
    assert(advLate.status === 200, `admin advance (late) failed (${advLate.status}): ${advLate.text}`);

    const s2 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements2 = ((s2.json as any)?.settlements || []) as any[];
    const set2 = settlements2.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(String(set2?.status) === 'settled', `expected settled after risk window, got: ${JSON.stringify(set2)}`);
  });

  await run('L15: reverted settlement is excluded from available balance', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for /api/admin/settlement/*)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic settlement tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l15-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l15';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l15_revert',
      taskInputHash: 'sha256:l15_in',
      taskOutputHash: 'sha256:l15_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l15_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);
    const adv = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1 });
    assert(adv.status === 200, `admin advance failed (${adv.status}): ${adv.text}`);

    const b0 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId });
    assert(b0.status === 200, `balance failed (${b0.status}): ${b0.text}`);
    const balances0 = ((b0.json as any)?.balances || []) as any[];
    const brl0 = balances0.find((x) => String(x?.currency || '').trim() === 'BRL');
    const amt = typeof created.amountCents === 'number' ? created.amountCents : undefined;
    assert(typeof amt === 'number', `missing amountCents in checkoutCreate response: ${JSON.stringify(created)}`);
    assert(Number(brl0?.availableCents || 0) === amt, `expected availableCents=${amt} before revert, got: ${JSON.stringify(balances0)}`);

    const revertEventId = `evt_${created.paymentId}_l15_revert`;
    const rev = await adminRevertSettlement({ baseUrl, adminToken, settlementId: String(set0.settlementId), sourceEventId: revertEventId });
    assert(rev.status === 200, `admin revert failed (${rev.status}): ${rev.text}`);

    const s1 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements1 = ((s1.json as any)?.settlements || []) as any[];
    const set1 = settlements1.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(String(set1?.status) === 'reverted', `expected reverted, got: ${JSON.stringify(set1)}`);

    const b1 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId });
    assert(b1.status === 200, `balance failed (${b1.status}): ${b1.text}`);
    const balances1 = ((b1.json as any)?.balances || []) as any[];
    const brl1 = balances1.find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl1?.availableCents || 0) === 0, `expected availableCents=0 after revert, got: ${JSON.stringify(balances1)}`);
    assert(Number(brl1?.revertedCents || 0) === amt, `expected revertedCents=${amt} after revert, got: ${JSON.stringify(balances1)}`);
  });

  await run('L16: settlement creation is idempotent against webhook replay', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin tenant creation)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic settlement tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l16-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l16';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l16_idempotency',
      taskInputHash: 'sha256:l16_in',
      taskOutputHash: 'sha256:l16_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const eventId1 = `evt_${created.paymentId}_l16_1`;
    const wh1 = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: eventId1,
      status: 'CONFIRMED'
    });
    if (wh1.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh1.status === 200, `pix webhook failed (${wh1.status}): ${wh1.text}`);

    const eventId2 = `evt_${created.paymentId}_l16_2`;
    const wh2 = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: eventId2,
      status: 'CONFIRMED'
    });
    assert(wh2.status === 200, `pix webhook replay failed (${wh2.status}): ${wh2.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    assert(s0.status === 200, `settlements list failed (${s0.status}): ${s0.text}`);
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const matches = settlements0.filter((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(matches.length === 1, `expected exactly 1 settlement for providerPaymentId, got ${matches.length}: ${JSON.stringify(matches)}`);
    assert(String(matches[0]?.sourceEventId || '') === eventId1, `expected sourceEventId=${eventId1}, got: ${JSON.stringify(matches[0])}`);
  });

  await run('L17: antifraud blocked prevents settlement (blocked status)', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin tenant creation)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic antifraud tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l17-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l17';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l17_antifraud',
      taskInputHash: 'sha256:l17_in',
      taskOutputHash: 'sha256:l17_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l17_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const proof = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(proof?.id, `expected proof with id, got: ${proofsRes.text}`);

    const af = await adminAntifraudEvent({
      baseUrl,
      adminToken,
      source: 'stress',
      eventId: `af_${proof.id}_l17_blocked`,
      proofId: String(proof.id),
      decision: 'blocked',
      reason: 'stress_test'
    });
    assert(af.status === 200, `antifraud event failed (${af.status}): ${af.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    assert(s0.status === 200, `settlements list failed (${s0.status}): ${s0.text}`);
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);
    const adv = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1000 });
    assert(adv.status === 200, `admin advance failed (${adv.status}): ${adv.text}`);

    const s1 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements1 = ((s1.json as any)?.settlements || []) as any[];
    const set1 = settlements1.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(String(set1?.status) === 'blocked', `expected blocked status, got: ${JSON.stringify(set1)}`);
  });

  await run('L18: antifraud replay is idempotent', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin tenant creation)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic antifraud tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l18-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l18';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l18_antifraud',
      taskInputHash: 'sha256:l18_in',
      taskOutputHash: 'sha256:l18_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l18_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const proof = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(proof?.id, `expected proof with id, got: ${proofsRes.text}`);

    const eventId = `af_${proof.id}_l18_blocked`;
    const af1 = await adminAntifraudEvent({
      baseUrl,
      adminToken,
      source: 'stress',
      eventId,
      proofId: String(proof.id),
      decision: 'blocked',
      reason: 'stress_test'
    });
    assert(af1.status === 200, `antifraud event failed (${af1.status}): ${af1.text}`);

    const af2 = await adminAntifraudEvent({
      baseUrl,
      adminToken,
      source: 'stress',
      eventId,
      proofId: String(proof.id),
      decision: 'blocked',
      reason: 'stress_test'
    });
    assert(af2.status === 200, `antifraud replay failed (${af2.status}): ${af2.text}`);
    assert((af2.json as any)?.deduped === true, `expected deduped=true on replay, got: ${af2.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    assert(s0.status === 200, `settlements list failed (${s0.status}): ${s0.text}`);
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const matches = settlements0.filter((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(matches.length === 1, `expected exactly 1 settlement, got ${matches.length}: ${JSON.stringify(matches)}`);
    assert(String(matches[0]?.antifraudDecision || '') === 'blocked', `expected antifraudDecision=blocked, got: ${JSON.stringify(matches[0])}`);
  });

  await run('L19: antifraud review then clear settles', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin tenant creation)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic antifraud tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l19-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l19';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l19_antifraud',
      taskInputHash: 'sha256:l19_in',
      taskOutputHash: 'sha256:l19_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l19_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const proof = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(proof?.id, `expected proof with id, got: ${proofsRes.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    assert(s0.status === 200, `settlements list failed (${s0.status}): ${s0.text}`);
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);

    const afReview = await adminAntifraudEvent({
      baseUrl,
      adminToken,
      source: 'stress',
      eventId: `af_${proof.id}_l19_review`,
      proofId: String(proof.id),
      decision: 'review',
      reason: 'stress_test'
    });
    assert(afReview.status === 200, `antifraud review failed (${afReview.status}): ${afReview.text}`);

    const adv1 = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 5000 });
    assert(adv1.status === 200, `admin advance failed (${adv1.status}): ${adv1.text}`);

    const s1 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements1 = ((s1.json as any)?.settlements || []) as any[];
    const set1 = settlements1.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(String(set1?.status) === 'pending', `expected pending under review, got: ${JSON.stringify(set1)}`);

    const afClear = await adminAntifraudEvent({
      baseUrl,
      adminToken,
      source: 'stress',
      eventId: `af_${proof.id}_l19_clear`,
      proofId: String(proof.id),
      decision: 'clear',
      reason: 'stress_test'
    });
    assert(afClear.status === 200, `antifraud clear failed (${afClear.status}): ${afClear.text}`);

    const adv2 = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 5000 });
    assert(adv2.status === 200, `admin advance failed (${adv2.status}): ${adv2.text}`);

    const s2 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements2 = ((s2.json as any)?.settlements || []) as any[];
    const set2 = settlements2.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(String(set2?.status) === 'settled', `expected settled after clear, got: ${JSON.stringify(set2)}`);
  });

  await run('L20: slashing create is idempotent (idempotencyKey) + affects balance', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin slashing)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic slashing tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l20a-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l20a';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l20_slash_idempotent',
      taskInputHash: 'sha256:l20a_in',
      taskOutputHash: 'sha256:l20a_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l20a_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const proof = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(proof?.id, `expected proof with id, got: ${proofsRes.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId });
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);
    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);
    const advSet = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1 });
    assert(advSet.status === 200, `admin advance failed (${advSet.status}): ${advSet.text}`);

    const amt = typeof created.amountCents === 'number' ? created.amountCents : undefined;
    assert(typeof amt === 'number', `missing amountCents in checkoutCreate response: ${JSON.stringify(created)}`);

    const b0 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId });
    assert(b0.status === 200, `balance failed (${b0.status}): ${b0.text}`);
    const brl0 = (((b0.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl0?.availableCents || 0) === amt, `expected availableCents=${amt}, got: ${JSON.stringify(brl0)}`);

    const penaltyCents = Math.max(1, Math.trunc(amt / 2));
    const idk = `idk_${String(proof.id)}_l20a`;
    const c1 = await adminCreateSlash({
      baseUrl,
      adminToken,
      proofId: String(proof.id),
      reason: 'sla_violation',
      penaltyCents,
      idempotencyKey: idk,
      contestWindowMs: 60_000,
      sourceEventId: `evt_${created.paymentId}_l20a_slash_1`
    });
    assert(c1.status === 200, `slash create failed (${c1.status}): ${c1.text}`);
    const slash1 = (c1.json as any)?.slash;
    assert(slash1?.slashId, `missing slash in response: ${c1.text}`);

    const c2 = await adminCreateSlash({
      baseUrl,
      adminToken,
      proofId: String(proof.id),
      reason: 'sla_violation',
      penaltyCents,
      idempotencyKey: idk,
      contestWindowMs: 60_000,
      sourceEventId: `evt_${created.paymentId}_l20a_slash_2`
    });
    assert(c2.status === 200, `slash create replay failed (${c2.status}): ${c2.text}`);
    const slash2 = (c2.json as any)?.slash;
    assert(String(slash2?.slashId || '') === String(slash1?.slashId || ''), `expected same slashId on replay, got: ${c2.text}`);

    const b1 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId });
    assert(b1.status === 200, `balance failed (${b1.status}): ${b1.text}`);
    const brl1 = (((b1.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl1?.heldCents || 0) >= penaltyCents, `expected heldCents>=${penaltyCents}, got: ${JSON.stringify(brl1)}`);
    assert(Number(brl1?.availableCents || 0) === amt - penaltyCents, `expected availableCents=${amt - penaltyCents}, got: ${JSON.stringify(brl1)}`);
  });

  await run('L20: slashing pending -> confirmed after contestation window', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin slashing)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic slashing tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l20b-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l20b';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l20_slash_confirm',
      taskInputHash: 'sha256:l20b_in',
      taskOutputHash: 'sha256:l20b_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l20b_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const proof = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(proof?.id, `expected proof with id, got: ${proofsRes.text}`);

    const startMs = Date.now();
    const contestWindowMs = 1500;

    const c1 = await adminCreateSlash({
      baseUrl,
      adminToken,
      proofId: String(proof.id),
      reason: 'sla_violation',
      penaltyCents: 123,
      idempotencyKey: `idk_${String(proof.id)}_l20b`,
      contestWindowMs,
      nowMs: startMs,
      sourceEventId: `evt_${created.paymentId}_l20b_slash_1`
    });
    assert(c1.status === 200, `slash create failed (${c1.status}): ${c1.text}`);
    const slash1 = (c1.json as any)?.slash;
    assert(String(slash1?.status || '') === 'pending', `expected pending slash, got: ${c1.text}`);
    const pendingUntilAt = String(slash1?.pendingUntilAt || '');
    const untilMs = Date.parse(pendingUntilAt);
    assert(Number.isFinite(untilMs), `invalid pendingUntilAt: ${c1.text}`);

    const adv = await adminAdvanceSlashes({ baseUrl, adminToken, nowMs: startMs + contestWindowMs + 1 });
    assert(adv.status === 200, `slash advance failed (${adv.status}): ${adv.text}`);

    const list = await agentSlashes({ baseUrl, apiKey: t.apiKey, agentId });
    assert(list.status === 200, `agent slashes list failed (${list.status}): ${list.text}`);
    const slashes = ((list.json as any)?.slashes || []) as any[];
    const got = slashes.find((x) => String(x?.slashId || '') === String(slash1?.slashId || ''));
    assert(String(got?.status || '') === 'confirmed', `expected confirmed after advance, got: ${JSON.stringify(got)}`);
  });

  await run('L20: slashing can be contested within window (pending -> canceled)', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin slashing)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic slashing tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l20c-${Date.now()}` });
    const key = newAgentSigningKey();
    const agentId = 'agent://agentic-l20c';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId,
      taskType: 'l20_slash_contest',
      taskInputHash: 'sha256:l20c_in',
      taskOutputHash: 'sha256:l20c_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l20c_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const proofsUrl = new URL(`/api/agents/${encodeURIComponent(agentId)}/proofs`, baseUrl);
    const proofsRes = await httpJson(proofsUrl.toString(), { method: 'GET', headers: { 'x-api-key': t.apiKey } });
    assert(proofsRes.status === 200, `agents proofs failed (${proofsRes.status}): ${proofsRes.text}`);
    const proofs = ((proofsRes.json as any)?.proofs || []) as any[];
    const proof = proofs.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId) || proofs[0];
    assert(proof?.id, `expected proof with id, got: ${proofsRes.text}`);

    const startMs = Date.now();

    const c1 = await adminCreateSlash({
      baseUrl,
      adminToken,
      proofId: String(proof.id),
      reason: 'sla_violation',
      penaltyCents: 321,
      idempotencyKey: `idk_${String(proof.id)}_l20c`,
      contestWindowMs: 60_000,
      nowMs: startMs,
      sourceEventId: `evt_${created.paymentId}_l20c_slash_1`
    });
    assert(c1.status === 200, `slash create failed (${c1.status}): ${c1.text}`);
    const slash1 = (c1.json as any)?.slash;
    assert(slash1?.slashId, `missing slashId: ${c1.text}`);

    const contest = await agentContestSlash({
      baseUrl,
      apiKey: t.apiKey,
      agentId,
      slashId: String(slash1.slashId),
      contestProofId: String(proof.id),
      sourceEventId: `evt_${created.paymentId}_l20c_contest_1`,
      nowMs: startMs + 1000
    });
    assert(contest.status === 200, `slash contest failed (${contest.status}): ${contest.text}`);
    const slash2 = (contest.json as any)?.slash;
    assert(String(slash2?.status || '') === 'canceled', `expected canceled, got: ${contest.text}`);
  });

  await run('L21: escrow held then released transfers balance (payer -> payee)', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin tenant creation)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic escrow tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l21a-${Date.now()}` });
    const key = newAgentSigningKey();
    const payerAgentId = 'agent://agentic-l21a-payer';
    const payeeAgentId = 'agent://agentic-l21a-payee';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId: payerAgentId,
      taskType: 'l21_escrow_release',
      taskInputHash: 'sha256:l21a_in',
      taskOutputHash: 'sha256:l21a_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l21a_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);

    const advSet = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1 });
    assert(advSet.status === 200, `admin advance failed (${advSet.status}): ${advSet.text}`);

    const amt = typeof created.amountCents === 'number' ? created.amountCents : undefined;
    assert(typeof amt === 'number', `missing amountCents in checkoutCreate response: ${JSON.stringify(created)}`);
    const escrowAmt = Math.max(1, Math.trunc(amt / 2));

    const b0 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(b0.status === 200, `balance failed (${b0.status}): ${b0.text}`);
    const brl0 = (((b0.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl0?.availableCents || 0) === amt, `expected payer availableCents=${amt}, got: ${JSON.stringify(brl0)}`);

    const c1 = await agentEscrowCreate({
      baseUrl,
      apiKey: t.apiKey,
      agentId: payerAgentId,
      payeeAgentId,
      currency: 'BRL',
      amountCents: escrowAmt,
      idempotencyKey: `idk_${created.paymentId}_l21a`,
      sourceEventId: `evt_${created.paymentId}_l21a_escrow_create`
    });
    assert(c1.status === 200, `escrow create failed (${c1.status}): ${c1.text}`);
    const escrow = (c1.json as any)?.escrow;
    assert(escrow?.escrowId, `missing escrow in response: ${c1.text}`);
    assert(String(escrow?.status || '') === 'held', `expected held escrow, got: ${c1.text}`);

    const b1 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(b1.status === 200, `balance failed (${b1.status}): ${b1.text}`);
    const brl1 = (((b1.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl1?.availableCents || 0) === amt - escrowAmt, `expected payer available=${amt - escrowAmt}, got: ${JSON.stringify(brl1)}`);
    assert(Number(brl1?.heldCents || 0) >= escrowAmt, `expected payer held>=${escrowAmt}, got: ${JSON.stringify(brl1)}`);

    const payee0 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId: payeeAgentId });
    assert(payee0.status === 200, `payee balance failed (${payee0.status}): ${payee0.text}`);

    const rel = await agentEscrowRelease({
      baseUrl,
      apiKey: t.apiKey,
      agentId: payerAgentId,
      escrowId: String(escrow.escrowId),
      sourceEventId: `evt_${created.paymentId}_l21a_escrow_release`
    });
    assert(rel.status === 200, `escrow release failed (${rel.status}): ${rel.text}`);
    const escrow2 = (rel.json as any)?.escrow;
    assert(String(escrow2?.status || '') === 'released', `expected released escrow, got: ${rel.text}`);

    const b2 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(b2.status === 200, `balance failed (${b2.status}): ${b2.text}`);
    const brl2 = (((b2.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl2?.availableCents || 0) === amt - escrowAmt, `expected payer available=${amt - escrowAmt}, got: ${JSON.stringify(brl2)}`);
    assert(Number(brl2?.heldCents || 0) < Number(brl1?.heldCents || 0), `expected payer held to decrease, got: ${JSON.stringify(brl2)}`);

    const payee1 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId: payeeAgentId });
    assert(payee1.status === 200, `payee balance failed (${payee1.status}): ${payee1.text}`);
    const brlPayee = (((payee1.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brlPayee?.availableCents || 0) === escrowAmt, `expected payee available=${escrowAmt}, got: ${JSON.stringify(brlPayee)}`);
  });

  await run('L21: escrow can be refunded after expiry (held -> refunded)', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin tenant creation)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic escrow tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l21b-${Date.now()}` });
    const key = newAgentSigningKey();
    const payerAgentId = 'agent://agentic-l21b-payer';
    const payeeAgentId = 'agent://agentic-l21b-payee';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId: payerAgentId,
      taskType: 'l21_escrow_refund',
      taskInputHash: 'sha256:l21b_in',
      taskOutputHash: 'sha256:l21b_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l21b_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);

    const advSet = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1 });
    assert(advSet.status === 200, `admin advance failed (${advSet.status}): ${advSet.text}`);

    const amt = typeof created.amountCents === 'number' ? created.amountCents : undefined;
    assert(typeof amt === 'number', `missing amountCents in checkoutCreate response: ${JSON.stringify(created)}`);
    const escrowAmt = Math.max(1, Math.trunc(amt / 2));

    const startMs = Date.now();
    const ttlMs = 200;
    const c1 = await agentEscrowCreate({
      baseUrl,
      apiKey: t.apiKey,
      agentId: payerAgentId,
      payeeAgentId,
      currency: 'BRL',
      amountCents: escrowAmt,
      idempotencyKey: `idk_${created.paymentId}_l21b`,
      ttlMs,
      nowMs: startMs,
      sourceEventId: `evt_${created.paymentId}_l21b_escrow_create`
    });
    assert(c1.status === 200, `escrow create failed (${c1.status}): ${c1.text}`);
    const escrow = (c1.json as any)?.escrow;
    assert(escrow?.escrowId, `missing escrow in response: ${c1.text}`);

    const b1 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(b1.status === 200, `balance failed (${b1.status}): ${b1.text}`);
    const brl1 = (((b1.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl1?.availableCents || 0) === amt - escrowAmt, `expected payer available=${amt - escrowAmt}, got: ${JSON.stringify(brl1)}`);

    const rel = await agentEscrowRelease({
      baseUrl,
      apiKey: t.apiKey,
      agentId: payerAgentId,
      escrowId: String(escrow.escrowId),
      nowMs: startMs + ttlMs + 1,
      sourceEventId: `evt_${created.paymentId}_l21b_escrow_release_expired`
    });
    assert(rel.status === 200, `escrow release failed (${rel.status}): ${rel.text}`);
    const escrow2 = (rel.json as any)?.escrow;
    assert(String(escrow2?.status || '') === 'refunded', `expected refunded escrow, got: ${rel.text}`);

    const b2 = await agentBalance({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(b2.status === 200, `balance failed (${b2.status}): ${b2.text}`);
    const brl2 = (((b2.json as any)?.balances || []) as any[]).find((x) => String(x?.currency || '').trim() === 'BRL');
    assert(Number(brl2?.availableCents || 0) === amt, `expected payer available restored=${amt}, got: ${JSON.stringify(brl2)}`);

    const adv = await adminAdvanceEscrows({ baseUrl, adminToken, nowMs: startMs + ttlMs + 1 });
    assert(adv.status === 200, `admin advance escrows failed (${adv.status}): ${adv.text}`);
  });

  await run('L22: reputation is deterministic and changes with escrow lifecycle', async () => {
    if (!adminToken) {
      skip('missing PHOENIX_ZERO_ADMIN_TOKEN (required for admin tenant creation)');
    }
    if (realMode) {
      skip('real mode does not inject webhooks for deterministic reputation tests');
    }

    const t = await createTenant({ baseUrl, adminToken, name: `stress-l22-${Date.now()}` });
    const key = newAgentSigningKey();
    const payerAgentId = 'agent://agentic-l22-payer';
    const payeeAgentId = 'agent://agentic-l22-payee';

    const meta = makeSignedProofMeta({
      tenantId: t.tenantId,
      agentId: payerAgentId,
      taskType: 'l22_reputation',
      taskInputHash: 'sha256:l22_in',
      taskOutputHash: 'sha256:l22_out',
      key
    });

    const created = await checkoutCreate({
      baseUrl,
      apiKey: t.apiKey,
      providerHint: 'pix',
      currency: 'BRL',
      proofMeta: meta,
      lineItems: [{ product: 'video_protection', operation: 'protect_video', guaranteeWindow: '30d', units: 1, durationSeconds: 10 }]
    });

    const st = await checkoutStatus({ baseUrl, apiKey: t.apiKey, paymentId: created.paymentId });
    const providerPaymentId = String(st.providerPaymentId || '').trim();
    assert(providerPaymentId, 'missing providerPaymentId');

    const wh = await pixWebhook({
      baseUrl,
      providerPaymentId,
      asaasWebhookSecret: asaasSecret || undefined,
      eventId: `evt_${created.paymentId}_l22_paid`,
      status: 'CONFIRMED'
    });
    if (wh.status === 401) {
      skip('pix webhook got 401 (server likely requires ASAAS_WEBHOOK_SECRET, but it is not set here)');
    }
    assert(wh.status === 200, `pix webhook failed (${wh.status}): ${wh.text}`);

    const s0 = await agentSettlements({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    const settlements0 = ((s0.json as any)?.settlements || []) as any[];
    const set0 = settlements0.find((x) => String(x?.providerPaymentId || '').trim() === providerPaymentId);
    assert(set0?.settlementId, `expected settlement entry, got: ${s0.text}`);

    const dueMs = Date.parse(String(set0.riskWindowEndsAt || ''));
    assert(Number.isFinite(dueMs), `invalid riskWindowEndsAt: ${JSON.stringify(set0)}`);

    const advSet = await adminAdvanceSettlement({ baseUrl, adminToken, nowMs: dueMs + 1 });
    assert(advSet.status === 200, `admin advance failed (${advSet.status}): ${advSet.text}`);

    const r0 = await agentReputation({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(r0.status === 200, `reputation failed (${r0.status}): ${r0.text}`);
    const r0b = await agentReputation({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(r0b.status === 200, `reputation failed (${r0b.status}): ${r0b.text}`);
    const h0 = String(((r0.json as any)?.reputation || {})?.reputationHashB64Url || '');
    const h0b = String(((r0b.json as any)?.reputation || {})?.reputationHashB64Url || '');
    assert(h0 && h0 === h0b, `expected deterministic reputation hash, got: ${h0} vs ${h0b}`);

    const amt = typeof created.amountCents === 'number' ? created.amountCents : undefined;
    assert(typeof amt === 'number', `missing amountCents in checkoutCreate response: ${JSON.stringify(created)}`);
    const escrowAmt = Math.max(1, Math.trunc(amt / 3));

    const c1 = await agentEscrowCreate({
      baseUrl,
      apiKey: t.apiKey,
      agentId: payerAgentId,
      payeeAgentId,
      currency: 'BRL',
      amountCents: escrowAmt,
      idempotencyKey: `idk_${created.paymentId}_l22`,
      sourceEventId: `evt_${created.paymentId}_l22_escrow_create`
    });
    assert(c1.status === 200, `escrow create failed (${c1.status}): ${c1.text}`);
    const escrow = (c1.json as any)?.escrow;
    assert(escrow?.escrowId, `missing escrow in response: ${c1.text}`);

    const r1 = await agentReputation({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(r1.status === 200, `reputation failed (${r1.status}): ${r1.text}`);
    const h1 = String(((r1.json as any)?.reputation || {})?.reputationHashB64Url || '');
    assert(h1 && h1 !== h0, `expected reputation hash to change after escrow hold, got: ${h1}`);

    const rel = await agentEscrowRelease({
      baseUrl,
      apiKey: t.apiKey,
      agentId: payerAgentId,
      escrowId: String(escrow.escrowId),
      sourceEventId: `evt_${created.paymentId}_l22_escrow_release`
    });
    assert(rel.status === 200, `escrow release failed (${rel.status}): ${rel.text}`);

    const r2 = await agentReputation({ baseUrl, apiKey: t.apiKey, agentId: payerAgentId });
    assert(r2.status === 200, `reputation failed (${r2.status}): ${r2.text}`);
    const h2 = String(((r2.json as any)?.reputation || {})?.reputationHashB64Url || '');
    assert(h2 && h2 !== h1, `expected reputation hash to change after escrow release, got: ${h2}`);

    const payeeRep = await agentReputation({ baseUrl, apiKey: t.apiKey, agentId: payeeAgentId });
    assert(payeeRep.status === 200, `payee reputation failed (${payeeRep.status}): ${payeeRep.text}`);
    const payeeObj = (payeeRep.json as any)?.reputation || {};
    assert(Number(payeeObj?.escrow?.releasedIncomingCents || 0) === escrowAmt, `expected payee releasedIncomingCents=${escrowAmt}, got: ${JSON.stringify(payeeObj)}`);
  });

  console.log('All tests completed.');
}

main().catch((e) => {
  console.error(String(e?.stack || e?.message || e));
  process.exit(1);
});
