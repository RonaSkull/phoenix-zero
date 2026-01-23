import { requireTenant } from '../../../../lib/tenant-auth';
import { estimatePilUnits, readUsageLedgerEntries } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function parseDateMs(x: string | null): number | null {
  const t = (x || '').trim();
  if (!t) return null;
  const d = new Date(t);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

type InvoicePreviewItem = {
  currency: string;
  valueEvent: string;
  product?: string;
  plan?: string;
  authenticityLevel?: string;
  units: number;
  pilUnits: number;
  amountCents: number;
  count: number;
};

export async function GET(req: Request) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json(
      { ok: false, reason: auth.reason },
      { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const url = new URL(req.url);
  const fromMs = parseDateMs(url.searchParams.get('from'));
  const toMs = parseDateMs(url.searchParams.get('to'));
  const includePreviews = url.searchParams.get('includePreviews') === '1';
  const includeUnpriced = url.searchParams.get('includeUnpriced') === '1';

  const tenantId = auth.ctx.tenantId;

  const entries = await readUsageLedgerEntries();

  const groups = new Map<string, InvoicePreviewItem>();
  const totalsByCurrency = new Map<string, number>();
  let totalPilUnits = 0;

  let matched = 0;

  for (const e of entries) {
    if (!e) continue;
    if (!e.tenantId || e.tenantId !== tenantId) continue;
    if (!e.ok) continue;
    const hasPrice = typeof e.finalPriceCents === 'number' && Number.isFinite(e.finalPriceCents);
    if (!includeUnpriced && !hasPrice) continue;

    if (!includePreviews && (e.op === 'pricing_preview' || e.op === 'pricing_quote')) continue;

    const currency = (e.currency || '').trim() || 'USD';

    const atMs = Number.isFinite(Date.parse(e.at)) ? Date.parse(e.at) : null;
    if (fromMs !== null && atMs !== null && atMs < fromMs) continue;
    if (toMs !== null && atMs !== null && atMs > toMs) continue;

    const units = typeof e.units === 'number' && Number.isFinite(e.units) ? Math.max(1, Math.trunc(e.units)) : 1;
    const amountCents = hasPrice ? Math.max(0, Math.trunc(e.finalPriceCents as number)) : 0;

    const valueEvent = (e.valueEvent || e.op || 'unknown').trim() || 'unknown';
    const product =
      (typeof e.product === 'string' ? e.product : undefined) ||
      (typeof e.contextSnapshot?.product === 'string' ? (e.contextSnapshot.product as string) : undefined);

    const plan =
      (typeof e.plan === 'string' ? e.plan : undefined) ||
      (typeof e.contextSnapshot?.plan === 'string' ? (e.contextSnapshot.plan as string) : undefined);

    const authenticityLevel =
      (typeof e.authenticityLevel === 'string' ? e.authenticityLevel : undefined) ||
      (typeof e.contextSnapshot?.authenticityLevel === 'string' ? (e.contextSnapshot.authenticityLevel as string) : undefined);

    const sourceVector =
      (typeof e.contextSnapshot?.sourceVector === 'string' ? (e.contextSnapshot.sourceVector as string) : undefined) || undefined;

    const durationSeconds =
      typeof e.contextSnapshot?.durationSeconds === 'number' && Number.isFinite(e.contextSnapshot.durationSeconds)
        ? Math.max(0, Math.trunc(e.contextSnapshot.durationSeconds))
        : undefined;

    const pilUnits =
      typeof e.pilUnits === 'number' && Number.isFinite(e.pilUnits)
        ? Math.max(1, Math.trunc(e.pilUnits))
        : estimatePilUnits({ op: e.op, product, authenticityLevel, sourceVector, units, durationSeconds });

    const key = [currency, valueEvent, product || '', plan || '', authenticityLevel || ''].join('|');

    const prev = groups.get(key);
    if (prev) {
      prev.units += units;
      prev.pilUnits += pilUnits;
      prev.amountCents += amountCents;
      prev.count += 1;
    } else {
      groups.set(key, { currency, valueEvent, product, plan, authenticityLevel, units, pilUnits, amountCents, count: 1 });
    }

    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + amountCents);
    totalPilUnits += pilUnits;
    matched += 1;
  }

  const items = [...groups.values()].sort((a, b) => b.amountCents - a.amountCents);

  return Response.json(
    {
      ok: true,
      tenantId,
      period: {
        from: fromMs !== null ? new Date(fromMs).toISOString() : null,
        to: toMs !== null ? new Date(toMs).toISOString() : null
      },
      totals: Object.fromEntries([...totalsByCurrency.entries()]),
      pil: {
        totalUnits: totalPilUnits
      },
      items,
      meta: {
        matchedEntries: matched,
        groups: items.length
      }
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
