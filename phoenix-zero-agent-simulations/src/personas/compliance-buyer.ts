import { randomBytes } from 'node:crypto';

import { FunnelLogger } from '../lib/funnel';
import { sha256Hex } from '../lib/http';
import { fetchWellKnown } from '../flows/discovery';
import { fetchPricingCatalog } from '../flows/pricing';
import { publicAgentSignup } from '../flows/signup';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid, waitForCheckoutPaid } from '../flows/checkout';
import { executeTask } from '../flows/execute';
import { listAgentProofs } from '../flows/proofs';
import { fetchGuaranteeProof, fetchVerifyPageHtml } from '../flows/verify';

function envInt(name: string, def: number): number {
  const raw = String(process.env[name] || '').trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.trunc(n));
}

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function runComplianceBuyer(params: { baseUrl: string; asaasWebhookSecret?: string }) {
  const runId = `run_${Date.now()}_${b64Url(randomBytes(6))}`;
  const log = new FunnelLogger({ personaId: 'compliance_buyer', runId });

  const wellKnown = await fetchWellKnown(params.baseUrl);
  log.push('DISCOVERY', wellKnown.ok, 'GET /.well-known/ai-service.json', { status: wellKnown.status, discovery: wellKnown.json?.discovery });

  const pricing = await fetchPricingCatalog(params.baseUrl);
  log.push('UNDERSTANDING', pricing.ok, 'GET /api/pricing (public)', { status: pricing.status });

  const signup = await publicAgentSignup(params.baseUrl, {
    agentType: 'compliance_buyer',
    intendedUse: 'risk/compliance buyer: auditability proof verification',
    currency: 'BRL'
  });
  log.push('ONBOARDING', signup.ok, 'POST /api/public/agent-signup', signup.ok ? { tenantId: signup.tenantId } : { status: signup.status, body: signup.rawJson });

  if (!signup.ok) {
    return { ok: false, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
  }

  const agentId = `ag_${b64Url(randomBytes(12))}`;
  const taskId = `task_${b64Url(randomBytes(12))}`;
  const taskType = 'protect_video';

  const checkout = await checkoutCreate(params.baseUrl, {
    apiKey: signup.apiKey,
    currency: 'BRL',
    providerHint: 'pix',
    operation: 'protect_video',
    units: 1,
    proofMeta: {
      agentId,
      taskId,
      taskType,
      taskInputHash: sha256Hex('input:compliance'),
      taskOutputHash: sha256Hex('output:compliance')
    }
  });

  log.push('PURCHASE', checkout.ok && checkout.json?.ok === true, 'checkout created', { status: checkout.status, body: checkout.json });
  if (!checkout.ok || !checkout.json?.ok) {
    return { ok: false, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
  }

  const paymentId = String(checkout.json?.paymentId || '').trim();
  const status0 = await checkoutStatus(params.baseUrl, { apiKey: signup.apiKey, paymentId });
  const providerPaymentId = String(status0.json?.providerPaymentId || '').trim();

  const checkoutUrl = String(checkout.json?.checkoutUrl || '').trim();

  if (!params.asaasWebhookSecret) {
    const waitMs = envInt('PHOENIX_ZERO_WAIT_FOR_PAYMENT_MS', 0);
    if (waitMs > 0) {
      console.log(JSON.stringify({ personaId: log.personaId, paymentId, checkoutUrl }, null, 2));
      log.push('PAYMENT_CONFIRMED', true, 'waiting for manual payment (poll /api/checkout/status)', { waitMs, checkoutUrl });
      const waited = await waitForCheckoutPaid(params.baseUrl, { apiKey: signup.apiKey, paymentId, waitMs });
      const paid = waited.ok && waited.paid;
      log.push('PAYMENT_CONFIRMED', paid, 'manual payment result', { status: waited.last.status, body: waited.last.json });
      if (!paid) {
        return {
          ok: false,
          personaId: log.personaId,
          runId,
          events: log.events,
          blockers: log.blockers(),
          next: { paymentId, checkoutUrl, providerPaymentId: providerPaymentId || null }
        };
      }
    } else {
      log.push('PAYMENT_CONFIRMED', false, 'cannot auto-confirm payment (missing ASAAS_WEBHOOK_SECRET)', { providerPaymentId: providerPaymentId || null, checkoutUrl });
      return {
        ok: false,
        personaId: log.personaId,
        runId,
        events: log.events,
        blockers: log.blockers(),
        next: { paymentId, checkoutUrl, providerPaymentId: providerPaymentId || null }
      };
    }
  } else {
    if (!providerPaymentId) {
      log.push('PAYMENT_CONFIRMED', false, 'cannot auto-confirm payment (missing providerPaymentId)', { checkoutUrl });
      return {
        ok: false,
        personaId: log.personaId,
        runId,
        events: log.events,
        blockers: log.blockers(),
        next: { paymentId, checkoutUrl, providerPaymentId: null }
      };
    }

    const evtPaid = `evt_paid_${Date.now()}_${b64Url(randomBytes(6))}`;
    const webhookPaid = await simulatePixWebhookPaid(params.baseUrl, {
      providerPaymentId,
      asaasWebhookSecret: params.asaasWebhookSecret,
      eventId: evtPaid
    });
    log.push('PAYMENT_CONFIRMED', webhookPaid.ok, 'simulate paid webhook', { status: webhookPaid.status, body: webhookPaid.json });
  }

  const execAfter = await executeTask(params.baseUrl, { apiKey: signup.apiKey, agentId, taskId, taskType });
  log.push('EXECUTION', execAfter.status === 200, 'execute after payment', { status: execAfter.status, body: execAfter.json });

  const proofs = await listAgentProofs(params.baseUrl, { apiKey: signup.apiKey, agentId, limit: 50 });
  const proofId = String(proofs.json?.proofs?.[0]?.id || '').trim();
  log.push('VERIFICATION', Boolean(proofId), 'extract proofId from agent proofs', { status: proofs.status, proofId: proofId || null });

  if (proofId) {
    const gp = await fetchGuaranteeProof(params.baseUrl, proofId);
    const gpOk = gp.ok && gp.json?.ok === true && gp.json?.proof?.digestB64Url;
    log.push('VERIFICATION', gpOk, 'machine-readable audit proof: GET /api/guarantee-proofs/{proofId}', { status: gp.status, body: gp.json });

    const html = await fetchVerifyPageHtml(params.baseUrl, proofId);
    const htmlOk = html.ok && html.text.includes('Proof Verified') && html.text.includes('digest');
    log.push('VERIFICATION', htmlOk, 'human audit page: GET /verify/{proofId}', { status: html.status });
  }

  const ok = log.blockers().length === 0;
  log.push('DONE', ok, 'scenario finished');
  return { ok, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
}
