import { createHash, randomBytes } from 'node:crypto';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function envInt(name: string, def: number): number {
  const raw = String(process.env[name] || '').trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  const x = Math.trunc(n);
  if (x <= 0) return def;
  return x;
}

type Json = any;

async function readJson(res: Response): Promise<{ json: Json | null; text: string }> {
  const text = await res.text().catch(() => '');
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function httpJson(params: {
  method: 'GET' | 'POST';
  url: string;
  apiKey?: string;
  adminToken?: string;
  body?: any;
  headers?: Record<string, string>;
}): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (params.apiKey) headers['x-api-key'] = params.apiKey;
  if (params.adminToken) headers['x-admin-token'] = params.adminToken;
  for (const [k, v] of Object.entries(params.headers || {})) {
    if (!k) continue;
    const vv = String(v ?? '').trim();
    if (!vv) continue;
    headers[String(k).toLowerCase()] = vv;
  }

  const timeoutMs = envInt('PHOENIX_ZERO_HTTP_TIMEOUT_MS', 120_000);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(params.url, {
      method: params.method,
      headers,
      body: params.method === 'POST' ? JSON.stringify(params.body ?? {}) : undefined,
      signal: ac.signal
    });
  } finally {
    clearTimeout(t);
  }

  const j = await readJson(res);
  return { ok: res.ok, status: res.status, json: j.json, text: j.text };
}

async function httpJsonRetry(params: {
  method: 'GET' | 'POST';
  url: string;
  apiKey?: string;
  adminToken?: string;
  body?: any;
  headers?: Record<string, string>;
  retries?: number;
}): Promise<{ ok: boolean; status: number; json: any; text: string }> {
  const retries = Math.max(0, Math.min(5, Math.trunc(Number(params.retries ?? 3))));

  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await httpJson(params);
      if (res.ok) return res;
      if (res.status >= 500 && i < retries) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
        continue;
      }
      return res;
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      const isAbort = msg.toLowerCase().includes('abort');
      if ((isAbort || msg) && i < retries) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)));
        continue;
      }
      throw e;
    }
  }

  return httpJson(params);
}

async function main() {
  const baseUrl = (env('PHOENIX_ZERO_BASE_URL') || env('CLIENT_BASE_URL') || 'http://localhost:3000').replace(/\/+$/g, '');
  const adminToken = env('PHOENIX_ZERO_ADMIN_TOKEN');
  const asaasWebhookSecret = env('ASAAS_WEBHOOK_SECRET');

  console.log('External agent simulation');
  console.log(JSON.stringify({ baseUrl }, null, 2));

  {
    const unauth = await httpJson({ method: 'GET', url: `${baseUrl}/api/checkout/status?paymentId=pay_nonexistent` });
    if (unauth.status !== 401) {
      console.error('Expected 401 for unauthenticated checkout/status but got:', unauth.status, unauth.text);
      process.exitCode = 1;
      return;
    }
  }

  if (!adminToken) {
    console.error('Missing PHOENIX_ZERO_ADMIN_TOKEN (needed to create tenant for the simulation).');
    process.exitCode = 1;
    return;
  }

  const tenantName = `external-agent-test-${Date.now()}`;
  const tenantRes = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/admin/tenants`,
    adminToken,
    body: { name: tenantName, clientType: 'partner', sector: 'testing', country: 'BR', currency: 'BRL', pricingProfile: 'default', commissionProfile: 'default', taxProfile: 'default' }
  });

  if (!tenantRes.ok || !tenantRes.json?.ok) {
    console.error('Failed to create tenant:', tenantRes.status, tenantRes.text);
    process.exitCode = 1;
    return;
  }

  const apiKey = String(tenantRes.json.apiKey || '').trim();
  const tenantId = String(tenantRes.json.tenant?.tenantId || '').trim();

  if (!apiKey || !tenantId) {
    console.error('Admin tenants response missing apiKey/tenantId:', tenantRes.text);
    process.exitCode = 1;
    return;
  }

  console.log('Tenant created:', JSON.stringify({ tenantId }, null, 2));

  const tenant2Res = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/admin/tenants`,
    adminToken,
    body: { name: `${tenantName}-iso`, clientType: 'partner', sector: 'testing', country: 'BR', currency: 'BRL', pricingProfile: 'default', commissionProfile: 'default', taxProfile: 'default' }
  });
  if (!tenant2Res.ok || !tenant2Res.json?.ok) {
    console.error('Failed to create tenant2:', tenant2Res.status, tenant2Res.text);
    process.exitCode = 1;
    return;
  }
  const apiKey2 = String(tenant2Res.json.apiKey || '').trim();
  const tenantId2 = String(tenant2Res.json.tenant?.tenantId || '').trim();
  console.log('Tenant2 created:', JSON.stringify({ tenantId2 }, null, 2));

  const agentId = `ag_${b64Url(randomBytes(12))}`;
  const taskId = `task_${b64Url(randomBytes(12))}`;
  const taskType = 'video_protection';
  const taskInput = { kind: 'video', sha256: sha256Hex('fake-video-bytes') };
  const taskOutput = { kind: 'proof', sha256: sha256Hex('fake-proof-output') };

  const checkoutRes = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/checkout/create`,
    apiKey,
    body: {
      currency: 'BRL',
      providerHint: 'pix',
      lineItems: [{ operation: 'video_protection', units: 1 }],
      proofMeta: {
        agentId,
        taskId,
        taskType,
        taskInputHash: sha256Hex(JSON.stringify(taskInput)),
        taskOutputHash: sha256Hex(JSON.stringify(taskOutput)),
        customerContact: {
          telegramChatId: env('SIM_TELEGRAM_CHAT_ID') || undefined,
          whatsappNumber: env('SIM_WHATSAPP_NUMBER') || undefined
        }
      }
    }
  });

  if (!checkoutRes.ok || !checkoutRes.json?.ok) {
    console.error('Checkout create failed:', checkoutRes.status, checkoutRes.text);
    process.exitCode = 1;
    return;
  }

  const paymentId = String(checkoutRes.json.paymentId || '').trim();
  const checkoutUrl = String(checkoutRes.json.checkoutUrl || '').trim();
  let providerPaymentId = String(checkoutRes.json.providerPaymentId || '').trim() || '';

  console.log('Checkout created:', JSON.stringify({ paymentId, checkoutUrl }, null, 2));

  if (!providerPaymentId) {
    const status0 = await httpJsonRetry({ method: 'GET', url: `${baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(paymentId)}`, apiKey });
    providerPaymentId = String(status0.json?.providerPaymentId || '').trim() || '';
  }

  if (!providerPaymentId) {
    console.error('Missing providerPaymentId (cannot simulate provider webhook reliably).');
    process.exitCode = 1;
    return;
  }

  const execBefore = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/execute`,
    apiKey,
    body: { taskId, taskType, requireSignature: false }
  });

  console.log('Execute before payment (expected 403):', JSON.stringify({ status: execBefore.status, body: execBefore.json }, null, 2));

  if (execBefore.status !== 403) {
    console.error('Expected 403 before payment.');
    process.exitCode = 1;
    return;
  }

  const simEventId = `evt_sim_${Date.now()}_${b64Url(randomBytes(6))}`;
  const webhookSimRes = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/pix`,
    headers: asaasWebhookSecret ? { 'asaas-access-token': asaasWebhookSecret } : undefined,
    body: {
      id: simEventId,
      event: { id: simEventId },
      provider: 'pix',
      providerPaymentId,
      status: 'paid',
      payment: {
        id: providerPaymentId,
        status: 'CONFIRMED',
        confirmedDate: new Date().toISOString()
      }
    }
  });

  console.log('Webhook simulate pix:', JSON.stringify({ status: webhookSimRes.status, body: webhookSimRes.json }, null, 2));

  const webhookSimRes2 = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/pix`,
    headers: asaasWebhookSecret ? { 'asaas-access-token': asaasWebhookSecret } : undefined,
    body: {
      id: simEventId,
      event: { id: simEventId },
      provider: 'pix',
      providerPaymentId,
      status: 'paid',
      payment: {
        id: providerPaymentId,
        status: 'CONFIRMED',
        confirmedDate: new Date().toISOString()
      }
    }
  });

  console.log('Webhook idempotency (same event twice):', JSON.stringify({ status: webhookSimRes2.status, body: webhookSimRes2.json }, null, 2));
  if (!(webhookSimRes2.json && webhookSimRes2.json.deduped === true)) {
    console.error('Expected deduped:true on duplicate webhook event.');
    process.exitCode = 1;
    return;
  }

  const statusRes = await httpJsonRetry({ method: 'GET', url: `${baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(paymentId)}`, apiKey });
  console.log('Payment status:', JSON.stringify({ status: statusRes.status, body: statusRes.json }, null, 2));

  const statusResOtherTenant = await httpJsonRetry({
    method: 'GET',
    url: `${baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(paymentId)}`,
    apiKey: apiKey2
  });
  console.log('Tenant isolation (other tenant checkout/status):', JSON.stringify({ status: statusResOtherTenant.status, body: statusResOtherTenant.json }, null, 2));
  if (statusResOtherTenant.status !== 403) {
    console.error('Expected 403 when other tenant queries checkout/status.');
    process.exitCode = 1;
    return;
  }

  const execAfter = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/execute`,
    apiKey,
    body: { taskId, taskType, requireSignature: false }
  });

  console.log('Execute after payment (expected 200):', JSON.stringify({ status: execAfter.status, body: execAfter.json }, null, 2));

  if (execAfter.status !== 200) {
    console.error('Expected 200 after payment.');
    process.exitCode = 1;
    return;
  }

  const settlements0 = await httpJsonRetry({
    method: 'GET',
    url: `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/settlements?limit=50`,
    apiKey
  });
  console.log('Agent settlements (before advance):', JSON.stringify({ status: settlements0.status, body: settlements0.json }, null, 2));

  const advance = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/admin/settlement/advance`,
    adminToken,
    body: { nowMs: Date.now() + 8 * 24 * 60 * 60 * 1000, limit: 5000 }
  });
  console.log('Admin settlement advance:', JSON.stringify({ status: advance.status, body: advance.json }, null, 2));

  const settlements1 = await httpJsonRetry({
    method: 'GET',
    url: `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/settlements?limit=50`,
    apiKey
  });
  console.log('Agent settlements (after advance):', JSON.stringify({ status: settlements1.status, body: settlements1.json }, null, 2));

  const refundEventId = `evt_refund_${Date.now()}_${b64Url(randomBytes(6))}`;
  const refundRes = await httpJsonRetry({
    method: 'POST',
    url: `${baseUrl}/api/webhooks/pix`,
    headers: asaasWebhookSecret ? { 'asaas-access-token': asaasWebhookSecret } : undefined,
    body: {
      id: refundEventId,
      event: { id: refundEventId },
      provider: 'pix',
      providerPaymentId,
      status: 'failed',
      payment: {
        id: providerPaymentId,
        status: 'REFUNDED',
        confirmedDate: new Date().toISOString()
      }
    }
  });
  console.log('Webhook simulate refund:', JSON.stringify({ status: refundRes.status, body: refundRes.json }, null, 2));

  const settlements2 = await httpJsonRetry({
    method: 'GET',
    url: `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/settlements?limit=50`,
    apiKey
  });
  console.log('Agent settlements (after refund):', JSON.stringify({ status: settlements2.status, body: settlements2.json }, null, 2));

  const entries: any[] = Array.isArray(settlements2.json?.settlements) ? settlements2.json.settlements : Array.isArray(settlements2.json?.entries) ? settlements2.json.entries : Array.isArray(settlements2.json) ? settlements2.json : [];
  const byPayment = entries.filter((e) => String(e?.paymentId || '') === paymentId);
  const hasReverted = byPayment.some((e) => String(e?.status || '') === 'reverted');
  if (!hasReverted) {
    console.error('Expected settlement status "reverted" after refund, but did not observe it.');
    console.error('Entries inspected:', JSON.stringify({ entries, byPayment, paymentId }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('Simulation finished.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exitCode = 1;
});
