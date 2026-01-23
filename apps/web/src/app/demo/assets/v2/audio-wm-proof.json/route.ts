import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  ed25519KeyPairFromPrivateKey,
  generateEd25519KeyPair,
  sha256B64Url
} from '@phoenix-zero/core';
import {
  createHybridSignature,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url
} from '@phoenix-zero/core/node';

import { maybeCreateIssuerAttestation } from '../../../../../lib/issuer-attestation';

export const runtime = 'nodejs';

type KeyFile = { privateKeyB64Url?: string };

type PhoenixZeroAudioWatermarkConfig = {
  payloadB64Url: string;
  payloadByteLength: number;
  bitCount: number;
  sampleRate: number;
  windowMs: number;
  repeatPerBit: number;
  startWindow: number;
  gainDelta: number;
};

type PhoenixZeroAudioFingerprintParams = {
  sampleRate: number;
  frameMs: number;
  targetLen: number;
  quant: number;
};

type IssuerProof = {
  version: 5;
  createdAt: string;
  creatorId?: string;
  media: {
    mimeType?: string;
    byteLength?: number;
  };
  watermark: {
    alg: 'audio_pair_gain_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    sampleRate: number;
    windowMs: number;
    repeatPerBit: number;
    startWindow: number;
    gainDelta: number;
    maxBitErrors: number;
  };
  fingerprint: {
    alg: 'abs_amp_envelope_v1';
    cfg: { sampleRate: number; frameMs: number; targetLen: number; quant: number };
    samples: number[];
    hashB64Url: string;
    madThreshold: number;
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

async function loadSigningKeyB64Url(): Promise<string | null> {
  const envKey = (process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL || '').trim();
  if (envKey) return envKey;

  const fromFile = await readJsonMaybe<KeyFile>(resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-ed25519.json'));
  const key = (fromFile?.privateKeyB64Url || '').trim();
  if (!key) return null;
  return key;
}

function makeSinePcm(params: { seconds: number; sampleRate: number; hz: number }): Int16Array {
  const n = Math.max(1, Math.floor(params.seconds * params.sampleRate));
  const pcm = new Int16Array(n);
  const amp = 0.2;
  for (let i = 0; i < n; i++) {
    const t = i / params.sampleRate;
    const v = Math.sin(2 * Math.PI * params.hz * t) * amp;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }

  return pcm;
}

function wavFromPcmI16(params: { samples: Int16Array; sampleRate: number; channels: number }): Uint8Array {
  const bytesPerSample = 2;
  const blockAlign = params.channels * bytesPerSample;
  const byteRate = params.sampleRate * blockAlign;
  const dataSize = params.samples.length * bytesPerSample;
  const riffSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;

  buf.write('RIFF', o);
  o += 4;
  buf.writeUInt32LE(riffSize, o);
  o += 4;
  buf.write('WAVE', o);
  o += 4;

  buf.write('fmt ', o);
  o += 4;
  buf.writeUInt32LE(16, o);
  o += 4;
  buf.writeUInt16LE(1, o);
  o += 2;
  buf.writeUInt16LE(params.channels, o);
  o += 2;
  buf.writeUInt32LE(params.sampleRate, o);
  o += 4;
  buf.writeUInt32LE(byteRate, o);
  o += 4;
  buf.writeUInt16LE(blockAlign, o);
  o += 2;
  buf.writeUInt16LE(16, o);
  o += 2;

  buf.write('data', o);
  o += 4;
  buf.writeUInt32LE(dataSize, o);
  o += 4;

  for (let i = 0; i < params.samples.length; i++) {
    buf.writeInt16LE(params.samples[i] ?? 0, o);
    o += 2;
  }

  return new Uint8Array(buf);
}

function clampI16(n: number): number {
  if (n < -32768) return -32768;
  if (n > 32767) return 32767;
  return n;
}

function bytesToBits(bytes: Uint8Array, bitCount: number): number[] {
  const bits: number[] = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  return bits.slice(0, bitCount);
}

function embedWatermarkInPcm(params: { samples: Int16Array; cfg: PhoenixZeroAudioWatermarkConfig }): void {
  const cfg = params.cfg;
  const payloadBytes = base64UrlToBytes(cfg.payloadB64Url).slice(0, cfg.payloadByteLength);
  const bits = bytesToBits(payloadBytes, cfg.bitCount);

  const windowSamples = Math.max(1, Math.floor((cfg.sampleRate * cfg.windowMs) / 1000));
  const rp = Math.max(1, Math.floor(cfg.repeatPerBit));
  const requiredWindows = cfg.startWindow + cfg.bitCount * rp * 2;
  const requiredSamples = requiredWindows * windowSamples;
  if (params.samples.length < requiredSamples) throw new Error('audio too short for watermark');

  const delta = Math.max(0, Math.min(0.2, cfg.gainDelta));

  for (let i = 0; i < cfg.bitCount; i++) {
    const bit = bits[i] ?? 0;
    for (let r = 0; r < rp; r++) {
      const baseWindow = cfg.startWindow + (i * rp + r) * 2;
      const w0 = baseWindow;
      const w1 = baseWindow + 1;

      const gain0 = bit === 1 ? 1 - delta : 1 + delta;
      const gain1 = bit === 1 ? 1 + delta : 1 - delta;

      const s0 = w0 * windowSamples;
      const s1 = w1 * windowSamples;

      for (let j = 0; j < windowSamples; j++) {
        const a = s0 + j;
        const b = s1 + j;
        params.samples[a] = clampI16(Math.round((params.samples[a] ?? 0) * gain0));
        params.samples[b] = clampI16(Math.round((params.samples[b] ?? 0) * gain1));
      }
    }
  }
}

function meanAbsI16(buf: Int16Array, start: number, end: number): number {
  const s0 = Math.max(0, Math.floor(start));
  const s1 = Math.min(buf.length, Math.floor(end));
  if (s1 <= s0) return 0;
  let s = 0;
  for (let i = s0; i < s1; i++) s += Math.abs(buf[i] ?? 0);
  return s / (s1 - s0);
}

function resample(samples: number[], targetLen: number): number[] {
  if (targetLen <= 0) return [];
  if (samples.length === 0) return Array.from({ length: targetLen }, () => 0);
  if (samples.length === targetLen) return samples.slice();
  if (targetLen === 1) return [samples[0] ?? 0];

  const out: number[] = [];
  const maxIdx = samples.length - 1;

  for (let i = 0; i < targetLen; i++) {
    const t = (i * maxIdx) / (targetLen - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, maxIdx);
    const frac = t - i0;
    const a = samples[i0] ?? 0;
    const b = samples[i1] ?? 0;
    out.push(a * (1 - frac) + b * frac);
  }

  return out;
}

function quantize(samples: number[], quant: number): number[] {
  const q = quant <= 0 ? 1 : quant;
  return samples.map((v) => {
    const clamped = Math.max(0, Math.min(255, v));
    return Math.round(clamped / q);
  });
}

function extractFingerprintFromPcm(params: {
  samples: Int16Array;
  cfg: PhoenixZeroAudioFingerprintParams;
}): { cfg: PhoenixZeroAudioFingerprintParams; samples: number[]; hashB64Url: string } {
  const cfg = params.cfg;

  const frameSamples = Math.max(1, Math.floor((cfg.sampleRate * cfg.frameMs) / 1000));
  const raw: number[] = [];

  for (let off = 0; off < params.samples.length; off += frameSamples) {
    const m = meanAbsI16(params.samples, off, off + frameSamples);
    const v = Math.round((m / 32768) * 255);
    raw.push(Math.max(0, Math.min(255, v)));
  }

  const rs = resample(raw, cfg.targetLen);
  const q = quantize(rs, cfg.quant);
  const bytes = new Uint8Array(q.length);
  for (let i = 0; i < q.length; i++) bytes[i] = q[i] ?? 0;
  const hashB64Url = sha256B64Url(bytes);

  return { cfg, samples: q, hashB64Url };
}

async function pickProofPath(): Promise<string | null> {
  const v2 = resolve(process.cwd(), '..', '..', 'platform-tests', 'demo-assets', 'v2', 'audio-wm-proof.json');
  try {
    await access(v2);
    return v2;
  } catch {
    return null;
  }
}

async function buildProof(): Promise<any> {
  const privateKeyB64Url = await loadSigningKeyB64Url();
  const edKeyPair = privateKeyB64Url
    ? ed25519KeyPairFromPrivateKey(base64UrlToBytes(privateKeyB64Url))
    : await generateEd25519KeyPair();

  const payloadBytes = new Uint8Array([0x13, 0x37, 0xc0, 0xde]);
  const payloadB64Url = bytesToBase64Url(payloadBytes);

  const watermarkCfg: PhoenixZeroAudioWatermarkConfig = {
    payloadB64Url,
    payloadByteLength: 4,
    bitCount: 32,
    sampleRate: 16000,
    windowMs: 25,
    repeatPerBit: 2,
    startWindow: 10,
    gainDelta: 0.08
  };

  const fingerprintCfg: PhoenixZeroAudioFingerprintParams = { sampleRate: 16000, frameMs: 50, targetLen: 64, quant: 4 };
  const madThreshold = 6;

  const pcm = makeSinePcm({ seconds: 6, sampleRate: watermarkCfg.sampleRate, hz: 440 });
  embedWatermarkInPcm({ samples: pcm, cfg: watermarkCfg });
  const wmBytes = wavFromPcmI16({ samples: pcm, sampleRate: watermarkCfg.sampleRate, channels: 1 });

  const fp = extractFingerprintFromPcm({ samples: pcm, cfg: fingerprintCfg });
  const fingerprintHash = fp.hashB64Url;

  const payload: IssuerProof = {
    version: 5,
    createdAt: new Date().toISOString(),
    creatorId: 'demo',
    media: { mimeType: 'audio/wav', byteLength: wmBytes.byteLength },
    watermark: {
      alg: 'audio_pair_gain_delta_v1',
      payloadByteLength: watermarkCfg.payloadByteLength,
      payloadB64Url: watermarkCfg.payloadB64Url,
      bitCount: watermarkCfg.bitCount,
      sampleRate: watermarkCfg.sampleRate,
      windowMs: watermarkCfg.windowMs,
      repeatPerBit: watermarkCfg.repeatPerBit,
      startWindow: watermarkCfg.startWindow,
      gainDelta: watermarkCfg.gainDelta,
      maxBitErrors: 2
    },
    fingerprint: {
      alg: 'abs_amp_envelope_v1',
      cfg: fp.cfg,
      samples: fp.samples,
      hashB64Url: fingerprintHash,
      madThreshold
    },
    signatureMode: 'compat'
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
    }

  const hybridSignature = await createHybridSignature({
    payload,
    mode: 'compat',
    ed25519: { privateKey: edKeyPair.privateKey, publicKey: edKeyPair.publicKey },
    pq: pqKeys
  });

  const issuerAttestation = await maybeCreateIssuerAttestation({ hybridId: hybridSignature.hybridId, creatorId: 'demo' });

  return {
    ...payload,
    hybridSignature,
    issuerAttestation: issuerAttestation ?? undefined
  };
}

export async function GET() {
  const proofPath = await pickProofPath();
  if (proofPath) {
    const bytes = await readFile(proofPath);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  const proof = await buildProof();
  const out = new TextEncoder().encode(JSON.stringify(proof, null, 2));
  return new Response(out, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function HEAD() {
  try {
    const proofPath = await pickProofPath();
    if (!proofPath) {
      const res = await GET();
      if (!res.ok) return new Response(null, { status: res.status });
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    const info = await stat(proofPath);
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(info.size),
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
