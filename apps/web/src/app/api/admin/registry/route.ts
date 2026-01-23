import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  publishSignedCreatorRegistry,
  readCreatorRegistrySignature,
  verifyCreatorRegistrySignature
} from '../../../../lib/registry-signing';

export const runtime = 'nodejs';

function keysPath(file: string): string {
  return resolve(process.cwd(), '..', '..', 'keys', file);
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

async function readLogTail(limit: number) {
  try {
    const txt = await readFile(keysPath('creator-registry.transparency.jsonl'), 'utf8');
    const lines = txt.split('\n').filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - limit));
    const entries = tail
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return entries;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  if (isProd()) return new Response('Not found', { status: 404 });
  if (!requireAdminToken(req)) return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });

  const u = new URL(req.url);
  const what = (u.searchParams.get('what') || 'status').toLowerCase();

  if (what === 'signature') {
    const signature = await readCreatorRegistrySignature();
    return Response.json({ ok: true, signature });
  }

  if (what === 'verify') {
    const verified = await verifyCreatorRegistrySignature();
    return Response.json({ ok: true, verified });
  }

  if (what === 'log') {
    const limit = Math.min(500, Math.max(1, Number(u.searchParams.get('limit') || '20')));
    const entries = await readLogTail(limit);
    return Response.json({ ok: true, entries });
  }

  const signature = await readCreatorRegistrySignature();
  const verified = await verifyCreatorRegistrySignature();
  return Response.json({ ok: true, signature, verified });
}

export async function POST(req: Request) {
  if (isProd()) return new Response('Not found', { status: 404 });
  if (!requireAdminToken(req)) return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 401 });

  const u = new URL(req.url);
  const action = (u.searchParams.get('action') || 'publish').toLowerCase();

  if (action !== 'publish') {
    return Response.json({ ok: false, reason: 'Unsupported action.' }, { status: 400 });
  }

  const signature = await publishSignedCreatorRegistry();
  const verified = await verifyCreatorRegistrySignature();
  return Response.json({ ok: true, signature, verified });
}
