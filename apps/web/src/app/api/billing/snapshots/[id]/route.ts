import { requireTenant } from '../../../../../lib/tenant-auth';
import { getInvoiceSnapshotById } from '../../../../../lib/invoice-snapshots';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json(
      { ok: false, reason: auth.reason },
      { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const id = (ctx?.params?.id || '').trim();
  if (!id) {
    return Response.json({ ok: false, reason: 'Missing id' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const snap = await getInvoiceSnapshotById(id);
  if (!snap || snap.tenantId !== auth.ctx.tenantId) {
    return Response.json({ ok: false, reason: 'Not found' }, { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  return Response.json(
    { ok: true, snapshot: snap },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
