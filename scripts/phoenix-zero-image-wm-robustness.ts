import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { bytesToBase64Url } from '@phoenix-zero/core';
import {
  computeImageDHashB64Url,
  dhashHammingDistance,
  embedInvisibleImageWatermark,
  extractInvisibleImageWatermark,
  type PhoenixZeroImageWatermarkConfig
} from '@phoenix-zero/core/node/watermark-image';

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

async function getSharp(): Promise<any> {
  try {
    const mod = (await import('sharp')) as unknown as { default?: unknown };
    return (mod as any).default ?? mod;
  } catch {
    const candidates = [
      resolve(process.cwd(), 'apps', 'web', 'package.json'),
      resolve(process.cwd(), 'package.json')
    ];

    let lastErr: unknown;
    for (const ref of candidates) {
      try {
        const req = createRequire(ref);
        const mod = req('sharp');
        return (mod as any).default ?? mod;
      } catch (e) {
        lastErr = e;
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`sharp is required for image robustness tests but could not be loaded: ${msg}`);
  }
}

async function generateDefaultImagePngBytes(): Promise<Uint8Array> {
  const sharp = await getSharp();
  const w = 1024;
  const h = 1024;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = Math.round((x / (w - 1)) * 255);
      const g = Math.round((y / (h - 1)) * 255);
      const b = Math.round((((x ^ y) & 255) / 255) * 255);
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
  const out = (await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer()) as Buffer;
  return new Uint8Array(out);
}

type Profile = {
  key:
    | 'whatsapp'
    | 'instagram'
    | 'tiktok'
    | 'linkedin'
    | 'twitter'
    | 'telegram'
    | 'discord'
    | 'slack'
    | 'youtube';
  resizeMax: number;
  jpegQuality: number;
  cropPct: number;
  blurSigma?: number;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function defaultInputImagePath(): Promise<string | null> {
  const candidates = [
    resolve(process.cwd(), 'platform-tests', 'demo-assets', 'v1', 'image.png'),
    resolve(process.cwd(), 'out', 'image.png')
  ];
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  return null;
}

async function transformForProfile(params: { inputBytes: Uint8Array; profile: Profile }): Promise<Uint8Array> {
  const p = params.profile;
  const sharp = await getSharp();

  let img = sharp(Buffer.from(params.inputBytes), { failOnError: false });

  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (p.cropPct > 0 && w > 0 && h > 0) {
    const cw = Math.max(1, Math.round(w * (1 - p.cropPct)));
    const ch = Math.max(1, Math.round(h * (1 - p.cropPct)));
    const left = Math.max(0, Math.floor((w - cw) / 2));
    const top = Math.max(0, Math.floor((h - ch) / 2));
    img = img.extract({ left, top, width: cw, height: ch });
  }

  img = img.resize({
    width: p.resizeMax,
    height: p.resizeMax,
    fit: 'inside',
    withoutEnlargement: true
  });

  if (p.blurSigma && p.blurSigma > 0) {
    img = img.blur(Math.max(0.3, p.blurSigma));
  }

  const out = await img
    .jpeg({ quality: p.jpegQuality, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toBuffer();

  return new Uint8Array(out);
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  const args = parseArgs(process.argv);

  const inPath = args.in ?? args.input;
  const outPath = args.out ?? args.output;
  const dumpDirArg = args.dumpDir;

  const resolvedIn = inPath || (await defaultInputImagePath());
  const base = resolvedIn ? new Uint8Array(await readFile(resolvedIn)) : await generateDefaultImagePngBytes();

  const payloadBytes = new Uint8Array([0x13, 0x37, 0xc0, 0xde, 0x52, 0x11, 0xaa, 0x10]);
  const payloadB64Url = bytesToBase64Url(payloadBytes);

  const wmCfg: PhoenixZeroImageWatermarkConfig = {
    payloadB64Url,
    payloadByteLength: 8,
    bitCount: 64,
    repeatPerBit: 2,
    brightnessDelta: 0.03,
    grid: { x: 0.1, y: 0.1, w: 0.8, h: 0.8, rows: 16, cols: 16 },
    analysisSize: 512,
    outputFormat: 'png'
  };

  const watermarked = await embedInvisibleImageWatermark({ inputBytes: base, cfg: wmCfg });
  const refDHash = await computeImageDHashB64Url({ imageBytes: watermarked.outputBytes, width: 9, height: 8 });

  const profiles: Profile[] = [
    { key: 'whatsapp', resizeMax: 1080, jpegQuality: 78, cropPct: 0.01, blurSigma: 0.2 },
    { key: 'instagram', resizeMax: 1080, jpegQuality: 85, cropPct: 0.01 },
    { key: 'tiktok', resizeMax: 1080, jpegQuality: 82, cropPct: 0.01 },
    { key: 'linkedin', resizeMax: 1200, jpegQuality: 88, cropPct: 0.0 },
    { key: 'twitter', resizeMax: 1200, jpegQuality: 85, cropPct: 0.0 },
    { key: 'telegram', resizeMax: 1280, jpegQuality: 90, cropPct: 0.0 },
    { key: 'discord', resizeMax: 1280, jpegQuality: 90, cropPct: 0.0 },
    { key: 'slack', resizeMax: 1280, jpegQuality: 90, cropPct: 0.0 },
    { key: 'youtube', resizeMax: 1920, jpegQuality: 90, cropPct: 0.0 }
  ];

  const dumpDir = dumpDirArg
    ? resolve(dumpDirArg)
    : resolve(process.cwd(), 'platform-tests', 'robustness', `image-${nowStamp()}`);
  await mkdir(dumpDir, { recursive: true });

  const maxHammingDistance = 16;
  const maxBitErrors = 2;

  const results = [] as Array<{
    platform: Profile['key'];
    ok: boolean;
    watermarkOk: boolean;
    bestBitErrors?: number;
    dhashDistance: number;
    dhashOk: boolean;
    outFile: string;
  }>;

  for (const p of profiles) {
    const outBytes = await transformForProfile({ inputBytes: watermarked.outputBytes, profile: p });

    const extract = await extractInvisibleImageWatermark({
      imageBytes: outBytes,
      cfg: wmCfg,
      expectedPayloadB64Url: wmCfg.payloadB64Url
    });

    const payloadMatch = extract.extractedPayloadB64Url === wmCfg.payloadB64Url;
    const bestBitErrors = typeof extract.bestBitErrors === 'number' ? extract.bestBitErrors : undefined;
    const watermarkOk = payloadMatch || (bestBitErrors !== undefined && bestBitErrors <= maxBitErrors);

    const dHash = await computeImageDHashB64Url({ imageBytes: outBytes, width: 9, height: 8 });
    const d = dhashHammingDistance(refDHash, dHash);
    const dhashOk = d <= maxHammingDistance;

    const outFile = join(dumpDir, `${p.key}.jpg`);
    await writeFile(outFile, Buffer.from(outBytes));

    results.push({
      platform: p.key,
      ok: watermarkOk && dhashOk,
      watermarkOk,
      bestBitErrors,
      dhashDistance: d,
      dhashOk,
      outFile
    });
  }

  const report = {
    ok: results.every((r) => r.ok),
    inputImage: resolvedIn ?? '(generated)',
    dumpDir,
    watermark: {
      payloadB64Url: wmCfg.payloadB64Url,
      bitCount: wmCfg.bitCount,
      repeatPerBit: wmCfg.repeatPerBit,
      brightnessDelta: wmCfg.brightnessDelta,
      grid: wmCfg.grid,
      analysisSize: wmCfg.analysisSize
    },
    fingerprint: { alg: 'dhash_v1', maxHammingDistance },
    maxBitErrors,
    results
  };

  const jsonPath = outPath
    ? resolve(outPath)
    : resolve(dumpDir, 'report.json');

  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  process.stdout.write(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.stack || e.message : String(e);
  process.stderr.write(`image-wm-robustness failed: ${msg}\n`);
  process.exitCode = 1;
});
