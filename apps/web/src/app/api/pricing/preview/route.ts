import { requireTenantOrPublic } from '../../../../lib/tenant-auth';
import { getObservationState } from '../../../../lib/observation-sessions';
import { estimatePilUnits, recordUsage } from '../../../../lib/usage-ledger';
import { inferContext } from '../../../../core/inference/infer-context';
import { consequenceFromRisk } from '../../../../core/pricing/consequence-engine';
import { calculateRisk } from '../../../../core/risk/risk-engine';
import { isAiClientMode } from '../../../../core/modes/ai-client';
import {
  calculateFinalPrice,
  durationBucketKey,
  getCommissionProfile,
  getPricingProfile,
  getTaxProfile,
  pagesBucketKey,
  recommendProtection,
  sizeMbBucketKey
} from '../../../../lib/pricing';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function normalizeKey(x: unknown): string {
  return String(x || '').trim().toLowerCase();
}

function safeMultiplier(m: unknown): number {
  if (typeof m !== 'number') return 1;
  if (!Number.isFinite(m)) return 1;
  if (m <= 0) return 1;
  if (m > 1000) return 1000;
  return m;
}

function clampNonNegativeInt(n: unknown, max: number): number {
  const x = Number(n ?? NaN);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(x)));
}

function productToOperation(product: string): string | null {
  const raw = (product || '').trim().toLowerCase();
  const p = raw.endsWith('_protection') ? raw.slice(0, -'_protection'.length) : raw;
  if (p === 'video') return 'protect_video';
  if (p === 'image') return 'protect_image';
  if (p === 'audio') return 'protect_audio';
  if (p === 'live') return 'protect_live';
  if (p === 'report' || p === 'document') return 'protect_report';
  return null;
}

function productToProductId(product: string): string {
  const raw = (product || '').trim().toLowerCase();
  const p = raw.endsWith('_protection') ? raw.slice(0, -'_protection'.length) : raw;
  if (p === 'video') return 'video_protection';
  if (p === 'image') return 'image_protection';
  if (p === 'audio') return 'audio_protection';
  if (p === 'live') return 'live_protection';
  if (p === 'report' || p === 'document') return 'document_protection';
  return raw || 'unknown';
}

function defaultBasePriceCentsForOperation(operation: string): number {
  const op = (operation || '').trim().toLowerCase();
  if (op === 'protect_video') return 120;
  if (op === 'protect_image') return 60;
  if (op === 'protect_audio') return 80;
  if (op === 'protect_live') return 250;
  if (op === 'protect_report') return 500;
  return 0;
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;

  let valueEvent: string | undefined;
  let units: number | undefined;
  let pilUnits: number | undefined;
  let finalPriceCents: number | undefined;
  let currency: string | undefined;
  let contextSnapshot: Record<string, any> | undefined;

  try {
    const url = new URL(req.url);
    const debug = (url.searchParams.get('debug') || '').trim() === '1';

    const auth = await requireTenantOrPublic(req);
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
          product?: string;
          reach?: string;
          exposure?: string;
          persistence?: string;
          guaranteeWindow?: string;
          proofGrade?: string;
          authenticityLevel?: string;
          riskProfile?: string;
          plan?: string;
          country?: string;
          currency?: string;
          clientType?: string;
          sector?: string;
          units?: number;
          durationSeconds?: number;
          sizeBytes?: number;
          pages?: number;
          commitments?: unknown;
          sourceVector?: string;
          sessionId?: string;
        };

    const product = (body?.product || '').trim().toLowerCase();
    const operation = productToOperation(product);
    if (!operation) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing or invalid product' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const productId = productToProductId(product);

    const unitsInput = body?.units;
    const unitsSafe = Number.isFinite(unitsInput ?? NaN) ? Math.max(1, Math.trunc(unitsInput as number)) : 1;

    const durationSeconds = clampNonNegativeInt(body?.durationSeconds, 172800);
    const sizeBytes = clampNonNegativeInt(body?.sizeBytes, 1_000_000_000);
    const pages = clampNonNegativeInt(body?.pages, 10_000);

    const sessionId = (body?.sessionId || '').trim();
    let sourceVectorRaw = '';

    if (auth.isPublic && !sessionId) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing sessionId' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    if (sessionId) {
      const obs = await getObservationState(sessionId);
      if (obs.tenantId && obs.tenantId !== auth.ctx.tenantId) {
        httpStatus = 403;
        return Response.json(
          { ok: false, reason: 'Unauthorized' },
          { status: 403, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
      if (auth.isPublic && obs.state !== 'CLASSIFIED') {
        httpStatus = 409;
        return Response.json(
          { ok: false, reason: 'Observation not complete' },
          { status: 409, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
      sourceVectorRaw = (obs.sourceVector ? String(obs.sourceVector) : '').trim().toUpperCase();
    }

    if (!sourceVectorRaw) {
      sourceVectorRaw = (body?.sourceVector || '').trim().toUpperCase();
    }

    const isHybrid = sourceVectorRaw === 'HYBRID';

    const authenticityRaw = (body?.authenticityLevel || '').trim();
    const proofGradeRaw = (body?.proofGrade || '').trim();
    let authenticityFromInput = authenticityRaw;
    let proofGrade = (proofGradeRaw || 'unknown').trim() || 'unknown';
    if (!authenticityFromInput && proofGrade && proofGrade !== 'unknown') {
      authenticityFromInput = proofGrade;
      proofGrade = 'unknown';
    }

    if (isHybrid) {
      authenticityFromInput = 'forensic';
    }

    const inferred = inferContext({
      product: productId,
      exposure: body?.exposure,
      persistence: body?.persistence,
      authenticityLevel: authenticityFromInput || undefined,
      units: unitsSafe
    });

    const risk = calculateRisk({
      exposure: inferred.context.exposure,
      persistence: inferred.context.persistence,
      authenticityLevel: inferred.context.authenticityLevel,
      units: inferred.context.units
    });
    const consequence = consequenceFromRisk(risk);

    const plan = (body?.plan || '').trim() || consequence.recommendedPlan;

    const guaranteeWindow = (body?.guaranteeWindow || '').trim() || 'unknown';

    const tenant = auth.ctx.tenant;

    const scope = {
      tenantId: auth.ctx.tenantId,
      operation,
      product: productId,
      clientType: (body?.clientType || tenant.clientType || 'unknown').trim(),
      sector: (body?.sector || tenant.sector || 'unknown').trim(),
      country: (body?.country || tenant.country || 'unknown').trim(),
      currency: (body?.currency || tenant.currency || 'USD').trim(),
      reach: (body?.reach || 'unknown').trim(),
      exposure: inferred.context.exposure,
      persistence: inferred.context.persistence,
      guaranteeWindow,
      proofGrade,
      authenticityLevel: inferred.context.authenticityLevel,
      riskProfile: (body?.riskProfile || 'unknown').trim(),
      plan,
      units: inferred.context.units,
      durationSeconds,
      sizeBytes,
      pages
    };

    const pricingProfile = await getPricingProfile(tenant.pricingProfile, scope.currency);
    const commissionProfile = await getCommissionProfile(tenant.commissionProfile);
    const taxProfile = await getTaxProfile(tenant.taxProfile);

    const basePriceCentsRaw = pricingProfile.basePriceCentsByOp[operation];
    let basePriceCents =
      typeof basePriceCentsRaw === 'number' && Number.isFinite(basePriceCentsRaw)
        ? Math.max(0, Math.trunc(basePriceCentsRaw))
        : 0;

    if (basePriceCents <= 0) {
      basePriceCents = defaultBasePriceCentsForOperation(operation);
    }

    const quote = calculateFinalPrice({
      scope,
      basePriceCents,
      pricingProfile,
      commissionProfile,
      taxProfile
    });

    const protection = recommendProtection(scope);

    ok = true;
    httpStatus = 200;

    valueEvent = 'authenticity_proof';
    units = unitsSafe;
    pilUnits = estimatePilUnits({
      op: 'pricing_preview',
      product: scope.product,
      authenticityLevel: scope.authenticityLevel,
      sourceVector: sourceVectorRaw || undefined,
      units,
      durationSeconds
    });
    finalPriceCents = quote.finalPriceCents;
    currency = quote.currency;

    const commitments = Array.isArray(body?.commitments) ? (body?.commitments as any[]).slice(-50) : undefined;
    contextSnapshot = {
      product: scope.product,
      reach: scope.reach,
      exposure: scope.exposure,
      persistence: scope.persistence,
      guaranteeWindow: scope.guaranteeWindow,
      proofGrade: scope.proofGrade,
      authenticityLevel: scope.authenticityLevel,
      sourceVector: sourceVectorRaw || undefined,
      sessionId: sessionId || undefined,
      riskProfile: scope.riskProfile,
      plan: scope.plan,
      units: scope.units,
      durationSeconds: scope.durationSeconds,
      sizeBytes: scope.sizeBytes,
      pages: scope.pages,
      clientType: scope.clientType,
      sector: scope.sector,
      country: scope.country,
      riskScore: risk.riskScore,
      recommendedPlan: consequence.recommendedPlan,
      recommendedProtection: consequence.recommendedProtection,
      monthlyCostCents: consequence.monthlyCostCents,
      commitments
    };

    const debugBreakdown = debug
      ? (() => {
          const clientTypeKey = normalizeKey(scope.clientType || 'unknown') || 'unknown';
          const sectorKey = normalizeKey(scope.sector || 'unknown') || 'unknown';
          const countryKey = normalizeKey(scope.country || 'unknown') || 'unknown';
          const reachKey = normalizeKey(scope.reach || 'unknown') || 'unknown';
          const exposureKey = normalizeKey(scope.exposure || 'unknown') || 'unknown';
          const persistenceKey = normalizeKey(scope.persistence || 'unknown') || 'unknown';
          const guaranteeKey = normalizeKey(scope.guaranteeWindow || 'unknown') || 'unknown';
          const proofGradeKey = normalizeKey(scope.proofGrade || 'unknown') || 'unknown';
          const authenticityKey = normalizeKey(scope.authenticityLevel || 'unknown') || 'unknown';
          const riskProfileKey = normalizeKey(scope.riskProfile || 'unknown') || 'unknown';
          const planKey = normalizeKey(scope.plan || 'unknown') || 'unknown';

          const durationKey = durationBucketKey({ product: scope.product, durationSeconds: scope.durationSeconds });
          const sizeKey = sizeMbBucketKey({ product: scope.product, sizeBytes: scope.sizeBytes });
          const pagesKey = pagesBucketKey(scope.pages);

          const mClient = safeMultiplier(pricingProfile.multiplierByClientType[clientTypeKey]);
          const mSector = safeMultiplier(pricingProfile.multiplierBySector[sectorKey]);
          const mCountry = safeMultiplier(pricingProfile.multiplierByCountry[countryKey]);
          const mReach = safeMultiplier(pricingProfile.multiplierByReach?.[reachKey]);
          const mExposure = safeMultiplier(pricingProfile.multiplierByExposure?.[exposureKey]);
          const mPersistence = safeMultiplier(pricingProfile.multiplierByPersistence?.[persistenceKey]);
          const mGuarantee = safeMultiplier(pricingProfile.multiplierByGuaranteeWindow?.[guaranteeKey]);
          const mProofGrade = safeMultiplier(pricingProfile.multiplierByProofGrade?.[proofGradeKey]);
          const mAuthenticity = safeMultiplier(pricingProfile.multiplierByAuthenticityLevel?.[authenticityKey]);
          const mRiskProfile = safeMultiplier(pricingProfile.multiplierByRiskProfile?.[riskProfileKey]);
          const mPlan = safeMultiplier(pricingProfile.multiplierByPlan?.[planKey]);

          const durationApplies =
            scope.product === 'video_protection' || scope.product === 'live_protection' || scope.product === 'audio_protection';
          const sizeApplies = scope.product === 'image_protection' || scope.product === 'document_protection';
          const pagesApplies = scope.product === 'document_protection';

          const mDuration = durationApplies ? safeMultiplier(pricingProfile.multiplierByDurationBucket?.[durationKey]) : 1;
          const mSize = sizeApplies ? safeMultiplier(pricingProfile.multiplierBySizeMbBucket?.[sizeKey]) : 1;
          const mPages = pagesApplies ? safeMultiplier(pricingProfile.multiplierByPagesBucket?.[pagesKey]) : 1;
          const mContent = scope.product === 'document_protection' ? safeMultiplier(Math.max(mPages, mSize)) : safeMultiplier(mDuration * mSize);

          return {
            pricingProfileId: pricingProfile.id,
            basePriceCents,
            quoteInternalBreakdown: quote.internalBreakdown,
            multiplierKeys: {
              clientTypeKey,
              sectorKey,
              countryKey,
              reachKey,
              exposureKey,
              persistenceKey,
              guaranteeKey,
              proofGradeKey,
              authenticityKey,
              riskProfileKey,
              planKey,
              durationKey,
              sizeKey,
              pagesKey
            },
            multipliers: {
              clientType: mClient,
              sector: mSector,
              country: mCountry,
              reach: mReach,
              exposure: mExposure,
              persistence: mPersistence,
              guaranteeWindow: mGuarantee,
              proofGrade: mProofGrade,
              authenticityLevel: mAuthenticity,
              riskProfile: mRiskProfile,
              plan: mPlan,
              durationBucket: mDuration,
              sizeMbBucket: mSize,
              pagesBucket: mPages,
              content: mContent
            },
            risk,
            consequence: {
              model: 'monthlyCostCents = riskScore^2 * 100 (placeholder)',
              recommendedPlan: consequence.recommendedPlan,
              recommendedProtection: consequence.recommendedProtection,
              monthlyCostCents: consequence.monthlyCostCents
            },
            pilUnits
          };
        })()
      : undefined;

    if (isAiClientMode()) {
      return Response.json(
        {
          ok: true,
          currency: quote.currency,
          finalPriceCents: quote.finalPriceCents,
          riskScore: risk.riskScore,
          recommendedPlan: consequence.recommendedPlan,
          recommendedProtection: consequence.recommendedProtection,
          monthlyCostCents: consequence.monthlyCostCents
        },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    return Response.json(
      {
        ok: true,
        currency: quote.currency,
        finalPriceCents: quote.finalPriceCents,
        riskScore: risk.riskScore,
        recommendedPlan: consequence.recommendedPlan,
        recommendedProtection: consequence.recommendedProtection,
        monthlyCostCents: consequence.monthlyCostCents,
        protection,
        debug: debugBreakdown,
        scope: {
          product: scope.product,
          reach: scope.reach,
          exposure: scope.exposure,
          persistence: scope.persistence,
          guaranteeWindow: scope.guaranteeWindow,
          proofGrade: scope.proofGrade,
          authenticityLevel: scope.authenticityLevel,
          riskProfile: scope.riskProfile,
          plan: scope.plan,
          units: scope.units,
          durationSeconds: scope.durationSeconds,
          sizeBytes: scope.sizeBytes,
          pages: scope.pages,
          country: scope.country,
          currency: scope.currency
        }
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
      op: 'pricing_preview',
      ok,
      httpStatus,
      startedAtMs,
      valueEvent,
      product: contextSnapshot?.product,
      plan: contextSnapshot?.plan,
      authenticityLevel: contextSnapshot?.authenticityLevel,
      units,
      pilUnits,
      finalPriceCents,
      currency,
      contextSnapshot,
      meta: { kind: 'pricing_preview' }
    });
  }
}
