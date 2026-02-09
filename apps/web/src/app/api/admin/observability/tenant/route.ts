import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { getTenantById } from '../../../../../lib/tenants';
import { listPaymentIntents } from '../../../../../lib/payments';
import { listPaymentProofs } from '../../../../../lib/payment-proofs';
import { listSemanticEventsAll } from '../../../../../lib/agent-semantic-ledger';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  try {
    const url = new URL(req.url);
    const tenantId = String(url.searchParams.get('tenantId') || '').trim();
    if (!tenantId) {
      return Response.json({ ok: false, reason: 'Missing tenantId' }, { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }

    const limit = clampInt(Number(url.searchParams.get('limit') || 200), 1, 2000);

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return Response.json({ ok: false, reason: 'Tenant not found' }, { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }

    const intents = await listPaymentIntents({ tenantId, limit: 1000 });
    const proofs = await listPaymentProofs({ limit: 500 });
    const tenantProofs = proofs.filter((p) => p && p.tenantId === tenantId);

    const events = await listSemanticEventsAll({ tenantId, limit });

    const errorsByReason: Record<string, number> = {};
    for (const ev of events) {
      if (ev && ev.ok === false) {
        const r = String(ev.reason || 'UNKNOWN').trim() || 'UNKNOWN';
        errorsByReason[r] = (errorsByReason[r] || 0) + 1;
      }
    }

    const topErrors = Object.entries(errorsByReason)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([reason, count]) => ({ reason, count }));

    const unitsPurchased = tenantProofs.reduce((acc, p) => acc + Math.max(0, Math.trunc(Number((p as any)?.totalUnits ?? 0))), 0);
    const unitsConsumed = tenantProofs.reduce((acc, p) => acc + Math.max(0, Math.trunc(Number((p as any)?.usedUnits ?? 0))), 0);

    const paymentsCreated = intents.length;
    const paymentsPaid = intents.filter((i) => i.status === 'paid').length;

    return Response.json(
      {
        ok: true,
        tenant: {
          tenantId: tenant.tenantId,
          name: tenant.name,
          status: tenant.status,
          clientType: tenant.clientType,
          sector: tenant.sector,
          country: tenant.country,
          currency: tenant.currency
        },
        metrics: {
          paymentsCreated,
          paymentsPaid,
          unitsPurchased,
          unitsConsumed
        },
        topErrors,
        recentEvents: events
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, reason: message }, { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }
}
