import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const runtime = 'nodejs';

export async function GET() {
  const videoPath = resolve(process.cwd(), '..', '..', 'platform-tests', 'output', 'watermarked.mp4');
  const bytes = await readFile(videoPath);

  return new Response(bytes, {
    headers: {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store'
    }
  });
}
