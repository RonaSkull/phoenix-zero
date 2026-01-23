import { requireTenant } from '../../../../lib/tenant-auth';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';

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

  const out = await getOrCreateBillingAccount(auth.ctx.tenantId);
  if (!out.ok) {
    return Response.json({ ok: false, reason: out.reason }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  return Response.json(
    {
      ok: true,
      tenantId: auth.ctx.tenantId,
      isActive: isBillingAccountActive(out.account),
      accessStatus:
        out.account.status === 'paid' || out.account.status === 'grace'
          ? 'active'
          : out.account.status === 'pending'
            ? 'trial'
            : 'blocked',
      account: out.account
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
