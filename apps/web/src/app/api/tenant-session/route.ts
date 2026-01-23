import { resolveTenantBySessionToken } from '../../../lib/tenants';

export const runtime = 'nodejs';

function cookieOptions(): { secure: boolean; maxAgeSeconds: number } {
  const secure = process.env.NODE_ENV === 'production';
  const maxAgeSeconds = 7 * 24 * 3600;
  return { secure, maxAgeSeconds };
}

function setTenantSessionCookie(sessionToken: string): string {
  const { secure, maxAgeSeconds } = cookieOptions();
  const parts = [
    `pz_tenant_session=${encodeURIComponent(sessionToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function safeNextPath(raw: string | null): string {
  const v = (raw || '').trim();
  if (!v) return '/';
  if (!v.startsWith('/')) return '/';
  if (v.startsWith('//')) return '/';
  return v;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const sessionToken = (u.searchParams.get('token') || u.searchParams.get('sessionToken') || '').trim();
    if (!sessionToken) {
      return Response.json({ ok: false, reason: 'Missing token' }, { status: 400 });
    }

    const resolved = await resolveTenantBySessionToken(sessionToken);
    if (!resolved.ok) {
      return Response.json({ ok: false, reason: resolved.reason }, { status: 401 });
    }

    const nextPath = safeNextPath(u.searchParams.get('next'));

    return new Response(null, {
      status: 302,
      headers: {
        Location: nextPath,
        'Set-Cookie': setTenantSessionCookie(sessionToken)
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as null | { sessionToken?: string };
    const sessionToken = (body?.sessionToken || '').trim();
    if (!sessionToken) {
      return Response.json({ ok: false, reason: 'Missing sessionToken' }, { status: 400 });
    }

    const resolved = await resolveTenantBySessionToken(sessionToken);
    if (!resolved.ok) {
      return Response.json({ ok: false, reason: resolved.reason }, { status: 401 });
    }

    return Response.json(
      { ok: true, tenantId: resolved.tenantId, tenantName: resolved.tenant.name },
      { status: 200, headers: { 'Set-Cookie': setTenantSessionCookie(sessionToken) } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}
