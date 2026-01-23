import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import JSZip from 'jszip';

import { bytesToBase64Url, ed25519KeyPairFromPrivateKey, base64UrlToBytes, sha256B64Url } from '@phoenix-zero/core';
import {
  createHybridSignature,
  embedInvisibleWatermark,
  extractTemporalFingerprintFromVideoPath,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  selectWatermarkedPreset,
  type PhoenixZeroPlatform
} from '@phoenix-zero/core/node';

import { getCreatorRecord } from '../../../../lib/creator-registry';
import { maybeCreateIssuerAttestation } from '../../../../lib/issuer-attestation';
import { verifyCreatorRegistrySignature } from '../../../../lib/registry-signing';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { phoenixZeroTmpDir } from '../../../../lib/tmp-dir';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

const MAX_VIDEO_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_STAMP_WATERMARKED_MAX_VIDEO_BYTES', 50 * 1024 * 1024));
const ALLOWED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

type TemporalFingerprintParams = {
  fps: number;
  scale: number;
  targetLen: number;
  quant: number;
};

function samplesToBytes(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] ?? 0;
  return out;
}

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let inputPath: string | null = null;
  let outputPath: string | null = null;
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
    const video = form.get('video');

    if (!(video instanceof File)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing form field: video' }, { status: 400 });
    }

    if (Number.isFinite(video.size) && video.size > MAX_VIDEO_BYTES) {
      httpStatus = 413;
      return Response.json({ ok: false, reason: 'File too large' }, { status: 413 });
    }

    if (video.type && !ALLOWED_MIME.has(video.type)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid file type' }, { status: 400 });
    }

    const mode = (typeof form.get('mode') === 'string' ? String(form.get('mode')) : 'compat') as 'compat' | 'strict';
    const creatorId = typeof form.get('creatorId') === 'string' ? String(form.get('creatorId')) : undefined;
    const platform = (typeof form.get('platform') === 'string' ? String(form.get('platform')) : undefined) as
      | PhoenixZeroPlatform
      | undefined;
    const presetId = typeof form.get('presetId') === 'string' ? String(form.get('presetId')) : undefined;

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

    const tmpDir = phoenixZeroTmpDir();
    await mkdir(tmpDir, { recursive: true });

    const stampId = Date.now().toString(10);
    inputPath = join(tmpDir, `input-${stampId}.mp4`);
    outputPath = join(tmpDir, `watermarked-${stampId}.mp4`);

    const videoBytes = new Uint8Array(await video.arrayBuffer());
    await writeFile(inputPath, Buffer.from(videoBytes));

    const preset = await selectWatermarkedPreset({ videoPath: inputPath, platform, presetId });

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
        return Response.json(
          { ok: false, reason: 'Signing key does not match creator registry for creatorId.' },
          { status: 403 }
        );
      }
    }

    const wmPayload = randomBytes(preset.watermark.payloadByteLength);
    const wmPayloadB64Url = bytesToBase64Url(new Uint8Array(wmPayload));

    const wmCfg = {
      payloadB64Url: wmPayloadB64Url,
      payloadByteLength: preset.watermark.payloadByteLength,
      bitCount: preset.watermark.bitCount,
      startFrame: preset.watermark.startFrame,
      frameInterval: preset.watermark.frameInterval,
      repeatPerBit: preset.watermark.repeatPerBit,
      brightnessDelta: preset.watermark.brightnessDelta,
      roi: preset.watermark.roi,
      rois: preset.watermark.rois
    };

    await embedInvisibleWatermark({ inputPath, outputPath, cfg: wmCfg });

    const temporalCfg: TemporalFingerprintParams = preset.temporal;
    const temporal = await extractTemporalFingerprintFromVideoPath({ videoPath: outputPath, cfg: temporalCfg });
    const temporalHash = sha256B64Url(samplesToBytes(temporal.samples));

    const madThreshold = preset.madThreshold;

    const payload = {
      version: 3 as const,
      createdAt: new Date().toISOString(),
      creatorId,
      preset: {
        id: preset.id,
        platform: preset.platform,
        durationSeconds: preset.durationSeconds,
        watermarkVerify: preset.watermarkVerify
      },
      media: { mimeType: video.type || undefined, byteLength: videoBytes.byteLength },
      temporal: {
        alg: 'signalstats_yavg_v1' as const,
        cfg: temporal.cfg,
        samples: temporal.samples,
        hashB64Url: temporalHash,
        madThreshold
      },
      watermark: {
        alg: 'roi_luma_delta_v1' as const,
        payloadByteLength: wmCfg.payloadByteLength,
        payloadB64Url: wmCfg.payloadB64Url,
        bitCount: wmCfg.bitCount,
        startFrame: wmCfg.startFrame,
        frameInterval: wmCfg.frameInterval,
        repeatPerBit: wmCfg.repeatPerBit,
        brightnessDelta: wmCfg.brightnessDelta,
        roi: wmCfg.roi,
        rois: wmCfg.rois
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
        return Response.json(
          { ok: false, reason: 'PQ key does not match creator registry for creatorId.' },
          { status: 403 }
        );
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

    const watermarkedBytes = await readFile(outputPath);

    const zip = new JSZip();
    zip.file('watermarked.mp4', watermarkedBytes);
    zip.file('proof.json', JSON.stringify(proof, null, 2));

    const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });

    ok = true;
    httpStatus = 200;
    return new Response(new Uint8Array(zipBytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="phoenix-zero-watermarked.zip"'
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    if (inputPath) {
      await rm(inputPath, { force: true }).catch(() => {});
    }
    if (outputPath) {
      await rm(outputPath, { force: true }).catch(() => {});
    }
    void recordUsage({ req, tenantId, op: 'stamp_video_watermarked', ok, httpStatus, startedAtMs });
  }
}
