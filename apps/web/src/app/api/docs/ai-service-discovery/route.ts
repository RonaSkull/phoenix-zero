import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

async function readAiServiceDiscoveryMd(): Promise<string> {
  const candidates = [
    join(process.cwd(), 'docs', 'AI_SERVICE_DISCOVERY.md'),
    join(process.cwd(), '..', 'docs', 'AI_SERVICE_DISCOVERY.md'),
    join(process.cwd(), '..', '..', 'docs', 'AI_SERVICE_DISCOVERY.md')
  ];

  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8');
    } catch {
    }
  }

  throw new Error('AI_SERVICE_DISCOVERY.md not found');
}

export async function GET() {
  try {
    const md = await readAiServiceDiscoveryMd();
    return new Response(md, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: 'DOC_NOT_FOUND', error: msg },
      { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
