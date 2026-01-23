import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { bytesToBase64Url } from '@phoenix-zero/core';
import { embedInvisibleImageWatermark } from '@phoenix-zero/core/node/watermark-image';

export const runtime = 'nodejs';

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

async function build(): Promise<{ bytes: Uint8Array }> {
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
  return { bytes: watermarked.outputBytes };
}

export async function GET() {
  const out = await build();

  const body = new ArrayBuffer(out.bytes.byteLength);
  new Uint8Array(body).set(out.bytes);

  return new Response(body, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(out.bytes.byteLength),
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    }
  });
}

export async function HEAD() {
  try {
    const out = await build();
    const size = out.bytes.byteLength;

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(size),
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
