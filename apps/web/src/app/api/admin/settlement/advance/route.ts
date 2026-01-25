import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { advanceSettlements } from '../../../../../lib/settlement/store';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type Body = {
  nowMs?: number;
  limit?: number;
};

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const nowMs = body && typeof body.nowMs === 'number' && Number.isFinite(body.nowMs) ? body.nowMs : undefined;
  const limit = body && typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : undefined;

  const res = await advanceSettlements({ nowMs, limit });
  return Response.json(
    { ok: true, advanced: res.advanced, nowMs: nowMs ?? Date.now() },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
