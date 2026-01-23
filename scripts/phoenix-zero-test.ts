import {
  createPhoenixZeroProof,
  encodeProofToCompactString,
  decodeProofFromCompactString,
  generateEd25519KeyPair,
  phoenixZeroProofId,
  verifyPhoenixZeroProof
} from '@phoenix-zero/core';

function randomBytes(len: number): Uint8Array {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (!g.crypto?.getRandomValues) throw new Error('crypto.getRandomValues unavailable');
  const out = new Uint8Array(len);
  g.crypto.getRandomValues(out);
  return out;
}

async function main() {
  const keyPair = generateEd25519KeyPair();
  const videoBytes = randomBytes(4096);

  const proof = createPhoenixZeroProof({ videoBytes, keyPair, creatorId: '@test', mimeType: 'video/mp4' });
  const proofId = phoenixZeroProofId(proof);
  const compact = encodeProofToCompactString(proof);
  const decoded = decodeProofFromCompactString(compact);

  const ok1 = verifyPhoenixZeroProof({ videoBytes, proof: decoded });
  if (!ok1.ok) throw new Error('Expected ok, got: ' + ok1.reason);

  const tampered = new Uint8Array(videoBytes);
  tampered[0] = (tampered[0] + 1) % 255;

  const ok2 = verifyPhoenixZeroProof({ videoBytes: tampered, proof: decoded });
  if (ok2.ok) throw new Error('Expected failure after tamper');

  console.log('OK');
  console.log('proofId:', proofId);
  console.log('tamper check:', ok2.reason);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
