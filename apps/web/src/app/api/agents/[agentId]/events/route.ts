import { agentHasCapability, getAgentRecord } from '../../../../../lib/agent-registry';
import { listSemanticEventsPage } from '../../../../../lib/agent-semantic-ledger';
import { rateLimitTenantApi } from '../../../../../lib/rate-limit';
import { requireTenant } from '../../../../../lib/tenant-auth';

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
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const rl = rateLimitTenantApi({
    req,
    tenantId: auth.ctx.tenantId,
    apiKeyHash: auth.ctx.apiKeyHash,
    envRpmName: 'PHOENIX_ZERO_PPE_EVENTS_RPM',
    defaultRpm: 240,
    ipEnvRpmName: 'PHOENIX_ZERO_PPE_EVENTS_IP_RPM',
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

  const semanticEnabled = envBool('PHOENIX_ZERO_SEMANTIC_LEDGER_ENABLED');
  const enforceRegistry = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_EVENTS');
  const capEnforce = envBool('PHOENIX_ZERO_AGENT_REGISTRY_ENFORCE_CAPABILITIES');

  const shouldLoadAgent = enforceRegistry || capEnforce;
  const agent = shouldLoadAgent ? await getAgentRecord({ tenantId: auth.ctx.tenantId, agentId }) : null;

  if (!agent && (enforceRegistry || capEnforce)) {
    return Response.json(
      { ok: false, reason: 'AGENT_NOT_REGISTERED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  if (agent && capEnforce && !agentHasCapability({ agent, capability: 'events:read' })) {
    return Response.json(
      { ok: false, reason: 'AGENT_CAPABILITY_DENIED' },
      { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit') || '200');
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200;
  const cursor = String(url.searchParams.get('cursor') || '').trim() || undefined;

  if (!semanticEnabled) {
    return Response.json(
      { ok: true, agentId, enabled: false, events: [], nextCursor: null },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const page = await listSemanticEventsPage({ tenantId: auth.ctx.tenantId, agentId, limit, cursor });

  return Response.json(
    { ok: true, agentId, enabled: true, events: page.events, nextCursor: page.nextCursor },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
