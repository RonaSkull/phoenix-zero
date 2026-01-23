import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';

export type MoneyCents = { currency: string; cents: number };

export type PricingContext = {
  tenantId: string;
  operation?: string;
  product?: string;
  clientType?: string;
  sector?: string;
  country?: string;
  currency?: string;
  reach?: string;
  exposure?: string;
  persistence?: string;
  guaranteeWindow?: string;
  proofGrade?: string;
  authenticityLevel?: string;
  riskProfile?: string;
  plan?: string;
  units?: number;
  durationSeconds?: number;
  sizeBytes?: number;
  pages?: number;
};

export type PricingProfile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  currency: string;
  basePriceCentsByOp: Record<string, number>;
  multiplierByClientType: Record<string, number>;
  multiplierBySector: Record<string, number>;
  multiplierByCountry: Record<string, number>;
  multiplierByReach?: Record<string, number>;
  multiplierByExposure?: Record<string, number>;
  multiplierByPersistence?: Record<string, number>;
  multiplierByGuaranteeWindow?: Record<string, number>;
  multiplierByProofGrade?: Record<string, number>;
  multiplierByAuthenticityLevel?: Record<string, number>;
  multiplierByRiskProfile?: Record<string, number>;
  multiplierByPlan?: Record<string, number>;
  multiplierByDurationBucket?: Record<string, number>;
  multiplierBySizeMbBucket?: Record<string, number>;
  multiplierByPagesBucket?: Record<string, number>;
  minFinalPriceCents?: number;
  maxFinalPriceCents?: number;
};

export type ProtectionLevel = 'social' | 'commercial' | 'legal' | 'enterprise';

export type ProtectionRecommendation = {
  level: ProtectionLevel;
  label: string;
};

export type CommissionProfile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  platformFeeBps: number;
  partnerShareBps: number;
};

export type TaxProfile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  taxBpsByCountry: Record<string, number>;
};

export type PricingQuoteInternal = {
  currency: string;
  finalPriceCents: number;
  scope: PricingContext;
  internalBreakdown: {
    basePriceCents: number;
    pricingMultiplier: number;
    priceAfterMultiplierCents: number;
    platformFeeCents: number;
    partnerShareCents: number;
    taxCents: number;
  };
};

type PricingProfileVersionMeta = {
  versionId: string;
  createdAt: string;
  reason?: string;
  createdBy?: string;
};

type PricingProfileVersioned = {
  activeVersionId: string;
  versions: Record<string, PricingProfile>;
  meta: Record<string, PricingProfileVersionMeta>;
};

type ProfilesDbV1 = {
  version: 1;
  pricingProfiles: Record<string, PricingProfile>;
  commissionProfiles: Record<string, CommissionProfile>;
  taxProfiles: Record<string, TaxProfile>;
};

type ProfilesDbV2 = {
  version: 2;
  pricingProfiles: Record<string, PricingProfileVersioned>;
  commissionProfiles: Record<string, CommissionProfile>;
  taxProfiles: Record<string, TaxProfile>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeKey(x: unknown): string {
  return String(x || '').trim().toLowerCase();
}

function applyBps(amountCents: number, bps: number): number {
  const safeAmount = Number.isFinite(amountCents) ? Math.max(0, Math.trunc(amountCents)) : 0;
  const safeBps = clampInt(bps, 0, 100_000);
  return Math.trunc((safeAmount * safeBps) / 10_000);
}

function safeMultiplier(m: unknown): number {
  if (typeof m !== 'number') return 1;
  if (!Number.isFinite(m)) return 1;
  if (m <= 0) return 1;
  if (m > 1000) return 1000;
  return m;
}

const VIDEO_DURATION_BUCKETS_SECONDS = [
  3, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800
];

const LIVE_DURATION_BUCKETS_SECONDS = [
  60, 180, 300, 600, 900, 1800, 2700, 3600, 5400, 7200, 10800, 14400, 21600, 28800, 43200, 86400, 172800
];

const IMAGE_SIZE_MB_BUCKETS = [0.25, 0.5, 1, 2, 5, 10];
const DOCUMENT_SIZE_MB_BUCKETS = [0.1, 0.5, 1, 2, 5, 10, 25, 50];
const DOCUMENT_PAGES_BUCKETS = [1, 2, 3, 5, 10, 20, 50, 100, 200, 500];

function clampNonNegativeInt(n: unknown): number {
  const x = Number(n ?? NaN);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.trunc(x));
}

function pickDiscreteBucket(value: number, buckets: number[]): number {
  if (!Number.isFinite(value) || value <= 0) return buckets[0] ?? 1;
  for (const b of buckets) {
    if (value <= b) return b;
  }
  return buckets[buckets.length - 1] ?? value;
}

export function durationBucketKey(params: { product?: string; durationSeconds?: number }): string {
  const product = normalizeKey(params.product || '');
  const durationSeconds = clampNonNegativeInt(params.durationSeconds);
  if (durationSeconds <= 0) return 'unknown';

  const buckets = product === 'live_protection' ? LIVE_DURATION_BUCKETS_SECONDS : VIDEO_DURATION_BUCKETS_SECONDS;
  const bucket = pickDiscreteBucket(durationSeconds, buckets);
  return `${bucket}s`;
}

function sizeBytesToMb(sizeBytes: number): number {
  return sizeBytes / (1024 * 1024);
}

function mbKey(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return 'unknown';
  const rounded = Math.round(mb * 1000) / 1000;
  return `${String(rounded)}mb`;
}

export function sizeMbBucketKey(params: { product?: string; sizeBytes?: number }): string {
  const product = normalizeKey(params.product || '');
  const sizeBytes = clampNonNegativeInt(params.sizeBytes);
  if (sizeBytes <= 0) return 'unknown';

  const mb = sizeBytesToMb(sizeBytes);
  const buckets = product === 'document_protection' ? DOCUMENT_SIZE_MB_BUCKETS : IMAGE_SIZE_MB_BUCKETS;
  const bucket = pickDiscreteBucket(mb, buckets);
  return mbKey(bucket);
}

export function pagesBucketKey(pages: number | undefined): string {
  const p = clampNonNegativeInt(pages);
  if (p <= 0) return 'unknown';
  const bucket = pickDiscreteBucket(p, DOCUMENT_PAGES_BUCKETS);
  return `${bucket}p`;
}

function profilesDbPath(): string {
  return join(phoenixZeroTmpDir(), 'pricing-profiles.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadProfilesDb(): Promise<ProfilesDb> {
  const json = await readJsonMaybe<any>(profilesDbPath());
  if (!json || (json.version !== 1 && json.version !== 2)) {
    return {
      version: 2,
      pricingProfiles: {},
      commissionProfiles: {},
      taxProfiles: {}
    };
  }

  if (json.version === 2) {
    const pricingProfiles =
      typeof json.pricingProfiles === 'object' && json.pricingProfiles ? (json.pricingProfiles as ProfilesDbV2['pricingProfiles']) : {};
    return {
      version: 2,
      pricingProfiles,
      commissionProfiles:
        typeof json.commissionProfiles === 'object' && json.commissionProfiles ? (json.commissionProfiles as any) : {},
      taxProfiles: typeof json.taxProfiles === 'object' && json.taxProfiles ? (json.taxProfiles as any) : {}
    };
  }

  const v1 = json as ProfilesDbV1;
  const migrated: ProfilesDbV2 = {
    version: 2,
    pricingProfiles: {},
    commissionProfiles: typeof v1.commissionProfiles === 'object' && v1.commissionProfiles ? v1.commissionProfiles : {},
    taxProfiles: typeof v1.taxProfiles === 'object' && v1.taxProfiles ? v1.taxProfiles : {}
  };

  const v1Pricing = typeof v1.pricingProfiles === 'object' && v1.pricingProfiles ? v1.pricingProfiles : {};
  for (const [id, profile] of Object.entries(v1Pricing)) {
    const versionId = 'v1';
    migrated.pricingProfiles[id] = {
      activeVersionId: versionId,
      versions: { [versionId]: profile },
      meta: { [versionId]: { versionId, createdAt: profile?.updatedAt || profile?.createdAt || nowIso() } }
    };
  }

  return migrated;
}

async function saveProfilesDb(db: ProfilesDbV2): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(profilesDbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

type ProfilesDb = ProfilesDbV2;

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function newProfileVersionId(): string {
  return `pv_${b64Url(randomBytes(9))}`;
}

function isValidSemanticVersionId(id: string): boolean {
  const v = String(id || '').trim();
  if (!v) return false;
  if (v.length > 80) return false;
  if (!v.startsWith('pv_')) return false;
  return /^[a-zA-Z0-9_-]+$/.test(v);
}

function normalizeMetaString(v: unknown, maxLen: number): string | undefined {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) return undefined;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function normalizeCreatedBy(v: unknown): string | undefined {
  const t = normalizeMetaString(v, 32);
  if (!t) return undefined;
  const k = t.toLowerCase();
  if (k === 'admin' || k === 'system' || k === 'agent') return k;
  return t;
}

function getActivePricingProfileFromDb(db: ProfilesDbV2, id: string): PricingProfile | null {
  const key = (id || '').trim();
  if (!key) return null;
  const entry = db.pricingProfiles[key];
  if (!entry) return null;
  const active = entry.versions?.[entry.activeVersionId];
  return active || null;
}

export async function listPricingProfileVersions(
  id: string
): Promise<{ activeVersionId: string; versions: PricingProfileVersionMeta[] } | null> {
  const key = (id || '').trim();
  if (!key) return null;
  const db = await loadProfilesDb();
  const entry = db.pricingProfiles[key];
  if (!entry) return null;
  const versions = Object.values(entry.meta || {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { activeVersionId: entry.activeVersionId, versions };
}

export async function getPricingProfileVersion(id: string, versionId: string): Promise<PricingProfile | null> {
  const key = (id || '').trim();
  const v = (versionId || '').trim();
  if (!key || !v) return null;
  const db = await loadProfilesDb();
  const entry = db.pricingProfiles[key];
  if (!entry) return null;
  return entry.versions?.[v] || null;
}

export async function activatePricingProfileVersion(params: {
  id: string;
  versionId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const id = String(params.id || '').trim();
    const versionId = String(params.versionId || '').trim();
    if (!id) return { ok: false, reason: 'Missing profile id' };
    if (!versionId) return { ok: false, reason: 'Missing versionId' };

    const db = await loadProfilesDb();
    const entry = db.pricingProfiles[id];
    if (!entry) return { ok: false, reason: 'Profile not found' };
    if (!entry.versions?.[versionId]) return { ok: false, reason: 'Version not found' };

    entry.activeVersionId = versionId;
    db.pricingProfiles[id] = entry;
    await saveProfilesDb(db);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

function defaultPricingProfile(currency: string): PricingProfile {
  const t = nowIso();
  return {
    id: 'default',
    createdAt: t,
    updatedAt: t,
    currency,
    basePriceCentsByOp: {
      protect_video: 120,
      protect_image: 60,
      protect_audio: 80,
      protect_live: 250,
      protect_report: 500,
      stamp_video: 25,
      stamp_video_watermarked: 50,
      stamp_image: 10,
      stamp_image_watermarked: 20,
      stamp_audio_watermarked: 20,
      verify_video: 10,
      verify_video_watermarked: 20,
      verify_image: 5,
      verify_image_watermarked: 10,
      verify_audio: 10,
      verify_by_url: 15,
      verify_image_by_url: 10,
      verify_image_watermarked_by_url: 15,
      verify_audio_by_url: 15,
      time_anchor_create: 5,
      time_anchor_get: 1,
      public_anchor_get: 1,
      share_link_create: 5,
      live_start: 10,
      live_append: 2,
      live_finish: 10,
      live_cancel: 1,
      live_get: 1,
      live_telemetry: 1
    },
    multiplierByClientType: {
      unknown: 1,
      individual: 1,
      business: 1
    },
    multiplierBySector: {
      unknown: 1
    },
    multiplierByCountry: {
      unknown: 1
    },
    multiplierByReach: {
      unknown: 1,
      small: 1,
      medium: 1.25,
      large: 1.6,
      mass: 2
    },
    multiplierByExposure: {
      unknown: 1,
      private: 1,
      team: 1,
      public: 1.3,
      paid: 1.6,
      mass: 2.2,
      viral: 2.2
    },
    multiplierByPersistence: {
      unknown: 1,
      short: 1,
      medium: 1.2,
      long: 1.5,
      permanent: 2
    },
    multiplierByGuaranteeWindow: {
      unknown: 1,
      none: 0.95,
      '7d': 1,
      '30d': 1.1,
      '6m': 1.25,
      '1y': 1.45,
      '3y': 1.75,
      'lifetime': 2
    },
    multiplierByProofGrade: {
      unknown: 1,
      social: 1,
      commercial: 1.6,
      legal: 2.4,
      forensic: 4
    },
    multiplierByAuthenticityLevel: {
      unknown: 1,
      social: 1,
      commercial: 1.6,
      legal: 2.4,
      forensic: 4
    },
    multiplierByRiskProfile: {
      unknown: 1
    },
    multiplierByPlan: {
      unknown: 1,
      starter: 1,
      pro: 0.85,
      enterprise: 0.7
    },
    multiplierByDurationBucket: {
      unknown: 1
    },
    multiplierBySizeMbBucket: {
      unknown: 1
    },
    multiplierByPagesBucket: {
      unknown: 1
    }
  };
}

function defaultCommissionProfile(): CommissionProfile {
  const t = nowIso();
  return {
    id: 'default',
    createdAt: t,
    updatedAt: t,
    platformFeeBps: 0,
    partnerShareBps: 0
  };
}

function defaultTaxProfile(): TaxProfile {
  const t = nowIso();
  return {
    id: 'default',
    createdAt: t,
    updatedAt: t,
    taxBpsByCountry: {
      unknown: 0
    }
  };
}

export async function upsertPricingProfile(profile: PricingProfile): Promise<{ ok: true } | { ok: false; reason: string }> {
  return upsertPricingProfileWithMeta({ profile });
}

export async function upsertPricingProfileWithMeta(params: {
  profile: PricingProfile;
  versionId?: string;
  reason?: string;
  createdBy?: string;
}): Promise<{ ok: true; versionId: string } | { ok: false; reason: string }> {
  try {
    const profile = params.profile;
    const id = (profile?.id || '').trim();
    if (!id) return { ok: false, reason: 'Missing profile id' };

    const db = await loadProfilesDb();
    const prevActive = getActivePricingProfileFromDb(db, id);
    const createdAt = prevActive?.createdAt || profile.createdAt || nowIso();
    const updatedAt = nowIso();

    const normalized: PricingProfile = {
      ...profile,
      id,
      createdAt,
      updatedAt,
      currency: (profile.currency || 'USD').trim() || 'USD',
      basePriceCentsByOp: profile.basePriceCentsByOp || {},
      multiplierByClientType: profile.multiplierByClientType || {},
      multiplierBySector: profile.multiplierBySector || {},
      multiplierByCountry: profile.multiplierByCountry || {},
      multiplierByReach: profile.multiplierByReach || {},
      multiplierByExposure: profile.multiplierByExposure || {},
      multiplierByPersistence: profile.multiplierByPersistence || {},
      multiplierByGuaranteeWindow: profile.multiplierByGuaranteeWindow || {},
      multiplierByProofGrade: profile.multiplierByProofGrade || {},
      multiplierByAuthenticityLevel: profile.multiplierByAuthenticityLevel || {},
      multiplierByRiskProfile: profile.multiplierByRiskProfile || {},
      multiplierByPlan: profile.multiplierByPlan || {},
      multiplierByDurationBucket: profile.multiplierByDurationBucket || {},
      multiplierBySizeMbBucket: profile.multiplierBySizeMbBucket || {},
      multiplierByPagesBucket: profile.multiplierByPagesBucket || {}
    };

    const wantedVersionId = String(params.versionId || '').trim();
    const versionId = isValidSemanticVersionId(wantedVersionId) ? wantedVersionId : newProfileVersionId();
    const existing = db.pricingProfiles[id];
    const next: PricingProfileVersioned = existing
      ? {
          activeVersionId: existing.activeVersionId,
          versions: existing.versions || {},
          meta: existing.meta || {}
        }
      : { activeVersionId: versionId, versions: {}, meta: {} };

    if (next.versions[versionId]) {
      return { ok: false, reason: 'Version already exists' };
    }

    next.versions[versionId] = normalized;
    next.meta[versionId] = {
      versionId,
      createdAt: updatedAt,
      reason: normalizeMetaString(params.reason, 120),
      createdBy: normalizeCreatedBy(params.createdBy)
    };
    next.activeVersionId = versionId;
    db.pricingProfiles[id] = next;

    await saveProfilesDb(db);
    return { ok: true, versionId };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

export async function upsertCommissionProfile(
  profile: CommissionProfile
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const id = (profile?.id || '').trim();
    if (!id) return { ok: false, reason: 'Missing profile id' };

    const db = await loadProfilesDb();
    const prev = db.commissionProfiles[id];
    const createdAt = prev?.createdAt || profile.createdAt || nowIso();

    db.commissionProfiles[id] = {
      ...profile,
      id,
      createdAt,
      updatedAt: nowIso(),
      platformFeeBps: clampInt(profile.platformFeeBps, 0, 100_000),
      partnerShareBps: clampInt(profile.partnerShareBps, 0, 100_000)
    };

    await saveProfilesDb(db);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

export async function upsertTaxProfile(profile: TaxProfile): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const id = (profile?.id || '').trim();
    if (!id) return { ok: false, reason: 'Missing profile id' };

    const db = await loadProfilesDb();
    const prev = db.taxProfiles[id];
    const createdAt = prev?.createdAt || profile.createdAt || nowIso();

    db.taxProfiles[id] = {
      ...profile,
      id,
      createdAt,
      updatedAt: nowIso(),
      taxBpsByCountry: profile.taxBpsByCountry || {}
    };

    await saveProfilesDb(db);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

export async function getPricingProfile(id: string, currencyFallback = 'USD'): Promise<PricingProfile> {
  const key = (id || '').trim() || 'default';
  const db = await loadProfilesDb();
  const active = getActivePricingProfileFromDb(db, key);
  return active || defaultPricingProfile(currencyFallback);
}

export async function getCommissionProfile(id: string): Promise<CommissionProfile> {
  const key = (id || '').trim() || 'default';
  const db = await loadProfilesDb();
  return db.commissionProfiles[key] || defaultCommissionProfile();
}

export async function getTaxProfile(id: string): Promise<TaxProfile> {
  const key = (id || '').trim() || 'default';
  const db = await loadProfilesDb();
  return db.taxProfiles[key] || defaultTaxProfile();
}

export function calculateFinalPrice(params: {
  scope: PricingContext;
  basePriceCents: number;
  pricingProfile: PricingProfile;
  commissionProfile: CommissionProfile;
  taxProfile: TaxProfile;
}): PricingQuoteInternal {
  const scope = params.scope;
  const currency = (scope.currency || params.pricingProfile.currency || 'USD').trim() || 'USD';

  const basePriceCents = Math.max(0, Math.trunc(params.basePriceCents));
  const units = Number.isFinite(Number(scope.units ?? NaN)) ? clampInt(Number(scope.units), 1, 1_000_000) : 1;
  const baseSubtotalCents = Math.max(0, Math.trunc(basePriceCents * units));

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

  const productKey = normalizeKey(scope.product || 'unknown') || 'unknown';

  const durationKey = durationBucketKey({ product: productKey, durationSeconds: scope.durationSeconds });
  const sizeKey = sizeMbBucketKey({ product: productKey, sizeBytes: scope.sizeBytes });
  const pagesKey = pagesBucketKey(scope.pages);

  const mClient = safeMultiplier(params.pricingProfile.multiplierByClientType[clientTypeKey]);
  const mSector = safeMultiplier(params.pricingProfile.multiplierBySector[sectorKey]);
  const mCountry = safeMultiplier(params.pricingProfile.multiplierByCountry[countryKey]);

  const mReach = safeMultiplier(params.pricingProfile.multiplierByReach?.[reachKey]);
  const mExposure = safeMultiplier(params.pricingProfile.multiplierByExposure?.[exposureKey]);
  const mPersistence = safeMultiplier(params.pricingProfile.multiplierByPersistence?.[persistenceKey]);
  const mGuarantee = safeMultiplier(params.pricingProfile.multiplierByGuaranteeWindow?.[guaranteeKey]);
  const mProofGrade = safeMultiplier(params.pricingProfile.multiplierByProofGrade?.[proofGradeKey]);
  const mAuthenticity = safeMultiplier(params.pricingProfile.multiplierByAuthenticityLevel?.[authenticityKey]);
  const mRiskProfile = safeMultiplier(params.pricingProfile.multiplierByRiskProfile?.[riskProfileKey]);
  const mPlan = safeMultiplier(params.pricingProfile.multiplierByPlan?.[planKey]);

  const durationApplies =
    productKey === 'video_protection' || productKey === 'live_protection' || productKey === 'audio_protection';
  const sizeApplies = productKey === 'image_protection' || productKey === 'document_protection';
  const pagesApplies = productKey === 'document_protection';

  const mDuration = durationApplies ? safeMultiplier(params.pricingProfile.multiplierByDurationBucket?.[durationKey]) : 1;
  const mSize = sizeApplies ? safeMultiplier(params.pricingProfile.multiplierBySizeMbBucket?.[sizeKey]) : 1;
  const mPages = pagesApplies ? safeMultiplier(params.pricingProfile.multiplierByPagesBucket?.[pagesKey]) : 1;

  const mContent = productKey === 'document_protection' ? safeMultiplier(Math.max(mPages, mSize)) : safeMultiplier(mDuration * mSize);

  const pricingMultiplier = safeMultiplier(
    mClient *
      mSector *
      mCountry *
      mReach *
      mExposure *
      mPersistence *
      mGuarantee *
      mProofGrade *
      mAuthenticity *
      mRiskProfile *
      mPlan *
      mContent
  );

  const priceAfterMultiplierCents = Math.max(0, Math.trunc(baseSubtotalCents * pricingMultiplier));

  const platformFeeCents = applyBps(priceAfterMultiplierCents, params.commissionProfile.platformFeeBps);
  const partnerShareCents = applyBps(priceAfterMultiplierCents, params.commissionProfile.partnerShareBps);

  const taxBps =
    params.taxProfile.taxBpsByCountry[countryKey] ??
    params.taxProfile.taxBpsByCountry[countryKey.toUpperCase()] ??
    params.taxProfile.taxBpsByCountry.unknown ??
    0;

  const taxableBaseCents = Math.max(0, priceAfterMultiplierCents + platformFeeCents + partnerShareCents);
  const taxCents = applyBps(taxableBaseCents, Number(taxBps) || 0);

  let finalPriceCents = taxableBaseCents + taxCents;

  if (typeof params.pricingProfile.minFinalPriceCents === 'number') {
    finalPriceCents = Math.max(finalPriceCents, Math.trunc(params.pricingProfile.minFinalPriceCents));
  }
  if (typeof params.pricingProfile.maxFinalPriceCents === 'number') {
    finalPriceCents = Math.min(finalPriceCents, Math.trunc(params.pricingProfile.maxFinalPriceCents));
  }

  finalPriceCents = Math.max(0, Math.trunc(finalPriceCents));

  return {
    currency,
    finalPriceCents,
    scope,
    internalBreakdown: {
      basePriceCents,
      pricingMultiplier,
      priceAfterMultiplierCents,
      platformFeeCents,
      partnerShareCents,
      taxCents
    }
  };
}

export function recommendProtection(scope: PricingContext): ProtectionRecommendation {
  const grade = normalizeKey(scope.proofGrade || 'unknown');
  const authenticity = normalizeKey(scope.authenticityLevel || '');
  const exposure = normalizeKey(scope.exposure || 'unknown');
  const reach = normalizeKey(scope.reach || 'unknown');
  const risk = normalizeKey(scope.riskProfile || 'unknown');
  const persistence = normalizeKey(scope.persistence || 'unknown');

  let score = 0;

  const levelKey = authenticity || grade;

  if (levelKey === 'forensic' || levelKey === 'judicial' || levelKey === 'pericial') {
    return { level: 'enterprise', label: 'Protecao Forense' };
  }

  if (levelKey === 'legal' || levelKey === 'court' || levelKey === 'enterprise') score += 3;
  else if (levelKey === 'commercial' || levelKey === 'business') score += 2;
  else if (levelKey === 'social' || levelKey === 'basic') score += 1;

  if (exposure === 'viral' || exposure === 'public') score += 2;
  else if (exposure === 'team' || exposure === 'community') score += 1;

  if (reach === 'large' || reach === 'mass') score += 2;
  else if (reach === 'medium') score += 1;

  if (risk === 'high') score += 2;
  else if (risk === 'medium') score += 1;

  if (persistence === 'permanent' || persistence === 'long') score += 1;

  if (score >= 7) return { level: 'enterprise', label: 'Protecao Enterprise' };
  if (score >= 5) return { level: 'legal', label: 'Protecao Legal' };
  if (score >= 3) return { level: 'commercial', label: 'Protecao Comercial' };
  return { level: 'social', label: 'Protecao Social' };
}
