import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { pqKeyToB64Url, generateSphincsKeyPair } from '@phoenix-zero/core/node';

async function main() {
  const kp = await generateSphincsKeyPair();

  const outDir = join(process.cwd(), 'keys');
  await mkdir(outDir, { recursive: true });

  const payload = {
    alg: 'sphincs',
    privateKeyB64Url: pqKeyToB64Url(kp.privateKey),
    publicKeyB64Url: pqKeyToB64Url(kp.publicKey)
  };

  const outFile = join(outDir, 'phoenix-zero-sphincs.json');
  await writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');

  console.log('Saved:', outFile);
  console.log('PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL=' + payload.privateKeyB64Url);
  console.log('PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL=' + payload.publicKeyB64Url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
