import { requireAdminToken } from '../../../../../../lib/tenant-auth';
import { getOrCreateBillingAccount } from '../../../../../../lib/billing-accounts';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request, ctx: { params: { tenantId: string } }) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const tenantId = (ctx?.params?.tenantId || '').trim();
  if (!tenantId) {
    return Response.json({ ok: false, reason: 'Missing tenantId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const out = await getOrCreateBillingAccount(tenantId);
  if (!out.ok) {
    return Response.json({ ok: false, reason: out.reason }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  return Response.json(
    { ok: true, account: out.account },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
