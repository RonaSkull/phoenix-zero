import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  ed25519KeyPairFromPrivateKey,
  sha256B64Url,
  signPhoenixZeroPayload,
  phoenixZeroStableStringify
} from '@phoenix-zero/core';

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

type PhoenixZeroTemporalProofPayload = {
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
};

type PhoenixZeroTemporalProof = PhoenixZeroTemporalProofPayload & {
  signatureB64Url: string;
  proofId: string;
};

function samplesToBytes(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] ?? 0;
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const inPath = args.in ?? args.input;
  const outPath = args.out ?? args.proof;

  if (!inPath) throw new Error('Missing --in <videoPath>');
  if (!outPath) throw new Error('Missing --out <proofPath>');

  const creatorId = args.creatorId;

  const privateKeyB64Url =
    args.privateKeyB64Url ?? process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL;

  if (!privateKeyB64Url) {
    throw new Error('Missing signing key: provide --privateKeyB64Url or set PHOENIX_ZERO_PRIVATE_KEY_B64URL');
  }

  const privateKey = base64UrlToBytes(privateKeyB64Url);
  const keyPair = ed25519KeyPairFromPrivateKey(privateKey);

  const cfg: TemporalFingerprintParams = {
    fps: args.fps ? Number(args.fps) : 8,
    scale: args.scale ? Number(args.scale) : 64,
    targetLen: args.targetLen ? Number(args.targetLen) : 24,
    quant: args.quant ? Number(args.quant) : 4
  };

  const videoBytes = new Uint8Array(await readFile(inPath));
  const fileSha = sha256B64Url(videoBytes);

  const temporal = await extractTemporalFingerprint({ videoPath: inPath, cfg });
  const temporalHash = sha256B64Url(samplesToBytes(temporal.samples));

  const payload: PhoenixZeroTemporalProofPayload = {
    version: 2,
    createdAt: new Date().toISOString(),
    creatorId: creatorId || undefined,
    input: {
      byteLength: videoBytes.byteLength,
      sha256B64Url: fileSha,
      path: args.includePath === 'true' ? resolve(inPath) : undefined
    },
    temporal: {
      alg: 'signalstats_yavg_v1',
      cfg: temporal.cfg,
      samples: temporal.samples,
      hashB64Url: temporalHash
    },
    signerPublicKeyB64Url: bytesToBase64Url(keyPair.publicKey),
    signatureAlg: 'ed25519'
  };

  const signatureB64Url = signPhoenixZeroPayload({ payload, privateKey: keyPair.privateKey });
  const proofId = sha256B64Url(new TextEncoder().encode(phoenixZeroStableStringify(payload) + '.' + signatureB64Url)).slice(0, 22);

  const proof: PhoenixZeroTemporalProof = {
    ...payload,
    signatureB64Url,
    proofId
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(proof, null, 2), 'utf8');

  process.stdout.write(JSON.stringify({ ok: true, proofId, out: outPath }, null, 2) + '\n');
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
