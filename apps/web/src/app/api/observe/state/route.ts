import { requireTenantOrPublic } from '../../../../lib/tenant-auth';
import { getObservationState } from '../../../../lib/observation-sessions';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireTenantOrPublic(req);
    if (!auth.ok) {
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const u = new URL(req.url);
    const sessionId = (u.searchParams.get('sessionId') || '').trim();
    if (!sessionId) {
      return Response.json(
        { ok: false, reason: 'Missing sessionId' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const state = await getObservationState(sessionId);

    if (state.tenantId && auth.ctx.tenantId && state.tenantId !== auth.ctx.tenantId) {
      return Response.json(
        { ok: false, reason: 'Unauthorized' },
        { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    return Response.json(
      { ok: true, state },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
