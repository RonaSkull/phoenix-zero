import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

import { base64UrlToBytes, bytesToBase64Url, ed25519KeyPairFromPrivateKey } from '@phoenix-zero/core';
import {
  createHybridSignature,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  type PhoenixZeroHybridMode
} from '@phoenix-zero/core/node';

import { computeImageDHashB64Url, embedInvisibleImageWatermark } from '@phoenix-zero/core/node/watermark-image';

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

async function loadJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
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

    const msg = lastErr instanceof Error ? lastErr.message : 'Unknown error';
    throw new Error(`cannot load sharp: ${msg}`);
  }
}

async function defaultBaseImageBytes(): Promise<Uint8Array> {
  const preferred = resolve(process.cwd(), 'platform-tests', 'demo-assets', 'v1', 'image.png');
  try {
    await access(preferred);
    return new Uint8Array(await readFile(preferred));
  } catch {
  }

  const sharp = await getSharp();
  const out = (await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: { r: 120, g: 120, b: 120 }
    }
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()) as Buffer;

  return new Uint8Array(out);
}

type IssuerProof = {
  version: 4;
  createdAt: string;
  creatorId?: string;
  media: { mimeType?: string; byteLength: number };
  watermark: {
    alg: 'grid_luma_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    repeatPerBit: number;
    brightnessDelta: number;
    maxBitErrors: number;
    grid: { x: number; y: number; w: number; h: number; rows: number; cols: number };
    analysisSize: number;
  };
  fingerprint: {
    alg: 'dhash_v1';
    width: number;
    height: number;
    valueB64Url: string;
    maxHammingDistance: number;
  };
  signatureMode: PhoenixZeroHybridMode;
};

async function main() {
  const args = parseArgs(process.argv);

  const inPath = args.in ?? args.input;
  const outPath = args.out ?? args.output;
  const proofPath = args.proof;

  if (!outPath) throw new Error('Missing --out <watermarkedImagePath>');
  if (!proofPath) throw new Error('Missing --proof <proofPath>');

  const mode = (args.mode === 'strict' ? 'strict' : 'compat') as PhoenixZeroHybridMode;
  const creatorId = args.creatorId;

  const localEdKey = await loadJsonIfExists<{ privateKeyB64Url?: string }>(
    join(process.cwd(), 'keys', 'phoenix-zero-ed25519.json')
  );

  const edPrivateKeyB64Url =
    args.privateKeyB64Url ?? process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL ?? localEdKey?.privateKeyB64Url;

  if (!edPrivateKeyB64Url) {
    throw new Error(
      'Missing Ed25519 signing key: provide --privateKeyB64Url or set PHOENIX_ZERO_PRIVATE_KEY_B64URL (or run npm run keygen)'
    );
  }

  const edKeyPair = ed25519KeyPairFromPrivateKey(base64UrlToBytes(edPrivateKeyB64Url));

  let inputBytes: Uint8Array;
  if (inPath) {
    try {
      await access(inPath);
      inputBytes = new Uint8Array(await readFile(inPath));
    } catch {
      throw new Error(`Input image not found: ${inPath}`);
    }
  } else {
    inputBytes = await defaultBaseImageBytes();
  }

  const payloadByteLength = 8;
  const bitCount = 64;
  const repeatPerBit = 2;
  const maxBitErrors = 2;
  const analysisSize = 512;

  const wmPayload = new Uint8Array(payloadByteLength);
  {
    const g = globalThis as unknown as { crypto?: Crypto };
    if (!g.crypto?.getRandomValues) throw new Error('crypto.getRandomValues unavailable');
    g.crypto.getRandomValues(wmPayload);
  }

  const wmPayloadB64Url = bytesToBase64Url(wmPayload);

  const outputFormat = (args.outputFormat === 'jpeg' ? 'jpeg' : 'png') as 'png' | 'jpeg';
  const jpegQuality = args.jpegQuality ? Number(args.jpegQuality) : undefined;

  const wmCfg = {
    payloadB64Url: wmPayloadB64Url,
    payloadByteLength,
    bitCount,
    repeatPerBit,
    brightnessDelta: 0.03,
    grid: { x: 0.1, y: 0.1, w: 0.8, h: 0.8, rows: 16, cols: 16 },
    analysisSize,
    outputFormat,
    jpegQuality
  };

  const watermarked = await embedInvisibleImageWatermark({ inputBytes, cfg: wmCfg });

  const dhashWidth = 9;
  const dhashHeight = 8;
  const dhash = await computeImageDHashB64Url({ imageBytes: watermarked.outputBytes, width: dhashWidth, height: dhashHeight });
  const maxHammingDistance = 14;

  const payload: IssuerProof = {
    version: 4,
    createdAt: new Date().toISOString(),
    creatorId: creatorId || undefined,
    media: { mimeType: watermarked.mimeType, byteLength: watermarked.outputBytes.byteLength },
    watermark: {
      alg: 'grid_luma_delta_v1',
      payloadByteLength,
      payloadB64Url: wmPayloadB64Url,
      bitCount,
      repeatPerBit,
      brightnessDelta: wmCfg.brightnessDelta,
      maxBitErrors,
      grid: wmCfg.grid,
      analysisSize
    },
    fingerprint: {
      alg: 'dhash_v1',
      width: dhashWidth,
      height: dhashHeight,
      valueB64Url: dhash,
      maxHammingDistance
    },
    signatureMode: mode
  };

  const localPqKey = await loadJsonIfExists<{ privateKeyB64Url?: string; publicKeyB64Url?: string }>(
    join(process.cwd(), 'keys', 'phoenix-zero-sphincs.json')
  );

  const pqPriv = args.pqPrivateKeyB64Url ?? process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL ?? localPqKey?.privateKeyB64Url;
  const pqPub = args.pqPublicKeyB64Url ?? process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL ?? localPqKey?.publicKeyB64Url;

  let pqKeys:
    | {
        alg: 'sphincs';
        privateKey: Uint8Array;
        publicKey: Uint8Array;
      }
    | undefined;

  if (pqPriv && pqPub) {
    pqKeys = { alg: 'sphincs', privateKey: pqPrivateKeyFromB64Url(pqPriv), publicKey: pqPublicKeyFromB64Url(pqPub) };
  } else if (mode === 'strict') {
    const kp = await generateSphincsKeyPair();
    pqKeys = { alg: 'sphincs', privateKey: kp.privateKey, publicKey: kp.publicKey };
  }

  const hybridSignature = await createHybridSignature({
    payload,
    mode,
    ed25519: { privateKey: edKeyPair.privateKey, publicKey: edKeyPair.publicKey },
    pq: pqKeys
  });

  const proof = { ...payload, hybridSignature };

  await mkdir(dirname(outPath), { recursive: true });
  await mkdir(dirname(proofPath), { recursive: true });

  await writeFile(outPath, Buffer.from(watermarked.outputBytes));
  await writeFile(proofPath, JSON.stringify(proof, null, 2), 'utf8');

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        outImage: outPath,
        proof: proofPath,
        mimeType: watermarked.mimeType,
        signatureMode: mode,
        pqPresent: Boolean(hybridSignature.pq),
        hybridId: hybridSignature.hybridId
      },
      null,
      2
    ) + '\n'
  );
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
