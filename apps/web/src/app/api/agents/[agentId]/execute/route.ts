import { verifyPhoenixZeroPayloadSignature } from '@phoenix-zero/core';

import { requireTenant } from '../../../../../lib/tenant-auth';
import { checkPpoGate, executeWithPPOGateDecision, PpoGateBlockedError } from '../../../../../lib/ppo-gate';
import { rateLimitTenantApi } from '../../../../../lib/rate-limit';
import { agentHasCapability, getAgentRecord } from '../../../../../lib/agent-registry';
import { checkAndConsumeAgentGovernance } from '../../../../../lib/agent-governance';
import { appendSemanticEvent } from '../../../../../lib/agent-semantic-ledger';
import {
  sovereignEntitlementDebugEnabled,
  sovereignEntitlementEnforced,
  tryReleaseExecutionEntitlement,
  tryConsumeExecutionEntitlement,
  validateExecutionEntitlement
} from '../../../../../lib/sovereign-entitlement';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: { agentId: string } }) {
  const agentId = String(ctx?.params?.agentId || '').trim();
  return Response.json({ ok: true, agentId }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type ExecuteRequestBody = {
  taskId: string;
  taskType: string;
  requireSignature?: boolean;
  simulateFailure?: boolean;

  executionClassId?: string;

  agentEd25519SignatureB64Url?: string;
  agentExecuteIssuedAt?: string;
};

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

function sovereignFailurePolicy(): 'on_success' | 'always' | 'refund' {
  const raw = String(process.env.PHOENIX_ZERO_SOVEREIGN_FAILURE_POLICY || '').trim().toLowerCase();
  if (raw === 'always') return 'always';
  if (raw === 'refund') return 'refund';
  return 'on_success';
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

export async function POST(req: Request, ctx: { params: { agentId: string } }) {
  let tenantIdForError: string | null = null;
  let agentIdForError: string | null = null;
  let sovereignContextForError: null | { executionClassId: string } = null;

  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      console.warn('[AGENTS_EXECUTE] unauthorized', { status: auth.status, reason: auth.reason });
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
    }

    tenantIdForError = auth.ctx.tenantId;

    const rl = rateLimitTenantApi({
      req,
      tenantId: auth.ctx.tenantId,
      apiKeyHash: auth.ctx.apiKeyHash,
      envRpmName: 'PHOENIX_ZERO_PPE_EXECUTE_RPM',
      defaultRpm: 300,
      ipEnvRpmName: 'PHOENIX_ZERO_PPE_EXECUTE_IP_RPM',
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
      console.warn('[AGENTS_EXECUTE] missing agentId');
      return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
    }

    agentIdForError = agentId;

    console.log('[AGENTS_EXECUTE] incoming', { tenantId: auth.ctx.tenantId, agentId });

    let body: ExecuteRequestBody | null = null;
    try {
      body = (await req.json()) as ExecuteRequestBody;
    } catch {
      body = null;
    }

    const taskId = String(body?.taskId || '').trim();
    const taskType = String(body?.taskType || '').trim();
    const requireSignature = body?.requireSignature === true;
    const simulateFailure = body?.simulateFailure === true;

    const executionClassId = String((body as any)?.executionClassId || '').trim() || undefined;

    const agentExecuteSignatureB64Url = String(body?.agentEd25519SignatureB64Url || '').trim() || undefined;
    const agentExecuteIssuedAt = String(body?.agentExecuteIssuedAt || '').trim() || undefined;

  if (simulateFailure && process.env.NODE_ENV === 'production' && !envBool('PHOENIX_ZERO_ALLOW_SIMULATED_FAILURE')) {
    return Response.json(
      { ok: false, reason: 'simulateFailure not allowed' },
      { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  if (!taskId || !taskType) {
    return Response.json({ ok: false, reason: 'Missing taskId or taskType' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const enforceRegistry = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_EXECUTE');
  const capEnforce = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CAPABILITIES');
  const identityStrict = envBool('PHOENIX_ZERO_AGENT_IDENTITY_STRICT') || envBool('PHOENIX_ZERO_AGENT_IDENTITY_ENFORCE_SIGNATURE_ON_EXECUTE');
  const governanceEnforce = envBool('PHOENIX_ZERO_AGENT_GOVERNANCE_ENFORCE_EXECUTE');
  const semanticEnabled = envBool('PHOENIX_ZERO_SEMANTIC_LEDGER_ENABLED');

  const shouldLoadAgent = enforceRegistry || capEnforce || identityStrict || governanceEnforce;
  const agent = shouldLoadAgent ? await getAgentRecord({ tenantId: auth.ctx.tenantId, agentId }) : null;

  if (!agent && (enforceRegistry || capEnforce || identityStrict)) {
    if (semanticEnabled) {
      await appendSemanticEvent({
        tenantId: auth.ctx.tenantId,
        agentId,
        action: 'execute',
        ok: false,
        reason: 'AGENT_NOT_REGISTERED',
        taskId,
        taskType,
        requireSignature
      }).catch(() => {
      });
    }
    return Response.json({ ok: false, reason: 'AGENT_NOT_REGISTERED' }, { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  if (agent && capEnforce && !agentHasCapability({ agent, capability: 'execute' })) {
    if (semanticEnabled) {
      await appendSemanticEvent({
        tenantId: auth.ctx.tenantId,
        agentId,
        action: 'execute',
        ok: false,
        reason: 'AGENT_CAPABILITY_DENIED',
        taskId,
        taskType,
        requireSignature
      }).catch(() => {
      });
    }
    return Response.json(
      { ok: false, reason: 'AGENT_CAPABILITY_DENIED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  if (identityStrict) {
    const pubKey = String(agent?.ed25519PublicKeyB64Url || '').trim() || undefined;
    if (!pubKey || !agentExecuteSignatureB64Url || !agentExecuteIssuedAt) {
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'execute',
          ok: false,
          reason: 'MISSING_AGENT_SIGNATURE_FIELDS',
          taskId,
          taskType,
          requireSignature
        }).catch(() => {
        });
      }
      return Response.json(
        { ok: false, reason: 'MISSING_AGENT_SIGNATURE_FIELDS' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (envBool('PHOENIX_ZERO_AGENT_IDENTITY_ENFORCE_ISSUED_AT_WINDOW')) {
      const windowSeconds = Math.max(5, envInt('PHOENIX_ZERO_AGENT_IDENTITY_ISSUED_AT_WINDOW_SECONDS', 300));
      const chk = issuedAtWithinWindow(agentExecuteIssuedAt, windowSeconds);
      if (!chk.ok) {
        if (semanticEnabled) {
          await appendSemanticEvent({
            tenantId: auth.ctx.tenantId,
            agentId,
            action: 'execute',
            ok: false,
            reason: chk.reason,
            taskId,
            taskType,
            requireSignature,
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
      kind: 'agent_execute',
      issuedAt: agentExecuteIssuedAt,
      tenantId: auth.ctx.tenantId,
      agentId,
      taskId,
      taskType,
      requireSignature
    };

    const verified = verifyPhoenixZeroPayloadSignature({
      payload,
      signatureB64Url: agentExecuteSignatureB64Url,
      publicKeyB64Url: pubKey
    });
    if (!verified) {
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'execute',
          ok: false,
          reason: 'INVALID_AGENT_SIGNATURE',
          taskId,
          taskType,
          requireSignature,
          signatureB64Url: agentExecuteSignatureB64Url
        }).catch(() => {
        });
      }
      return Response.json(
        { ok: false, reason: 'INVALID_AGENT_SIGNATURE' },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
  }

  if (governanceEnforce) {
    const g0 = await checkAndConsumeAgentGovernance({
      tenantId: auth.ctx.tenantId,
      agentId,
      action: 'execute',
      consume: false
    });

    if (!g0.allowed) {
      const retryAfter = typeof g0.retryAfterSeconds === 'number' ? Math.max(1, Math.trunc(g0.retryAfterSeconds)) : null;
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'execute',
          ok: false,
          reason: `AGENT_GOVERNANCE_${g0.reason}`,
          taskId,
          taskType,
          requireSignature,
          meta: retryAfter ? { retryAfterSeconds: retryAfter } : undefined
        }).catch(() => {
        });
      }
      return Response.json(
        { ok: false, reason: `AGENT_GOVERNANCE_${g0.reason}`, retryAfterSeconds: retryAfter || undefined },
        {
          status: 403,
          headers: jsonUtf8Headers({
            'Cache-Control': 'no-store',
            ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {})
          })
        }
      );
    }
  }

  const gate = await checkPpoGate({
    tenantId: auth.ctx.tenantId,
    agentId,
    taskId,
    taskType,
    requireSignature,
    limit: 500
  });

  if (!gate.allowed) {
    if (semanticEnabled) {
      await appendSemanticEvent({
        tenantId: auth.ctx.tenantId,
        agentId,
        action: 'execute',
        ok: false,
        reason: gate.reason,
        taskId,
        taskType,
        requireSignature,
        proofId: gate.proofId,
        meta: { gateReason: gate.reason, proofId: gate.proofId }
      }).catch(() => {
      });
    }
    return Response.json(
      { ok: false, reason: 'PPO_GATE_BLOCKED', gate },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const sovereignEnforce = sovereignEntitlementEnforced();
  const sovereignDebug = sovereignEntitlementDebugEnabled();

  let sovereignContext:
    | null
    | {
        contractId: string;
        executionClassId: string;
        currency: string;
        pricePerExecutionCents: number;
        usage?: { day: string; month: string; dailyExecutions: number; monthlyExecutions: number };
      } = null;

  if (sovereignEnforce) {
    const entitlement = await validateExecutionEntitlement({
      tenantId: auth.ctx.tenantId,
      agentId,
      taskType,
      requestedExecutionClassId: executionClassId,
      enforce: true
    });

    if (!entitlement.allowed) {
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'execute',
          ok: false,
          reason: entitlement.reasonCode,
          taskId,
          taskType,
          requireSignature,
          meta: { sovereign: { reasonCode: entitlement.reasonCode, executionClassId } }
        }).catch(() => {
        });
      }

      return Response.json(
        {
          ok: false,
          reasonCode: entitlement.reasonCode,
          reason: entitlement.reasonCode
        },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const consumed = await tryConsumeExecutionEntitlement({
      tenantId: auth.ctx.tenantId,
      agentId,
      contractId: entitlement.contract.contractId,
      executionClass: entitlement.executionClass
    });

    if (!consumed.allowed) {
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'execute',
          ok: false,
          reason: consumed.reasonCode,
          taskId,
          taskType,
          requireSignature,
          meta: {
            sovereign: {
              reasonCode: consumed.reasonCode,
              contractId: entitlement.contract.contractId,
              executionClassId: entitlement.executionClass.classId
            }
          }
        }).catch(() => {
        });
      }

      return Response.json(
        {
          ok: false,
          reasonCode: consumed.reasonCode,
          reason: consumed.reasonCode
        },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    sovereignContext = {
      contractId: entitlement.contract.contractId,
      executionClassId: entitlement.executionClass.classId,
      currency: String(entitlement.executionClass.currency || '').trim() || 'USD',
      pricePerExecutionCents: Math.max(0, Math.trunc(Number(entitlement.executionClass.pricePerExecutionCents ?? 0))),
      usage: consumed.usage
    };

    sovereignContextForError = { executionClassId: entitlement.executionClass.classId };
  }

  if (governanceEnforce) {
    const g1 = await checkAndConsumeAgentGovernance({
      tenantId: auth.ctx.tenantId,
      agentId,
      action: 'execute',
      consume: true
    });

    if (!g1.allowed) {
      if (sovereignContext) {
        await tryReleaseExecutionEntitlement({
          tenantId: auth.ctx.tenantId,
          agentId,
          executionClassId: sovereignContext.executionClassId
        }).catch(() => {
        });
      }

      const retryAfter = typeof g1.retryAfterSeconds === 'number' ? Math.max(1, Math.trunc(g1.retryAfterSeconds)) : null;
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'execute',
          ok: false,
          reason: `AGENT_GOVERNANCE_${g1.reason}`,
          taskId,
          taskType,
          requireSignature,
          meta: retryAfter ? { retryAfterSeconds: retryAfter } : undefined
        }).catch(() => {
        });
      }
      return Response.json(
        { ok: false, reason: `AGENT_GOVERNANCE_${g1.reason}`, retryAfterSeconds: retryAfter || undefined },
        {
          status: 403,
          headers: jsonUtf8Headers({
            'Cache-Control': 'no-store',
            ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {})
          })
        }
      );
    }
  }

  try {
    const out = await executeWithPPOGateDecision({
      gate,
      action: async () => {
        if (simulateFailure) {
          throw new Error('SIMULATED_HANDLER_FAILURE');
        }
        return { executed: true };
      }
    });

    console.log('[AGENTS_EXECUTE] allowed', { tenantId: auth.ctx.tenantId, agentId, taskId, taskType });

    if (semanticEnabled) {
      await appendSemanticEvent({
        tenantId: auth.ctx.tenantId,
        agentId,
        action: 'execute',
        ok: true,
        taskId,
        taskType,
        requireSignature,
        proofId: gate.proofId
      }).catch(() => {
      });
    }

    return Response.json(
      {
        ok: true,
        executed: true,
        agentId,
        taskId,
        taskType,
        result: out,
        ...(sovereignContext && (sovereignEnforce || sovereignDebug) ? { sovereign: sovereignContext } : {})
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    if (e instanceof PpoGateBlockedError) {
      if (sovereignContext) {
        await tryReleaseExecutionEntitlement({
          tenantId: auth.ctx.tenantId,
          agentId,
          executionClassId: sovereignContext.executionClassId
        }).catch(() => {
        });
      }

      console.log('[AGENTS_EXECUTE] blocked', {
        tenantId: auth.ctx.tenantId,
        agentId,
        taskId,
        taskType,
        reason: e.gate.reason
      });

      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'execute',
          ok: false,
          reason: e.gate.reason,
          taskId,
          taskType,
          requireSignature,
          proofId: e.gate.proofId,
          meta: { gateReason: e.gate.reason, proofId: e.gate.proofId }
        }).catch(() => {
        });
      }

      return Response.json(
        { ok: false, reason: 'PPO_GATE_BLOCKED', gate: e.gate },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (sovereignContext) {
      const policy = sovereignFailurePolicy();
      if (policy !== 'always') {
        await tryReleaseExecutionEntitlement({
          tenantId: auth.ctx.tenantId,
          agentId,
          executionClassId: sovereignContext.executionClassId
        }).catch(() => {
        });
      }
    }
    const msg = e instanceof Error ? e.message : String(e);

    if (simulateFailure && msg === 'SIMULATED_HANDLER_FAILURE') {
      return Response.json(
        { ok: false, reason: 'EXECUTE_FAILED', error: msg },
        { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (semanticEnabled) {
      await appendSemanticEvent({
        tenantId: auth.ctx.tenantId,
        agentId,
        action: 'execute',
        ok: false,
        reason: 'EXECUTE_FAILED',
        taskId,
        taskType,
        requireSignature,
        meta: { error: msg }
      }).catch(() => {
      });
    }

    return Response.json(
      { ok: false, reason: 'EXECUTE_FAILED', error: msg },
      {
        status: 429,
        headers: jsonUtf8Headers({ 'Cache-Control': 'no-store', 'Retry-After': '1' })
      }
    );
  }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[AGENTS_EXECUTE] unhandled', { tenantId: tenantIdForError, agentId: agentIdForError, error: msg });

    if (tenantIdForError && agentIdForError && sovereignContextForError) {
      const policy = sovereignFailurePolicy();
      if (policy !== 'always') {
        await tryReleaseExecutionEntitlement({
          tenantId: tenantIdForError,
          agentId: agentIdForError,
          executionClassId: sovereignContextForError.executionClassId
        }).catch(() => {
        });
      }
    }

    return Response.json(
      { ok: false, reason: 'EXECUTE_UNAVAILABLE', error: msg },
      {
        status: 429,
        headers: jsonUtf8Headers({ 'Cache-Control': 'no-store', 'Retry-After': '1' })
      }
    );
  }
}
