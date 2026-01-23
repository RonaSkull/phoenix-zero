import { requireAdminToken } from '../../../../lib/tenant-auth';
import { getTenantById } from '../../../../lib/tenants';
import { estimatePilUnits } from '../../../../lib/usage-ledger';
import { inferContext } from '../../../../core/inference/infer-context';
import { consequenceFromRisk } from '../../../../core/pricing/consequence-engine';
import { calculateRisk, type RiskResult } from '../../../../core/risk/risk-engine';
import {
  calculateFinalPrice,
  durationBucketKey,
  getCommissionProfile,
  getPricingProfile,
  getTaxProfile,
  pagesBucketKey,
  recommendProtection,
  sizeMbBucketKey,
  type PricingProfile
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

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | null
      | {
          tenantId?: string;
          pricingProfileOverride?: PricingProfile;
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
          volumePerMonth?: number;
          riskScoreOverride?: number;
          sourceVector?: string;
        };

    const tenantId = (body?.tenantId || '').trim();
    if (!tenantId) {
      return Response.json(
        { ok: false, reason: 'Missing tenantId' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return Response.json(
        { ok: false, reason: 'Tenant not found' },
        { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const product = (body?.product || 'video_protection').trim().toLowerCase();
    const operation = productToOperation(product);
    if (!operation) {
      return Response.json(
        { ok: false, reason: 'Missing or invalid product' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const productId = productToProductId(product);

    const sourceVector = String(body?.sourceVector || '').trim().toUpperCase();

    const durationSeconds = clampNonNegativeInt(body?.durationSeconds, 172800);
    const sizeBytes = clampNonNegativeInt(body?.sizeBytes, 1_000_000_000);
    const pages = clampNonNegativeInt(body?.pages, 10_000);

    const unitsInput = body?.units;
    const unitsSafe = Number.isFinite(unitsInput ?? NaN) ? Math.max(1, Math.trunc(unitsInput as number)) : 1;

    const authenticityRaw = (body?.authenticityLevel || '').trim();
    const proofGradeRaw = (body?.proofGrade || '').trim();
    let authenticityFromInput = authenticityRaw;
    let proofGrade = (proofGradeRaw || 'unknown').trim() || 'unknown';
    if (!authenticityFromInput && proofGrade && proofGrade !== 'unknown') {
      authenticityFromInput = proofGrade;
      proofGrade = 'unknown';
    }

    if (sourceVector === 'HYBRID') {
      authenticityFromInput = 'forensic';
    }

    const inferred = inferContext({
      product: productId,
      exposure: body?.exposure,
      persistence: body?.persistence,
      authenticityLevel: authenticityFromInput || undefined,
      units: unitsSafe
    });

    const riskScoreOverrideRaw = Number(body?.riskScoreOverride ?? NaN);
    const risk: RiskResult = Number.isFinite(riskScoreOverrideRaw)
      ? {
          riskScore: clampInt(riskScoreOverrideRaw, 0, 100),
          breakdown: [{ key: 'manual', label: 'Risco (manual)', delta: clampInt(riskScoreOverrideRaw, 0, 100) }]
        }
      : calculateRisk({
          exposure: inferred.context.exposure,
          persistence: inferred.context.persistence,
          authenticityLevel: inferred.context.authenticityLevel,
          units: inferred.context.units
        });

    const consequence = consequenceFromRisk(risk);

    const plan = (body?.plan || '').trim() || consequence.recommendedPlan;

    const guaranteeWindow = (body?.guaranteeWindow || '').trim() || 'unknown';

    const scope = {
      tenantId: tenant.tenantId,
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

    const pricingProfile = body?.pricingProfileOverride
      ? body.pricingProfileOverride
      : await getPricingProfile(tenant.pricingProfile, scope.currency);

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

    const pilUnits = estimatePilUnits({
      op: 'pricing_preview',
      product: scope.product,
      authenticityLevel: scope.authenticityLevel,
      sourceVector: sourceVector || undefined,
      units: scope.units,
      durationSeconds
    });

    const protection = recommendProtection(scope);

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

    const finalNoClamp =
      quote.internalBreakdown.priceAfterMultiplierCents +
      quote.internalBreakdown.platformFeeCents +
      quote.internalBreakdown.partnerShareCents +
      quote.internalBreakdown.taxCents;

    const minFinal = typeof pricingProfile.minFinalPriceCents === 'number' ? Math.trunc(pricingProfile.minFinalPriceCents) : null;
    const maxFinal = typeof pricingProfile.maxFinalPriceCents === 'number' ? Math.trunc(pricingProfile.maxFinalPriceCents) : null;

    const appliedMin = minFinal !== null && Number.isFinite(minFinal) && finalNoClamp < minFinal && quote.finalPriceCents === minFinal;
    const appliedMax = maxFinal !== null && Number.isFinite(maxFinal) && finalNoClamp > maxFinal && quote.finalPriceCents === maxFinal;

    const volumeRaw = Number(body?.volumePerMonth ?? NaN);
    const volumePerMonth = Number.isFinite(volumeRaw) ? clampInt(volumeRaw, 0, 100_000_000) : 0;

    const monthlyProtectionSpendCents = Math.max(0, Math.trunc(quote.finalPriceCents * (volumePerMonth || 0)));
    const monthlyLossAvoidedCents = Math.trunc(consequence.monthlyCostCents - monthlyProtectionSpendCents);
    const negativeLossAvoided = monthlyLossAvoidedCents < 0;

    return Response.json(
      {
        ok: true,
        tenant: { tenantId: tenant.tenantId, name: tenant.name },
        currency: quote.currency,
        unitPriceCents: quote.finalPriceCents,
        pil: { units: pilUnits, durationSeconds },
        risk,
        consequence: {
          recommendedPlan: consequence.recommendedPlan,
          recommendedProtection: consequence.recommendedProtection,
          monthlyCostCents: consequence.monthlyCostCents,
          model: 'monthlyCostCents = riskScore^2 * 100'
        },
        protection,
        volume: { volumePerMonth, monthlyProtectionSpendCents, monthlyLossAvoidedCents },
        flags: { appliedMin, appliedMax, negativeLossAvoided },
        scope,
        breakdown: {
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
          }
        }
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: message }, { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }
}
