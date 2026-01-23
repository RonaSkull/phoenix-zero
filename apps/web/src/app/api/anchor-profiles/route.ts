import { ANCHOR_PROFILES } from '../../../lib/anchor-profiles';

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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  const profiles = Object.values(ANCHOR_PROFILES)
    .slice()
    .sort((a, b) => {
      const ak = a.kind === 'live' ? 0 : 1;
      const bk = b.kind === 'live' ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return a.label.localeCompare(b.label);
    });

  return Response.json(
    { ok: true, profiles },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
