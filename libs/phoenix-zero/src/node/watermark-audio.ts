import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { base64UrlToBytes, bytesToBase64Url, sha256B64Url } from '../core';

export type PhoenixZeroAudioWatermarkConfig = {
  payloadB64Url: string;
  payloadByteLength: number;
  bitCount: number;
  sampleRate: number;
  windowMs: number;
  repeatPerBit: number;
  startWindow: number;
  gainDelta: number;
};

export type PhoenixZeroAudioFingerprintParams = {
  sampleRate: number;
  frameMs: number;
  targetLen: number;
  quant: number;
};

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

function bitsToPayloadB64Url(bits: number[], byteLen: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] ?? 0);
    bytes.push(b);
  }
  return bytesToBase64Url(new Uint8Array(bytes).slice(0, byteLen));
}

function bitErrors(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let e = 0;
  for (let i = 0; i < n; i++) e += (a[i] ?? 0) === (b[i] ?? 0) ? 0 : 1;
  return e;
}

function thresholdCandidatesFromScores(scores: number[]): number[] {
  const clean = scores.filter((x) => Number.isFinite(x));
  if (clean.length === 0) return [0];
  const uniq = Array.from(new Set(clean));
  uniq.sort((a, b) => a - b);

  const out: number[] = [];
  out.push(0);
  {
    let s = 0;
    for (const v of clean) s += v;
    out.push(s / clean.length);
  }

  if (uniq.length === 1) {
    const u0 = uniq[0];
    if (u0 !== undefined) {
      out.push(u0 - 1e-9);
      out.push(u0 + 1e-9);
    }
  } else {
    out.push((uniq[0] ?? 0) - 1e-9);
    for (let i = 0; i < uniq.length - 1; i++) {
      const a = uniq[i];
      const b = uniq[i + 1];
      if (a === undefined || b === undefined) continue;
      out.push((a + b) / 2);
    }
    out.push((uniq[uniq.length - 1] ?? 0) + 1e-9);
  }

  const dedup = Array.from(new Set(out.filter((x) => Number.isFinite(x))));
  dedup.sort((a, b) => a - b);
  return dedup;
}

function decodeBitsFromScores(scores: number[], threshold: number, polarity: 1 | -1): number[] {
  if (polarity === 1) return scores.map((s) => (s > threshold ? 1 : 0));
  return scores.map((s) => (s < threshold ? 1 : 0));
}

function bestThresholdAndPolarity(params: {
  scores: number[];
  expectedBits: number[];
}): { threshold: number; polarity: 1 | -1; errors: number } {
  const candidates = thresholdCandidatesFromScores(params.scores);

  let bestThr = 0;
  let bestPol: 1 | -1 = 1;
  let bestErr = Number.POSITIVE_INFINITY;

  for (const thr of candidates) {
    for (const pol of [1, -1] as const) {
      const bits = decodeBitsFromScores(params.scores, thr, pol);
      const err = bitErrors(bits, params.expectedBits);
      if (err < bestErr) {
        bestErr = err;
        bestThr = thr;
        bestPol = pol;
        if (bestErr === 0) return { threshold: bestThr, polarity: bestPol, errors: bestErr };
      }
    }
  }

  return { threshold: bestThr, polarity: bestPol, errors: Number.isFinite(bestErr) ? bestErr : params.scores.length };
}

function meanAbsI16(buf: Int16Array, start: number, end: number): number {
  const s0 = Math.max(0, Math.floor(start));
  const s1 = Math.min(buf.length, Math.floor(end));
  if (s1 <= s0) return 0;
  let s = 0;
  for (let i = s0; i < s1; i++) s += Math.abs(buf[i] ?? 0);
  return s / (s1 - s0);
}

async function getFfmpegPath(): Promise<string> {
  const env = process.env.PHOENIX_ZERO_FFMPEG_PATH ?? process.env.FFMPEG_PATH;
  if (env && existsSync(env)) return env;

  const mod = (await import('ffmpeg-static')) as unknown as { default?: unknown };
  const maybe = (mod as { default?: unknown }).default ?? mod;
  if (typeof maybe === 'string' && existsSync(maybe)) return maybe;

  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const p = resolve(dir, 'node_modules', 'ffmpeg-static', bin);
      if (existsSync(p)) return p;
      const next = resolve(dir, '..');
      if (next === dir) break;
      dir = next;
    }
  }

  throw new Error(
    `FFmpeg binary not found. Set PHOENIX_ZERO_FFMPEG_PATH to an existing ffmpeg executable. Resolved ffmpeg-static path was: ${
      typeof maybe === 'string' ? maybe : '[non-string]'
    }`
  );
}

function runCollectStdout(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let err = '';

    child.stdout.on('data', (d: Buffer) => chunks.push(Buffer.from(d)));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => (err += String(d)));

    child.on('error', (e: Error) => reject(e));
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(err || `ffmpeg exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

async function decodeToPcmI16(params: { audioPath: string; sampleRate: number }): Promise<Int16Array> {
  const ffmpegPath = await getFfmpegPath();
  const out = await runCollectStdout(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    params.audioPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    String(params.sampleRate),
    '-f',
    's16le',
    '-'
  ]);
  const view = new Int16Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 2));
  return new Int16Array(view);
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

export async function embedInvisibleAudioWatermark(params: {
  inputPath: string;
  outputPath: string;
  cfg: PhoenixZeroAudioWatermarkConfig;
}): Promise<{ byteLength: number; mimeType: string }> {
  const cfg = params.cfg;
  const samples = await decodeToPcmI16({ audioPath: params.inputPath, sampleRate: cfg.sampleRate });

  const payloadBytes = base64UrlToBytes(cfg.payloadB64Url).slice(0, cfg.payloadByteLength);
  const bits = bytesToBits(payloadBytes, cfg.bitCount);

  const windowSamples = Math.max(1, Math.floor((cfg.sampleRate * cfg.windowMs) / 1000));
  const rp = Math.max(1, Math.floor(cfg.repeatPerBit));
  const requiredWindows = cfg.startWindow + cfg.bitCount * rp * 2;
  const requiredSamples = requiredWindows * windowSamples;

  if (samples.length < requiredSamples) {
    throw new Error('audio too short for watermark');
  }

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
        samples[a] = clampI16(Math.round((samples[a] ?? 0) * gain0));
        samples[b] = clampI16(Math.round((samples[b] ?? 0) * gain1));
      }
    }
  }

  const wav = wavFromPcmI16({ samples, sampleRate: cfg.sampleRate, channels: 1 });
  await writeFile(params.outputPath, Buffer.from(wav));

  return { byteLength: wav.byteLength, mimeType: 'audio/wav' };
}

export async function extractInvisibleAudioWatermark(params: {
  audioPath: string;
  cfg: PhoenixZeroAudioWatermarkConfig;
  expectedPayloadB64Url?: string;
}): Promise<{
  extractedPayloadB64Url: string;
  bits: number[];
  scores: number[];
  threshold: number;
  polarity: 1 | -1;
  bestBitErrors?: number;
}> {
  const cfg = params.cfg;
  const samples = await decodeToPcmI16({ audioPath: params.audioPath, sampleRate: cfg.sampleRate });

  const windowSamples = Math.max(1, Math.floor((cfg.sampleRate * cfg.windowMs) / 1000));
  const rp = Math.max(1, Math.floor(cfg.repeatPerBit));

  const scores: number[] = [];
  for (let i = 0; i < cfg.bitCount; i++) {
    let sum = 0;
    for (let r = 0; r < rp; r++) {
      const baseWindow = cfg.startWindow + (i * rp + r) * 2;
      const w0 = baseWindow;
      const w1 = baseWindow + 1;

      const s0 = w0 * windowSamples;
      const e0 = s0 + windowSamples;
      const s1 = w1 * windowSamples;
      const e1 = s1 + windowSamples;

      const m0 = meanAbsI16(samples, s0, e0);
      const m1 = meanAbsI16(samples, s1, e1);
      sum += m1 - m0;
    }
    scores.push(sum / rp);
  }

  let threshold = 0;
  let polarity: 1 | -1 = 1;
  let bits = decodeBitsFromScores(scores, threshold, polarity);
  let bestBitErrors: number | undefined;

  if (params.expectedPayloadB64Url) {
    const expectedBytes = base64UrlToBytes(params.expectedPayloadB64Url).slice(0, cfg.payloadByteLength);
    const expectedBits = bytesToBits(expectedBytes, cfg.bitCount);
    const tuned = bestThresholdAndPolarity({ scores, expectedBits });
    threshold = tuned.threshold;
    polarity = tuned.polarity;
    bits = decodeBitsFromScores(scores, threshold, polarity);
    bestBitErrors = tuned.errors;
  }

  const extractedPayloadB64Url = bitsToPayloadB64Url(bits, cfg.payloadByteLength);
  return { extractedPayloadB64Url, bits, scores, threshold, polarity, bestBitErrors };
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

export async function extractAudioFingerprintFromAudioPath(params: {
  audioPath: string;
  cfg: PhoenixZeroAudioFingerprintParams;
}): Promise<{ cfg: PhoenixZeroAudioFingerprintParams; samples: number[]; hashB64Url: string }> {
  const cfg = params.cfg;
  const pcm = await decodeToPcmI16({ audioPath: params.audioPath, sampleRate: cfg.sampleRate });

  const frameSamples = Math.max(1, Math.floor((cfg.sampleRate * cfg.frameMs) / 1000));
  const raw: number[] = [];

  for (let off = 0; off < pcm.length; off += frameSamples) {
    const m = meanAbsI16(pcm, off, off + frameSamples);
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

export function meanAbsDiff(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Number.POSITIVE_INFINITY;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / n;
}
