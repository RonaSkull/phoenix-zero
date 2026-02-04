import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { renderMarkdownLiteToHtml } from '../../../../lib/markdown-lite';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

async function readAgentTrustModelMd(): Promise<string> {
  const candidates = [
    join(process.cwd(), 'docs', 'pay-per-execution', '24_AGENT_TRUST_AND_ENFORCEMENT_MODEL.md'),
    join(process.cwd(), '..', 'docs', 'pay-per-execution', '24_AGENT_TRUST_AND_ENFORCEMENT_MODEL.md'),
    join(process.cwd(), '..', '..', 'docs', 'pay-per-execution', '24_AGENT_TRUST_AND_ENFORCEMENT_MODEL.md')
  ];

  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8');
    } catch {
    }
  }

  throw new Error('24_AGENT_TRUST_AND_ENFORCEMENT_MODEL.md not found');
}

function wantsHtml(req: Request): boolean {
  const url = new URL(req.url);
  const fmt = String(url.searchParams.get('format') || '').trim().toLowerCase();
  if (fmt === 'md' || fmt === 'markdown') return false;
  if (fmt === 'html') return true;
  const accept = String(req.headers.get('accept') || '').toLowerCase();
  if (!accept.includes('text/html')) return false;
  if (accept.includes('text/markdown')) return false;
  const ua = String(req.headers.get('user-agent') || '').toLowerCase();
  const looksLikeBrowser = /(mozilla|applewebkit|chrome|safari|firefox|edg)\//.test(ua);
  return looksLikeBrowser;
}

export async function GET(req: Request) {
  try {
    const md = await readAgentTrustModelMd();

    if (wantsHtml(req)) {
      const html = renderMarkdownLiteToHtml(md, { title: 'Agent Trust Model' });
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

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
