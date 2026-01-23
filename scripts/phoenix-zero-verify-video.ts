import { readFile } from 'node:fs/promises';

import { sha256B64Url, verifyPhoenixZeroPayloadSignature } from '@phoenix-zero/core';

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

type PhoenixZeroTemporalProof = {
  version: 2;
  createdAt: string;
  creatorId?: string;
  input: {
    byteLength: number;
    sha256B64Url: string;
    path?: string;
  };
  temporal: {
    alg: 'signalstats_yavg_v1';
    cfg: TemporalFingerprintParams;
    samples: number[];
    hashB64Url: string;
  };
  signerPublicKeyB64Url: string;
  signatureAlg: 'ed25519';
  signatureB64Url: string;
  proofId: string;
};

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

async function main() {
  const args = parseArgs(process.argv);

  const inPath = args.in ?? args.input;
  const proofPath = args.proof;

  if (!inPath) throw new Error('Missing --in <videoPath>');
  if (!proofPath) throw new Error('Missing --proof <proofPath>');

  const threshold = args.threshold ? Number(args.threshold) : 12;

  const proof = JSON.parse(await readFile(proofPath, 'utf8')) as PhoenixZeroTemporalProof;

  const payload = {
    version: proof.version,
    createdAt: proof.createdAt,
    creatorId: proof.creatorId,
    input: proof.input,
    temporal: proof.temporal,
    signerPublicKeyB64Url: proof.signerPublicKeyB64Url,
    signatureAlg: proof.signatureAlg
  };

  const sigOk = verifyPhoenixZeroPayloadSignature({
    payload,
    signatureB64Url: proof.signatureB64Url,
    publicKeyB64Url: proof.signerPublicKeyB64Url
  });

  if (!sigOk) {
    process.stdout.write(JSON.stringify({ ok: false, reason: 'Invalid signature', proofId: proof.proofId }, null, 2) + '\n');
    process.exit(2);
  }

  const videoBytes = new Uint8Array(await readFile(inPath));
  const fileSha = sha256B64Url(videoBytes);
  const exactFileMatch = fileSha === proof.input.sha256B64Url;

  const extracted = await extractTemporalFingerprint({ videoPath: inPath, cfg: proof.temporal.cfg });
  const extractedHash = sha256B64Url(samplesToBytes(extracted.samples));

  const mad = meanAbsDiff(extracted.samples, proof.temporal.samples);
  const temporalMatch = mad <= threshold;

  process.stdout.write(
    JSON.stringify(
      {
        ok: temporalMatch,
        proofId: proof.proofId,
        signatureOk: true,
        exactFileMatch,
        temporal: {
          alg: proof.temporal.alg,
          threshold,
          meanAbsDiff: mad,
          referenceHash: proof.temporal.hashB64Url,
          extractedHash
        }
      },
      null,
      2
    ) + '\n'
  );

  process.exit(temporalMatch ? 0 : 3);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
