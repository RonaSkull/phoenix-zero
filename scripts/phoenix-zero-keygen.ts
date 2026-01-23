import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { bytesToBase64Url, generateEd25519KeyPair } from '@phoenix-zero/core';

async function main() {
  const kp = generateEd25519KeyPair();

  const outDir = join(process.cwd(), 'keys');
  await mkdir(outDir, { recursive: true });

  const privateKeyB64Url = bytesToBase64Url(kp.privateKey);
  const publicKeyB64Url = bytesToBase64Url(kp.publicKey);

  const payload = {
    alg: 'ed25519',
    privateKeyB64Url,
    publicKeyB64Url
  };

  const outFile = join(outDir, 'phoenix-zero-ed25519.json');
  await writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');

  console.log('Saved:', outFile);
  console.log('PHOENIX_ZERO_PRIVATE_KEY_B64URL=' + privateKeyB64Url);
  console.log('PHOENIX_ZERO_PUBLIC_KEY_B64URL=' + publicKeyB64Url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
