import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';

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

async function getFfmpegPath(): Promise<string> {
  const mod = (await import('ffmpeg-static')) as unknown as { default?: unknown };
  const maybe = (mod as any).default ?? mod;
  if (typeof maybe === 'string') return maybe;
  throw new Error('ffmpeg-static did not resolve to a path string');
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function defaultWatermarkedVideoPath(): Promise<string | null> {
  const candidates = [
    resolve(process.cwd(), 'platform-tests', 'output', 'watermarked.mp4'),
    resolve(process.cwd(), 'out', 'watermarked.mp4')
  ];
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  return null;
}

async function defaultProofPath(): Promise<string | null> {
  const candidates = [
    resolve(process.cwd(), 'platform-tests', 'proofs', 'original.proof.json'),
    resolve(process.cwd(), 'out', 'proof.json')
  ];
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  return null;
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

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

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const ffmpegPath = await getFfmpegPath();
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string | Buffer) => {
      err += String(d);
    });

    child.on('error', (e) => reject(e));
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || `ffmpeg exited with code ${code}`));
      resolve();
    });
  });
}

type EncodeProfile = {
  key: PhoenixZeroPlatform | 'twitter' | 'discord' | 'slack' | 'youtube';
  // Max dimension; we preserve aspect ratio.
  maxSize: number;
  crf: number;
  preset: 'veryfast' | 'faster' | 'fast' | 'medium';
  audioKbps: number;
};

async function reencode(params: { inPath: string; outPath: string; profile: EncodeProfile }) {
  const p = params.profile;

  const vf = `scale='if(gt(iw,ih),min(${p.maxSize},iw),-2)':'if(gt(iw,ih),-2,min(${p.maxSize},ih))':flags=bicubic`;

  await runFfmpeg([
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    params.inPath,
    '-vf',
    vf,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-profile:v',
    'high',
    '-preset',
    p.preset,
    '-crf',
    String(p.crf),
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    `${p.audioKbps}k`,
    params.outPath
  ]);
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

async function verifyOnce(params: { videoPath: string; proof: Proof; platform?: PhoenixZeroPlatform }) {
  const proof = params.proof;
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

  let wmThreshold = proof.preset?.watermarkVerify?.yThreshold;
  let wmSearchWindow = proof.preset?.watermarkVerify?.searchStartFrameWindow;

  if (params.platform && (wmThreshold === undefined || wmSearchWindow === undefined)) {
    const preset = await selectWatermarkedPreset({ videoPath: params.videoPath, platform: params.platform });
    wmThreshold = wmThreshold ?? preset.watermarkVerify?.yThreshold;
    wmSearchWindow = wmSearchWindow ?? preset.watermarkVerify?.searchStartFrameWindow;
  }

  const searchStartFrameWindow = wmSearchWindow ?? 0;

  const wm = await extractInvisibleWatermark({
    videoPath: params.videoPath,
    cfg: wmCfg,
    yThreshold: wmThreshold,
    expectedPayloadB64Url: proof.watermark.payloadB64Url,
    searchStartFrameWindow
  });

  const watermarkMatch = wm.extractedPayloadB64Url === proof.watermark.payloadB64Url;

  const extracted = await extractTemporalFingerprint({ videoPath: params.videoPath, cfg: proof.temporal.cfg });
  const mad = meanAbsDiff(extracted.samples, proof.temporal.samples);
  const temporalMatch = mad <= proof.temporal.madThreshold;
  const extractedHash = sha256B64Url(samplesToBytes(extracted.samples));

  const ok = sigResult.ok && (watermarkMatch || temporalMatch);

  return {
    ok,
    signature: sigResult,
    watermark: {
      ok: watermarkMatch,
      bestStartFrame: wm.bestStartFrame,
      bestBitErrors: wm.bestBitErrors
    },
    temporal: {
      ok: temporalMatch,
      mad,
      madThreshold: proof.temporal.madThreshold,
      extractedHashB64Url: extractedHash,
      expectedHashB64Url: proof.temporal.hashB64Url
    }
  };
}

async function main() {
  const args = parseArgs(process.argv);

  const inPath = args.in ?? args.input;
  const proofPath = args.proof;
  const outDirArg = args.outDir;
  const outPath = args.out ?? args.output;

  const resolvedIn = inPath || (await defaultWatermarkedVideoPath());
  const resolvedProof = proofPath || (await defaultProofPath());

  if (!resolvedIn) throw new Error('Missing --in <watermarkedVideoPath> and no default found.');
  if (!resolvedProof) throw new Error('Missing --proof <proofPath> and no default found.');

  const proof = JSON.parse(await readFile(resolvedProof, 'utf8')) as Proof;

  const outDir = outDirArg
    ? resolve(outDirArg)
    : resolve(process.cwd(), 'platform-tests', 'robustness', `video-${nowStamp()}`);

  await mkdir(outDir, { recursive: true });

  const encodes: EncodeProfile[] = [
    { key: 'whatsapp', maxSize: 720, crf: 32, preset: 'veryfast', audioKbps: 96 },
    { key: 'instagram', maxSize: 1080, crf: 30, preset: 'veryfast', audioKbps: 128 },
    { key: 'tiktok', maxSize: 720, crf: 31, preset: 'veryfast', audioKbps: 128 },
    { key: 'linkedin', maxSize: 1080, crf: 28, preset: 'fast', audioKbps: 128 },
    { key: 'twitter', maxSize: 720, crf: 30, preset: 'veryfast', audioKbps: 128 },
    { key: 'telegram', maxSize: 1080, crf: 28, preset: 'fast', audioKbps: 128 },
    { key: 'discord', maxSize: 1080, crf: 28, preset: 'fast', audioKbps: 128 },
    { key: 'slack', maxSize: 1080, crf: 28, preset: 'fast', audioKbps: 128 },
    { key: 'youtube', maxSize: 1080, crf: 26, preset: 'medium', audioKbps: 160 }
  ];

  const results: Array<{
    platform: EncodeProfile['key'];
    outFile: string;
    verify: any;
  }> = [];

  for (const p of encodes) {
    const outFile = join(outDir, `${p.key}.mp4`);
    await reencode({ inPath: resolvedIn, outPath: outFile, profile: p });

    const platform =
      p.key === 'twitter' || p.key === 'discord' || p.key === 'slack' || p.key === 'youtube'
        ? undefined
        : (p.key as PhoenixZeroPlatform);

    const verify = await verifyOnce({ videoPath: outFile, proof, platform });

    results.push({ platform: p.key, outFile, verify });
  }

  const report = {
    ok: results.every((r) => r.verify?.ok === true),
    inputVideo: resolvedIn,
    proofPath: resolvedProof,
    outDir,
    results
  };

  const jsonPath = outPath ? resolve(outPath) : join(outDir, 'report.json');
  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  process.stdout.write(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.stack || e.message : String(e);
  process.stderr.write(`video-wm-reencode failed: ${msg}\n`);
  process.exitCode = 1;
});
