import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { listTenants } from '../../../../../lib/tenants';
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

function isoDay(s: string): string {
  // Expect YYYY-MM-DD
  const t = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return '';
}

function dayFromTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  try {
    const url = new URL(req.url);
    const from = isoDay(url.searchParams.get('from') || '');
    const to = isoDay(url.searchParams.get('to') || '');
    const limit = clampInt(Number(url.searchParams.get('limit') || 50), 1, 500);

    const tenants = (await listTenants()).slice(0, limit);

    const intents = await listPaymentIntents({ limit: 5000 });
    const proofs = await listPaymentProofs({ limit: 500 });

    const events = await listSemanticEventsAll({ limit: 50_000 });

    const fromDay = from || '';
    const toDay = to || '';

    function inRange(day: string): boolean {
      if (!day) return false;
      if (fromDay && day < fromDay) return false;
      if (toDay && day > toDay) return false;
      return true;
    }

    const byTenant: Record<
      string,
      {
        tenantId: string;
        name: string;
        status: string;
        clientType: string;
        paymentsCreated: number;
        paymentsPaid: number;
        unitsPurchased: number;
        unitsConsumed: number;
        executions: number;
        gateChecks: number;
        errorsByReason: Record<string, number>;
        executionsByDay: Record<string, number>;
      }
    > = {};

    for (const t of tenants) {
      byTenant[t.tenantId] = {
        tenantId: t.tenantId,
        name: t.name,
        status: t.status,
        clientType: t.clientType,
        paymentsCreated: 0,
        paymentsPaid: 0,
        unitsPurchased: 0,
        unitsConsumed: 0,
        executions: 0,
        gateChecks: 0,
        errorsByReason: {},
        executionsByDay: {}
      };
    }

    for (const i of intents) {
      const rec = byTenant[i.tenantId];
      if (!rec) continue;
      const day = dayFromTs(String(i.createdAt || ''));
      if ((fromDay || toDay) && !inRange(day)) continue;
      rec.paymentsCreated += 1;
      if (i.status === 'paid') rec.paymentsPaid += 1;
    }

    for (const p of proofs) {
      const rec = byTenant[p.tenantId];
      if (!rec) continue;
      const day = dayFromTs(String(p.verifiedAt || p.createdAt || ''));
      if ((fromDay || toDay) && !inRange(day)) continue;
      const totalUnits = Math.max(0, Math.trunc(Number((p as any)?.totalUnits ?? 0)));
      const usedUnits = Math.max(0, Math.trunc(Number((p as any)?.usedUnits ?? 0)));
      rec.unitsPurchased += totalUnits;
      rec.unitsConsumed += usedUnits;
    }

    for (const ev of events) {
      const rec = byTenant[ev.tenantId];
      if (!rec) continue;
      const day = dayFromTs(String(ev.ts || ''));
      if ((fromDay || toDay) && !inRange(day)) continue;

      if (ev.action === 'execute') {
        if (ev.ok === true) {
          rec.executions += 1;
          if (day) rec.executionsByDay[day] = (rec.executionsByDay[day] || 0) + 1;
        } else {
          const r = String(ev.reason || 'UNKNOWN').trim() || 'UNKNOWN';
          rec.errorsByReason[r] = (rec.errorsByReason[r] || 0) + 1;
        }
      }

      if (ev.action === 'gate_check') {
        rec.gateChecks += 1;
        if (ev.ok === false) {
          const r = String(ev.reason || 'UNKNOWN').trim() || 'UNKNOWN';
          rec.errorsByReason[r] = (rec.errorsByReason[r] || 0) + 1;
        }
      }
    }

    const rows = Object.values(byTenant).sort((a, b) => b.executions - a.executions);

    return Response.json(
      {
        ok: true,
        period: {
          from: fromDay || null,
          to: toDay || null
        },
        tenants: rows
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, reason: message }, { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }
}
