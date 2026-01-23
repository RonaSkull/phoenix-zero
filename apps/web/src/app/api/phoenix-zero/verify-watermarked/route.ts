import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from '../../../../lib/tmp-dir';

import { sha256B64Url } from '@phoenix-zero/core';
import {
  extractInvisibleWatermark,
  extractTemporalFingerprintFromVideoPath,
  selectWatermarkedPreset,
  verifyHybridSignature,
  type PhoenixZeroPlatform
} from '@phoenix-zero/core/node';

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

const MAX_VIDEO_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_VERIFY_WATERMARKED_MAX_VIDEO_BYTES', 50 * 1024 * 1024));
const ALLOWED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

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

    const proofField = form.get('proof');
    const proofCompact = typeof form.get('proofCompact') === 'string' ? String(form.get('proofCompact')) : undefined;

    const proof: Proof | null =
      proofCompact != null
        ? (JSON.parse(new TextDecoder().decode(Buffer.from(proofCompact, 'base64url'))) as Proof)
        : typeof proofField === 'string'
          ? (JSON.parse(proofField) as Proof)
          : proofField instanceof File
            ? (JSON.parse(await proofField.text()) as Proof)
            : null;

    if (!proof) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing proof. Provide proof (string/file) or proofCompact.' },
        { status: 400 }
      );
    }

    const platform = (typeof form.get('platform') === 'string' ? String(form.get('platform')) : undefined) as
      | PhoenixZeroPlatform
      | undefined;
    let wmThreshold = typeof form.get('wmThreshold') === 'string' ? Number(String(form.get('wmThreshold'))) : undefined;
    let wmSearchWindow = typeof form.get('wmSearchWindow') === 'string' ? Number(String(form.get('wmSearchWindow'))) : undefined;

    wmThreshold = wmThreshold ?? proof.preset?.watermarkVerify?.yThreshold;
    wmSearchWindow = wmSearchWindow ?? proof.preset?.watermarkVerify?.searchStartFrameWindow;

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

    const tmpDir = phoenixZeroTmpDir();
    await mkdir(tmpDir, { recursive: true });

    const stampId = Date.now().toString(10);
    inputPath = join(tmpDir, `verify-${stampId}.mp4`);

    const videoBytes = new Uint8Array(await video.arrayBuffer());
    await writeFile(inputPath, Buffer.from(videoBytes));

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

    ok = sigResult.ok && (watermarkMatch || temporalMatch);
    httpStatus = ok ? 200 : 400;

    return Response.json(
      {
        ok,
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
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    if (inputPath) {
      await rm(inputPath, { force: true }).catch(() => {
      });
    }
    void recordUsage({ req, tenantId, op: 'verify_video_watermarked', ok, httpStatus, startedAtMs });
  }
}
