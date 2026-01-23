import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { base64UrlToBytes, createPhoenixZeroProof, ed25519KeyPairFromPrivateKey } from '@phoenix-zero/core';

export const runtime = 'nodejs';

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadSigningKeyB64Url(): Promise<string> {
  const envKey = (process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL || '').trim();
  if (envKey) return envKey;

  const fromFile = await readJsonMaybe<{ privateKeyB64Url?: string }>(
    resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-ed25519.json')
  );
  const key = (fromFile?.privateKeyB64Url || '').trim();
  if (!key) throw new Error('Missing signing key. Set PHOENIX_ZERO_PRIVATE_KEY_B64URL or create keys/phoenix-zero-ed25519.json.');
  return key;
}

async function pickImagePath(): Promise<string | null> {
  const preferred = resolve(process.cwd(), '..', '..', 'platform-tests', 'demo-assets', 'v1', 'image.png');
  try {
    await access(preferred);
    return preferred;
  } catch {
    return null;
  }
}

function fallbackPngBytes(): Uint8Array {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAwMCAO5w2igAAAAASUVORK5CYII=';
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function getImageBytes(): Promise<Uint8Array> {
  const imagePath = await pickImagePath();
  return imagePath ? new Uint8Array(await readFile(imagePath)) : fallbackPngBytes();
}

export async function GET() {
  try {
    const privateKeyB64Url = await loadSigningKeyB64Url();
    const keyPair = ed25519KeyPairFromPrivateKey(base64UrlToBytes(privateKeyB64Url));

    const imageBytes = await getImageBytes();

    const proof = createPhoenixZeroProof({
      videoBytes: imageBytes,
      keyPair,
      creatorId: 'demo',
      mimeType: 'image/png'
    });

    const out = new TextEncoder().encode(JSON.stringify(proof, null, 2));
    return new Response(out, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: msg }, { status: 500 });
  }
}

export async function HEAD() {
  try {
    const res = await GET();
    if (!res.ok) return new Response(null, { status: res.status });
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
