import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { base64UrlToBytes, bytesToBase64Url, ed25519KeyPairFromPrivateKey, sha256B64Url } from '@phoenix-zero/core';
import {
  createHybridSignature,
  embedInvisibleAudioWatermark,
  extractAudioFingerprintFromAudioPath,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  type PhoenixZeroHybridMode
} from '@phoenix-zero/core/node';

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

type IssuerProof = {
  version: 5;
  createdAt: string;
  creatorId?: string;
  media: { mimeType?: string; byteLength?: number };
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
  signatureMode: PhoenixZeroHybridMode;
};

function getRandomBytes(len: number): Uint8Array {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (!g.crypto?.getRandomValues) throw new Error('crypto.getRandomValues unavailable');
  const out = new Uint8Array(len);
  g.crypto.getRandomValues(out);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const inPath = args.in ?? args.input;
  const outPath = args.out ?? args.output;
  const proofPath = args.proof;

  if (!outPath) throw new Error('Missing --out <watermarkedAudioPath>');
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

  let inputAudioPath = inPath;
  let inputBytes: Uint8Array | null = null;

  if (inputAudioPath) {
    try {
      await access(inputAudioPath);
    } catch {
      throw new Error(`Input audio not found: ${inputAudioPath}`);
    }
  } else {
    const sampleRate = 16000;
    const pcm = makeSinePcm({ seconds: 6, sampleRate, hz: 440 });
    const wav = wavFromPcmI16({ samples: pcm, sampleRate, channels: 1 });
    inputBytes = wav;
    inputAudioPath = join(process.cwd(), 'out', 'audio6s.wav');
    await mkdir(dirname(inputAudioPath), { recursive: true });
    await writeFile(inputAudioPath, Buffer.from(wav));
  }

  const watermarkCfg = {
    payloadByteLength: 4,
    bitCount: 32,
    sampleRate: 16000,
    windowMs: 25,
    repeatPerBit: 2,
    startWindow: 10,
    gainDelta: 0.08,
    maxBitErrors: 2
  };

  const wmPayload = getRandomBytes(watermarkCfg.payloadByteLength);
  const wmPayloadB64Url = bytesToBase64Url(wmPayload);

  const wmCfg = {
    payloadB64Url: wmPayloadB64Url,
    payloadByteLength: watermarkCfg.payloadByteLength,
    bitCount: watermarkCfg.bitCount,
    sampleRate: watermarkCfg.sampleRate,
    windowMs: watermarkCfg.windowMs,
    repeatPerBit: watermarkCfg.repeatPerBit,
    startWindow: watermarkCfg.startWindow,
    gainDelta: watermarkCfg.gainDelta
  };

  const fingerprintCfg = { sampleRate: 16000, frameMs: 50, targetLen: 64, quant: 4 };
  const madThreshold = 6;

  await mkdir(dirname(outPath), { recursive: true });

  await embedInvisibleAudioWatermark({ inputPath: inputAudioPath, outputPath: outPath, cfg: wmCfg });

  const outBytes = new Uint8Array(await readFile(outPath));

  const fp = await extractAudioFingerprintFromAudioPath({ audioPath: outPath, cfg: fingerprintCfg });

  const payload: IssuerProof = {
    version: 5,
    createdAt: new Date().toISOString(),
    creatorId: creatorId || undefined,
    media: { mimeType: 'audio/wav', byteLength: outBytes.byteLength },
    watermark: {
      alg: 'audio_pair_gain_delta_v1',
      payloadByteLength: wmCfg.payloadByteLength,
      payloadB64Url: wmCfg.payloadB64Url,
      bitCount: wmCfg.bitCount,
      sampleRate: wmCfg.sampleRate,
      windowMs: wmCfg.windowMs,
      repeatPerBit: wmCfg.repeatPerBit,
      startWindow: wmCfg.startWindow,
      gainDelta: wmCfg.gainDelta,
      maxBitErrors: watermarkCfg.maxBitErrors
    },
    fingerprint: {
      alg: 'abs_amp_envelope_v1',
      cfg: fp.cfg,
      samples: fp.samples,
      hashB64Url: fp.hashB64Url,
      madThreshold
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

  await mkdir(dirname(proofPath), { recursive: true });
  await writeFile(proofPath, JSON.stringify(proof, null, 2), 'utf8');

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        inputAudio: inputAudioPath,
        outAudio: outPath,
        proof: proofPath,
        signatureMode: mode,
        pqPresent: Boolean(hybridSignature.pq),
        hybridId: hybridSignature.hybridId,
        outSha256B64Url: sha256B64Url(outBytes)
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
