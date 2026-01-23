import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { listInvoiceSnapshots } from '../../../../../lib/invoice-snapshots';

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

  const url = new URL(req.url);
  const tenantId = (url.searchParams.get('tenantId') || '').trim() || undefined;

  const items = await listInvoiceSnapshots({ tenantId });

  return Response.json(
    { ok: true, tenantId: tenantId || null, items },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
