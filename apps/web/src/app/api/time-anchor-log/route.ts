import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from '../../../lib/tmp-dir';

export const runtime = 'nodejs';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function requireAuditToken(req: Request): boolean {
  const token = (process.env.PHOENIX_ZERO_TIME_ANCHOR_LOG_TOKEN || '').trim();
  if (!token) return true;
  const got = (req.headers.get('x-audit-token') || '').trim();
  return got === token;
}

function transparencyLogPath(): string {
  return join(phoenixZeroTmpDir(), 'time-anchors.transparency.jsonl');
}

async function readLogTail(limit: number) {
  try {
    const txt = await readFile(transparencyLogPath(), 'utf8');
    const lines = txt.split(/\r?\n/).filter(Boolean);
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
    return { totalLines: lines.length, entries };
  } catch {
    return { totalLines: 0, entries: [] as any[] };
  }
}

async function findByAnchorId(anchorId: string) {
  try {
    const txt = await readFile(transparencyLogPath(), 'utf8');
    const lines = txt.split(/\r?\n/).filter(Boolean);

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry === 'object' && (entry as any).anchorId === anchorId) {
          return { totalLines: lines.length, entry };
        }
      } catch {
      }
    }

    return { totalLines: lines.length, entry: null as any };
  } catch {
    return { totalLines: 0, entry: null as any };
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    if (!requireAuditToken(req)) {
      return Response.json(
        { ok: false, reason: 'Unauthorized' },
        { status: 401, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const u = new URL(req.url);
    const limit = Math.min(2000, Math.max(1, Number(u.searchParams.get('limit') || '50')));
    const anchorId = (u.searchParams.get('anchorId') || '').trim();

    if (anchorId) {
      const { totalLines, entry } = await findByAnchorId(anchorId);
      return Response.json(
        { ok: true, log: { format: 'time_anchors_transparency_jsonl_v1', totalLines, lastHash: '', entries: entry ? [entry] : [] } },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const { totalLines, entries } = await readLogTail(limit);

    const last = (entries[entries.length - 1] as any) ?? null;
    const lastHash = typeof last?.entryHash === 'string' ? last.entryHash : '';

    return Response.json(
      { ok: true, log: { format: 'time_anchors_transparency_jsonl_v1', totalLines, lastHash, entries } },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
