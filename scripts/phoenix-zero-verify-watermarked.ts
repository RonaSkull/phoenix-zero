import { readFile } from 'node:fs/promises';

import { sha256B64Url } from '@phoenix-zero/core';
import {
  extractInvisibleWatermark,
  selectWatermarkedPreset,
  verifyHybridSignature,
  type PhoenixZeroPlatform
} from '@phoenix-zero/core/node';

import { extractTemporalFingerprint, type TemporalFingerprintParams } from './phoenix-zero-temporal';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val && !val.startsWith('--')) {
      args[key] = val;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
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
    cfg: TemporalFingerprintParams;
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

async function main() {
  const args = parseArgs(process.argv);
  const inPath = args.in ?? args.input;
  const proofPath = args.proof;

  if (!inPath) throw new Error('Missing --in <videoPath>');
  if (!proofPath) throw new Error('Missing --proof <proofPath>');

  const proof = JSON.parse(await readFile(proofPath, 'utf8')) as Proof;

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

  const platform = (args.platform as PhoenixZeroPlatform | undefined) ?? undefined;
  let wmThreshold = args.wmThreshold ? Number(args.wmThreshold) : undefined;
  let wmSearchWindow = args.wmSearchWindow ? Number(args.wmSearchWindow) : undefined;

  // Prefer hints embedded in the proof (if any), then fall back to platform presets.
  wmThreshold = wmThreshold ?? proof.preset?.watermarkVerify?.yThreshold;
  wmSearchWindow = wmSearchWindow ?? proof.preset?.watermarkVerify?.searchStartFrameWindow;

  if (platform && (wmThreshold === undefined || wmSearchWindow === undefined)) {
    const preset = await selectWatermarkedPreset({ videoPath: inPath, platform });
    wmThreshold = wmThreshold ?? preset.watermarkVerify?.yThreshold;
    wmSearchWindow = wmSearchWindow ?? preset.watermarkVerify?.searchStartFrameWindow;
  }

  const searchStartFrameWindow = wmSearchWindow ?? 0;
  const wm = await extractInvisibleWatermark({
    videoPath: inPath,
    cfg: wmCfg,
    yThreshold: wmThreshold,
    expectedPayloadB64Url: proof.watermark.payloadB64Url,
    searchStartFrameWindow
  });
  const watermarkMatch = wm.extractedPayloadB64Url === proof.watermark.payloadB64Url;

  const extracted = await extractTemporalFingerprint({ videoPath: inPath, cfg: proof.temporal.cfg });
  const mad = meanAbsDiff(extracted.samples, proof.temporal.samples);
  const temporalMatch = mad <= proof.temporal.madThreshold;
  const extractedHash = sha256B64Url(samplesToBytes(extracted.samples));

  const ok = sigResult.ok && (watermarkMatch || temporalMatch);

  process.stdout.write(
    JSON.stringify(
      {
        ok,
        signature: sigResult,
        watermark: {
          ok: watermarkMatch,
          expectedPayloadB64Url: proof.watermark.payloadB64Url,
          extractedPayloadB64Url: wm.extractedPayloadB64Url,
          bestStartFrame: wm.bestStartFrame,
          bestBitErrors: wm.bestBitErrors
        },
        temporal: {
          ok: temporalMatch,
          mad,
          threshold: proof.temporal.madThreshold,
          referenceHash: proof.temporal.hashB64Url,
          extractedHash
        }
      },
      null,
      2
    ) + '\n'
  );

  process.exit(ok ? 0 : 3);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
