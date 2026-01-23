import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { ensureBillingAccountsForAllTenants, listBillingAccounts, setBillingAccountStatus } from '../../../../../lib/billing-accounts';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type UpdateBody = {
  tenantId?: string;
  status?: string;
  graceUntil?: string;
  suspendedReason?: string;
};

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  await ensureBillingAccountsForAllTenants();

  const url = new URL(req.url);
  const tenantId = (url.searchParams.get('tenantId') || '').trim() || undefined;

  const items = await listBillingAccounts({ tenantId });

  return Response.json(
    { ok: true, tenantId: tenantId || null, items },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as UpdateBody | null;
  const tenantId = (body?.tenantId || '').trim();
  const status = (body?.status || '').trim();

  if (!tenantId) {
    return Response.json({ ok: false, reason: 'Missing tenantId' }, { status: 400, headers: jsonUtf8Headers() });
  }
  if (!status) {
    return Response.json({ ok: false, reason: 'Missing status' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const out = await setBillingAccountStatus({
    tenantId,
    status: status as any,
    graceUntil: (body?.graceUntil || '').trim() || undefined,
    suspendedReason: (body?.suspendedReason || '').trim() || undefined
  });

  if (!out.ok) {
    return Response.json({ ok: false, reason: out.reason }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  return Response.json(
    { ok: true, account: out.account },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
