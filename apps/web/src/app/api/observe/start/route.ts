import { requireTenantOrPublic } from '../../../../lib/tenant-auth';
import { startObservationSession } from '../../../../lib/observation-sessions';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function POST(req: Request) {
  try {
    const auth = await requireTenantOrPublic(req);
    if (!auth.ok) {
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const state = await startObservationSession({ tenantId: auth.ctx.tenantId });

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
