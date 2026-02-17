export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  };
}

export async function GET(_req: Request) {
  return new Response(null, { status: 410, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
