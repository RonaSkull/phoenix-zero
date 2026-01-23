import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

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
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/xcAAwMCAO5w2igAAAAASUVORK5CYII=';
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export async function GET() {
  const imagePath = await pickImagePath();
  const bytes = imagePath ? new Uint8Array(await readFile(imagePath)) : fallbackPngBytes();

  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);

  return new Response(body, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    }
  });
}

export async function HEAD() {
  try {
    const imagePath = await pickImagePath();
    const size = imagePath ? (await stat(imagePath)).size : fallbackPngBytes().byteLength;
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
