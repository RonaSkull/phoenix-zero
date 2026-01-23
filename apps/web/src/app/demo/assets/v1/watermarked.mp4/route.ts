import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export const runtime = 'nodejs';

async function pickVideoPath(): Promise<string> {
  const preferred = resolve(process.cwd(), '..', '..', 'platform-tests', 'demo-assets', 'v1', 'watermarked.mp4');
  try {
    await access(preferred);
    return preferred;
  } catch {
    return resolve(process.cwd(), '..', '..', 'platform-tests', 'output', 'watermarked.mp4');
  }
}

export async function GET() {
  const videoPath = await pickVideoPath();
  const bytes = await readFile(videoPath);

  return new Response(bytes, {
    headers: {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store'
    }
  });
}

export async function HEAD() {
  try {
    const videoPath = await pickVideoPath();
    const info = await stat(videoPath);
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(info.size),
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
