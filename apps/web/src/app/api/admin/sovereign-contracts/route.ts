import { requireAdminToken } from '../../../../lib/tenant-auth';
import {
  deleteSovereignContract,
  getSovereignContract,
  type SovereignContract,
  upsertSovereignContract
} from '../../../../lib/sovereign-contracts';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function clampNonEmpty(s: unknown): string {
  return String(s || '').trim();
}

export async function GET(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json(
      { ok: false, reason: admin.reason },
      { status: admin.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const u = new URL(req.url);
  const tenantId = clampNonEmpty(u.searchParams.get('tenantId'));
  const agentId = clampNonEmpty(u.searchParams.get('agentId'));

  if (!tenantId || !agentId) {
    return Response.json(
      { ok: false, reason: 'Missing tenantId/agentId' },
      { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const contract = await getSovereignContract({ tenantId, agentId });
  if (!contract) {
    return Response.json(
      { ok: false, reason: 'Not found' },
      { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  return Response.json({ ok: true, contract }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json(
      { ok: false, reason: admin.reason },
      { status: admin.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const body = (await req.json().catch(() => null)) as null | any;
  if (!body || typeof body !== 'object') {
    return Response.json(
      { ok: false, reason: 'Invalid JSON body' },
      { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const contract =
    (body as any).contract && typeof (body as any).contract === 'object'
      ? ((body as any).contract as SovereignContract)
      : (body as SovereignContract);

  const res = await upsertSovereignContract({ contract });
  if (!res.ok) {
    return Response.json(
      { ok: false, reason: res.reason },
      { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  return Response.json(
    { ok: true, contract: res.contract },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}

export async function DELETE(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json(
      { ok: false, reason: admin.reason },
      { status: admin.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const u = new URL(req.url);
  const tenantId = clampNonEmpty(u.searchParams.get('tenantId'));
  const agentId = clampNonEmpty(u.searchParams.get('agentId'));

  if (!tenantId || !agentId) {
    return Response.json(
      { ok: false, reason: 'Missing tenantId/agentId' },
      { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  const res = await deleteSovereignContract({ tenantId, agentId });
  if (!res.ok) {
    return Response.json(
      { ok: false, reason: res.reason },
      { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }

  return Response.json({ ok: true }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
