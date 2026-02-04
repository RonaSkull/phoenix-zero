import { requireTenant } from '../../../../../lib/tenant-auth';
import { checkPpoGate } from '../../../../../lib/ppo-gate';
import { rateLimitTenantApi } from '../../../../../lib/rate-limit';
import { agentHasCapability, getAgentRecord } from '../../../../../lib/agent-registry';
import { checkAndConsumeAgentGovernance } from '../../../../../lib/agent-governance';
import { appendSemanticEvent } from '../../../../../lib/agent-semantic-ledger';

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

export async function GET(req: Request, ctx: { params: { agentId: string } }) {
  let tenantIdForError: string | null = null;
  let agentIdForError: string | null = null;

  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
    }

    tenantIdForError = auth.ctx.tenantId;

    const rl = rateLimitTenantApi({
      req,
      tenantId: auth.ctx.tenantId,
      apiKeyHash: auth.ctx.apiKeyHash,
      envRpmName: 'PHOENIX_ZERO_PPE_GATE_RPM',
      defaultRpm: 300,
      ipEnvRpmName: 'PHOENIX_ZERO_PPE_GATE_IP_RPM',
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

    agentIdForError = agentId;

    const enforceRegistry = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_GATE');
    const capEnforce = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CAPABILITIES');
    const governanceEnforce = envBool('PHOENIX_ZERO_AGENT_GOVERNANCE_ENFORCE_GATE');
    const semanticEnabled = envBool('PHOENIX_ZERO_SEMANTIC_LEDGER_ENABLED');

    const shouldLoadAgent = enforceRegistry || capEnforce || governanceEnforce;
    const agent = shouldLoadAgent ? await getAgentRecord({ tenantId: auth.ctx.tenantId, agentId }) : null;

    if (!agent && (enforceRegistry || capEnforce)) {
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'gate_check',
          ok: false,
          reason: 'AGENT_NOT_REGISTERED'
        }).catch(() => {
        });
      }
      return Response.json(
        { ok: false, reason: 'AGENT_NOT_REGISTERED' },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (agent && capEnforce && !agentHasCapability({ agent, capability: 'gate:read' })) {
      if (semanticEnabled) {
        await appendSemanticEvent({
          tenantId: auth.ctx.tenantId,
          agentId,
          action: 'gate_check',
          ok: false,
          reason: 'AGENT_CAPABILITY_DENIED'
        }).catch(() => {
        });
      }
      return Response.json(
        { ok: false, reason: 'AGENT_CAPABILITY_DENIED' },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (governanceEnforce) {
      const g = await checkAndConsumeAgentGovernance({ tenantId: auth.ctx.tenantId, agentId, action: 'gate:read', consume: true });
      if (!g.allowed) {
        const retryAfter = typeof g.retryAfterSeconds === 'number' ? Math.max(1, Math.trunc(g.retryAfterSeconds)) : null;
        if (semanticEnabled) {
          await appendSemanticEvent({
            tenantId: auth.ctx.tenantId,
            agentId,
            action: 'gate_check',
            ok: false,
            reason: `AGENT_GOVERNANCE_${g.reason}`,
            meta: retryAfter ? { retryAfterSeconds: retryAfter } : undefined
          }).catch(() => {
          });
        }
        return Response.json(
          { ok: false, reason: `AGENT_GOVERNANCE_${g.reason}`, retryAfterSeconds: retryAfter || undefined },
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

    const url = new URL(req.url);
    const taskId = String(url.searchParams.get('taskId') || '').trim() || undefined;
    const taskType = String(url.searchParams.get('taskType') || '').trim() || undefined;
    const requireSignatureRaw = (url.searchParams.get('requireSignature') || '').trim().toLowerCase();
    const requireSignature =
      requireSignatureRaw === ''
        ? undefined
        : requireSignatureRaw === '1' || requireSignatureRaw === 'true' || requireSignatureRaw === 'yes' || requireSignatureRaw === 'on'
          ? true
          : requireSignatureRaw === '0' || requireSignatureRaw === 'false' || requireSignatureRaw === 'no' || requireSignatureRaw === 'off'
            ? false
            : undefined;

    const limitRaw = Number(url.searchParams.get('limit') || '500');
    const limit = Number.isFinite(limitRaw) ? limitRaw : 500;

    const decision = await checkPpoGate({
      tenantId: auth.ctx.tenantId,
      agentId,
      taskId,
      taskType,
      requireSignature,
      limit
    });

    if (semanticEnabled) {
      await appendSemanticEvent({
        tenantId: auth.ctx.tenantId,
        agentId,
        action: 'gate_check',
        ok: decision.allowed,
        reason: decision.allowed ? undefined : decision.reason,
        taskId,
        taskType,
        requireSignature,
        proofId: (decision as any)?.proofId,
        meta: decision.allowed
          ? undefined
          : {
              gateReason: decision.reason,
              proofId: (decision as any)?.proofId
            }
      }).catch(() => {
      });
    }

    const { ok: _ok, ...rest } = decision as any;
    return Response.json({ ok: true, ...rest }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[AGENTS_GATE] unhandled', { tenantId: tenantIdForError, agentId: agentIdForError, error: msg });

    if (tenantIdForError && agentIdForError) {
      return Response.json(
        { ok: true, allowed: false, reason: 'GATE_UNAVAILABLE', retryAfterSeconds: 1 },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    return Response.json(
      { ok: false, reason: 'GATE_UNAVAILABLE', error: msg },
      { status: 429, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store', 'Retry-After': '1' }) }
    );
  }
}
