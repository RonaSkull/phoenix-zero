import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { createLockedInvoiceSnapshot } from '../../../../../lib/invoice-snapshots';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type ClosePeriodBody = {
  tenantId?: string;
  from?: string;
  to?: string;
  includePreviews?: boolean;
  includeUnpriced?: boolean;
};

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as ClosePeriodBody | null;
  const tenantId = (body?.tenantId || '').trim();
  const from = (body?.from || '').trim();
  const to = (body?.to || '').trim();

  if (!tenantId) {
    return Response.json({ ok: false, reason: 'Missing tenantId' }, { status: 400, headers: jsonUtf8Headers() });
  }
  if (!from || !to) {
    return Response.json({ ok: false, reason: 'Missing from/to' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const out = await createLockedInvoiceSnapshot({
    tenantId,
    from,
    to,
    includePreviews: body?.includePreviews === true,
    includeUnpriced: body?.includeUnpriced === true
  });

  if (!out.ok) {
    return Response.json({ ok: false, reason: out.reason }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  return Response.json(
    { ok: true, snapshot: out.snapshot },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
