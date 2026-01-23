import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import JSZip from 'jszip';

import { base64UrlToBytes, bytesToBase64Url, ed25519KeyPairFromPrivateKey } from '@phoenix-zero/core';
import {
  createHybridSignature,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url
} from '@phoenix-zero/core/node';

import { computeImageDHashB64Url, embedInvisibleImageWatermark } from '@phoenix-zero/core/node/watermark-image';

import { getCreatorRecord } from '../../../../lib/creator-registry';
import { maybeCreateIssuerAttestation } from '../../../../lib/issuer-attestation';
import { verifyCreatorRegistrySignature } from '../../../../lib/registry-signing';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

const MAX_IMAGE_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_STAMP_IMAGE_WATERMARKED_MAX_IMAGE_BYTES', 10 * 1024 * 1024));
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

type IssuerProof = {
  version: 4;
  createdAt: string;
  creatorId?: string;
  media: {
    mimeType?: string;
    byteLength: number;
  };
  watermark: {
    alg: 'grid_luma_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    repeatPerBit: number;
    brightnessDelta: number;
    maxBitErrors: number;
    grid: {
      x: number;
      y: number;
      w: number;
      h: number;
      rows: number;
      cols: number;
    };
    analysisSize: number;
  };
  fingerprint: {
    alg: 'dhash_v1';
    width: number;
    height: number;
    valueB64Url: string;
    maxHammingDistance: number;
  };
  signatureMode: 'compat' | 'strict';
};

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function extFromMime(mime: string | undefined): 'png' | 'jpg' {
  if (mime === 'image/png') return 'png';
  return 'jpg';
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

    const form = await req.formData();
    const image = form.get('image');

    if (!(image instanceof File)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing form field: image' }, { status: 400 });
    }

    if (Number.isFinite(image.size) && image.size > MAX_IMAGE_BYTES) {
      httpStatus = 413;
      return Response.json({ ok: false, reason: 'File too large' }, { status: 413 });
    }

    if (image.type && !ALLOWED_MIME.has(image.type)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid file type' }, { status: 400 });
    }

    const mode = (typeof form.get('mode') === 'string' ? String(form.get('mode')) : 'compat') as 'compat' | 'strict';
    const creatorId = typeof form.get('creatorId') === 'string' ? String(form.get('creatorId')) : undefined;

    const privateKeyB64Url =
      (typeof form.get('privateKeyB64Url') === 'string' ? String(form.get('privateKeyB64Url')) : undefined) ??
      process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL ??
      (await readJsonMaybe<{ privateKeyB64Url?: string }>(
        resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-ed25519.json')
      ))?.privateKeyB64Url;

    if (!privateKeyB64Url) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing signing key. Provide privateKeyB64Url or set PHOENIX_ZERO_PRIVATE_KEY_B64URL.' },
        { status: 400 }
      );
    }

    const edKeyPair = ed25519KeyPairFromPrivateKey(base64UrlToBytes(privateKeyB64Url));

    const enforceRegistry = process.env.PHOENIX_ZERO_ENFORCE_CREATOR_REGISTRY === '1';
    const requireSignedRegistry = process.env.PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY === '1';

    if (enforceRegistry && creatorId && requireSignedRegistry) {
      const trust = await verifyCreatorRegistrySignature();
      if (!trust.ok) {
        httpStatus = 503;
        return Response.json(
          { ok: false, reason: 'Creator registry is not trusted (missing/invalid signature).' },
          { status: 503 }
        );
      }
    }

    const registryRecord = enforceRegistry && creatorId ? await getCreatorRecord(creatorId) : null;
    if (enforceRegistry && creatorId && registryRecord) {
      const edPub = bytesToBase64Url(edKeyPair.publicKey);
      if (edPub !== registryRecord.ed25519PublicKeyB64Url) {
        httpStatus = 403;
        return Response.json({ ok: false, reason: 'Signing key does not match creator registry for creatorId.' }, { status: 403 });
      }
    }

    const imageBytes = new Uint8Array(await image.arrayBuffer());

    const payloadByteLength = 8;
    const bitCount = 64;
    const repeatPerBit = 2;
    const maxBitErrors = 2;

    const wmPayload = randomBytes(payloadByteLength);
    const wmPayloadB64Url = bytesToBase64Url(new Uint8Array(wmPayload));

    const analysisSize = 512;

    const wmCfg = {
      payloadB64Url: wmPayloadB64Url,
      payloadByteLength,
      bitCount,
      repeatPerBit,
      brightnessDelta: 0.03,
      grid: {
        x: 0.1,
        y: 0.1,
        w: 0.8,
        h: 0.8,
        rows: 16,
        cols: 16
      },
      analysisSize
    };

    const watermarked = await embedInvisibleImageWatermark({ inputBytes: imageBytes, cfg: wmCfg });

    const dhashWidth = 9;
    const dhashHeight = 8;
    const dhash = await computeImageDHashB64Url({ imageBytes: watermarked.outputBytes, width: dhashWidth, height: dhashHeight });
    const maxHammingDistance = 14;

    const payload: IssuerProof = {
      version: 4,
      createdAt: new Date().toISOString(),
      creatorId,
      media: { mimeType: watermarked.mimeType, byteLength: watermarked.outputBytes.byteLength },
      watermark: {
        alg: 'grid_luma_delta_v1',
        payloadByteLength: wmCfg.payloadByteLength,
        payloadB64Url: wmCfg.payloadB64Url,
        bitCount: wmCfg.bitCount,
        repeatPerBit: wmCfg.repeatPerBit,
        brightnessDelta: wmCfg.brightnessDelta,
        maxBitErrors,
        grid: wmCfg.grid,
        analysisSize
      },
      fingerprint: {
        alg: 'dhash_v1',
        width: dhashWidth,
        height: dhashHeight,
        valueB64Url: dhash,
        maxHammingDistance
      },
      signatureMode: mode
    };

    let pqKeys:
      | {
          alg: 'sphincs';
          privateKey: Uint8Array;
          publicKey: Uint8Array;
        }
      | undefined;

    const pqPriv = process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL;
    const pqPub = process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL;

    const pqFromFile = await readJsonMaybe<{ privateKeyB64Url?: string; publicKeyB64Url?: string }>(
      resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-sphincs.json')
    );

    const pqPriv2 = pqPriv ?? pqFromFile?.privateKeyB64Url;
    const pqPub2 = pqPub ?? pqFromFile?.publicKeyB64Url;

    if (pqPriv2 && pqPub2) {
      pqKeys = {
        alg: 'sphincs',
        privateKey: pqPrivateKeyFromB64Url(pqPriv2),
        publicKey: pqPublicKeyFromB64Url(pqPub2)
      };
    } else if (mode === 'strict') {
      const kp = await generateSphincsKeyPair();
      pqKeys = { alg: 'sphincs', privateKey: kp.privateKey, publicKey: kp.publicKey };
    }

    if (enforceRegistry && creatorId && registryRecord?.pqPublicKeyB64Url) {
      const pqPub = pqKeys ? bytesToBase64Url(pqKeys.publicKey) : '';
      if (!pqPub || pqPub !== registryRecord.pqPublicKeyB64Url) {
        httpStatus = 403;
        return Response.json({ ok: false, reason: 'PQ key does not match creator registry for creatorId.' }, { status: 403 });
      }
    }

    const hybridSignature = await createHybridSignature({
      payload,
      mode,
      ed25519: { privateKey: edKeyPair.privateKey, publicKey: edKeyPair.publicKey },
      pq: pqKeys
    });

    const issuerAttestation = await maybeCreateIssuerAttestation({ hybridId: hybridSignature.hybridId, creatorId });

    const proof = {
      ...payload,
      hybridSignature,
      issuerAttestation: issuerAttestation ?? undefined
    };

    const zip = new JSZip();
    const ext = extFromMime(watermarked.mimeType);
    zip.file(`watermarked.${ext}`, Buffer.from(watermarked.outputBytes));
    zip.file('proof.json', JSON.stringify(proof, null, 2));

    const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });

    ok = true;
    httpStatus = 200;
    return new Response(new Uint8Array(zipBytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="phoenix-zero-image-watermarked.zip"'
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op: 'stamp_image_watermarked', ok, httpStatus, startedAtMs });
  }
}
