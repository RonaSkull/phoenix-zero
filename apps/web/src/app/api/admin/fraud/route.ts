import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { phoenixZeroTmpDir } from '../../../../lib/tmp-dir';

export const runtime = 'nodejs';

function keysPath(file: string): string {
  return resolve(process.cwd(), '..', '..', 'keys', file);
}

function auditPath(): string {
  return join(phoenixZeroTmpDir(), 'fraud-events.jsonl');
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function requireAdminToken(req: Request): boolean {
  const token = process.env.PHOENIX_ZERO_ADMIN_TOKEN;
  if (!token) return true;
  const got = req.headers.get('x-admin-token') || '';
  return got === token;
}

async function readEvents(limit: number) {
  try {
    const txt = await readFile(auditPath(), 'utf8');
    const lines = txt.split('\n').filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - limit));
    const events = tail
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return events;
  } catch {
    return [];
  }
}

async function readWatchlist() {
  try {
    const txt = await readFile(keysPath('fraud-watchlist.json'), 'utf8');
    return JSON.parse(txt);
  } catch {
    return { version: 1, blockedCreators: [], blockedEd25519PublicKeys: [], blockedPqPublicKeys: [] };
  }
}

export async function GET(req: Request) {
  if (isProd()) return new Response('Not found', { status: 404 });
  if (!requireAdminToken(req)) return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });

  const u = new URL(req.url);
  const what = (u.searchParams.get('what') || 'events').toLowerCase();

  if (what === 'watchlist') {
    const watchlist = await readWatchlist();
    return Response.json({ ok: true, watchlist });
  }

  const limit = Math.min(500, Math.max(1, Number(u.searchParams.get('limit') || '50')));
  const events = await readEvents(limit);
  return Response.json({ ok: true, events });
}

export async function POST(req: Request) {
  if (isProd()) return new Response('Not found', { status: 404 });
  if (!requireAdminToken(req)) return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });

  const u = new URL(req.url);
  const what = (u.searchParams.get('what') || 'watchlist').toLowerCase();
  if (what !== 'watchlist') {
    return Response.json({ ok: false, reason: 'Unsupported action.' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as any;
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body.' }, { status: 400 });
  }

  const out = {
    version: typeof body.version === 'number' ? body.version : 1,
    blockedCreators: Array.isArray(body.blockedCreators) ? body.blockedCreators : [],
    blockedEd25519PublicKeys: Array.isArray(body.blockedEd25519PublicKeys) ? body.blockedEd25519PublicKeys : [],
    blockedPqPublicKeys: Array.isArray(body.blockedPqPublicKeys) ? body.blockedPqPublicKeys : []
  };

  await writeFile(keysPath('fraud-watchlist.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
  return Response.json({ ok: true, watchlist: out });
}
