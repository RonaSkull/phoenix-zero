import { requireAdminToken } from '../../../../../../lib/tenant-auth';
import { getInvoiceSnapshotById } from '../../../../../../lib/invoice-snapshots';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const id = (ctx?.params?.id || '').trim();
  if (!id) {
    return Response.json({ ok: false, reason: 'Missing id' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const snap = await getInvoiceSnapshotById(id);
  if (!snap) {
    return Response.json({ ok: false, reason: 'Not found' }, { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  return Response.json(
    { ok: true, snapshot: snap },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
