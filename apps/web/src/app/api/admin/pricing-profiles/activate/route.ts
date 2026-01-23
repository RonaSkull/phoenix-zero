import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { activatePricingProfileVersion } from '../../../../../lib/pricing';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as null | { id?: string; versionId?: string };
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const id = String(body.id || '').trim();
  const versionId = String(body.versionId || '').trim();
  if (!id) {
    return Response.json({ ok: false, reason: 'Missing id' }, { status: 400, headers: jsonUtf8Headers() });
  }
  if (!versionId) {
    return Response.json({ ok: false, reason: 'Missing versionId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const res = await activatePricingProfileVersion({ id, versionId });
  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
