import { requireAdminToken } from '../../../../lib/tenant-auth';
import {
  getPricingProfile,
  getPricingProfileVersion,
  listPricingProfileVersions,
  upsertPricingProfile,
  upsertPricingProfileWithMeta,
  type PricingProfile
} from '../../../../lib/pricing';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const u = new URL(req.url);
  const id = (u.searchParams.get('id') || '').trim();
  const currencyFallback = (u.searchParams.get('currency') || 'USD').trim() || 'USD';
  const versionId = (u.searchParams.get('versionId') || '').trim();
  const includeVersions = (u.searchParams.get('versions') || '').trim() === '1';

  if (id && versionId) {
    const profile = await getPricingProfileVersion(id, versionId);
    if (!profile) {
      return Response.json(
        { ok: false, reason: 'Version not found' },
        { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }
    return Response.json({ ok: true, profile }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
  }

  if (id && includeVersions) {
    const profile = await getPricingProfile(id || 'default', currencyFallback);
    const versions = await listPricingProfileVersions(id || 'default');
    return Response.json(
      { ok: true, profile, versions },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const profile = await getPricingProfile(id || 'default', currencyFallback);
  return Response.json({ ok: true, profile }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as null | any;
  if (!body || typeof body !== 'object') {
    return Response.json({ ok: false, reason: 'Invalid JSON body' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const profile =
    (body as any).profile && typeof (body as any).profile === 'object'
      ? ((body as any).profile as PricingProfile)
      : (body as PricingProfile);

  const versionId = typeof (body as any).versionId === 'string' ? String((body as any).versionId) : undefined;
  const reason = typeof (body as any).reason === 'string' ? String((body as any).reason) : undefined;
  const createdBy = typeof (body as any).createdBy === 'string' ? String((body as any).createdBy) : undefined;

  const hasMeta = Boolean((versionId || '').trim() || (reason || '').trim() || (createdBy || '').trim());

  const res = hasMeta ? await upsertPricingProfileWithMeta({ profile, versionId, reason, createdBy }) : await upsertPricingProfile(profile);
  if (!res.ok) {
    return Response.json({ ok: false, reason: res.reason }, { status: 400, headers: jsonUtf8Headers() });
  }

  const versions = await listPricingProfileVersions(String(profile?.id || 'default'));
  return Response.json(
    { ok: true, versions, created: (res as any).versionId ? { versionId: (res as any).versionId } : undefined },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
