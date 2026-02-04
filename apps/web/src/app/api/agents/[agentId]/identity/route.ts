import { verifyPhoenixZeroPayloadSignature } from '@phoenix-zero/core';

import { agentHasCapability, getAgentRecord, upsertAgentRecord } from '../../../../../lib/agent-registry';
import { appendSemanticEvent } from '../../../../../lib/agent-semantic-ledger';
import { rateLimitTenantApi } from '../../../../../lib/rate-limit';
import { requireAdminToken, requireTenant } from '../../../../../lib/tenant-auth';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function envBool(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

 function envInt(name: string, def: number): number {
   const raw = String(process.env[name] || '').trim();
   if (!raw) return def;
   const n = Number(raw);
   if (!Number.isFinite(n)) return def;
   return Math.floor(n);
 }

 function issuedAtWithinWindow(issuedAt: string, windowSeconds: number):
   | { ok: true }
   | { ok: false; reason: 'INVALID_ISSUED_AT' | 'ISSUED_AT_OUT_OF_WINDOW'; skewSeconds?: number } {
   const t = Date.parse(issuedAt);
   if (!Number.isFinite(t)) {
     return { ok: false, reason: 'INVALID_ISSUED_AT' };
   }
   const skewMs = Date.now() - t;
   const windowMs = Math.max(1, Math.floor(windowSeconds)) * 1000;
   if (Math.abs(skewMs) > windowMs) {
     return { ok: false, reason: 'ISSUED_AT_OUT_OF_WINDOW', skewSeconds: Math.trunc(skewMs / 1000) };
   }
   return { ok: true };
 }

type IdentityPutBody = {
  agentName?: string;
  status?: 'active' | 'paused';
  capabilityScope?: unknown;
  policy?: unknown;

  ed25519PublicKeyB64Url?: string;

  keyRotation?: {
    newEd25519PublicKeyB64Url?: string;
    issuedAt?: string;
    signatureB64Url?: string;
  };
};

function tryAdminOverride(req: Request): { ok: true } | { ok: false } {
  const got = (req.headers.get('x-admin-token') || '').trim();
  if (!got) return { ok: false };
  const admin = requireAdminToken(req);
  return admin.ok ? { ok: true } : { ok: false };
}

export async function GET(req: Request, ctx: { params: { agentId: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const rl = rateLimitTenantApi({
    req,
    tenantId: auth.ctx.tenantId,
    apiKeyHash: auth.ctx.apiKeyHash,
    envRpmName: 'PHOENIX_ZERO_PPE_IDENTITY_RPM',
    defaultRpm: 120,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_IDENTITY_IP_RPM',
    ipDefaultRpm: 0
  });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reason: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
    );
  }

  const agentId = String(ctx?.params?.agentId || '').trim();
  if (!agentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const enforceRegistry = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_IDENTITY');
  const capEnforce = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CAPABILITIES');

  const agent = await getAgentRecord({ tenantId: auth.ctx.tenantId, agentId });

  if (!agent && (enforceRegistry || capEnforce)) {
    return Response.json(
      { ok: false, reason: 'AGENT_NOT_REGISTERED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  if (agent && capEnforce && !agentHasCapability({ agent, capability: 'identity:read' })) {
    return Response.json(
      { ok: false, reason: 'AGENT_CAPABILITY_DENIED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  return Response.json({ ok: true, agentId, identity: agent }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}

export async function PUT(req: Request, ctx: { params: { agentId: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const rl = rateLimitTenantApi({
    req,
    tenantId: auth.ctx.tenantId,
    apiKeyHash: auth.ctx.apiKeyHash,
    envRpmName: 'PHOENIX_ZERO_PPE_IDENTITY_RPM',
    defaultRpm: 120,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_IDENTITY_IP_RPM',
    ipDefaultRpm: 0
  });
  if (!rl.ok) {
    return Response.json(
      { ok: false, reason: 'Rate limit exceeded' },
      { status: 429, headers: jsonUtf8Headers({ 'Retry-After': String(rl.retryAfterSeconds), 'Cache-Control': 'no-store' }) }
    );
  }

  const agentId = String(ctx?.params?.agentId || '').trim();
  if (!agentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as IdentityPutBody | null;
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const semanticEnabled = envBool('PHOENIX_ZERO_SEMANTIC_LEDGER_ENABLED');
  const enforceRegistry = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_IDENTITY');
  const capEnforce = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CAPABILITIES');

  const adminOverride = tryAdminOverride(req).ok;

  const existing = await getAgentRecord({ tenantId: auth.ctx.tenantId, agentId });
  if (!existing && (enforceRegistry || capEnforce) && !adminOverride) {
    return Response.json(
      { ok: false, reason: 'AGENT_NOT_REGISTERED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  if (existing && capEnforce && !agentHasCapability({ agent: existing, capability: 'identity:write' }) && !adminOverride) {
    return Response.json(
      { ok: false, reason: 'AGENT_CAPABILITY_DENIED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const directKey = String(body.ed25519PublicKeyB64Url || '').trim() || undefined;
  const rotationNewKey = String(body.keyRotation?.newEd25519PublicKeyB64Url || '').trim() || undefined;
  const rotationIssuedAt = String(body.keyRotation?.issuedAt || '').trim() || undefined;
  const rotationSig = String(body.keyRotation?.signatureB64Url || '').trim() || undefined;

  const nextKey = rotationNewKey || directKey;
  const oldKey = String(existing?.ed25519PublicKeyB64Url || '').trim() || undefined;

  let rotated = false;

  if (nextKey && oldKey && nextKey !== oldKey) {
    if (!adminOverride) {
      if (!rotationNewKey || !rotationIssuedAt || !rotationSig) {
        return Response.json(
          { ok: false, reason: 'MISSING_KEY_ROTATION_PROOF' },
          { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }

       if (envBool('PHOENIX_ZERO_AGENT_IDENTITY_ENFORCE_ISSUED_AT_WINDOW')) {
         const windowSeconds = Math.max(5, envInt('PHOENIX_ZERO_AGENT_IDENTITY_ISSUED_AT_WINDOW_SECONDS', 300));
         const chk = issuedAtWithinWindow(rotationIssuedAt, windowSeconds);
         if (!chk.ok) {
           if (semanticEnabled) {
             await appendSemanticEvent({
               tenantId: auth.ctx.tenantId,
               agentId,
               action: 'identity:update',
               ok: false,
               reason: chk.reason,
               meta: chk.reason === 'ISSUED_AT_OUT_OF_WINDOW' ? { skewSeconds: chk.skewSeconds, windowSeconds } : { windowSeconds }
             }).catch(() => {
             });
           }
           return Response.json(
             { ok: false, reason: chk.reason },
             {
               status: chk.reason === 'INVALID_ISSUED_AT' ? 400 : 403,
               headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' })
             }
           );
         }
       }

      const payload = {
        v: 1,
        kind: 'agent_identity_rotate',
        issuedAt: rotationIssuedAt,
        tenantId: auth.ctx.tenantId,
        agentId,
        newEd25519PublicKeyB64Url: rotationNewKey
      };

      const verified = verifyPhoenixZeroPayloadSignature({
        payload,
        signatureB64Url: rotationSig,
        publicKeyB64Url: oldKey
      });

      if (!verified) {
        return Response.json(
          { ok: false, reason: 'INVALID_KEY_ROTATION_SIGNATURE' },
          { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
    }

    rotated = true;
  }

  const updated = await upsertAgentRecord({
    tenantId: auth.ctx.tenantId,
    agentId,
    agentName: typeof body.agentName === 'string' ? body.agentName : undefined,
    status: body.status === 'paused' ? 'paused' : body.status === 'active' ? 'active' : undefined,
    capabilityScope: body.capabilityScope,
    policy: body.policy,
    ed25519PublicKeyB64Url: nextKey
  });

  if (semanticEnabled) {
    if (rotated) {
      await appendSemanticEvent({
        tenantId: auth.ctx.tenantId,
        agentId,
        action: 'key_rotated',
        ok: true,
        meta: {
          oldEd25519PublicKeyB64Url: oldKey,
          newEd25519PublicKeyB64Url: nextKey,
          adminOverride
        }
      }).catch(() => {
      });
    }

    await appendSemanticEvent({
      tenantId: auth.ctx.tenantId,
      agentId,
      action: 'identity:update',
      ok: true,
      meta: {
        adminOverride
      }
    }).catch(() => {
    });
  }

  return Response.json(
    { ok: true, agentId, identity: updated, rotated },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
