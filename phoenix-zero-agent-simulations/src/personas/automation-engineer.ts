import { randomBytes } from 'node:crypto';

import { FunnelLogger } from '../lib/funnel';
import { sha256Hex } from '../lib/http';
import { fetchCapabilities, fetchWellKnown } from '../flows/discovery';
import { fetchPricingCatalog } from '../flows/pricing';
import { checkCompatibility } from '../flows/compatibility';
import { publicAgentSignup } from '../flows/signup';
import { checkoutCreate, checkoutStatus, simulatePixWebhookPaid, simulatePixWebhookRefund, waitForCheckoutPaid } from '../flows/checkout';
import { executeTask, ppoGateCheck } from '../flows/execute';
import { listAgentProofs } from '../flows/proofs';
import { fetchGuaranteeProof, fetchVerifyPageHtml } from '../flows/verify';

function envInt(name: string, def: number): number {
  const raw = String(process.env[name] || '').trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.trunc(n));
}

function envIntMin(name: string, def: number, min: number): number {
  const v = envInt(name, def);
  return Math.max(min, v);
}

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function runAutomationEngineer(params: {
  baseUrl: string;
  asaasWebhookSecret?: string;
  simulateRefund?: boolean;
}) {
  const runId = `run_${Date.now()}_${b64Url(randomBytes(6))}`;
  const log = new FunnelLogger({ personaId: 'automation_engineer', runId });

  const wellKnown = await fetchWellKnown(params.baseUrl);
  log.push('DISCOVERY', wellKnown.ok, 'GET /.well-known/ai-service.json', { status: wellKnown.status });

  const caps = await fetchCapabilities(params.baseUrl);
  log.push('DISCOVERY', caps.ok, 'GET /api/capabilities', { status: caps.status });

  if (!wellKnown.ok || !caps.ok) {
    return { ok: false, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
  }

  const pricing = await fetchPricingCatalog(params.baseUrl);
  log.push('UNDERSTANDING', pricing.ok, 'GET /api/pricing (public)', { status: pricing.status });

  const ops: string[] = Array.isArray(pricing.json?.operations) ? pricing.json.operations.map((x: any) => String(x?.operation || x || '').trim()) : [];
  const hasProtectVideo = ops.includes('protect_video');
  log.push('UNDERSTANDING', hasProtectVideo, 'operation catalog contains protect_video', { operationsCount: ops.length });

  const compat = await checkCompatibility(params.baseUrl, {
    operation: 'protect_video',
    intent: 'run job on event and produce proof',
    agentType: 'platform_engineer',
    supportsPpo: true
  });
  log.push('DECISION', compat.ok && compat.json?.compatible === true, 'POST /api/compatibility for protect_video', { status: compat.status, body: compat.json });

  const signup = await publicAgentSignup(params.baseUrl, {
    agentType: 'platform_engineer',
    intendedUse: 'automation-as-a-service: pay-per-execution job with proof',
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
      taskInputHash: sha256Hex('input:platform-engineer'),
      taskOutputHash: sha256Hex('output:platform-engineer')
    }
  });

  log.push('PURCHASE', checkout.ok && checkout.json?.ok === true, 'POST /api/checkout/create', { status: checkout.status, body: checkout.json });
  if (!checkout.ok || !checkout.json?.ok) {
    return { ok: false, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
  }

  const paymentId = String(checkout.json?.paymentId || '').trim();

  const gateBefore = await ppoGateCheck(params.baseUrl, { apiKey: signup.apiKey, agentId, taskId, taskType });
  log.push('PURCHASE', gateBefore.ok && gateBefore.json?.allowed === false, 'GET /api/agents/{agentId}/gate before payment', { status: gateBefore.status, body: gateBefore.json });

  const execBefore = await executeTask(params.baseUrl, { apiKey: signup.apiKey, agentId, taskId, taskType });
  log.push('PURCHASE', execBefore.status === 403, 'POST /api/agents/{agentId}/execute before payment should be 403', { status: execBefore.status, body: execBefore.json });

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
    log.push('PAYMENT_CONFIRMED', webhookPaid.ok, 'POST /api/webhooks/pix simulate paid', { status: webhookPaid.status, body: webhookPaid.json });

    const afterWebhookWaitMs = envInt('PHOENIX_ZERO_WAIT_FOR_STATUS_AFTER_WEBHOOK_MS', 6_000);
    const waitedPaid = await waitForCheckoutPaid(params.baseUrl, {
      apiKey: signup.apiKey,
      paymentId,
      waitMs: afterWebhookWaitMs,
      pollMs: envIntMin('PHOENIX_ZERO_STATUS_POLL_MS', 1500, 750)
    });
    const paid = waitedPaid.ok && waitedPaid.paid;
    log.push('PAYMENT_CONFIRMED', paid, 'GET /api/checkout/status after webhook', { status: waitedPaid.last.status, body: waitedPaid.last.json });
  }

  const execAfter = await executeTask(params.baseUrl, { apiKey: signup.apiKey, agentId, taskId, taskType });
  log.push('EXECUTION', execAfter.status === 200 && execAfter.json?.ok === true, 'POST /api/agents/{agentId}/execute after payment should be 200', {
    status: execAfter.status,
    body: execAfter.json
  });

  const proofs = await listAgentProofs(params.baseUrl, { apiKey: signup.apiKey, agentId, limit: 50 });
  const proofId = String(proofs.json?.proofs?.[0]?.id || proofs.json?.proofs?.[0]?.proofId || '').trim();
  log.push('VERIFICATION', Boolean(proofId), 'GET /api/agents/{agentId}/proofs (extract proofId)', { status: proofs.status, proofId: proofId || null });

  if (proofId) {
    const gp = await fetchGuaranteeProof(params.baseUrl, proofId);
    log.push('VERIFICATION', gp.ok && gp.json?.ok === true && gp.json?.proof?.kind === 'guarantee_proof', 'GET /api/guarantee-proofs/{proofId}', {
      status: gp.status,
      body: gp.json
    });

    const html = await fetchVerifyPageHtml(params.baseUrl, proofId);
    const htmlOk = html.ok && html.text.includes('Proof Verified') && html.text.includes('guarantee_proof');
    log.push('VERIFICATION', htmlOk, 'GET /verify/{proofId} (human-readable)', { status: html.status });

    if (params.simulateRefund) {
      const evtRefund = `evt_refund_${Date.now()}_${b64Url(randomBytes(6))}`;
      const webhookRefund = await simulatePixWebhookRefund(params.baseUrl, {
        providerPaymentId,
        asaasWebhookSecret: params.asaasWebhookSecret,
        eventId: evtRefund
      });
      log.push('REFUND', webhookRefund.ok, 'POST /api/webhooks/pix simulate refund', { status: webhookRefund.status, body: webhookRefund.json });

      const afterRefundWaitMs = envInt('PHOENIX_ZERO_WAIT_FOR_GATE_AFTER_REFUND_MS', 6_000);
      const pollMs = envIntMin('PHOENIX_ZERO_GATE_POLL_MS', 1200, 750);
      const deadline = Date.now() + Math.max(0, afterRefundWaitMs);
      let gateAfterRefund = await ppoGateCheck(params.baseUrl, { apiKey: signup.apiKey, agentId, taskId, taskType });
      while (Date.now() <= deadline && gateAfterRefund.ok && gateAfterRefund.json?.allowed === true) {
        await new Promise((r) => setTimeout(r, pollMs));
        gateAfterRefund = await ppoGateCheck(params.baseUrl, { apiKey: signup.apiKey, agentId, taskId, taskType });
      }

      log.push('REFUND', gateAfterRefund.ok && gateAfterRefund.json?.allowed === false, 'GET /api/agents/{agentId}/gate after refund should block', {
        status: gateAfterRefund.status,
        body: gateAfterRefund.json
      });
    }
  }

  const ok = log.blockers().length === 0;
  log.push('DONE', ok, 'scenario finished');
  return { ok, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
}
