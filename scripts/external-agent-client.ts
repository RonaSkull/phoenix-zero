import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function stripQuotes(v: string): string {
  const s = String(v || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function loadEnvFromFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = String(lineRaw || '').trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    if (!k) continue;
    if (process.env[k] != null && String(process.env[k]).trim() !== '') continue;
    const v = stripQuotes(line.slice(idx + 1));
    process.env[k] = v;
  }
}

function loadEnv(): void {
  const cwd = process.cwd();
  loadEnvFromFile(resolve(cwd, '.env.local'));
  loadEnvFromFile(resolve(cwd, '.env'));
  loadEnvFromFile(resolve(cwd, 'apps', 'web', '.env.local'));
  loadEnvFromFile(resolve(cwd, 'apps', 'web', '.env'));
}

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

function hmacSha512Hex(secret: string, raw: string): string {
  return createHmac('sha512', String(secret || '').trim()).update(String(raw || ''), 'utf8').digest('hex');
}

function canonicalJson(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  const keys = Object.keys(obj).sort();
  const out: Record<string, any> = {};
  for (const k of keys) out[k] = (obj as any)[k];
  return JSON.stringify(out);
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

async function waitForCheckoutStatus(params: {
  baseUrl: string;
  apiKey: string;
  paymentId: string;
  desired: string;
  waitMs: number;
  pollMs: number;
}): Promise<{ ok: boolean; last: { status: number; json: any; text: string } }> {
  const deadline = Date.now() + Math.max(0, Math.trunc(params.waitMs));
  let last = await httpJsonRetry({
    method: 'GET',
    url: `${params.baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(params.paymentId)}`,
    apiKey: params.apiKey
  });

  while (Date.now() <= deadline) {
    const got = String(last.json?.status || '').trim();
    if (last.ok && got === params.desired) {
      return { ok: true, last: { status: last.status, json: last.json, text: last.text } };
    }
    await sleepMs(params.pollMs);
    last = await httpJsonRetry({
      method: 'GET',
      url: `${params.baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(params.paymentId)}`,
      apiKey: params.apiKey
    });
  }

  const got = String(last.json?.status || '').trim();
  return { ok: last.ok && got === params.desired, last: { status: last.status, json: last.json, text: last.text } };
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
  loadEnv();
  const baseUrl = (env('PHOENIX_ZERO_BASE_URL') || env('CLIENT_BASE_URL') || 'http://localhost:3000').replace(/\/+$/g, '');
  const adminToken = env('PHOENIX_ZERO_ADMIN_TOKEN');
  const asaasWebhookSecret = env('ASAAS_WEBHOOK_SECRET');
  const nowPaymentsIpnSecret = env('NOWPAYMENTS_IPN_SECRET');
  const hasTelegramToken = Boolean(env('TELEGRAM_BOT_TOKEN'));
  const skipPix = ['1', 'true', 'yes', 'y'].includes(env('SIM_SKIP_PIX').toLowerCase());
  const skipCrypto = ['1', 'true', 'yes', 'y'].includes(env('SIM_SKIP_CRYPTO').toLowerCase());

  console.log('External agent simulation');
  console.log(JSON.stringify({ baseUrl, hasTelegramToken, hasNowPaymentsSecret: Boolean(nowPaymentsIpnSecret), skipPix, skipCrypto }, null, 2));

  {
    try {
      const unauth = await httpJson({ method: 'GET', url: `${baseUrl}/api/checkout/status?paymentId=pay_nonexistent` });
      if (unauth.status !== 401) {
        console.error('Expected 401 for unauthenticated checkout/status but got:', unauth.status, unauth.text);
        process.exitCode = 1;
        return;
      }
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      console.error('Failed to reach baseUrl:', JSON.stringify({ baseUrl, message: msg }));
      console.error('Hint: start the web server (localhost) or set PHOENIX_ZERO_BASE_URL to your Render URL (https://...).');
      process.exitCode = 1;
      return;
    }
  }

  if (!adminToken) {
    console.error('Missing PHOENIX_ZERO_ADMIN_TOKEN (needed to create tenant for the simulation).');
    console.error('Hint: in PowerShell set env vars like:');
    console.error("  $env:PHOENIX_ZERO_ADMIN_TOKEN='...'");
    console.error("  $env:PHOENIX_ZERO_BASE_URL='http://localhost:3000'  # or your Render URL");
    console.error('Or create a .env.local file in the repo root with those values (gitignored).');
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
  const taskType = 'protect_video';
  const taskInput = { kind: 'video', sha256: sha256Hex('fake-video-bytes') };
  const taskOutput = { kind: 'proof', sha256: sha256Hex('fake-proof-output') };

  if (!skipPix) {
    const checkoutRes = await httpJsonRetry({
      method: 'POST',
      url: `${baseUrl}/api/checkout/create`,
      apiKey,
      body: {
        currency: 'BRL',
        providerHint: 'pix',
        lineItems: [{ operation: 'protect_video', units: 1 }],
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
    } else {
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
      } else {
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
        } else {
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
          } else {
            const waitedPaid = await waitForCheckoutStatus({
              baseUrl,
              apiKey,
              paymentId,
              desired: 'paid',
              waitMs: envInt('SIM_WAIT_FOR_STATUS_MS', 12_000),
              pollMs: envInt('SIM_STATUS_POLL_MS', 900)
            });
            console.log('Payment status:', JSON.stringify({ status: waitedPaid.last.status, body: waitedPaid.last.json }, null, 2));
            if (!waitedPaid.ok) {
              console.error('Expected checkout/status to become paid after webhook but it did not.');
              process.exitCode = 1;
            }

            const statusResOtherTenant = await httpJsonRetry({
              method: 'GET',
              url: `${baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(paymentId)}`,
              apiKey: apiKey2
            });
            console.log('Tenant isolation (other tenant checkout/status):', JSON.stringify({ status: statusResOtherTenant.status, body: statusResOtherTenant.json }, null, 2));
            if (statusResOtherTenant.status !== 403) {
              console.error('Expected 403 when other tenant queries checkout/status.');
              process.exitCode = 1;
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
            }

            const settlements0 = await httpJsonRetry({
              method: 'GET',
              url: `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/settlements?limit=50`,
              apiKey
            });
            console.log('Agent settlements (before advance):', JSON.stringify({ status: settlements0.status, body: settlements0.json }, null, 2));

            {
              const entries0: any[] = Array.isArray(settlements0.json?.settlements)
                ? settlements0.json.settlements
                : Array.isArray(settlements0.json?.entries)
                  ? settlements0.json.entries
                  : Array.isArray(settlements0.json)
                    ? settlements0.json
                    : [];
              const proofId = entries0[0]?.proofId != null ? String(entries0[0].proofId) : '';
              if (proofId) {
                const proofRes = await httpJsonRetry({ method: 'GET', url: `${baseUrl}/api/payment-proofs/${encodeURIComponent(proofId)}`, apiKey });
                if (proofRes.ok && proofRes.json?.ok && proofRes.json?.proof) {
                  const proof = proofRes.json.proof;
                  console.log(
                    'Payment proof notifications:',
                    JSON.stringify(
                      {
                        proofId,
                        status: proof.status,
                        customerContact: proof.customerContact,
                        customerNotifications: proof.customerNotifications
                      },
                      null,
                      2
                    )
                  );
                } else {
                  console.log('Payment proof fetch failed:', JSON.stringify({ proofId, status: proofRes.status, text: proofRes.text }, null, 2));
                }
              } else {
                console.log('Payment proofId not found in settlements response (cannot inspect notification receipts).');
              }
            }

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

            const gateAfterRefund = await httpJsonRetry({
              method: 'GET',
              url: `${baseUrl}/api/agents/${encodeURIComponent(agentId)}/gate?taskId=${encodeURIComponent(taskId)}&taskType=${encodeURIComponent(taskType)}`,
              apiKey
            });
            console.log('Gate after refund (expected allowed=false):', JSON.stringify({ status: gateAfterRefund.status, body: gateAfterRefund.json }, null, 2));
            if (gateAfterRefund.status !== 200 || gateAfterRefund.json?.allowed !== false) {
              console.error('Expected gate.allowed=false after refund.');
              process.exitCode = 1;
            }

            const entries2: any[] = Array.isArray(settlements2.json?.settlements)
              ? settlements2.json.settlements
              : Array.isArray(settlements2.json?.entries)
                ? settlements2.json.entries
                : Array.isArray(settlements2.json)
                  ? settlements2.json
                  : [];
            const byPayment = entries2.filter((e) => String(e?.paymentId || '') === paymentId);
            const hasReverted = byPayment.some((e) => String(e?.status || '') === 'reverted');
            if (!hasReverted) {
              console.error('Expected settlement status "reverted" after refund, but did not observe it.');
              console.error('Entries inspected:', JSON.stringify({ entries: entries2, byPayment, paymentId }, null, 2));
              process.exitCode = 1;
            }
          }
        }
      }
    }

    console.log('Simulation finished.');
  }

  if (!skipCrypto) {
    console.log('---');
    console.log('Crypto (NowPayments) simulation');
    if (!nowPaymentsIpnSecret && baseUrl.includes('onrender.com')) {
      console.error('Missing NOWPAYMENTS_IPN_SECRET for crypto simulation.');
      process.exitCode = 1;
      return;
    }

    const agentIdC = `ag_${b64Url(randomBytes(12))}`;
    const taskIdC = `task_${b64Url(randomBytes(12))}`;
    const taskTypeC = 'protect_video';
    const taskInputC = { kind: 'video', sha256: sha256Hex('fake-video-bytes-crypto') };
    const taskOutputC = { kind: 'proof', sha256: sha256Hex('fake-proof-output-crypto') };

    const checkoutCrypto = await httpJsonRetry({
      method: 'POST',
      url: `${baseUrl}/api/checkout/create`,
      apiKey,
      body: {
        currency: 'USD',
        providerHint: 'crypto',
        lineItems: [{ operation: 'protect_video', units: 1 }],
        proofMeta: {
          agentId: agentIdC,
          taskId: taskIdC,
          taskType: 'protect_video',
          taskInputHash: sha256Hex(JSON.stringify(taskInputC)),
          taskOutputHash: sha256Hex(JSON.stringify(taskOutputC)),
          customerContact: {
            telegramChatId: env('SIM_TELEGRAM_CHAT_ID') || undefined,
            whatsappNumber: env('SIM_WHATSAPP_NUMBER') || undefined
          }
        }
      }
    });

    if (!checkoutCrypto.ok || !checkoutCrypto.json?.ok) {
      console.error('Checkout create (crypto) failed:', checkoutCrypto.status, checkoutCrypto.text);
      process.exitCode = 1;
      return;
    }

    const paymentIdC = String(checkoutCrypto.json.paymentId || '').trim();
    const checkoutUrlC = String(checkoutCrypto.json.checkoutUrl || '').trim();
    let providerPaymentIdC = String(checkoutCrypto.json.providerPaymentId || '').trim() || '';
    console.log('Checkout created (crypto):', JSON.stringify({ paymentId: paymentIdC, checkoutUrl: checkoutUrlC }, null, 2));

    if (!providerPaymentIdC) {
      const status0 = await httpJsonRetry({
        method: 'GET',
        url: `${baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(paymentIdC)}`,
        apiKey
      });
      providerPaymentIdC = String(status0.json?.providerPaymentId || '').trim() || '';
    }

    if (!providerPaymentIdC) {
      console.error('Missing providerPaymentId (crypto) (cannot simulate NowPayments webhook reliably).');
      process.exitCode = 1;
      return;
    }

    const execBeforeC = await httpJsonRetry({
      method: 'POST',
      url: `${baseUrl}/api/agents/${encodeURIComponent(agentIdC)}/execute`,
      apiKey,
      body: { taskId: taskIdC, taskType: taskTypeC, requireSignature: false }
    });

    console.log('Execute before payment (crypto) (expected 403):', JSON.stringify({ status: execBeforeC.status, body: execBeforeC.json }, null, 2));
    if (execBeforeC.status !== 403) {
      console.error('Expected 403 before payment (crypto).');
      process.exitCode = 1;
      return;
    }

    const npEventId = `np_evt_${Date.now()}_${b64Url(randomBytes(6))}`;
    const npBody: any = {
      ipn_id: npEventId,
      invoice_id: providerPaymentIdC,
      payment_status: 'finished',
      created_at: new Date().toISOString()
    };
    const npCanonical = canonicalJson(npBody);
    const npSig = nowPaymentsIpnSecret ? hmacSha512Hex(nowPaymentsIpnSecret, npCanonical) : '';

    const npWebhook1 = await httpJsonRetry({
      method: 'POST',
      url: `${baseUrl}/api/webhooks/nowpayments`,
      headers: npSig ? { 'x-nowpayments-sig': npSig } : undefined,
      body: npBody
    });
    console.log('Webhook simulate nowpayments:', JSON.stringify({ status: npWebhook1.status, body: npWebhook1.json }, null, 2));
    if (npWebhook1.status !== 200) {
      console.error('Expected 200 for nowpayments webhook simulation.');
      process.exitCode = 1;
      return;
    }

    const npWebhook2 = await httpJsonRetry({
      method: 'POST',
      url: `${baseUrl}/api/webhooks/nowpayments`,
      headers: npSig ? { 'x-nowpayments-sig': npSig } : undefined,
      body: npBody
    });
    console.log('Webhook idempotency (nowpayments):', JSON.stringify({ status: npWebhook2.status, body: npWebhook2.json }, null, 2));
    if (!(npWebhook2.json && npWebhook2.json.deduped === true)) {
      console.error('Expected deduped:true on duplicate nowpayments webhook event.');
      process.exitCode = 1;
      return;
    }

    const statusC = await httpJsonRetry({
      method: 'GET',
      url: `${baseUrl}/api/checkout/status?paymentId=${encodeURIComponent(paymentIdC)}`,
      apiKey
    });
    console.log('Payment status (crypto):', JSON.stringify({ status: statusC.status, body: statusC.json }, null, 2));

    const execAfterC = await httpJsonRetry({
      method: 'POST',
      url: `${baseUrl}/api/agents/${encodeURIComponent(agentIdC)}/execute`,
      apiKey,
      body: { taskId: taskIdC, taskType: taskTypeC, requireSignature: false }
    });

    console.log('Execute after payment (crypto) (expected 200):', JSON.stringify({ status: execAfterC.status, body: execAfterC.json }, null, 2));
    if (execAfterC.status !== 200) {
      console.error('Expected 200 after payment (crypto).');
      process.exitCode = 1;
      return;
    }

    const settlementsC0 = await httpJsonRetry({
      method: 'GET',
      url: `${baseUrl}/api/agents/${encodeURIComponent(agentIdC)}/settlements?limit=50`,
      apiKey
    });
    console.log('Agent settlements (crypto) (before refund):', JSON.stringify({ status: settlementsC0.status, body: settlementsC0.json }, null, 2));

    const refundEventIdC = `np_refund_${Date.now()}_${b64Url(randomBytes(6))}`;
    const npRefundBody: any = {
      ipn_id: refundEventIdC,
      invoice_id: providerPaymentIdC,
      payment_status: 'refunded',
      created_at: new Date().toISOString()
    };
    const npRefundSig = nowPaymentsIpnSecret ? hmacSha512Hex(nowPaymentsIpnSecret, canonicalJson(npRefundBody)) : '';

    const npRefundRes = await httpJsonRetry({
      method: 'POST',
      url: `${baseUrl}/api/webhooks/nowpayments`,
      headers: npRefundSig ? { 'x-nowpayments-sig': npRefundSig } : undefined,
      body: npRefundBody
    });
    console.log('Webhook simulate nowpayments refund:', JSON.stringify({ status: npRefundRes.status, body: npRefundRes.json }, null, 2));
    if (npRefundRes.status !== 200) {
      console.error('Expected 200 for nowpayments refund simulation.');
      process.exitCode = 1;
      return;
    }

    const settlementsC1 = await httpJsonRetry({
      method: 'GET',
      url: `${baseUrl}/api/agents/${encodeURIComponent(agentIdC)}/settlements?limit=50`,
      apiKey
    });
    console.log('Agent settlements (crypto) (after refund):', JSON.stringify({ status: settlementsC1.status, body: settlementsC1.json }, null, 2));

    const entriesC: any[] = Array.isArray(settlementsC1.json?.settlements)
      ? settlementsC1.json.settlements
      : Array.isArray(settlementsC1.json?.entries)
        ? settlementsC1.json.entries
        : Array.isArray(settlementsC1.json)
          ? settlementsC1.json
          : [];
    const byPaymentC = entriesC.filter((e) => String(e?.paymentId || '') === paymentIdC);
    const hasRevertedC = byPaymentC.some((e) => String(e?.status || '') === 'reverted');
    if (!hasRevertedC) {
      console.error('Expected settlement status "reverted" after nowpayments refund, but did not observe it.');
      console.error('Entries inspected:', JSON.stringify({ entriesC, byPaymentC, paymentIdC }, null, 2));
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exitCode = 1;
});
