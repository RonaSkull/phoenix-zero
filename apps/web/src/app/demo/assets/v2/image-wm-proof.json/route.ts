import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { base64UrlToBytes, bytesToBase64Url, ed25519KeyPairFromPrivateKey } from '@phoenix-zero/core';
import {
  createHybridSignature,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url
} from '@phoenix-zero/core/node';

import { computeImageDHashB64Url, embedInvisibleImageWatermark } from '@phoenix-zero/core/node/watermark-image';

import { maybeCreateIssuerAttestation } from '../../../../../lib/issuer-attestation';

export const runtime = 'nodejs';

type KeyFile = { privateKeyB64Url?: string };

type IssuerProof = {
  version: 4;
  createdAt: string;
  creatorId?: string;
  media: {
    mimeType?: string;
    byteLength: number;
  };
  watermark: {
    alg: 'grid_luma_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    repeatPerBit: number;
    brightnessDelta: number;
    maxBitErrors: number;
    grid: {
      x: number;
      y: number;
      w: number;
      h: number;
      rows: number;
      cols: number;
    };
    analysisSize: number;
  };
  fingerprint: {
    alg: 'dhash_v1';
    width: number;
    height: number;
    valueB64Url: string;
    maxHammingDistance: number;
  };
  signatureMode: 'compat' | 'strict';
};

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

  const fromFile = await readJsonMaybe<KeyFile>(resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-ed25519.json'));
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
  const w = 512;
  const h = 512;
  const buf = Buffer.alloc(w * h * 3, 128);
  return new Uint8Array(buf);
}

async function getBaseImageBytes(): Promise<Uint8Array> {
  const imagePath = await pickImagePath();
  if (imagePath) return new Uint8Array(await readFile(imagePath));

  const raw = fallbackPngBytes();
  const sharpMod = (await import('sharp')) as unknown as { default?: unknown };
  const sharp = (sharpMod as any).default ?? sharpMod;
  const out = (await sharp(Buffer.from(raw), { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer()) as Buffer;
  return new Uint8Array(out);
}

async function buildWatermarkedBytes(): Promise<Uint8Array> {
  const base = await getBaseImageBytes();

  const payloadBytes = new Uint8Array([0x13, 0x37, 0xc0, 0xde, 0x52, 0x11, 0xaa, 0x10]);
  const payloadB64Url = bytesToBase64Url(payloadBytes);

  const wmCfg = {
    payloadB64Url,
    payloadByteLength: 8,
    bitCount: 64,
    repeatPerBit: 2,
    brightnessDelta: 0.03,
    grid: { x: 0.1, y: 0.1, w: 0.8, h: 0.8, rows: 16, cols: 16 },
    analysisSize: 512,
    outputFormat: 'png' as const
  };

  const watermarked = await embedInvisibleImageWatermark({ inputBytes: base, cfg: wmCfg });
  return watermarked.outputBytes;
}

export async function GET() {
  try {
    const privateKeyB64Url = await loadSigningKeyB64Url();
    const edKeyPair = ed25519KeyPairFromPrivateKey(base64UrlToBytes(privateKeyB64Url));

    const imageBytes = await buildWatermarkedBytes();

    const dhashWidth = 9;
    const dhashHeight = 8;
    const dhash = await computeImageDHashB64Url({ imageBytes, width: dhashWidth, height: dhashHeight });
    const maxHammingDistance = 14;

    const payloadBytes = new Uint8Array([0x13, 0x37, 0xc0, 0xde, 0x52, 0x11, 0xaa, 0x10]);
    const payloadB64Url = bytesToBase64Url(payloadBytes);

    const analysisSize = 512;

    const proofPayload: IssuerProof = {
      version: 4,
      createdAt: new Date().toISOString(),
      creatorId: 'demo',
      media: { mimeType: 'image/png', byteLength: imageBytes.byteLength },
      watermark: {
        alg: 'grid_luma_delta_v1',
        payloadByteLength: 8,
        payloadB64Url,
        bitCount: 64,
        repeatPerBit: 2,
        brightnessDelta: 0.03,
        maxBitErrors: 2,
        grid: { x: 0.1, y: 0.1, w: 0.8, h: 0.8, rows: 16, cols: 16 },
        analysisSize
      },
      fingerprint: { alg: 'dhash_v1', width: dhashWidth, height: dhashHeight, valueB64Url: dhash, maxHammingDistance },
      signatureMode: 'compat'
    };

    let pqKeys:
      | {
          alg: 'sphincs';
          privateKey: Uint8Array;
          publicKey: Uint8Array;
        }
      | undefined;

    const pqPriv = process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL;
    const pqPub = process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL;

    const pqFromFile = await readJsonMaybe<{ privateKeyB64Url?: string; publicKeyB64Url?: string }>(
      resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-sphincs.json')
    );

    const pqPriv2 = pqPriv ?? pqFromFile?.privateKeyB64Url;
    const pqPub2 = pqPub ?? pqFromFile?.publicKeyB64Url;

    if (pqPriv2 && pqPub2) {
      pqKeys = {
        alg: 'sphincs',
        privateKey: pqPrivateKeyFromB64Url(pqPriv2),
        publicKey: pqPublicKeyFromB64Url(pqPub2)
      };
    }

    const hybridSignature = await createHybridSignature({
      payload: proofPayload,
      mode: 'compat',
      ed25519: { privateKey: edKeyPair.privateKey, publicKey: edKeyPair.publicKey },
      pq: pqKeys
    });

    const issuerAttestation = await maybeCreateIssuerAttestation({ hybridId: hybridSignature.hybridId, creatorId: 'demo' });

    const proof = {
      ...proofPayload,
      hybridSignature,
      issuerAttestation: issuerAttestation ?? undefined
    };

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
