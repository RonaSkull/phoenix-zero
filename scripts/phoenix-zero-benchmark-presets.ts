import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { base64UrlToBytes, bytesToBase64Url, generateEd25519KeyPair, sha256B64Url } from '@phoenix-zero/core';
import {
  createHybridSignature,
  embedInvisibleWatermark,
  extractInvisibleWatermark,
  extractTemporalFingerprintFromVideoPath,
  selectWatermarkedPreset,
  verifyHybridSignature,
  type PhoenixZeroPlatform
} from '@phoenix-zero/core/node';

function samplesToBytes(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] ?? 0;
  return out;
}

type ProofV3 = {
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
    repeatPerBit: number;
    brightnessDelta: number;
    roi?: { x: number; y: number; w: number; h: number };
    rois?: { x: number; y: number; w: number; h: number }[];
  };
  signatureMode: 'compat' | 'strict';
  hybridSignature: any;
};

type VariantSpec = {
  id: string;
  vf?: string;
  crf?: number;
};

type VerifyOut = {
  ok: boolean;
  signatureOk: boolean;
  watermarkOk: boolean;
  watermarkBitErrors?: number;
  watermarkBitCount?: number;
  temporalOk: boolean;
  temporalMad: number;
};

type CaseResult = {
  platform?: PhoenixZeroPlatform;
  durationSeconds: number;
  presetId: string;
  paths: {
    input: string;
    watermarked: string;
    proof: string;
    variants: Record<string, string>;
  };
  verify: {
    watermarked: VerifyOut;
    variants: Record<string, VerifyOut>;
  };
};

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
  const maybe = (mod as { default?: unknown }).default ?? mod;
  if (typeof maybe === 'string') return maybe;
  throw new Error('ffmpeg-static did not resolve to a path string');
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => (err += String(d)));
    child.on('error', (e: Error) => rejectP(e));
    child.on('close', (code: number | null) => {
      if (code !== 0) return rejectP(new Error(err || `ffmpeg exited with code ${code}`));
      resolveP();
    });
  });
}

async function makeTestVideo(params: { outPath: string; durationSeconds: number; size: string; fps: number }): Promise<void> {
  const ffmpegPath = await getFfmpegPath();
  await mkdir(dirname(params.outPath), { recursive: true });

  const cmdArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${params.durationSeconds}:size=${params.size}:rate=${params.fps}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=1000:duration=${params.durationSeconds}`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    params.outPath
  ];

  await run(ffmpegPath, cmdArgs);
}

async function transcodeVariant(params: { inPath: string; outPath: string; spec: VariantSpec }): Promise<void> {
  const ffmpegPath = await getFfmpegPath();
  await mkdir(dirname(params.outPath), { recursive: true });

  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y', '-i', params.inPath];

  if (params.spec.vf) {
    args.push('-vf', params.spec.vf);
  }

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(params.spec.crf ?? 32),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    params.outPath
  );

  await run(ffmpegPath, args);
}

function meanAbsDiff(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Number.POSITIVE_INFINITY;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / n;
}

function bytesToBits(bytes: Uint8Array, bitCount: number): number[] {
  const bits: number[] = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  return bits.slice(0, bitCount);
}

function hammingBits(a: number[], b: number[], bitCount: number): number {
  let e = 0;
  for (let i = 0; i < bitCount; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) e++;
  }
  return e;
}

async function verifyFromProof(params: { videoPath: string; proof: ProofV3 }): Promise<VerifyOut> {
  const payload = {
    version: params.proof.version,
    createdAt: params.proof.createdAt,
    creatorId: params.proof.creatorId,
    preset: params.proof.preset,
    media: params.proof.media,
    temporal: params.proof.temporal,
    watermark: params.proof.watermark,
    signatureMode: params.proof.signatureMode
  };

  const sig = await verifyHybridSignature({ payload, sig: params.proof.hybridSignature });

  const wmThreshold = params.proof.preset?.watermarkVerify?.yThreshold;
  const wmSearch = params.proof.preset?.watermarkVerify?.searchStartFrameWindow ?? 0;

  const wm = await extractInvisibleWatermark({
    videoPath: params.videoPath,
    cfg: {
      payloadB64Url: params.proof.watermark.payloadB64Url,
      payloadByteLength: params.proof.watermark.payloadByteLength,
      bitCount: params.proof.watermark.bitCount,
      startFrame: params.proof.watermark.startFrame,
      frameInterval: params.proof.watermark.frameInterval,
      repeatPerBit: params.proof.watermark.repeatPerBit,
      brightnessDelta: params.proof.watermark.brightnessDelta,
      roi: params.proof.watermark.roi,
      rois: params.proof.watermark.rois
    },
    yThreshold: wmThreshold,
    expectedPayloadB64Url: params.proof.watermark.payloadB64Url,
    searchStartFrameWindow: wmSearch
  });

  const watermarkOk = wm.extractedPayloadB64Url === params.proof.watermark.payloadB64Url;

  const expectedBytes = base64UrlToBytes(params.proof.watermark.payloadB64Url).slice(0, params.proof.watermark.payloadByteLength);
  const expectedBits = bytesToBits(expectedBytes, params.proof.watermark.bitCount);
  const bitErrors = hammingBits(expectedBits, wm.bits, params.proof.watermark.bitCount);

  const extracted = await extractTemporalFingerprintFromVideoPath({
    videoPath: params.videoPath,
    cfg: params.proof.temporal.cfg
  });

  const mad = meanAbsDiff(extracted.samples, params.proof.temporal.samples);
  const temporalOk = mad <= params.proof.temporal.madThreshold;

  const ok = Boolean(sig.ok) && (watermarkOk || temporalOk);

  return {
    ok,
    signatureOk: Boolean(sig.ok),
    watermarkOk,
    watermarkBitErrors: bitErrors,
    watermarkBitCount: params.proof.watermark.bitCount,
    temporalOk,
    temporalMad: mad
  };
}

async function stampOne(params: {
  inputPath: string;
  watermarkedPath: string;
  proofPath: string;
  creatorId?: string;
  platform?: PhoenixZeroPlatform;
}): Promise<ProofV3> {
  const preset = await selectWatermarkedPreset({ videoPath: params.inputPath, platform: params.platform });

  const edKeyPair = generateEd25519KeyPair();

  const wmPayloadBytes = new Uint8Array(preset.watermark.payloadByteLength);
  wmPayloadBytes.set(randomBytes(wmPayloadBytes.byteLength));
  const wmPayloadB64Url = bytesToBase64Url(wmPayloadBytes);

  const wmCfg = {
    payloadB64Url: wmPayloadB64Url,
    payloadByteLength: preset.watermark.payloadByteLength,
    bitCount: preset.watermark.bitCount,
    startFrame: preset.watermark.startFrame,
    frameInterval: preset.watermark.frameInterval,
    repeatPerBit: preset.watermark.repeatPerBit ?? 2,
    brightnessDelta: preset.watermark.brightnessDelta,
    roi: preset.watermark.roi,
    rois: preset.watermark.rois
  };

  await mkdir(dirname(params.watermarkedPath), { recursive: true });
  await embedInvisibleWatermark({ inputPath: params.inputPath, outputPath: params.watermarkedPath, cfg: wmCfg });

  const temporal = await extractTemporalFingerprintFromVideoPath({ videoPath: params.watermarkedPath, cfg: preset.temporal });
  const temporalHash = sha256B64Url(samplesToBytes(temporal.samples));

  const payload = {
    version: 3 as const,
    createdAt: new Date().toISOString(),
    creatorId: params.creatorId,
    preset: {
      id: preset.id,
      platform: preset.platform,
      durationSeconds: preset.durationSeconds,
      watermarkVerify: preset.watermarkVerify
    },
    media: { mimeType: 'video/mp4', byteLength: 0 },
    temporal: {
      alg: 'signalstats_yavg_v1' as const,
      cfg: temporal.cfg,
      samples: temporal.samples,
      hashB64Url: temporalHash,
      madThreshold: preset.madThreshold
    },
    watermark: {
      alg: 'roi_luma_delta_v1' as const,
      payloadByteLength: wmCfg.payloadByteLength,
      payloadB64Url: wmCfg.payloadB64Url,
      bitCount: wmCfg.bitCount,
      startFrame: wmCfg.startFrame,
      frameInterval: wmCfg.frameInterval,
      repeatPerBit: wmCfg.repeatPerBit,
      brightnessDelta: wmCfg.brightnessDelta,
      roi: wmCfg.roi,
      rois: wmCfg.rois
    },
    signatureMode: 'compat' as const
  };

  const hybridSignature = await createHybridSignature({
    payload,
    mode: 'compat',
    ed25519: { privateKey: edKeyPair.privateKey, publicKey: edKeyPair.publicKey }
  });

  const proof: ProofV3 = {
    ...payload,
    hybridSignature
  };

  await mkdir(dirname(params.proofPath), { recursive: true });
  await writeFile(params.proofPath, JSON.stringify(proof, null, 2), 'utf8');

  return proof;
}

function formatMdTable(cases: CaseResult[]): string {
  const lines: string[] = [];
  lines.push('| platform | duration(s) | preset | watermarked | crf28 | crf32 | fps24+scale540+crf32 |');
  lines.push('|---|---:|---|---|---|---|---|');

  for (const c of cases) {
    const p = c.platform ?? 'default';
    const wm = c.verify.watermarked.watermarkOk ? 'OK' : 'FAIL';
    const v28 = c.verify.variants['crf28']?.watermarkOk ? 'OK' : c.verify.variants['crf28'] ? 'FAIL' : '-';
    const v32 = c.verify.variants['crf32']?.watermarkOk ? 'OK' : c.verify.variants['crf32'] ? 'FAIL' : '-';
    const vCombo = c.verify.variants['fps24_scale540_crf32']?.watermarkOk
      ? 'OK'
      : c.verify.variants['fps24_scale540_crf32']
        ? 'FAIL'
        : '-';
    lines.push(`| ${p} | ${c.durationSeconds} | ${c.presetId} | ${wm} | ${v28} | ${v32} | ${vCombo} |`);
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv);

  const outDir = resolve(args.outDir ?? './benchmarks/presets');
  const size = args.size ?? '720x1280';
  const fps = args.fps ? Number(args.fps) : 30;

  const durations = (args.durations ?? '3,8,12,20,33,40,55,75')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const platforms: (PhoenixZeroPlatform | undefined)[] = (args.platforms ?? args.platform ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s as PhoenixZeroPlatform);

  if (platforms.length === 0) platforms.push(undefined);

  const variantsToRun = (args.variants ?? 'crf28,crf32,fps24_scale540_crf32')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const variantSpecs: VariantSpec[] = [
    { id: 'crf28', crf: 28 },
    { id: 'crf32', crf: 32 },
    { id: 'fps24_scale540_crf32', vf: 'fps=24,scale=540:-2', crf: 32 }
  ].filter((v) => variantsToRun.includes(v.id));

  const stampId = Date.now().toString(10);
  const runDir = join(outDir, stampId);
  await mkdir(runDir, { recursive: true });

  const results: CaseResult[] = [];

  for (const platform of platforms) {
    for (const durationSeconds of durations) {
      const baseName = `${platform ?? 'default'}-${durationSeconds}s`;
      const input = join(runDir, 'inputs', `${baseName}.mp4`);
      const watermarked = join(runDir, 'watermarked', `${baseName}.mp4`);
      const proofPath = join(runDir, 'proofs', `${baseName}.proof.json`);

      await makeTestVideo({ outPath: input, durationSeconds, size, fps });

      const proof = await stampOne({
        inputPath: input,
        watermarkedPath: watermarked,
        proofPath,
        platform
      });

      const vWatermarked = await verifyFromProof({ videoPath: watermarked, proof });

      const variantPaths: Record<string, string> = {};
      const variantVerify: Record<string, VerifyOut> = {};

      for (const spec of variantSpecs) {
        const vOut = join(runDir, 'variants', spec.id, `${baseName}.mp4`);
        await transcodeVariant({ inPath: watermarked, outPath: vOut, spec });
        variantPaths[spec.id] = vOut;
        variantVerify[spec.id] = await verifyFromProof({ videoPath: vOut, proof });
      }

      results.push({
        platform,
        durationSeconds,
        presetId: proof.preset?.id ?? 'unknown',
        paths: {
          input,
          watermarked,
          proof: proofPath,
          variants: variantPaths
        },
        verify: {
          watermarked: vWatermarked,
          variants: variantVerify
        }
      });
    }
  }

  const report = {
    runId: stampId,
    outDir: runDir,
    durations,
    platforms: platforms.map((p) => p ?? 'default'),
    variants: variantSpecs.map((v) => v.id),
    results
  };

  const reportJsonPath = join(runDir, 'report.json');
  const reportMdPath = join(runDir, 'report.md');

  await writeFile(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(reportMdPath, formatMdTable(results), 'utf8');

  process.stdout.write(JSON.stringify({ ok: true, reportDir: runDir, reportJson: reportJsonPath, reportMd: reportMdPath }, null, 2) + '\n');
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(msg + '\n');
  process.exit(1);
});
