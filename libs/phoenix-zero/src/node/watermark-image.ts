import { resolve as resolvePath } from 'node:path';

import { base64UrlToBytes, bytesToBase64Url } from '../core';

export type PhoenixZeroImageWatermarkGrid = {
  x: number;
  y: number;
  w: number;
  h: number;
  rows: number;
  cols: number;
};

export type PhoenixZeroImageWatermarkConfig = {
  payloadB64Url: string;
  payloadByteLength: number;
  bitCount: number;
  repeatPerBit: number;
  brightnessDelta: number;
  grid: PhoenixZeroImageWatermarkGrid;
  analysisSize?: number;
  outputFormat?: 'png' | 'jpeg';
  jpegQuality?: number;
};

function clampByte(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
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

function otsuThreshold(scores: number[], fallbackThreshold: number): number {
  const clean = scores.filter((x) => Number.isFinite(x));
  if (clean.length < 2) return fallbackThreshold;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of clean) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return fallbackThreshold;

  const bins = 64;
  const hist = new Uint32Array(bins);
  for (const s of clean) {
    const t = (s - min) / (max - min);
    const idx = Math.max(0, Math.min(bins - 1, Math.floor(t * (bins - 1))));
    hist[idx] = (hist[idx] ?? 0) + 1;
  }

  const total = clean.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * (hist[i] ?? 0);

  let sumB = 0;
  let wB = 0;
  let best = -1;
  let bestVar = -1;

  for (let i = 0; i < bins; i++) {
    wB += hist[i] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += i * (hist[i] ?? 0);
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) {
      bestVar = between;
      best = i;
    }
  }

  if (best < 0) return fallbackThreshold;

  const thrNorm = best / (bins - 1);
  return min + thrNorm * (max - min);
}

function thresholdCandidatesFromScores(scores: number[], fallbackThreshold: number): number[] {
  const clean = scores.filter((x) => Number.isFinite(x));
  if (clean.length === 0) return [fallbackThreshold];

  const uniq = Array.from(new Set(clean));
  uniq.sort((a, b) => a - b);

  const out: number[] = [];
  out.push(fallbackThreshold);
  out.push(otsuThreshold(clean, fallbackThreshold));
  out.push(0);
  {
    let s = 0;
    for (const v of clean) s += v;
    out.push(s / clean.length);
  }

  if (uniq.length === 1) {
    const u0 = uniq[0];
    if (u0 !== undefined) {
      out.push(u0 - 1e-6);
      out.push(u0 + 1e-6);
    }
  } else {
    out.push((uniq[0] ?? 0) - 1e-6);
    for (let i = 0; i < uniq.length - 1; i++) {
      const a = uniq[i];
      const b = uniq[i + 1];
      if (a === undefined || b === undefined) continue;
      out.push((a + b) / 2);
    }
    out.push((uniq[uniq.length - 1] ?? 0) + 1e-6);
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
  fallbackThreshold: number;
}): { threshold: number; polarity: 1 | -1; errors: number } {
  const candidates = thresholdCandidatesFromScores(params.scores, params.fallbackThreshold);

  let bestThr = params.fallbackThreshold;
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

function cellRects(params: { width: number; height: number; grid: PhoenixZeroImageWatermarkGrid }): {
  x: number;
  y: number;
  w: number;
  h: number;
}[] {
  const g = params.grid;
  const x0 = Math.round(params.width * g.x);
  const y0 = Math.round(params.height * g.y);
  const w0 = Math.max(1, Math.round(params.width * g.w));
  const h0 = Math.max(1, Math.round(params.height * g.h));

  const rows = Math.max(1, Math.floor(g.rows));
  const cols = Math.max(1, Math.floor(g.cols));
  const cw = Math.max(1, Math.floor(w0 / cols));
  const ch = Math.max(1, Math.floor(h0 / rows));

  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({ x: x0 + c * cw, y: y0 + r * ch, w: cw, h: ch });
    }
  }

  return rects;
}

function requiredCells(cfg: PhoenixZeroImageWatermarkConfig): number {
  return cfg.bitCount * Math.max(1, cfg.repeatPerBit) * 2;
}

async function getSharp(): Promise<any> {
  try {
    const mod = (await import('sharp')) as unknown as { default?: unknown };
    return (mod as any).default ?? mod;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    throw new Error(`watermark-image: cannot load sharp: ${msg}`);
  }
}

export async function embedInvisibleImageWatermark(params: {
  inputBytes: Uint8Array;
  cfg: PhoenixZeroImageWatermarkConfig;
}): Promise<{ outputBytes: Uint8Array; mimeType: string; width: number; height: number }> {
  const sharp = await getSharp();

  const img = sharp(Buffer.from(params.inputBytes), { failOnError: false });
  const meta = await img.metadata();

  const decoded = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const data = decoded.data as Buffer;
  const info = decoded.info as { width: number; height: number; channels: number };

  const cfg = params.cfg;
  const payloadBytes = base64UrlToBytes(cfg.payloadB64Url).slice(0, cfg.payloadByteLength);
  const bits = bytesToBits(payloadBytes, cfg.bitCount);

  const rects = cellRects({ width: info.width, height: info.height, grid: cfg.grid });
  if (rects.length < requiredCells(cfg)) throw new Error('watermark-image: grid too small');

  const delta = cfg.brightnessDelta * 255;
  const rp = Math.max(1, cfg.repeatPerBit);

  for (let i = 0; i < cfg.bitCount; i++) {
    const bit = bits[i] ?? 0;
    for (let r = 0; r < rp; r++) {
      const base = (i * rp + r) * 2;
      const rect0 = rects[base]!;
      const rect1 = rects[base + 1]!;
      const rectBright = bit === 1 ? rect1 : rect0;
      const rectDark = bit === 1 ? rect0 : rect1;

      const applyDelta = (target: { x: number; y: number; w: number; h: number }, d: number) => {
        const x1 = Math.min(info.width, target.x + target.w);
        const y1 = Math.min(info.height, target.y + target.h);
        const x0 = Math.max(0, target.x);
        const y0 = Math.max(0, target.y);

        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const idx = (y * info.width + x) * info.channels;
            data[idx] = clampByte((data[idx] ?? 0) + d);
            data[idx + 1] = clampByte((data[idx + 1] ?? 0) + d);
            data[idx + 2] = clampByte((data[idx + 2] ?? 0) + d);
          }
        }
      };

      applyDelta(rectBright, +delta);
      applyDelta(rectDark, -delta);
    }
  }

  const outFormat = cfg.outputFormat ?? ((meta?.format as string) === 'png' ? 'png' : 'jpeg');

  let out: Buffer;
  let mimeType: string;

  if (outFormat === 'png') {
    out = (await sharp(data, { raw: info }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()) as Buffer;
    mimeType = 'image/png';
  } else {
    const quality = Math.max(60, Math.min(100, cfg.jpegQuality ?? 95));
    out = (await sharp(data, { raw: info }).jpeg({ quality, mozjpeg: true }).toBuffer()) as Buffer;
    mimeType = 'image/jpeg';
  }

  return { outputBytes: new Uint8Array(out), mimeType, width: info.width, height: info.height };
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function meanLuma(params: {
  data: Buffer;
  info: { width: number; height: number; channels: number };
  rect: { x: number; y: number; w: number; h: number };
}): number {
  const w = params.info.width;
  const h = params.info.height;
  const ch = params.info.channels;

  const x0 = Math.max(0, params.rect.x);
  const y0 = Math.max(0, params.rect.y);
  const x1 = Math.min(w, params.rect.x + params.rect.w);
  const y1 = Math.min(h, params.rect.y + params.rect.h);

  let s = 0;
  let n = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * w + x) * ch;
      const r = params.data[idx] ?? 0;
      const g = params.data[idx + 1] ?? 0;
      const b = params.data[idx + 2] ?? 0;
      s += luma(r, g, b);
      n++;
    }
  }

  return n > 0 ? s / n : 0;
}

export async function extractInvisibleImageWatermark(params: {
  imageBytes: Uint8Array;
  cfg: PhoenixZeroImageWatermarkConfig;
  expectedPayloadB64Url?: string;
}): Promise<{
  extractedPayloadB64Url: string;
  bits: number[];
  scores: number[];
  threshold: number;
  polarity: 1 | -1;
  bestBitErrors?: number;
}> {
  const sharp = await getSharp();

  const cfg = params.cfg;
  const analysisSize = Math.max(32, Math.floor(cfg.analysisSize ?? 512));

  const decoded = await sharp(Buffer.from(params.imageBytes), { failOnError: false })
    .resize({ width: analysisSize, height: analysisSize, fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const data = decoded.data as Buffer;
  const info = decoded.info as { width: number; height: number; channels: number };

  const rects = cellRects({ width: info.width, height: info.height, grid: cfg.grid });
  if (rects.length < requiredCells(cfg)) throw new Error('watermark-image: grid too small');

  const rp = Math.max(1, cfg.repeatPerBit);

  const scores: number[] = [];
  for (let i = 0; i < cfg.bitCount; i++) {
    let sum = 0;
    for (let r = 0; r < rp; r++) {
      const base = (i * rp + r) * 2;
      const rect0 = rects[base]!;
      const rect1 = rects[base + 1]!;
      const m0 = meanLuma({ data, info, rect: rect0 });
      const m1 = meanLuma({ data, info, rect: rect1 });
      sum += m1 - m0;
    }
    scores.push(sum / rp);
  }

  const fallbackThreshold = Math.max(0.2, cfg.brightnessDelta * 255 * 0.05);

  let threshold = fallbackThreshold;
  let polarity: 1 | -1 = 1;
  let bits = decodeBitsFromScores(scores, threshold, polarity);
  let bestBitErrors: number | undefined;

  if (params.expectedPayloadB64Url) {
    const expectedBytes = base64UrlToBytes(params.expectedPayloadB64Url).slice(0, cfg.payloadByteLength);
    const expectedBits = bytesToBits(expectedBytes, cfg.bitCount);
    const tuned = bestThresholdAndPolarity({ scores, expectedBits, fallbackThreshold });
    threshold = tuned.threshold;
    polarity = tuned.polarity;
    bits = decodeBitsFromScores(scores, threshold, polarity);
    bestBitErrors = tuned.errors;
  }

  const extractedPayloadB64Url = bitsToPayloadB64Url(bits, cfg.payloadByteLength);

  return { extractedPayloadB64Url, bits, scores, threshold, polarity, bestBitErrors };
}

function popcnt8(n: number): number {
  let x = n & 0xff;
  x = x - ((x >> 1) & 0x55);
  x = (x & 0x33) + ((x >> 2) & 0x33);
  return (((x + (x >> 4)) & 0x0f) * 0x01) & 0xff;
}

export function dhashHammingDistance(aB64Url: string, bB64Url: string): number {
  const a = base64UrlToBytes(aB64Url);
  const b = base64UrlToBytes(bB64Url);
  const n = Math.min(a.byteLength, b.byteLength);
  let d = 0;
  for (let i = 0; i < n; i++) d += popcnt8((a[i] ?? 0) ^ (b[i] ?? 0));
  d += Math.abs(a.byteLength - b.byteLength) * 8;
  return d;
}

export async function computeImageDHashB64Url(params: {
  imageBytes: Uint8Array;
  width?: number;
  height?: number;
}): Promise<string> {
  const sharp = await getSharp();
  const w = Math.max(2, Math.floor(params.width ?? 9));
  const h = Math.max(1, Math.floor(params.height ?? 8));

  const buf = (await sharp(Buffer.from(params.imageBytes), { failOnError: false })
    .resize({ width: w, height: h, fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer()) as Buffer;

  const bits: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = buf[y * w + x] ?? 0;
      const b = buf[y * w + x + 1] ?? 0;
      bits.push(a < b ? 1 : 0);
    }
  }

  const outBytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = 7 - (i % 8);
    outBytes[byteIdx] = (outBytes[byteIdx] ?? 0) | ((bits[i] ?? 0) << bitIdx);
  }

  return bytesToBase64Url(outBytes);
}
