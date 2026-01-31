export const runtime = 'nodejs';

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET() {
  const commit = env('RENDER_GIT_COMMIT') || env('GIT_COMMIT') || env('VERCEL_GIT_COMMIT_SHA');
  const service = env('RENDER_SERVICE_NAME') || env('RENDER_SERVICE_ID');
  return Response.json(
    {
      ok: true,
      ts: new Date().toISOString(),
      commit: commit || null,
      service: service || null
    },
    {
      status: 200,
      headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' })
    }
  );
}
