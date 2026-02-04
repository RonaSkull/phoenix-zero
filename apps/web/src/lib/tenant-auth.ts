import { appendUsage } from './usage-ledger';
import {
  parseTenantApiKeyFromRequest,
  parseTenantSessionFromRequest,
  resolveTenantByApiKey,
  resolveTenantBySessionToken,
  type TenantRecord
} from './tenants';

export type TenantAuthContext = {
  tenant: TenantRecord;
  tenantId: string;
  apiKeyHash?: string;
};

export async function requireTenant(req: Request): Promise<
  | { ok: true; ctx: TenantAuthContext }
  | { ok: false; status: number; reason: string }
> {
  const apiKey = parseTenantApiKeyFromRequest(req);
  if (apiKey) {
    const resolved = await resolveTenantByApiKey(apiKey);
    if (!resolved.ok) return { ok: false, status: 401, reason: resolved.reason };
    return { ok: true, ctx: { tenant: resolved.tenant, tenantId: resolved.tenantId, apiKeyHash: resolved.apiKeyHash } };
  }

  const sessionToken = parseTenantSessionFromRequest(req);
  if (sessionToken) {
    const resolved = await resolveTenantBySessionToken(sessionToken);
    if (!resolved.ok) return { ok: false, status: 401, reason: resolved.reason };
    return { ok: true, ctx: { tenant: resolved.tenant, tenantId: resolved.tenantId } };
  }

  return { ok: false, status: 401, reason: 'Missing API key' };
}

export async function requireTenantOrPublic(req: Request): Promise<
  | { ok: true; ctx: TenantAuthContext; isPublic: boolean }
  | { ok: false; status: number; reason: string }
> {
  const apiKey = parseTenantApiKeyFromRequest(req);
  const sessionToken = parseTenantSessionFromRequest(req);

  if (apiKey || sessionToken) {
    const resolved = await requireTenant(req);
    if (!resolved.ok) return resolved;
    return { ok: true, ctx: resolved.ctx, isPublic: false };
  }

  const publicApiKey = (process.env.PHOENIX_ZERO_PUBLIC_API_KEY || '').trim();
  if (!publicApiKey) {
    return {
      ok: false,
      status: 403,
      reason: 'Public tenant is not configured (set PHOENIX_ZERO_PUBLIC_API_KEY and restart the server)'
    };
  }

  const resolved = await resolveTenantByApiKey(publicApiKey);
  if (!resolved.ok) {
    return {
      ok: false,
      status: 403,
      reason: 'Public tenant is not configured (PHOENIX_ZERO_PUBLIC_API_KEY does not match any tenant)'
    };
  }

  return { ok: true, ctx: { tenant: resolved.tenant, tenantId: resolved.tenantId, apiKeyHash: resolved.apiKeyHash }, isPublic: true };
}

export function requireAdminToken(req: Request): { ok: true } | { ok: false; status: number; reason: string } {
  const token = (process.env.PHOENIX_ZERO_ADMIN_TOKEN || '').trim();
  if (!token) return { ok: false, status: 500, reason: 'Missing PHOENIX_ZERO_ADMIN_TOKEN' };
  const got = (req.headers.get('x-admin-token') || '').trim();
  if (!got || got !== token) return { ok: false, status: 401, reason: 'Unauthorized' };
  return { ok: true };
}

export async function withUsage<T>(params: {
  req: Request;
  tenantId: string | null;
  op: Parameters<typeof appendUsage>[0]['op'];
  fn: () => Promise<{ res: Response; ok: boolean; httpStatus: number; meta?: Record<string, any> }>;
}): Promise<Response> {
  const started = Date.now();
  try {
    const out = await params.fn();
    const durationMs = Math.max(0, Date.now() - started);
    const u = new URL(params.req.url);
    await appendUsage({
      at: new Date().toISOString(),
      tenantId: params.tenantId,
      op: params.op,
      ok: out.ok,
      httpStatus: out.httpStatus,
      durationMs,
      requestPath: u.pathname,
      meta: out.meta
    }).catch(() => {
    });
    return out.res;
  } catch (e) {
    const durationMs = Math.max(0, Date.now() - started);
    const u = new URL(params.req.url);
    await appendUsage({
      at: new Date().toISOString(),
      tenantId: params.tenantId,
      op: params.op,
      ok: false,
      httpStatus: 500,
      durationMs,
      requestPath: u.pathname,
      meta: { error: e instanceof Error ? e.message : String(e) }
    }).catch(() => {
    });
    throw e;
  }
}
