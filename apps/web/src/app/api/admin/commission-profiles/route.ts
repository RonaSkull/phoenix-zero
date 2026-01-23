import { requireAdminToken } from '../../../../lib/tenant-auth';
import { getCommissionProfile, upsertCommissionProfile, type CommissionProfile } from '../../../../lib/pricing';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const u = new URL(req.url);
  const id = (u.searchParams.get('id') || '').trim();

  const profile = await getCommissionProfile(id || 'default');
  return Response.json({ ok: true, profile }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as null | CommissionProfile;
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const res = await upsertCommissionProfile(body);
  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
