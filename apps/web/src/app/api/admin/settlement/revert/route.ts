import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { revertSettlement } from '../../../../../lib/settlement/store';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type Body = {
  proofId?: string;
  settlementId?: string;
  sourceEventId?: string;
};

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const proofId = String(body?.proofId || '').trim() || undefined;
  const settlementId = String(body?.settlementId || '').trim() || undefined;
  const sourceEventId = String(body?.sourceEventId || '').trim() || undefined;

  if (!proofId && !settlementId) {
    return Response.json({ ok: false, reason: 'Missing proofId or settlementId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const out = await revertSettlement({
    proofId,
    settlementId,
    sourceEventId,
    lastUpdatedBy: sourceEventId ? `admin:${sourceEventId}` : 'admin'
  });

  if (!out) {
    return Response.json({ ok: false, reason: 'Settlement not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true, settlement: out }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
