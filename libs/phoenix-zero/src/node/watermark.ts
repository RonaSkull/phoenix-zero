import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { base64UrlToBytes, bytesToBase64Url } from '../core';

export type PhoenixZeroWatermarkRoi = { x: number; y: number; w: number; h: number };

export type PhoenixZeroWatermarkConfig = {
  payloadB64Url: string;
  payloadByteLength: number;
  rois?: PhoenixZeroWatermarkRoi[];
  roi?: PhoenixZeroWatermarkRoi;
  frameInterval: number; // in frames
  repeatPerBit?: number; // <= frameInterval
  startFrame: number;
  brightnessDelta: number; // eq brightness, e.g. 0.02
  bitCount: number; // default 16
};

function clampIndex(n: number, len: number): number {
  if (len <= 0) return 0;
  if (n < 0) return 0;
  if (n >= len) return len - 1;
  return n;
}

function computeRepeatOffsets(frameInterval: number, repeatPerBit: number): number[] {
  const fi = Math.max(1, Math.floor(frameInterval));
  const rp = Math.max(1, Math.min(Math.floor(repeatPerBit), Math.max(1, fi - 1)));
  if (rp === 1) return [0];
  if (fi === 1) return [0];

  const offsets: number[] = [];
  for (let i = 0; i < rp; i++) {
    const off = Math.round((i * (fi - 1)) / (rp - 1));
    offsets.push(Math.max(0, Math.min(fi - 1, off)));
  }

  return Array.from(new Set(offsets)).sort((a, b) => a - b);
}

function computeConsecutiveOffsets(frameInterval: number, repeatPerBit: number): number[] {
  const fi = Math.max(1, Math.floor(frameInterval));
  const rp = Math.max(1, Math.min(Math.floor(repeatPerBit), Math.max(1, fi - 1)));
  const offsets: number[] = [];
  for (let i = 0; i < rp; i++) offsets.push(i);
  return offsets;
}

function decodeBitsFromScores(scores: number[], threshold: number, polarity: 1 | -1): number[] {
  // polarity=1: bit=1 if score>threshold
  // polarity=-1: bit=1 if score<threshold
  if (polarity === 1) return scores.map((s) => (s > threshold ? 1 : 0));
  return scores.map((s) => (s < threshold ? 1 : 0));
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

  // de-dup
  const dedup = Array.from(new Set(out.filter((x) => Number.isFinite(x))));
  dedup.sort((a, b) => a - b);
  return dedup;
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

function bytesToBits(bytes: Uint8Array, bitCount: number): number[] {
  const bits: number[] = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  return bits.slice(0, bitCount);
}

async function getFfmpegPath(): Promise<string> {
  const env = process.env.PHOENIX_ZERO_FFMPEG_PATH ?? process.env.FFMPEG_PATH;
  if (env && existsSync(env)) return env;

  let maybe: unknown = undefined;
  try {
    const mod = (await import('ffmpeg-static')) as unknown as { default?: unknown };
    maybe = (mod as { default?: unknown }).default ?? mod;
  } catch {
    maybe = undefined;
  }

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
      typeof maybe === 'string' ? maybe : '[unavailable]'
    }`
  );
}

function getRois(cfg: PhoenixZeroWatermarkConfig): PhoenixZeroWatermarkRoi[] {
  if (Array.isArray(cfg.rois) && cfg.rois.length > 0) return cfg.rois;
  if (cfg.roi) return [cfg.roi];
  return [{ x: 0.2, y: 0.2, w: 0.6, h: 0.6 }];
}

function majority(bits: number[]): number {
  let s = 0;
  for (const b of bits) s += b ? 1 : -1;
  return s >= 0 ? 1 : 0;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => {
      err += String(d);
    });
    child.on('error', (e: Error) => reject(e));
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(err || `ffmpeg exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

export async function embedInvisibleWatermark(params: {
  inputPath: string;
  outputPath: string;
  cfg: PhoenixZeroWatermarkConfig;
}): Promise<void> {
  const ffmpegPath = await getFfmpegPath();
  const payloadBytes = base64UrlToBytes(params.cfg.payloadB64Url);
  const expectedLen = params.cfg.payloadByteLength;
  const payload = payloadBytes.slice(0, expectedLen);
  const bits = bytesToBits(payload, params.cfg.bitCount);

  const rois = getRois(params.cfg);
  const repeatPerBit = Math.max(1, Math.min(params.cfg.repeatPerBit ?? 2, Math.max(1, params.cfg.frameInterval - 1)));
  const repeatOffsets = computeRepeatOffsets(params.cfg.frameInterval, repeatPerBit);

  const framesToMark: number[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== 1) continue;
    const base = params.cfg.startFrame + i * params.cfg.frameInterval;
    for (const off of repeatOffsets) framesToMark.push(base + off);
  }

  const enableExpr =
    framesToMark.length === 0 ? '0' : `(${framesToMark.map((n) => `between(n\\,${n}\\,${n})`).join('+')})`;

  let filter = `[0:v]null[v0];`;
  for (let i = 0; i < rois.length; i++) {
    const roi = rois[i]!;
    const cropW = `iw*${roi.w}`;
    const cropH = `ih*${roi.h}`;
    const cropX = `iw*${roi.x}`;
    const cropY = `ih*${roi.y}`;
    const overlayX = `main_w*${roi.x}`;
    const overlayY = `main_h*${roi.y}`;

    filter +=
      `[v${i}]split=2[base${i}][tmp${i}];` +
      `[tmp${i}]crop=w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY},eq=brightness=${params.cfg.brightnessDelta}[patch${i}];` +
      `[base${i}][patch${i}]overlay=x=${overlayX}:y=${overlayY}:enable='${enableExpr}'[v${i + 1}];`;
  }

  filter += `[v${rois.length}]null`;

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    params.inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    params.outputPath
  ];

  await run(ffmpegPath, args);
}

export async function extractInvisibleWatermark(params: {
  videoPath: string;
  cfg: PhoenixZeroWatermarkConfig;
  yThreshold?: number; // in YAVG units 0..255
  expectedPayloadB64Url?: string;
  searchStartFrameWindow?: number;
}): Promise<{
  extractedPayloadB64Url: string;
  bits: number[];
  yavgByFrame: number[];
  bestStartFrame?: number;
  bestBitErrors?: number;
}> {
  const ffmpegPath = await getFfmpegPath();

  const rois = getRois(params.cfg);
  const repeatPerBit = Math.max(1, Math.min(params.cfg.repeatPerBit ?? 2, Math.max(1, params.cfg.frameInterval - 1)));
  const repeatOffsetsSpread = computeRepeatOffsets(params.cfg.frameInterval, repeatPerBit);
  const repeatOffsetsConsecutive = computeConsecutiveOffsets(params.cfg.frameInterval, params.cfg.repeatPerBit ?? 2);
  const repeatOffsetSets = [
    new Set<number>(repeatOffsetsSpread),
    new Set<number>(repeatOffsetsConsecutive)
  ];
  const threshold =
    params.yThreshold ??
    // brightnessDelta is in ~0..1 (normalized), signalstats YAVG is in 0..255.
    // Derive a conservative default threshold from the configured delta.
    Math.max(0.2, params.cfg.brightnessDelta * 255 * 0.05);

  async function yavgForRoi(roi: PhoenixZeroWatermarkRoi): Promise<number[]> {
    const cropW = `iw*${roi.w}`;
    const cropH = `ih*${roi.h}`;
    const cropX = `iw*${roi.x}`;
    const cropY = `ih*${roi.y}`;
    const vf = `crop=w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY},signalstats,metadata=print:file=-`;
    const args = ['-hide_banner', '-loglevel', 'error', '-i', params.videoPath, '-an', '-vf', vf, '-f', 'null', '-'];

    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (d: string) => (out += String(d)));
      child.stderr.on('data', (d: string) => (err += String(d)));
      child.on('error', (e: Error) => reject(e));
      child.on('close', (code: number | null) => {
        if (code !== 0) return reject(new Error(err || `ffmpeg exited with code ${code}`));
        const lines = out.split(/\r?\n/);
        const samples: number[] = [];
        for (const line of lines) {
          const m = line.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
          if (!m) continue;
          const v = m[1];
          if (!v) continue;
          samples.push(parseFloat(v));
        }
        if (samples.length === 0) return reject(new Error('No YAVG samples extracted'));
        resolve(samples);
      });
    });
  }

  async function yavgForFullFrame(): Promise<number[]> {
    const vf = `signalstats,metadata=print:file=-`;
    const args = ['-hide_banner', '-loglevel', 'error', '-i', params.videoPath, '-an', '-vf', vf, '-f', 'null', '-'];

    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (d: string) => (out += String(d)));
      child.stderr.on('data', (d: string) => (err += String(d)));
      child.on('error', (e: Error) => reject(e));
      child.on('close', (code: number | null) => {
        if (code !== 0) return reject(new Error(err || `ffmpeg exited with code ${code}`));
        const lines = out.split(/\r?\n/);
        const samples: number[] = [];
        for (const line of lines) {
          const m = line.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
          if (!m) continue;
          const v = m[1];
          if (!v) continue;
          samples.push(parseFloat(v));
        }
        if (samples.length === 0) return reject(new Error('No YAVG samples extracted'));
        resolve(samples);
      });
    });
  }

  const [yFull, ...yRois] = await Promise.all([yavgForFullFrame(), ...rois.map((r) => yavgForRoi(r))]);

  const ySeriesVariants: { id: 'raw' | 'normFull'; series: number[][] }[] = [
    { id: 'raw', series: yRois },
    {
      id: 'normFull',
      series: yRois.map((ys) => ys.map((y, i) => y - (yFull[i] ?? yFull[yFull.length - 1] ?? 0)))
    }
  ];

  const defaultYSeries = ySeriesVariants[1]?.series ?? ySeriesVariants[0]?.series ?? [];

  function scoresForStartFrame(startFrame: number, markOffsets: Set<number>, ySeries: number[][]): number[] {
    const scores: number[] = [];
    for (let i = 0; i < params.cfg.bitCount; i++) {
      const base = startFrame + i * params.cfg.frameInterval;
      const roiScores: number[] = [];
      for (const ys of ySeries) {
        const len = ys.length;
        let markSum = 0;
        let markN = 0;
        let unmarkSum = 0;
        let unmarkN = 0;

        for (let off = 0; off < params.cfg.frameInterval; off++) {
          const idx = clampIndex(base + off, len);
          const y = ys[idx] ?? 0;
          if (markOffsets.has(off)) {
            markSum += y;
            markN++;
          } else {
            unmarkSum += y;
            unmarkN++;
          }
        }

        const markMean = markN > 0 ? markSum / markN : 0;
        const unmarkMean = unmarkN > 0 ? unmarkSum / unmarkN : ys[clampIndex(base - 1, len)] ?? 0;
        roiScores.push(markMean - unmarkMean);
      }

      if (roiScores.length === 0) {
        scores.push(0);
      } else {
        let s = 0;
        for (const v of roiScores) s += v;
        scores.push(s / roiScores.length);
      }
    }

    return scores;
  }

  function decodeBitsForStartFrame(startFrame: number, markOffsets: Set<number>): number[] {
    const scores = scoresForStartFrame(startFrame, markOffsets, defaultYSeries);
    return scores.map((s) => (s > threshold ? 1 : 0));
  }

  function bitsToPayloadB64Url(bits: number[]): string {
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | (bits[i + j] ?? 0);
      }
      bytes.push(b);
    }
    const extractedPayload = new Uint8Array(bytes).slice(0, params.cfg.payloadByteLength);
    return bytesToBase64Url(extractedPayload);
  }

  // Default decode uses spread offsets (new embed strategy), but search below can choose the best.
  let bits = decodeBitsForStartFrame(params.cfg.startFrame, repeatOffsetSets[0]!);

  let bestStartFrame: number | undefined;
  let bestBitErrors: number | undefined;
  let bestYSeries = defaultYSeries;

  const expectedPayloadB64Url = params.expectedPayloadB64Url;
  const searchWindow = Math.max(0, params.searchStartFrameWindow ?? 0);
  if (expectedPayloadB64Url && searchWindow > 0) {
    const expectedBits = bytesToBits(base64UrlToBytes(expectedPayloadB64Url).slice(0, params.cfg.payloadByteLength), params.cfg.bitCount);
    let bestBits = bits;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestStart = params.cfg.startFrame;

    let bestThr = threshold;
    let bestPol: 1 | -1 = 1;

    const minLen = bestYSeries.reduce((m, ys) => Math.min(m, ys.length), Number.POSITIVE_INFINITY);
    const maxStart = Number.isFinite(minLen) ? Math.max(0, Math.floor(minLen) - params.cfg.bitCount * params.cfg.frameInterval) : 0;

    for (let d = -searchWindow; d <= searchWindow; d++) {
      const candStart = Math.max(0, Math.min(maxStart, params.cfg.startFrame + d));
      for (const markOffsets of repeatOffsetSets) {
        for (const variant of ySeriesVariants) {
          const scores = scoresForStartFrame(candStart, markOffsets, variant.series);
          const tuned = bestThresholdAndPolarity({ scores, expectedBits, fallbackThreshold: threshold });
          if (tuned.errors < bestScore) {
            bestScore = tuned.errors;
            bestThr = tuned.threshold;
            bestPol = tuned.polarity;
            bestBits = decodeBitsFromScores(scores, bestThr, bestPol);
            bestStart = candStart;
            bestYSeries = variant.series;
            if (bestScore === 0) break;
          }
        }
        if (bestScore === 0) break;
      }
      if (bestScore === 0) break;
    }

    bits = bestBits;
    bestStartFrame = bestStart;
    bestBitErrors = Number.isFinite(bestScore) ? bestScore : undefined;
  }

  const yavgByFrame = bestYSeries[0] ?? [];

  const extractedPayloadB64Url = bitsToPayloadB64Url(bits);

  return { extractedPayloadB64Url, bits, yavgByFrame, bestStartFrame, bestBitErrors };
}
