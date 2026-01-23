import { lookup } from 'node:dns/promises';

import { verifyHybridSignature } from '@phoenix-zero/core/node';
import { computeImageDHashB64Url, dhashHammingDistance, extractInvisibleImageWatermark } from '@phoenix-zero/core/node/watermark-image';

import { findCreatorByPublicKeys, getCreatorRecord } from '../../../../lib/creator-registry';
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
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

const ALLOW_LOCALHOST_VERIFY =
  process.env.PHOENIX_ZERO_VERIFY_URL_ALLOW_LOCALHOST === '1' || process.env.NODE_ENV !== 'production';

function getRequestHost(req: Request): string {
  const xfHost = (req.headers.get('x-forwarded-host') || '').split(',')[0]?.trim();
  const host = (xfHost || req.headers.get('host') || '').trim();
  return host.toLowerCase();
}

type Proof = {
  version: 4;
  createdAt: string;
  creatorId?: string;
  media: { mimeType?: string; byteLength?: number };
  watermark: {
    alg: 'grid_luma_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    repeatPerBit: number;
    brightnessDelta: number;
    maxBitErrors?: number;
    grid: { x: number; y: number; w: number; h: number; rows: number; cols: number };
    analysisSize: number;
  };
  fingerprint?: {
    alg: 'dhash_v1';
    width: number;
    height: number;
    valueB64Url: string;
    maxHammingDistance?: number;
  };
  signatureMode: 'compat' | 'strict';
  hybridSignature: any;
  issuerAttestation?: any;
};

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
  const res = await fetch(params.url.toString(), { redirect: 'manual' });

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

    const body = (await req.json().catch(() => null)) as null | { imageUrl?: string; proofUrl?: string };

    const imageUrlStr = body?.imageUrl;
    const proofUrlStr = body?.proofUrl;

    if (!imageUrlStr || !proofUrlStr) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing imageUrl or proofUrl.' }, { status: 400 });
    }

    const imageUrl = new URL(imageUrlStr);
    const proofUrl = new URL(proofUrlStr);

    const requestHost = getRequestHost(req);

    await assertPublicHttpUrl(imageUrl, requestHost);
    await assertPublicHttpUrl(proofUrl, requestHost);

    const proofBytes = await fetchBytes({ url: proofUrl, maxBytes: 1024 * 1024 });
    const proofTxt = new TextDecoder().decode(proofBytes);
    const proof = JSON.parse(proofTxt) as Proof;

    if (proof.version !== 4) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Unsupported proof version.' }, { status: 400 });
    }

    const payload = {
      version: proof.version,
      createdAt: proof.createdAt,
      creatorId: proof.creatorId,
      media: proof.media,
      watermark: proof.watermark,
      fingerprint: proof.fingerprint,
      signatureMode: proof.signatureMode
    };

    const sigResult = await verifyHybridSignature({ payload, sig: proof.hybridSignature });

    const proofEd25519PublicKeyB64Url = (proof.hybridSignature as any)?.ed25519?.publicKeyB64Url as string | undefined;
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

    const imageBytes = await fetchBytes({ url: imageUrl, maxBytes: 50 * 1024 * 1024 });

    const wmCfg = {
      payloadB64Url: proof.watermark.payloadB64Url,
      payloadByteLength: proof.watermark.payloadByteLength,
      bitCount: proof.watermark.bitCount,
      repeatPerBit: proof.watermark.repeatPerBit,
      brightnessDelta: proof.watermark.brightnessDelta,
      grid: proof.watermark.grid,
      analysisSize: proof.watermark.analysisSize
    };

    const wm = await extractInvisibleImageWatermark({
      imageBytes,
      cfg: wmCfg,
      expectedPayloadB64Url: proof.watermark.payloadB64Url
    });

    const watermarkMatch = wm.extractedPayloadB64Url === proof.watermark.payloadB64Url;
    const maxBitErrors = Number.isFinite(proof.watermark.maxBitErrors) ? Number(proof.watermark.maxBitErrors) : 2;
    const bestBitErrors = typeof wm.bestBitErrors === 'number' ? wm.bestBitErrors : undefined;
    const watermarkOk = watermarkMatch || (bestBitErrors !== undefined && bestBitErrors <= maxBitErrors);

    let fingerprint: any = { present: false, ok: true as const };
    if (proof.fingerprint?.alg === 'dhash_v1') {
      const extracted = await computeImageDHashB64Url({
        imageBytes,
        width: proof.fingerprint.width,
        height: proof.fingerprint.height
      });
      const dist = dhashHammingDistance(proof.fingerprint.valueB64Url, extracted);
      const max = proof.fingerprint.maxHammingDistance ?? 14;
      fingerprint = {
        present: true,
        ok: dist <= max,
        distance: dist,
        max,
        referenceB64Url: proof.fingerprint.valueB64Url,
        extractedB64Url: extracted
      };
    }

    const baseOk = sigResult.ok && watermarkOk && (fingerprint.present ? fingerprint.ok : true);

    const requireSignedRegistry = process.env.PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY === '1';
    const registry = requireSignedRegistry ? await verifyCreatorRegistrySignature() : { ok: true as const };

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

    const decision =
      !baseOk || (requireIssuerAttestation && !attestation.ok)
        ? 'not_verified'
        : identity.status === 'mismatch' || watch.blocked
          ? 'suspected_impersonation'
          : identity.status === 'match'
            ? 'verified'
            : 'verified_unregistered_creator';

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
          imageUrl: imageUrl.toString(),
          proofUrl: proofUrl.toString(),
          creatorId: proof.creatorId,
          createdAt: proof.createdAt
        },
        signature: sigResult,
        watermark: {
          ok: watermarkOk,
          expectedPayloadB64Url: proof.watermark.payloadB64Url,
          extractedPayloadB64Url: wm.extractedPayloadB64Url,
          bestBitErrors,
          maxBitErrors,
          threshold: wm.threshold,
          polarity: wm.polarity
        },
        fingerprint
      },
      { status: httpStatus }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op: 'verify_image_watermarked_by_url', ok, httpStatus, startedAtMs });
  }
}
