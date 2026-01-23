import { createTenant, issueTenantSession, listTenants } from '../../../../lib/tenants';
import { requireAdminToken } from '../../../../lib/tenant-auth';

export const runtime = 'nodejs';

function requestBase(req: Request): string {
  const u = new URL(req.url);
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').trim();
  const proto = (req.headers.get('x-forwarded-proto') || u.protocol.replace(':', '') || 'http').trim();
  if (!host) return `${u.protocol}//${u.host}`;
  return `${proto}://${host}`;
}

function safeNextPath(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return '/';
  if (!v.startsWith('/')) return '/';
  if (v.startsWith('//')) return '/';
  return v;
}

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status });
  }
  try {
    const tenants = (await listTenants()).map((t) => ({
      tenantId: t.tenantId,
      createdAt: t.createdAt,
      status: t.status,
      name: t.name,
      clientType: t.clientType,
      sector: t.sector,
      country: t.country,
      currency: t.currency,
      pricingProfile: t.pricingProfile,
      commissionProfile: t.commissionProfile,
      taxProfile: t.taxProfile
    }));
    return Response.json(
      { ok: true, tenants },
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status });
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | null
      | {
          name?: string;
          clientType?: string;
          sector?: string;
          country?: string;
          currency?: string;
          pricingProfile?: string;
          commissionProfile?: string;
          taxProfile?: string;
          sessionTtlSeconds?: number;
          next?: string;
        };

    const name = (body?.name || '').trim();
    const clientType = (body?.clientType || 'unknown').trim();
    const sector = (body?.sector || 'unknown').trim();
    const country = (body?.country || 'unknown').trim();
    const currency = (body?.currency || 'USD').trim();
    const pricingProfile = (body?.pricingProfile || 'default').trim();
    const commissionProfile = (body?.commissionProfile || 'default').trim();
    const taxProfile = (body?.taxProfile || 'default').trim();

    if (!name) {
      return Response.json({ ok: false, reason: 'Missing name' }, { status: 400 });
    }

    const created = await createTenant({
      name,
      clientType,
      sector,
      country,
      currency,
      pricingProfile,
      commissionProfile,
      taxProfile
    });

    if (!created.ok) {
      return Response.json({ ok: false, reason: created.reason }, { status: 400 });
    }

    const sessionTtlSeconds = Number.isFinite(body?.sessionTtlSeconds ?? NaN)
      ? Math.max(60, Math.floor(body?.sessionTtlSeconds as number))
      : 7 * 24 * 3600;

    const session = await issueTenantSession({ tenantId: created.tenant.tenantId, ttlSeconds: sessionTtlSeconds });
    if (!session.ok) {
      return Response.json({ ok: false, reason: session.reason }, { status: 500 });
    }

    const base = (process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim() || requestBase(req);
    const nextPath = safeNextPath(body?.next);

    const redeemUrl = new URL('/api/tenant-session', base);
    redeemUrl.searchParams.set('token', session.sessionToken);
    redeemUrl.searchParams.set('next', nextPath);

    return Response.json({
      ok: true,
      tenant: created.tenant,
      apiKey: created.apiKey,
      sessionToken: session.sessionToken,
      sessionExpiresAt: session.expiresAt,
      redeemUrl: redeemUrl.toString()
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: message }, { status: 500 });
  }
}
