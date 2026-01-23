import { requireTenant } from '../../../../lib/tenant-auth';
import { listInvoiceSnapshots } from '../../../../lib/invoice-snapshots';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json(
      { ok: false, reason: auth.reason },
      { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const items = await listInvoiceSnapshots({ tenantId: auth.ctx.tenantId });

  return Response.json(
    { ok: true, tenantId: auth.ctx.tenantId, items },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
