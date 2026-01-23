import { randomBytes } from 'node:crypto';

import { base64UrlToBytes, bytesToBase64Url, ed25519KeyPairFromPrivateKey } from '@phoenix-zero/core';
import {
  createHybridSignature,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  verifyHybridSignature,
  type PhoenixZeroHybridMode,
  type PhoenixZeroWatermarkConfig
} from '@phoenix-zero/core/node';

import type { PhoenixZeroLiveSessionPayload, PhoenixZeroLiveSessionProof } from '../protocols/realtime';

function defaultRois(): { x: number; y: number; w: number; h: number }[] {
  return [
    { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
    { x: 0.1, y: 0.1, w: 0.35, h: 0.35 },
    { x: 0.55, y: 0.55, w: 0.35, h: 0.35 }
  ];
}

function defaultWatermarkTemplate(): Omit<PhoenixZeroWatermarkConfig, 'payloadB64Url'> {
  return {
    payloadByteLength: 2,
    bitCount: 16,
    startFrame: 6,
    frameInterval: 3,
    repeatPerBit: 2,
    brightnessDelta: 0.03,
    rois: defaultRois()
  };
}

export async function createLiveSessionProof(params: {
  creatorId?: string;
  segmentSeconds: number;
  mode: PhoenixZeroHybridMode;
  privateKeyB64Url: string;
  pqPrivateKeyB64Url?: string;
  pqPublicKeyB64Url?: string;
  watermarkTemplate?: Omit<PhoenixZeroWatermarkConfig, 'payloadB64Url'>;
  watermarkVerify?: { yThreshold?: number; searchStartFrameWindow?: number };
  temporal?: { fps: number; scale: number; targetLen: number; quant: number };
  madThreshold?: number;
}): Promise<PhoenixZeroLiveSessionProof> {
  const sessionId = bytesToBase64Url(randomBytes(16)).slice(0, 22);

  const watermarkTemplate = params.watermarkTemplate ?? defaultWatermarkTemplate();
  const temporalCfg = params.temporal ?? { fps: 8, scale: 64, targetLen: 24, quant: 4 };

  const payload: PhoenixZeroLiveSessionPayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    creatorId: params.creatorId,
    sessionId,
    segmentSeconds: params.segmentSeconds,
    watermarkTemplate,
    watermarkVerify: params.watermarkVerify,
    temporal: { alg: 'signalstats_yavg_v1', cfg: temporalCfg, madThreshold: params.madThreshold ?? 12 },
    signatureMode: params.mode
  };

  const ed = ed25519KeyPairFromPrivateKey(base64UrlToBytes(params.privateKeyB64Url));

  const pqKeys =
    params.pqPrivateKeyB64Url && params.pqPublicKeyB64Url
      ? {
          alg: 'sphincs' as const,
          privateKey: pqPrivateKeyFromB64Url(params.pqPrivateKeyB64Url),
          publicKey: pqPublicKeyFromB64Url(params.pqPublicKeyB64Url)
        }
      : undefined;

  const hybridSignature = await createHybridSignature({
    payload,
    mode: params.mode,
    ed25519: { privateKey: ed.privateKey, publicKey: ed.publicKey },
    pq: pqKeys
  });

  return { ...payload, hybridSignature };
}

export async function verifyLiveSessionProof(params: {
  proof: PhoenixZeroLiveSessionProof;
}): Promise<
  | { ok: true; signature: { ok: true; ed25519Ok: true; pqOk: boolean; mode: PhoenixZeroHybridMode; pqPresent: boolean; pqAvailable: boolean } }
  | {
      ok: false;
      signature: {
        ok: false;
        reason: string;
        ed25519Ok: boolean;
        pqOk: boolean;
        mode: PhoenixZeroHybridMode;
        pqPresent: boolean;
        pqAvailable: boolean;
      };
    }
> {
  const payload: PhoenixZeroLiveSessionPayload = {
    version: params.proof.version,
    createdAt: params.proof.createdAt,
    creatorId: params.proof.creatorId,
    sessionId: params.proof.sessionId,
    segmentSeconds: params.proof.segmentSeconds,
    watermarkTemplate: params.proof.watermarkTemplate,
    watermarkVerify: params.proof.watermarkVerify,
    temporal: params.proof.temporal,
    signatureMode: params.proof.signatureMode
  };

  const signature = await verifyHybridSignature({ payload, sig: params.proof.hybridSignature });
  if (!signature.ok) return { ok: false, signature };
  return { ok: true, signature };
}
