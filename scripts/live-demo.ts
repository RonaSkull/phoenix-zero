import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { base64UrlToBytes } from '@phoenix-zero/core';
import { pqPrivateKeyFromB64Url, pqPublicKeyFromB64Url, type PhoenixZeroHybridMode, type PhoenixZeroPlatform } from '@phoenix-zero/core/node';

import { createLiveSessionProof } from '../live/authenticator';
import { LiveBroadcaster } from '../live/broadcaster';
import { LiveVerifier } from '../live/verifier';
import type { PhoenixZeroLiveVerifyPolicy } from '../live/protocols/realtime';

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

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function main() {
  const args = parseArgs(process.argv);

  const inputVideoPath = args.in ?? args.input;
  if (!inputVideoPath) throw new Error('Missing --in <videoPath>');

  const outDir = args.outDir ?? './out/live';
  const segmentSeconds = args.segmentSeconds ? Number(args.segmentSeconds) : 3;
  const mode = (args.mode === 'compat' ? 'compat' : 'strict') as PhoenixZeroHybridMode;
  const policy = (args.policy === 'sig+wm+temporal' ? 'sig+wm+temporal' : 'sig+(wm|temporal)') as PhoenixZeroLiveVerifyPolicy;

  const creatorId = args.creatorId;

  const edPath = join(process.cwd(), 'keys', 'phoenix-zero-ed25519.json');
  const ed = await loadJson<{ privateKeyB64Url?: string }>(edPath);
  const privateKeyB64Url = args.privateKeyB64Url ?? process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL ?? ed.privateKeyB64Url;
  if (!privateKeyB64Url) throw new Error('Missing Ed25519 key. Run npm run keygen.');

  const pqPath = join(process.cwd(), 'keys', 'phoenix-zero-sphincs.json');
  let pq: { privateKeyB64Url?: string; publicKeyB64Url?: string } | null = null;
  try {
    pq = await loadJson(pqPath);
  } catch {
    pq = null;
  }

  const pqPrivateKeyB64Url = args.pqPrivateKeyB64Url ?? process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL ?? pq?.privateKeyB64Url;
  const pqPublicKeyB64Url = args.pqPublicKeyB64Url ?? process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL ?? pq?.publicKeyB64Url;

  if (mode === 'strict') {
    if (!pqPrivateKeyB64Url || !pqPublicKeyB64Url) throw new Error('Strict mode requires PQ keys. Run npm run pq:keygen.');
    pqPrivateKeyFromB64Url(pqPrivateKeyB64Url);
    pqPublicKeyFromB64Url(pqPublicKeyB64Url);
  }

  // quick validate ed key bytes
  base64UrlToBytes(privateKeyB64Url);

  const sessionProof = await createLiveSessionProof({
    creatorId: creatorId || undefined,
    segmentSeconds: Number.isFinite(segmentSeconds) && segmentSeconds > 0 ? segmentSeconds : 3,
    mode,
    privateKeyB64Url,
    pqPrivateKeyB64Url: pqPrivateKeyB64Url || undefined,
    pqPublicKeyB64Url: pqPublicKeyB64Url || undefined
  });

  process.stdout.write(JSON.stringify({ sessionProof }, null, 2) + '\n');

  const broadcaster = new LiveBroadcaster();
  const verifier = new LiveVerifier();

  let allOk = true;

  await broadcaster.broadcastFromFileToSegments({
    inputVideoPath,
    outDir,
    sessionProof,
    privateKeyB64Url,
    pqPrivateKeyB64Url: pqPrivateKeyB64Url || undefined,
    pqPublicKeyB64Url: pqPublicKeyB64Url || undefined,
    onSegment: async (seg) => {
      const result = await verifier.verifySegment({
        videoPath: seg.videoPath,
        segmentProof: seg.proof,
        sessionProof,
        policy
      });

      allOk = allOk && result.ok;
      process.stdout.write(JSON.stringify({ segmentIndex: seg.index, result }, null, 2) + '\n');
    }
  });

  process.exit(allOk ? 0 : 3);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
