import { lookup } from 'node:dns/promises';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sha256B64Url } from '@phoenix-zero/core';
import {
  extractInvisibleWatermark,
  extractTemporalFingerprintFromVideoPath,
  selectWatermarkedPreset,
  verifyHybridSignature,
  type PhoenixZeroPlatform
} from '@phoenix-zero/core/node';

import { findCreatorByPublicKeys, getCreatorRecord } from '../../../../lib/creator-registry';
import { appendFraudEvent } from '../../../../lib/fraud-audit';
import { checkWatchlist } from '../../../../lib/fraud-watchlist';
import { assessIdentity } from '../../../../lib/identity';
import {
  computeHybridIdFromParts,
  getLocalIssuerPublicKeyB64Url,
  verifyIssuerAttestation
} from '../../../../lib/issuer-attestation';
import { verifyCreatorRegistrySignature } from '../../../../lib/registry-signing';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { phoenixZeroTmpDir } from '../../../../lib/tmp-dir';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

const ALLOW_LOCALHOST_VERIFY =
  process.env.PHOENIX_ZERO_VERIFY_URL_ALLOW_LOCALHOST === '1' || process.env.NODE_ENV !== 'production';

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parseAllowlist(raw: string | undefined): string[] {
  const txt = (raw || '').trim();
  if (!txt) return [];
  return txt
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostAllowed(host: string, allowlist: string[]): boolean {
  return allowlist.some((d) => host === d || host.endsWith(`.${d}`));
}

const VERIFY_URL_ALLOWLIST = parseAllowlist(process.env.PHOENIX_ZERO_VERIFY_URL_ALLOWLIST);
const REQUIRE_ALLOWLIST =
  process.env.PHOENIX_ZERO_VERIFY_URL_REQUIRE_ALLOWLIST === '0'
    ? false
    : process.env.PHOENIX_ZERO_VERIFY_URL_REQUIRE_ALLOWLIST === '1' || process.env.NODE_ENV === 'production';
const FETCH_TIMEOUT_MS = Math.max(1000, getEnvInt('PHOENIX_ZERO_VERIFY_URL_FETCH_TIMEOUT_MS', 15_000));
const MAX_PROOF_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_VERIFY_URL_MAX_PROOF_BYTES', 1024 * 1024));
const MAX_VIDEO_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_VERIFY_URL_MAX_VIDEO_BYTES', 200 * 1024 * 1024));

function getRequestHost(req: Request): string {
  const xfHost = (req.headers.get('x-forwarded-host') || '').split(',')[0]?.trim();
  const host = (xfHost || req.headers.get('host') || '').trim();
  return host.toLowerCase();
}

type Proof = {
  version: 3;
  createdAt: string;
  creatorId?: string;
  preset?: {
    id: string;
    platform?: PhoenixZeroPlatform;
    durationSeconds?: number;
    watermarkVerify?: {
      yThreshold?: number;
      searchStartFrameWindow?: number;
    };
  };
  media: { mimeType?: string; byteLength?: number };
  temporal: {
    alg: 'signalstats_yavg_v1';
    cfg: { fps: number; scale: number; targetLen: number; quant: number };
    samples: number[];
    hashB64Url: string;
    madThreshold: number;
  };
  watermark: {
    alg: 'roi_luma_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    startFrame: number;
    frameInterval: number;
    repeatPerBit?: number;
    brightnessDelta: number;
    roi?: { x: number; y: number; w: number; h: number };
    rois?: { x: number; y: number; w: number; h: number }[];
  };
  signatureMode: 'compat' | 'strict';
  hybridSignature: any;
  issuerAttestation?: any;
};

function meanAbsDiff(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Number.POSITIVE_INFINITY;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / n;
}

function samplesToBytes(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] ?? 0;
  return out;
}

function isPrivateIp(ip: string): boolean {
  const v = ip.trim();

  if (v === '127.0.0.1' || v === '0.0.0.0') return true;
  if (v === '::1') return true;
  if (v.startsWith('fe80:')) return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;

  const m = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/.exec(v);
  if (!m) return false;

  const a = Number(m[1]);
  const b = Number(m[2]);

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

async function assertPublicHttpUrl(url: URL, requestHost: string) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must be http(s).');
  }

  if (url.username || url.password) {
    throw new Error('URL must not include credentials.');
  }

  const host = url.hostname.toLowerCase();
  const reqHost = ((requestHost || '').split(',')[0] || '').trim().toLowerCase();
  const reqHostNoPort = ((reqHost.split(':')[0] || '')).trim();
  const sameOrigin = Boolean(reqHostNoPort) && host === reqHostNoPort;

  if (REQUIRE_ALLOWLIST && VERIFY_URL_ALLOWLIST.length === 0 && !sameOrigin) {
    throw new Error('Missing URL allowlist (PHOENIX_ZERO_VERIFY_URL_ALLOWLIST).');
  }
  if (VERIFY_URL_ALLOWLIST.length > 0 && !hostAllowed(host, VERIFY_URL_ALLOWLIST)) {
    throw new Error('Refusing URL outside allowlist.');
  }
  if (!ALLOW_LOCALHOST_VERIFY && !sameOrigin) {
    if (host === 'localhost') throw new Error('Refusing localhost URL.');
  }

  if (!ALLOW_LOCALHOST_VERIFY && !sameOrigin) {
    const resolved = await lookup(host, { all: true, verbatim: true });
    for (const r of resolved) {
      if (isPrivateIp(r.address)) throw new Error('Refusing private network URL.');
    }
  }
}

async function fetchBytes(params: { url: URL; maxBytes: number }): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(params.url.toString(), { redirect: 'manual', signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`Refusing redirect (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }

  const len = res.headers.get('content-length');
  if (len) {
    const n = Number(len);
    if (Number.isFinite(n) && n > params.maxBytes) {
      throw new Error(`Response too large (${n} bytes).`);
    }
  }

  if (!res.body) throw new Error('Missing response body.');

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > params.maxBytes) {
      throw new Error(`Response too large (>${params.maxBytes} bytes).`);
    }

    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }

  return out;
}

export async function POST(req: Request) {
  let inputPath: string | null = null;
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;

  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
    }
    tenantId = auth.ctx.tenantId;

    const billing = await getOrCreateBillingAccount(auth.ctx.tenantId);
    if (!billing.ok) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: billing.reason }, { status: 400 });
    }
    if (!isBillingAccountActive(billing.account)) {
      httpStatus = 402;
      return Response.json(
        { ok: false, reason: 'Payment required', billing: { status: billing.account.status, isActive: false } },
        { status: 402 }
      );
    }

    const body = (await req.json().catch(() => null)) as
      | {
          videoUrl?: string;
          proofUrl?: string;
          platform?: PhoenixZeroPlatform;
          wmThreshold?: number;
          wmSearchWindow?: number;
        }
      | null;

    const videoUrlStr = body?.videoUrl;
    const proofUrlStr = body?.proofUrl;

    if (!videoUrlStr || !proofUrlStr) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing videoUrl or proofUrl.' }, { status: 400 });
    }

    const videoUrl = new URL(videoUrlStr);
    const proofUrl = new URL(proofUrlStr);

    const requestHost = getRequestHost(req);

    await assertPublicHttpUrl(videoUrl, requestHost);
    await assertPublicHttpUrl(proofUrl, requestHost);

    const proofBytes = await fetchBytes({ url: proofUrl, maxBytes: MAX_PROOF_BYTES });
    const proofTxt = new TextDecoder().decode(proofBytes);
    let proof: Proof;
    try {
      proof = JSON.parse(proofTxt) as Proof;
    } catch {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid proof JSON.' }, { status: 400 });
    }

    if (!(proof as any)?.hybridSignature || typeof (proof as any).hybridSignature !== 'object') {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid proof: missing hybridSignature.' }, { status: 400 });
    }

    const payload = {
      version: proof.version,
      createdAt: proof.createdAt,
      creatorId: proof.creatorId,
      preset: proof.preset,
      media: proof.media,
      temporal: proof.temporal,
      watermark: proof.watermark,
      signatureMode: proof.signatureMode
    };

    const sigResult = await verifyHybridSignature({ payload, sig: proof.hybridSignature });

    const proofEd25519PublicKeyB64Url = (proof.hybridSignature as any)?.ed25519?.publicKeyB64Url as
      | string
      | undefined;
    const proofPqPublicKeyB64Url = (proof.hybridSignature as any)?.pq?.publicKeyB64Url as string | undefined;

    const registryById = proof.creatorId ? await getCreatorRecord(proof.creatorId) : null;
    const registryByKey =
      !proof.creatorId && proofEd25519PublicKeyB64Url
        ? await findCreatorByPublicKeys({
            ed25519PublicKeyB64Url: proofEd25519PublicKeyB64Url,
            pqPublicKeyB64Url: proofPqPublicKeyB64Url
          })
        : null;

    const effectiveCreatorId = proof.creatorId ?? registryByKey?.creatorId;
    const registryRecord = registryById ?? registryByKey?.record ?? null;

    const identity = assessIdentity({
      creatorId: effectiveCreatorId,
      registryRecord,
      proofEd25519PublicKeyB64Url,
      proofPqPublicKeyB64Url
    });

    const tmpDir = phoenixZeroTmpDir();
    await mkdir(tmpDir, { recursive: true });

    const stampId = Date.now().toString(10);
    inputPath = join(tmpDir, `verify-url-${stampId}.mp4`);

    const videoBytes = await fetchBytes({ url: videoUrl, maxBytes: MAX_VIDEO_BYTES });
    await writeFile(inputPath, Buffer.from(videoBytes));

    const platform = body?.platform;
    let wmThreshold = body?.wmThreshold;
    let wmSearchWindow = body?.wmSearchWindow;

    wmThreshold = wmThreshold ?? proof.preset?.watermarkVerify?.yThreshold;
    wmSearchWindow = wmSearchWindow ?? proof.preset?.watermarkVerify?.searchStartFrameWindow;

    const wmCfg = {
      payloadB64Url: proof.watermark.payloadB64Url,
      payloadByteLength: proof.watermark.payloadByteLength,
      bitCount: proof.watermark.bitCount,
      startFrame: proof.watermark.startFrame,
      frameInterval: proof.watermark.frameInterval,
      repeatPerBit: proof.watermark.repeatPerBit ?? 2,
      brightnessDelta: proof.watermark.brightnessDelta,
      roi: proof.watermark.roi,
      rois: proof.watermark.rois
    };

    if (platform && (wmThreshold === undefined || wmSearchWindow === undefined)) {
      const preset = await selectWatermarkedPreset({ videoPath: inputPath, platform });
      wmThreshold = wmThreshold ?? preset.watermarkVerify?.yThreshold;
      wmSearchWindow = wmSearchWindow ?? preset.watermarkVerify?.searchStartFrameWindow;
    }

    const searchStartFrameWindow = wmSearchWindow ?? 0;

    const wm = await extractInvisibleWatermark({
      videoPath: inputPath,
      cfg: wmCfg,
      yThreshold: wmThreshold,
      expectedPayloadB64Url: proof.watermark.payloadB64Url,
      searchStartFrameWindow
    });
    const watermarkMatch = wm.extractedPayloadB64Url === proof.watermark.payloadB64Url;

    const extracted = await extractTemporalFingerprintFromVideoPath({ videoPath: inputPath, cfg: proof.temporal.cfg });
    const mad = meanAbsDiff(extracted.samples, proof.temporal.samples);
    const temporalMatch = mad <= proof.temporal.madThreshold;

    const extractedHash = sha256B64Url(samplesToBytes(extracted.samples));

    const baseOk = sigResult.ok && (watermarkMatch || temporalMatch);

    const requireSignedRegistry = process.env.PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY === '1';
    const registry = requireSignedRegistry
      ? await verifyCreatorRegistrySignature()
      : { ok: true as const };

    if (requireSignedRegistry && !(registry as any).ok) {
      httpStatus = 503;
      return Response.json(
        {
          ok: false,
          decision: 'not_verified',
          registry
        },
        { status: 503 }
      );
    }

    const requireIssuerAttestation = process.env.PHOENIX_ZERO_REQUIRE_ISSUER_ATTESTATION === '1';
    const trustedIssuerPublicKeyB64Url =
      process.env.PHOENIX_ZERO_TRUSTED_ISSUER_PUBLIC_KEY_B64URL ?? (await getLocalIssuerPublicKeyB64Url()) ?? undefined;

    const edSigB64Url = (proof.hybridSignature as any)?.ed25519?.signatureB64Url as string | undefined;
    const pqSigB64Url = (proof.hybridSignature as any)?.pq?.signatureB64Url as string | undefined;

    let expectedHybridId: string | undefined;
    if (typeof edSigB64Url === 'string' && edSigB64Url) {
      try {
        expectedHybridId = computeHybridIdFromParts({ payload, edSigB64Url, pqSigB64Url });
      } catch {
        expectedHybridId = undefined;
      }
    }

    const attestation = verifyIssuerAttestation({
      attestation: (proof as any).issuerAttestation,
      expectedHybridId,
      trustedIssuerPublicKeyB64Url
    });

    const okResult = requireIssuerAttestation ? baseOk && attestation.ok : baseOk;

    const watch = await checkWatchlist({
      creatorId: effectiveCreatorId,
      ed25519PublicKeyB64Url: proofEd25519PublicKeyB64Url,
      pqPublicKeyB64Url: proofPqPublicKeyB64Url
    });

    const fraudReasons: string[] = [];
    if (identity.status === 'mismatch') fraudReasons.push('identity_mismatch');
    if (watch.blocked) fraudReasons.push(...watch.reasons);
    const fraud = { blocked: fraudReasons.length > 0, reasons: fraudReasons };

    const decision = !baseOk || (requireIssuerAttestation && !attestation.ok)
      ? 'not_verified'
      : identity.status === 'mismatch' || watch.blocked
        ? 'suspected_impersonation'
        : identity.status === 'match'
          ? 'verified'
          : 'verified_unregistered_creator';

    if (decision === 'suspected_impersonation') {
      const ipHeader = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
      const ip = ipHeader ? ipHeader.split(',')[0]?.trim() : undefined;
      try {
        await appendFraudEvent({
          at: new Date().toISOString(),
          kind: 'verify_by_url',
          decision,
          reasons: fraudReasons,
          creatorId: effectiveCreatorId,
          proofEd25519PublicKeyB64Url,
          proofPqPublicKeyB64Url,
          videoUrl: videoUrl.toString(),
          proofUrl: proofUrl.toString(),
          ip
        });
      } catch {
      }
    }

    ok = okResult;
    httpStatus = ok ? 200 : 400;
    return Response.json(
      {
        ok,
        decision,
        identity,
        fraud,
        attestation,
        registry,
        meta: {
          videoUrl: videoUrl.toString(),
          proofUrl: proofUrl.toString(),
          creatorId: proof.creatorId,
          createdAt: proof.createdAt,
          preset: proof.preset
        },
        signature: sigResult,
        watermark: {
          ok: watermarkMatch,
          expectedPayloadB64Url: proof.watermark.payloadB64Url,
          extractedPayloadB64Url: wm.extractedPayloadB64Url
        },
        temporal: {
          ok: temporalMatch,
          mad,
          threshold: proof.temporal.madThreshold,
          referenceHash: proof.temporal.hashB64Url,
          extractedHash
        }
      },
      { status: httpStatus }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    const status =
      message.includes('Missing URL allowlist') ||
      message.includes('Refusing ') ||
      message.includes('URL must ') ||
      message.includes('URL must not ') ||
      message.includes('Invalid proof') ||
      message.includes('Unexpected token') ||
      message.includes('Cannot read properties')
        ? 400
        : message.includes('Response too large')
          ? 413
          : message.includes('aborted') || message.includes('AbortError')
            ? 504
            : 500;
    ok = false;
    httpStatus = status;
    return Response.json({ ok: false, reason: message }, { status });
  } finally {
    if (inputPath) {
      await rm(inputPath, { force: true }).catch(() => {
      });
    }
    void recordUsage({ req, tenantId, op: 'verify_by_url', ok, httpStatus, startedAtMs });
  }
}
