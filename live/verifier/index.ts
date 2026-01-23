import { readFile } from 'node:fs/promises';

import { sha256B64Url } from '@phoenix-zero/core';
import {
  extractInvisibleWatermark,
  extractTemporalFingerprintFromVideoPath,
  verifyHybridSignature,
  type PhoenixZeroPlatform
} from '@phoenix-zero/core/node';

import type {
  PhoenixZeroLiveSegmentPayload,
  PhoenixZeroLiveSegmentProof,
  PhoenixZeroLiveSegmentVerifyResult,
  PhoenixZeroLiveSessionProof,
  PhoenixZeroLiveVerifyPolicy
} from '../protocols/realtime';

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

function signaturePayloadForSegment(proof: PhoenixZeroLiveSegmentProof): PhoenixZeroLiveSegmentPayload {
  return {
    version: proof.version,
    createdAt: proof.createdAt,
    sessionId: proof.sessionId,
    segmentIndex: proof.segmentIndex,
    watermark: proof.watermark,
    temporal: proof.temporal,
    signatureMode: proof.signatureMode
  };
}

export async function verifyLiveSegment(params: {
  videoPath: string;
  segmentProof: PhoenixZeroLiveSegmentProof;
  sessionProof?: PhoenixZeroLiveSessionProof;
  policy?: PhoenixZeroLiveVerifyPolicy;
  platform?: PhoenixZeroPlatform;
  wmThreshold?: number;
  wmSearchWindow?: number;
}): Promise<PhoenixZeroLiveSegmentVerifyResult> {
  const policy: PhoenixZeroLiveVerifyPolicy = params.policy ?? 'sig+(wm|temporal)';

  const sigPayload = signaturePayloadForSegment(params.segmentProof);
  const sig = await verifyHybridSignature({ payload: sigPayload, sig: params.segmentProof.hybridSignature });

  const sigResult: PhoenixZeroLiveSegmentVerifyResult['signature'] = sig.ok
    ? {
        ok: true,
        ed25519Ok: true,
        pqOk: sig.pqOk,
        mode: sig.mode,
        pqPresent: sig.pqPresent,
        pqAvailable: sig.pqAvailable
      }
    : {
        ok: false,
        reason: sig.reason,
        ed25519Ok: sig.ed25519Ok,
        pqOk: sig.pqOk,
        mode: sig.mode,
        pqPresent: sig.pqPresent,
        pqAvailable: sig.pqAvailable
      };

  let wmThreshold = params.wmThreshold;
  let wmSearchWindow = params.wmSearchWindow;

  wmThreshold = wmThreshold ?? params.sessionProof?.watermarkVerify?.yThreshold;
  wmSearchWindow = wmSearchWindow ?? params.sessionProof?.watermarkVerify?.searchStartFrameWindow;

  const wm = await extractInvisibleWatermark({
    videoPath: params.videoPath,
    cfg: params.segmentProof.watermark,
    yThreshold: wmThreshold,
    expectedPayloadB64Url: params.segmentProof.watermark.payloadB64Url,
    searchStartFrameWindow: wmSearchWindow ?? 0
  });

  const watermarkOk = wm.extractedPayloadB64Url === params.segmentProof.watermark.payloadB64Url;

  const extracted = await extractTemporalFingerprintFromVideoPath({
    videoPath: params.videoPath,
    cfg: params.segmentProof.temporal.cfg
  });

  const mad = meanAbsDiff(extracted.samples, params.segmentProof.temporal.samples);
  const temporalOk = mad <= params.segmentProof.temporal.madThreshold;
  const extractedHash = sha256B64Url(samplesToBytes(extracted.samples));

  const ok =
    policy === 'sig+wm+temporal'
      ? sig.ok && watermarkOk && temporalOk
      : policy === 'sig+(wm|temporal)'
        ? sig.ok && (watermarkOk || temporalOk)
        : false;

  return {
    ok,
    policy,
    signature: sigResult,
    watermark: {
      ok: watermarkOk,
      expectedPayloadB64Url: params.segmentProof.watermark.payloadB64Url,
      extractedPayloadB64Url: wm.extractedPayloadB64Url,
      bestStartFrame: wm.bestStartFrame,
      bestBitErrors: wm.bestBitErrors
    },
    temporal: {
      ok: temporalOk,
      mad,
      threshold: params.segmentProof.temporal.madThreshold,
      referenceHash: params.segmentProof.temporal.hashB64Url,
      extractedHash
    }
  };
}

export async function verifyLiveSegmentFromFiles(params: {
  videoPath: string;
  segmentProofPath: string;
  sessionProofPath?: string;
  policy?: PhoenixZeroLiveVerifyPolicy;
  platform?: PhoenixZeroPlatform;
  wmThreshold?: number;
  wmSearchWindow?: number;
}): Promise<PhoenixZeroLiveSegmentVerifyResult> {
  const segmentProof = JSON.parse(await readFile(params.segmentProofPath, 'utf8')) as PhoenixZeroLiveSegmentProof;
  const sessionProof = params.sessionProofPath
    ? (JSON.parse(await readFile(params.sessionProofPath, 'utf8')) as PhoenixZeroLiveSessionProof)
    : undefined;

  return verifyLiveSegment({
    videoPath: params.videoPath,
    segmentProof,
    sessionProof,
    policy: params.policy,
    platform: params.platform,
    wmThreshold: params.wmThreshold,
    wmSearchWindow: params.wmSearchWindow
  });
}

export class LiveVerifier {
  async verifySegment(params: {
    videoPath: string;
    segmentProof: PhoenixZeroLiveSegmentProof;
    sessionProof?: PhoenixZeroLiveSessionProof;
    policy?: PhoenixZeroLiveVerifyPolicy;
    platform?: PhoenixZeroPlatform;
    wmThreshold?: number;
    wmSearchWindow?: number;
  }): Promise<PhoenixZeroLiveSegmentVerifyResult> {
    return verifyLiveSegment(params);
  }

  async verifySegmentFromFiles(params: {
    videoPath: string;
    segmentProofPath: string;
    sessionProofPath?: string;
    policy?: PhoenixZeroLiveVerifyPolicy;
    platform?: PhoenixZeroPlatform;
    wmThreshold?: number;
    wmSearchWindow?: number;
  }): Promise<PhoenixZeroLiveSegmentVerifyResult> {
    return verifyLiveSegmentFromFiles(params);
  }
}
