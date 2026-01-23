import { requireTenant } from '../../../../lib/tenant-auth';
import { recordUsage } from '../../../../lib/usage-ledger';
import {
  calculateFinalPrice,
  getCommissionProfile,
  getPricingProfile,
  getTaxProfile
} from '../../../../lib/pricing';

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

function clampNonNegativeInt(n: unknown, max: number): number {
  const x = Number(n ?? NaN);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(x)));
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;

  let valueEvent: string | undefined;
  let units: number | undefined;
  let finalPriceCents: number | undefined;
  let currency: string | undefined;
  let contextSnapshot: Record<string, any> | undefined;

  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    tenantId = auth.ctx.tenantId;

    const body = (await req.json().catch(() => null)) as
      | null
      | {
          operation?: string;
          product?: string;
          clientType?: string;
          sector?: string;
          country?: string;
          currency?: string;
          units?: number;
          guaranteeWindow?: string;
          durationSeconds?: number;
          sizeBytes?: number;
          pages?: number;
        };

    const operation = (body?.operation || '').trim();
    if (!operation) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing operation' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const product = (body?.product || '').trim();

    const unitsInput = Number(body?.units ?? NaN);
    const unitsSafe = Number.isFinite(unitsInput) ? clampInt(unitsInput, 1, 1_000_000) : 1;

    const durationSeconds = clampNonNegativeInt(body?.durationSeconds, 172800);
    const sizeBytes = clampNonNegativeInt(body?.sizeBytes, 1_000_000_000);
    const pages = clampNonNegativeInt(body?.pages, 10_000);

    const guaranteeWindow = (body?.guaranteeWindow || '').trim() || 'unknown';

    const tenant = auth.ctx.tenant;

    const scope = {
      tenantId: auth.ctx.tenantId,
      operation,
      product: product || undefined,
      clientType: (body?.clientType || tenant.clientType || 'unknown').trim(),
      sector: (body?.sector || tenant.sector || 'unknown').trim(),
      country: (body?.country || tenant.country || 'unknown').trim(),
      currency: (body?.currency || tenant.currency || 'USD').trim(),
      units: unitsSafe,
      guaranteeWindow,
      durationSeconds,
      sizeBytes,
      pages
    };

    const pricingProfile = await getPricingProfile(tenant.pricingProfile, scope.currency);
    const commissionProfile = await getCommissionProfile(tenant.commissionProfile);
    const taxProfile = await getTaxProfile(tenant.taxProfile);

    const basePriceCentsRaw = pricingProfile.basePriceCentsByOp[operation];
    const basePriceCents =
      typeof basePriceCentsRaw === 'number' && Number.isFinite(basePriceCentsRaw)
        ? Math.max(0, Math.trunc(basePriceCentsRaw))
        : 0;

    const quote = calculateFinalPrice({
      scope,
      basePriceCents,
      pricingProfile,
      commissionProfile,
      taxProfile
    });

    valueEvent = operation;
    units = unitsSafe;
    finalPriceCents = quote.finalPriceCents;
    currency = quote.currency;
    contextSnapshot = {
      operation: scope.operation,
      product: scope.product,
      clientType: scope.clientType,
      sector: scope.sector,
      country: scope.country,
      currency: scope.currency,
      units: scope.units,
      guaranteeWindow: scope.guaranteeWindow,
      durationSeconds: scope.durationSeconds,
      sizeBytes: scope.sizeBytes,
      pages: scope.pages
    };

    ok = true;
    httpStatus = 200;

    return Response.json(
      {
        ok: true,
        currency: quote.currency,
        finalPriceCents: quote.finalPriceCents,
        scope: quote.scope
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } finally {
    void recordUsage({
      req,
      tenantId,
      op: 'pricing_quote',
      ok,
      httpStatus,
      startedAtMs,
      valueEvent,
      units,
      finalPriceCents,
      currency,
      contextSnapshot
    });
  }
}
