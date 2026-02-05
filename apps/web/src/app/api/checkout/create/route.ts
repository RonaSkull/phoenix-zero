import { phoenixZeroStableStringify, sha256B64Url, verifyPhoenixZeroPayloadSignature } from '@phoenix-zero/core';

import { postgresEnabled, updateKvJsonLocked } from '../../../../lib/pg-kv';
import { createPaymentIntent, getPaymentIntentById, quoteCheckoutAmount, type CheckoutLineItem } from '../../../../lib/payments';
import { agentHasCapability, getAgentRecord, upsertAgentRecord } from '../../../../lib/agent-registry';
import { checkAndConsumeAgentGovernance } from '../../../../lib/agent-governance';
import { appendSemanticEvent } from '../../../../lib/agent-semantic-ledger';
import { fingerprintFromRequest } from '../../../../lib/agent-fingerprint';
import { requireTenant } from '../../../../lib/tenant-auth';
import { rateLimitOk, rateLimitTenantApi } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type CheckoutIdempotencyDb = {
  version: 1;
  records: Record<
    string,
    {
      requestHashB64Url: string;
      status: 'creating' | 'created' | 'failed';
      paymentId?: string;
      errorReason?: string;
      createdAt: string;
      updatedAt: string;
    }
  >;
};

function nowIso(): string {
  return new Date().toISOString();
}

function computeRequestHashB64Url(payload: unknown): string {
  const canonical = phoenixZeroStableStringify(payload);
  const bytes = new TextEncoder().encode(canonical);
  return sha256B64Url(bytes);
}

function envBool(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

function envBoolDefault(name: string, defaultValue: boolean): boolean {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return defaultValue;
  return envBool(name);
}

function envInt0(name: string, def: number): number {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.trunc(n));
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

type CheckoutIdempotencyDecision =
  | { kind: 'create' }
  | { kind: 'in_progress' }
  | { kind: 'conflict' }
  | { kind: 'return_existing'; paymentId: string }
  | { kind: 'return_failed'; reason: string };

export async function POST(req: Request) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const fp = fingerprintFromRequest(req);
  const fpRpm = envInt0('PHOENIX_ZERO_PPE_CHECKOUT_CREATE_FP_RPM', 0);
  if (fpRpm > 0 && fp.fp) {
    const hit = rateLimitOk({ key: `PHOENIX_ZERO_PPE_CHECKOUT_CREATE_FP_RPM:fp:${fp.fp}`, rpm: fpRpm });
    if (!hit.ok) {
      return Response.json(
        { ok: false, reason: 'Rate limit exceeded' },
        { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(hit.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
      );
    }
  }

  const rl = rateLimitTenantApi({
    req,
    tenantId: auth.ctx.tenantId,
    apiKeyHash: auth.ctx.apiKeyHash,
    envRpmName: 'PHOENIX_ZERO_PPE_CHECKOUT_CREATE_RPM',
    defaultRpm: 120,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_CHECKOUT_CREATE_IP_RPM',
    ipDefaultRpm: 0
  });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reason: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
    );
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

  const proofMetaAgentId = String(body.proofMeta?.agentId || '').trim();
  const proofMetaTaskId = String(body.proofMeta?.taskId || '').trim() || undefined;
  const proofMetaTaskType = String(body.proofMeta?.taskType || '').trim() || undefined;
  const proofMetaTaskInputHash = String(body.proofMeta?.taskInputHash || '').trim() || undefined;
  const proofMetaTaskOutputHash = String(body.proofMeta?.taskOutputHash || '').trim() || undefined;
  const proofMetaPubKey = String(body.proofMeta?.agentEd25519PublicKeyB64Url || '').trim() || undefined;
  const proofMetaSig = String(body.proofMeta?.agentEd25519SignatureB64Url || '').trim() || undefined;

  if (!Array.isArray(lineItems) || lineItems.length <= 0) {
    return Response.json({ ok: false, reason: 'Missing lineItems' }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  const tenantKyc = String((auth.ctx.tenant as any)?.kycStatus || 'none').trim().toLowerCase();
  const riskBlockRaw = String(process.env.PHOENIX_ZERO_PPE_CHECKOUT_CREATE_RISK_BLOCK_THRESHOLD || '').trim();
  const riskBlockThreshold = riskBlockRaw ? clampInt(envInt0('PHOENIX_ZERO_PPE_CHECKOUT_CREATE_RISK_BLOCK_THRESHOLD', 100), 0, 100) : null;
  const riskScore = clampInt(fp.agentScore + (tenantKyc === 'none' ? 10 : 0) + (lineItems.length > 8 ? 10 : 0), 0, 100);
  if (typeof riskBlockThreshold === 'number' && riskScore >= riskBlockThreshold) {
    return Response.json(
      { ok: false, reasonCode: 'RISK_BLOCKED', reason: 'RISK_BLOCKED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const missingProofMetaFields: string[] = [];
  if (!proofMetaAgentId) missingProofMetaFields.push('proofMeta.agentId');
  if (!proofMetaTaskId) missingProofMetaFields.push('proofMeta.taskId');
  if (!proofMetaTaskType) missingProofMetaFields.push('proofMeta.taskType');
  if (!proofMetaTaskInputHash) missingProofMetaFields.push('proofMeta.taskInputHash');
  if (!proofMetaTaskOutputHash) missingProofMetaFields.push('proofMeta.taskOutputHash');

  if (missingProofMetaFields.length > 0) {
    return Response.json(
      {
        ok: false,
        reasonCode: 'MISSING_PROOF_META_FIELDS',
        reason: 'MISSING_PROOF_META_FIELDS',
        missingFields: missingProofMetaFields
      },
      { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const idempotencyKey = String(req.headers.get('x-idempotency-key') || '').trim() || undefined;
  if (idempotencyKey && idempotencyKey.length > 200) {
    return Response.json({ ok: false, reason: 'Invalid x-idempotency-key' }, { status: 400, headers: jsonUtf8Headers() });
  }

  if (proofMetaAgentId) {
    const enforceRegistry = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CHECKOUT_CREATE');
    const enforceKeyBinding = envBool('PHOENIX_ZERO_AGENT_IDENTITY_ENFORCE_KEY_BINDING');
    const allowKeyRotation = envBool('PHOENIX_ZERO_AGENT_IDENTITY_ALLOW_KEY_ROTATION');
    const enforceSignature = envBool('PHOENIX_ZERO_AGENT_IDENTITY_ENFORCE_SIGNATURE_ON_CHECKOUT_CREATE');
    const autoUpsert = envBoolDefault('PHOENIX_ZERO_AGENT_REGISTRY_AUTO_UPSERT_ON_CHECKOUT_CREATE', true);

    const existing = await getAgentRecord({ tenantId, agentId: proofMetaAgentId });
    if (!existing && enforceRegistry && !autoUpsert) {
      return Response.json(
        { ok: false, reason: 'AGENT_NOT_REGISTERED' },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const existingPubKey = String(existing?.ed25519PublicKeyB64Url || '').trim() || undefined;
    if (existingPubKey && proofMetaPubKey && existingPubKey !== proofMetaPubKey) {
      if (enforceKeyBinding && !allowKeyRotation) {
        return Response.json(
          { ok: false, reason: 'AGENT_PUBLIC_KEY_MISMATCH' },
          { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
    }

    if (enforceSignature) {
      if (!proofMetaPubKey || !proofMetaSig || !proofMetaTaskId || !proofMetaTaskType || !proofMetaTaskInputHash || !proofMetaTaskOutputHash) {
        return Response.json(
          { ok: false, reason: 'MISSING_AGENT_SIGNATURE_FIELDS' },
          { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }

      const payload = {
        v: 1,
        kind: 'ppo_meta',
        tenantId,
        agentId: proofMetaAgentId,
        taskId: proofMetaTaskId,
        taskType: proofMetaTaskType,
        taskInputHash: proofMetaTaskInputHash,
        taskOutputHash: proofMetaTaskOutputHash
      };
      const verified = verifyPhoenixZeroPayloadSignature({
        payload,
        signatureB64Url: proofMetaSig,
        publicKeyB64Url: proofMetaPubKey
      });
      if (!verified) {
        return Response.json(
          { ok: false, reason: 'INVALID_AGENT_SIGNATURE' },
          { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
    }

    const canWriteIdentity = envBoolDefault('PHOENIX_ZERO_AGENT_REGISTRY_AUTO_UPSERT_ON_CHECKOUT_CREATE', true);
    if (autoUpsert && canWriteIdentity) {
      if (!existing) {
        await upsertAgentRecord({
          tenantId,
          agentId: proofMetaAgentId,
          ed25519PublicKeyB64Url: proofMetaPubKey,
          status: 'active'
        }).catch(() => {
        });
      } else if (allowKeyRotation && proofMetaPubKey && existingPubKey !== proofMetaPubKey) {
        await upsertAgentRecord({
          tenantId,
          agentId: proofMetaAgentId,
          ed25519PublicKeyB64Url: proofMetaPubKey
        }).catch(() => {
        });
      }
    }

    const capEnforce = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CAPABILITIES');
    if (capEnforce && existing && !agentHasCapability({ agent: existing, capability: 'checkout:create' })) {
      return Response.json(
        { ok: false, reason: 'AGENT_CAPABILITY_DENIED' },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
  }

  const requestHashB64Url = idempotencyKey
    ? computeRequestHashB64Url({
        tenantId,
        pricingProfileId,
        pricingVersionId: pricingVersionId || null,
        currency,
        providerHint: String(body.providerHint || '').trim() || null,
        lineItems,
        proofMeta: body.proofMeta || null
      })
    : undefined;

  if (idempotencyKey && postgresEnabled() && requestHashB64Url) {
    const tenantKey = `${tenantId}:${idempotencyKey}`;

    const decisionBox: { value: CheckoutIdempotencyDecision | null } = { value: null };

    await updateKvJsonLocked<CheckoutIdempotencyDb>('checkout-idempotency', (current) => {
      const db: CheckoutIdempotencyDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? (current as CheckoutIdempotencyDb)
          : { version: 1, records: {} };

      const rec = db.records[tenantKey];
      if (rec) {
        if (rec.requestHashB64Url !== requestHashB64Url) {
          decisionBox.value = { kind: 'conflict' };
          return db;
        }

        if (rec.status === 'created' && rec.paymentId) {
          decisionBox.value = { kind: 'return_existing', paymentId: rec.paymentId };
          return db;
        }

        if (rec.status === 'failed' && rec.errorReason) {
          decisionBox.value = { kind: 'return_failed', reason: rec.errorReason };
          return db;
        }

        decisionBox.value = { kind: 'in_progress' };
        return db;
      }

      const ts = nowIso();
      db.records[tenantKey] = {
        requestHashB64Url,
        status: 'creating',
        createdAt: ts,
        updatedAt: ts
      };
      decisionBox.value = { kind: 'create' };
      return db;
    });

    const decision: CheckoutIdempotencyDecision = decisionBox.value || { kind: 'create' };

    if (decision.kind === 'conflict') {
      return Response.json(
        { ok: false, reason: 'IDEMPOTENCY_KEY_REUSED' },
        { status: 409, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (decision.kind === 'in_progress') {
      return Response.json(
        { ok: false, reason: 'IDEMPOTENCY_IN_PROGRESS' },
        { status: 409, headers: jsonUtf8Headers({ 'Retry-After': '2', 'Cache-Control': 'no-store' }) }
      );
    }

    if (decision.kind === 'return_failed') {
      return Response.json(
        { ok: false, reason: decision.reason },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (decision.kind === 'return_existing') {
      const existing = await getPaymentIntentById(decision.paymentId);
      if (!existing || existing.tenantId !== tenantId) {
        return Response.json(
          { ok: false, reason: 'IDEMPOTENCY_RECORD_STALE' },
          { status: 409, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }

      return Response.json(
        {
          ok: true,
          paymentId: existing.id,
          status: existing.status,
          provider: existing.provider,
          amountCents: existing.amountCents,
          currency: existing.currency,
          checkoutUrl: existing.checkoutUrl,
          instructions: existing.instructions,
          pricing: {
            pricingProfileId: existing.pricingProfileId,
            pricingVersionId: existing.pricingVersionId
          }
        },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
  }

  if (proofMetaAgentId && envBool('PHOENIX_ZERO_AGENT_GOVERNANCE_ENFORCE_CHECKOUT_CREATE')) {
    const q = await quoteCheckoutAmount({ tenantId, currency, pricingProfileId, pricingVersionId, lineItems });
    if (!q.ok) {
      if (idempotencyKey && postgresEnabled() && requestHashB64Url) {
        const tenantKey = `${tenantId}:${idempotencyKey}`;
        await updateKvJsonLocked<CheckoutIdempotencyDb>('checkout-idempotency', (current) => {
          const db: CheckoutIdempotencyDb =
            current && typeof current === 'object' && (current as any).version === 1
              ? (current as CheckoutIdempotencyDb)
              : { version: 1, records: {} };
          const rec = db.records[tenantKey];
          if (rec && rec.requestHashB64Url === requestHashB64Url && rec.status === 'creating') {
            const ts = nowIso();
            db.records[tenantKey] = { ...rec, status: 'failed', errorReason: q.reason, updatedAt: ts };
          }
          return db;
        }).catch(() => {});
      }
      return Response.json(
        { ok: false, reasonCode: q.reason, reason: q.reason, ...(q.details ? { details: q.details } : {}) },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const dailyDecision = await checkAndConsumeAgentGovernance({
      tenantId,
      agentId: proofMetaAgentId,
      action: 'checkout:create',
      amountCents: Math.max(0, Math.trunc(q.amountCents)),
      consume: false
    });
    if (!dailyDecision.allowed) {
      const reason = `AGENT_GOVERNANCE_${dailyDecision.reason}`;
      if (idempotencyKey && postgresEnabled() && requestHashB64Url) {
        const tenantKey = `${tenantId}:${idempotencyKey}`;
        await updateKvJsonLocked<CheckoutIdempotencyDb>('checkout-idempotency', (current) => {
          const db: CheckoutIdempotencyDb =
            current && typeof current === 'object' && (current as any).version === 1
              ? (current as CheckoutIdempotencyDb)
              : { version: 1, records: {} };
          const rec = db.records[tenantKey];
          if (rec && rec.requestHashB64Url === requestHashB64Url && rec.status === 'creating') {
            const ts = nowIso();
            db.records[tenantKey] = { ...rec, status: 'failed', errorReason: reason, updatedAt: ts };
          }
          return db;
        }).catch(() => {});
      }
      return Response.json(
        { ok: false, reason },
        {
          status: 403,
          headers: jsonUtf8Headers({
            'Cache-Control': 'no-store',
            ...(dailyDecision.retryAfterSeconds ? { 'Retry-After': String(dailyDecision.retryAfterSeconds) } : {})
          })
        }
      );
    }

    await checkAndConsumeAgentGovernance({
      tenantId,
      agentId: proofMetaAgentId,
      action: 'checkout:create',
      amountCents: 0,
      consume: true
    }).catch(() => {
    });
  }

  const out = await createPaymentIntent({
    tenantId,
    pricingProfileId,
    pricingVersionId,
    currency,
    providerHint: String(body.providerHint || '').trim() || undefined,
    lineItems,
    proofMeta: body.proofMeta
  });

  if (!out.ok) {
    if (idempotencyKey && postgresEnabled() && requestHashB64Url) {
      const tenantKey = `${tenantId}:${idempotencyKey}`;
      await updateKvJsonLocked<CheckoutIdempotencyDb>('checkout-idempotency', (current) => {
        const db: CheckoutIdempotencyDb =
          current && typeof current === 'object' && (current as any).version === 1
            ? (current as CheckoutIdempotencyDb)
            : { version: 1, records: {} };
        const rec = db.records[tenantKey];
        if (rec && rec.requestHashB64Url === requestHashB64Url && rec.status === 'creating') {
          const ts = nowIso();
          db.records[tenantKey] = { ...rec, status: 'failed', errorReason: out.reason, updatedAt: ts };
        }
        return db;
      }).catch(() => {});
    }
    return Response.json(
      { ok: false, reasonCode: out.reason, reason: out.reason, ...(out.details ? { details: out.details } : {}) },
      { status: 400, headers: jsonUtf8Headers() }
    );
  }

  const intent = out.intent;

  if (proofMetaAgentId && envBool('PHOENIX_ZERO_SEMANTIC_LEDGER_ENABLED')) {
    await appendSemanticEvent({
      tenantId,
      agentId: proofMetaAgentId,
      action: 'checkout_create',
      ok: true,
      paymentIntentId: intent.id,
      amountCents: Math.max(0, Math.trunc(intent.amountCents)),
      currency: String(intent.currency || '').trim() || undefined,
      taskId: proofMetaTaskId,
      taskType: proofMetaTaskType,
      signatureB64Url: proofMetaSig,
      meta: {
        provider: intent.provider,
        providerPaymentId: String(intent.providerPaymentId || '').trim() || undefined
      }
    }).catch(() => {
    });
  }

  if (idempotencyKey && postgresEnabled() && requestHashB64Url) {
    const tenantKey = `${tenantId}:${idempotencyKey}`;
    await updateKvJsonLocked<CheckoutIdempotencyDb>('checkout-idempotency', (current) => {
      const db: CheckoutIdempotencyDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? (current as CheckoutIdempotencyDb)
          : { version: 1, records: {} };
      const rec = db.records[tenantKey];
      if (rec && rec.requestHashB64Url === requestHashB64Url) {
        const ts = nowIso();
        db.records[tenantKey] = { ...rec, status: 'created', paymentId: intent.id, updatedAt: ts };
      }
      return db;
    }).catch(() => {});
  }

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
