import type { PhoenixZeroHybridMode, PhoenixZeroHybridSignature, PhoenixZeroWatermarkConfig, PhoenixZeroWatermarkVerifyHints, TemporalFingerprintParams } from '@phoenix-zero/core/node';

export type PhoenixZeroLiveSessionPayload = {
  version: 1;
  createdAt: string;
  creatorId?: string;
  sessionId: string;
  segmentSeconds: number;
  watermarkTemplate: Omit<PhoenixZeroWatermarkConfig, 'payloadB64Url'>;
  watermarkVerify?: PhoenixZeroWatermarkVerifyHints;
  temporal: {
    alg: 'signalstats_yavg_v1';
    cfg: TemporalFingerprintParams;
    madThreshold: number;
  };
  signatureMode: PhoenixZeroHybridMode;
};

export type PhoenixZeroLiveSessionProof = PhoenixZeroLiveSessionPayload & {
  hybridSignature: PhoenixZeroHybridSignature;
};

export type PhoenixZeroLiveSegmentPayload = {
  version: 1;
  createdAt: string;
  sessionId: string;
  segmentIndex: number;
  watermark: PhoenixZeroWatermarkConfig;
  temporal: {
    alg: 'signalstats_yavg_v1';
    cfg: TemporalFingerprintParams;
    samples: number[];
    hashB64Url: string;
    madThreshold: number;
  };
  signatureMode: PhoenixZeroHybridMode;
};

export type PhoenixZeroLiveSegmentProof = PhoenixZeroLiveSegmentPayload & {
  hybridSignature: PhoenixZeroHybridSignature;
};

export type PhoenixZeroLiveVerifyPolicy = 'sig+wm+temporal' | 'sig+(wm|temporal)';

export type PhoenixZeroLiveSegmentVerifyResult = {
  ok: boolean;
  policy: PhoenixZeroLiveVerifyPolicy;
  signature: {
    ok: boolean;
    ed25519Ok: boolean;
    pqOk: boolean;
    mode: PhoenixZeroHybridMode;
    pqPresent: boolean;
    pqAvailable: boolean;
    reason?: string;
  };
  watermark: {
    ok: boolean;
    expectedPayloadB64Url: string;
    extractedPayloadB64Url: string;
    bestStartFrame?: number;
    bestBitErrors?: number;
  };
  temporal: {
    ok: boolean;
    mad: number;
    threshold: number;
    referenceHash: string;
    extractedHash: string;
  };
};
