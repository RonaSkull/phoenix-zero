export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET() {
  return Response.json(
    {
      ok: true,
      ts: new Date().toISOString()
    },
    {
      status: 200,
      headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' })
    }
  );
}
