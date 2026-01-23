import { readFile } from 'node:fs/promises';

import {
  extractAudioFingerprintFromAudioPath,
  extractInvisibleAudioWatermark,
  meanAbsDiff,
  verifyHybridSignature
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

type Proof = {
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
    maxBitErrors?: number;
  };
  fingerprint?: {
    alg: 'abs_amp_envelope_v1';
    cfg: { sampleRate: number; frameMs: number; targetLen: number; quant: number };
    samples: number[];
    hashB64Url: string;
    madThreshold: number;
  };
  signatureMode: 'compat' | 'strict';
  hybridSignature: any;
};

async function main() {
  const args = parseArgs(process.argv);
  const inPath = args.in ?? args.input;
  const proofPath = args.proof;

  if (!inPath) throw new Error('Missing --in <audioPath>');
  if (!proofPath) throw new Error('Missing --proof <proofPath>');

  const proof = JSON.parse(await readFile(proofPath, 'utf8')) as Proof;
  if (proof.version !== 5) throw new Error('Unsupported proof version.');

  const payload = {
    version: proof.version,
    createdAt: proof.createdAt,
    creatorId: proof.creatorId,
    media: proof.media,
    watermark: proof.watermark,
    fingerprint: proof.fingerprint,
    signatureMode: proof.signatureMode
  };

  const sigResult = await verifyHybridSignature({ payload, sig: proof.hybridSignature });

  const wmCfg = {
    payloadB64Url: proof.watermark.payloadB64Url,
    payloadByteLength: proof.watermark.payloadByteLength,
    bitCount: proof.watermark.bitCount,
    sampleRate: proof.watermark.sampleRate,
    windowMs: proof.watermark.windowMs,
    repeatPerBit: proof.watermark.repeatPerBit,
    startWindow: proof.watermark.startWindow,
    gainDelta: proof.watermark.gainDelta
  };

  const wm = await extractInvisibleAudioWatermark({
    audioPath: inPath,
    cfg: wmCfg,
    expectedPayloadB64Url: proof.watermark.payloadB64Url
  });

  const watermarkMatch = wm.extractedPayloadB64Url === proof.watermark.payloadB64Url;
  const maxBitErrors = Number.isFinite(proof.watermark.maxBitErrors) ? Number(proof.watermark.maxBitErrors) : 2;
  const bestBitErrors = typeof wm.bestBitErrors === 'number' ? wm.bestBitErrors : undefined;
  const watermarkOk = watermarkMatch || (bestBitErrors !== undefined && bestBitErrors <= maxBitErrors);

  let fingerprint: any = { present: false, ok: true as const };

  if (proof.fingerprint?.alg === 'abs_amp_envelope_v1') {
    const extracted = await extractAudioFingerprintFromAudioPath({ audioPath: inPath, cfg: proof.fingerprint.cfg });
    const mad = meanAbsDiff(extracted.samples, proof.fingerprint.samples);
    const threshold = proof.fingerprint.madThreshold;
    fingerprint = {
      present: true,
      ok: mad <= threshold,
      mad,
      threshold,
      referenceHash: proof.fingerprint.hashB64Url,
      extractedHash: extracted.hashB64Url
    };
  }

  const ok = sigResult.ok && watermarkOk && (fingerprint.present ? fingerprint.ok : true);

  process.stdout.write(
    JSON.stringify(
      {
        ok,
        signature: sigResult,
        watermark: {
          ok: watermarkOk,
          expectedPayloadB64Url: proof.watermark.payloadB64Url,
          extractedPayloadB64Url: wm.extractedPayloadB64Url,
          bestBitErrors,
          maxBitErrors,
          threshold: wm.threshold,
          polarity: wm.polarity
        },
        fingerprint
      },
      null,
      2
    ) + '\n'
  );

  process.exit(ok ? 0 : 3);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
