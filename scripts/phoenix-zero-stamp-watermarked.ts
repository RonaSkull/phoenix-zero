import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  ed25519KeyPairFromPrivateKey,
  sha256B64Url
} from '@phoenix-zero/core';

import {
  createHybridSignature,
  embedInvisibleWatermark,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  selectWatermarkedPreset,
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

type PhoenixZeroWatermarkedProofPayload = {
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
  media: {
    mimeType?: string;
    byteLength?: number;
  };
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
    repeatPerBit: number;
    brightnessDelta: number;
    roi?: { x: number; y: number; w: number; h: number };
    rois?: { x: number; y: number; w: number; h: number }[];
  };
  signatureMode: 'compat' | 'strict';
};

type PhoenixZeroWatermarkedProof = PhoenixZeroWatermarkedProofPayload & {
  hybridSignature: Awaited<ReturnType<typeof createHybridSignature>>;
};

function samplesToBytes(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] ?? 0;
  return out;
}

function getRandomBytes(len: number): Uint8Array {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (!g.crypto?.getRandomValues) throw new Error('crypto.getRandomValues unavailable');
  const out = new Uint8Array(len);
  g.crypto.getRandomValues(out);
  return out;
}

async function loadJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const inPath = args.in ?? args.input;
  const outPath = args.out ?? args.output;
  const proofPath = args.proof;

  if (!inPath) throw new Error('Missing --in <videoPath>');
  if (!outPath) throw new Error('Missing --out <watermarkedVideoPath>');
  if (!proofPath) throw new Error('Missing --proof <proofPath>');

  try {
    await access(inPath);
  } catch {
    throw new Error(`Input video not found: ${inPath}`);
  }

  const creatorId = args.creatorId;

  const mode = (args.mode === 'strict' ? 'strict' : 'compat') as 'compat' | 'strict';

  const platform = (args.platform as PhoenixZeroPlatform | undefined) ?? undefined;
  const presetId = args.presetId ?? args.preset;
  const preset = await selectWatermarkedPreset({ videoPath: inPath, platform, presetId });

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

  // Watermark payload: 2 bytes (16 bits) for 3s videos.
  const wmPayload = getRandomBytes(preset.watermark.payloadByteLength);
  const wmPayloadB64Url = bytesToBase64Url(wmPayload);

  const wmCfg = {
    payloadB64Url: wmPayloadB64Url,
    payloadByteLength: preset.watermark.payloadByteLength,
    bitCount: preset.watermark.bitCount,
    startFrame: args.startFrame ? Number(args.startFrame) : preset.watermark.startFrame,
    frameInterval: args.frameInterval ? Number(args.frameInterval) : preset.watermark.frameInterval,
    repeatPerBit: args.repeatPerBit ? Number(args.repeatPerBit) : preset.watermark.repeatPerBit,
    brightnessDelta: args.brightnessDelta ? Number(args.brightnessDelta) : preset.watermark.brightnessDelta,
    roi: preset.watermark.roi,
    rois: preset.watermark.rois
  };

  await mkdir(dirname(outPath), { recursive: true });

  await embedInvisibleWatermark({ inputPath: inPath, outputPath: outPath, cfg: wmCfg });

  const temporalCfg: TemporalFingerprintParams = {
    fps: args.fps ? Number(args.fps) : preset.temporal.fps,
    scale: args.scale ? Number(args.scale) : preset.temporal.scale,
    targetLen: args.targetLen ? Number(args.targetLen) : preset.temporal.targetLen,
    quant: args.quant ? Number(args.quant) : preset.temporal.quant
  };

  const temporal = await extractTemporalFingerprint({ videoPath: outPath, cfg: temporalCfg });
  const temporalHash = sha256B64Url(samplesToBytes(temporal.samples));

  const madThreshold = args.madThreshold ? Number(args.madThreshold) : preset.madThreshold;

  const payload: PhoenixZeroWatermarkedProofPayload = {
    version: 3,
    createdAt: new Date().toISOString(),
    creatorId: creatorId || undefined,
    preset: {
      id: preset.id,
      platform: preset.platform,
      durationSeconds: preset.durationSeconds,
      watermarkVerify: preset.watermarkVerify
    },
    media: {
      mimeType: args.mimeType
    },
    temporal: {
      alg: 'signalstats_yavg_v1',
      cfg: temporal.cfg,
      samples: temporal.samples,
      hashB64Url: temporalHash,
      madThreshold
    },
    watermark: {
      alg: 'roi_luma_delta_v1',
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
    signatureMode: mode
  };

  let pqKeys:
    | {
        alg: 'sphincs';
        privateKey: Uint8Array;
        publicKey: Uint8Array;
      }
    | undefined;

  const localPqKey = await loadJsonIfExists<{ privateKeyB64Url?: string; publicKeyB64Url?: string }>(
    join(process.cwd(), 'keys', 'phoenix-zero-sphincs.json')
  );

  const pqPriv =
    args.pqPrivateKeyB64Url ?? process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL ?? localPqKey?.privateKeyB64Url;
  const pqPub =
    args.pqPublicKeyB64Url ?? process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL ?? localPqKey?.publicKeyB64Url;

  if (pqPriv && pqPub) {
    pqKeys = {
      alg: 'sphincs',
      privateKey: pqPrivateKeyFromB64Url(pqPriv),
      publicKey: pqPublicKeyFromB64Url(pqPub)
    };
  } else if (mode === 'strict') {
    // strict mode requires PQ signature.
    // If no key provided, generate ephemeral PQ keys.
    const kp = await generateSphincsKeyPair();
    pqKeys = { alg: 'sphincs', privateKey: kp.privateKey, publicKey: kp.publicKey };
  }

  const hybridSignature = await createHybridSignature({
    payload,
    mode,
    ed25519: { privateKey: edKeyPair.privateKey, publicKey: edKeyPair.publicKey },
    pq: pqKeys
  });

  const proof: PhoenixZeroWatermarkedProof = {
    ...payload,
    hybridSignature
  };

  await mkdir(dirname(proofPath), { recursive: true });
  await writeFile(proofPath, JSON.stringify(proof, null, 2), 'utf8');

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        outVideo: outPath,
        proof: proofPath,
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
