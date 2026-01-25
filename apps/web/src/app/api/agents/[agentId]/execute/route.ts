import { requireTenant } from '../../../../../lib/tenant-auth';
import { executeWithPPOGate, PpoGateBlockedError } from '../../../../../lib/ppo-gate';

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
};

export async function POST(req: Request, ctx: { params: { agentId: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    console.warn('[AGENTS_EXECUTE] unauthorized', { status: auth.status, reason: auth.reason });
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const agentId = String(ctx?.params?.agentId || '').trim();
  if (!agentId) {
    console.warn('[AGENTS_EXECUTE] missing agentId');
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

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

  if (!taskId || !taskType) {
    return Response.json({ ok: false, reason: 'Missing taskId or taskType' }, { status: 400, headers: jsonUtf8Headers() });
  }

  try {
    const out = await executeWithPPOGate({
      tenantId: auth.ctx.tenantId,
      agentId,
      taskId,
      taskType,
      requireSignature,
      action: async () => ({ executed: true })
    });

    return Response.json(
      { ok: true, executed: true, agentId, taskId, taskType, result: out },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    if (e instanceof PpoGateBlockedError) {
      return Response.json(
        { ok: false, reason: 'PPO_GATE_BLOCKED', gate: e.gate },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: 'EXECUTE_FAILED', error: msg },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
