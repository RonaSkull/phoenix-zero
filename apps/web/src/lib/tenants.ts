import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { KycStatus } from './agent-fingerprint';
import { postgresEnabled, readKvJson, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';

export type TenantStatus = 'active' | 'paused';

export type TenantRecord = {
  tenantId: string;
  createdAt: string;
  status: TenantStatus;
  name: string;
  companyName?: string;
  clientType: string;
  sector: string;
  country: string;
  walletAddress?: string;
  kycStatus?: KycStatus;
  currency: string;
  pricingProfile: string;
  commissionProfile: string;
  taxProfile: string;
  apiKeyHash: string;
};

type TenantsDb = {
  version: 1;
  tenants: Record<string, TenantRecord>;
  apiKeyHashIndex: Record<string, string>;
};

type TenantSessionsDb = {
  version: 1;
  sessions: Record<
    string,
    {
      tenantId: string;
      createdAt: string;
      lastSeenAt?: string;
      expiresAt?: string;
    }
  >;
};

function tenantsDbPath(): string {
  return join(phoenixZeroTmpDir(), 'tenants.json');
}

function tenantSessionsDbPath(): string {
  return join(phoenixZeroTmpDir(), 'tenant-sessions.json');
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

export async function issueTenantSession(params: {
  tenantId: string;
  ttlSeconds?: number;
}): Promise<{ ok: true; sessionToken: string; expiresAt: string } | { ok: false; reason: string }> {
  try {
    const tenants = await loadTenantsDb();
    const tenant = tenants.tenants[params.tenantId];
    if (!tenant) return { ok: false, reason: 'Tenant not found' };

    const db = await loadTenantSessionsDb();

    const sessionToken = `s_${b64Url(randomBytes(18))}`;
    const hash = sha256Hex(sessionToken);

    const ttlSeconds = Number.isFinite(params.ttlSeconds ?? NaN)
      ? Math.max(30, Math.floor(params.ttlSeconds as number))
      : 7 * 24 * 3600;

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    db.sessions[hash] = {
      tenantId: tenant.tenantId,
      createdAt: nowIso(),
      expiresAt
    };

    await saveTenantSessionsDb(db);

    return { ok: true, sessionToken, expiresAt };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}

export async function getTenantById(tenantId: string): Promise<TenantRecord | null> {
  const id = String(tenantId || '').trim();
  if (!id) return null;
  const db = await loadTenantsDb();
  return db.tenants[id] || null;
}

export async function listTenants(): Promise<TenantRecord[]> {
  const db = await loadTenantsDb();
  return Object.values(db.tenants || {});
}

export async function resolveTenantBySessionToken(sessionToken: string): Promise<
  | { ok: true; tenant: TenantRecord; tenantId: string }
  | { ok: false; reason: string }
> {
  const token = String(sessionToken || '').trim();
  if (!token) return { ok: false, reason: 'Missing session token' };

  const tokenHash = sha256Hex(token);
  const sessions = await loadTenantSessionsDb();
  const rec = sessions.sessions[tokenHash];
  if (!rec) return { ok: false, reason: 'Invalid session token' };

  if (rec.expiresAt) {
    const exp = Date.parse(rec.expiresAt);
    if (Number.isFinite(exp) && Date.now() > exp) return { ok: false, reason: 'Session token expired' };
  }

  const tenants = await loadTenantsDb();
  const tenant = tenants.tenants[rec.tenantId];
  if (!tenant) return { ok: false, reason: 'Tenant not found' };
  if (tenant.status !== 'active') return { ok: false, reason: 'Tenant not active' };

  rec.lastSeenAt = nowIso();
  sessions.sessions[tokenHash] = rec;
  await saveTenantSessionsDb(sessions);

  return { ok: true, tenant, tenantId: tenant.tenantId };
}

async function loadTenantsDb(): Promise<TenantsDb> {
  const kvKey = 'tenants';
  const jsonFromPg = postgresEnabled() ? await readKvJson<TenantsDb>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<TenantsDb>(tenantsDbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: TenantsDb =
    !json || json.version !== 1 || typeof (json as any).tenants !== 'object' || typeof (json as any).apiKeyHashIndex !== 'object'
      ? { version: 1, tenants: {}, apiKeyHashIndex: {} }
      : json;

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveTenantsDb(db: TenantsDb): Promise<void> {
  const kvKey = 'tenants';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(tenantsDbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

async function loadTenantSessionsDb(): Promise<TenantSessionsDb> {
  const kvKey = 'tenant-sessions';
  const jsonFromPg = postgresEnabled() ? await readKvJson<TenantSessionsDb>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<TenantSessionsDb>(tenantSessionsDbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: TenantSessionsDb = !json || json.version !== 1 || typeof (json as any).sessions !== 'object'
    ? { version: 1, sessions: {} }
    : json;

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveTenantSessionsDb(db: TenantSessionsDb): Promise<void> {
  const kvKey = 'tenant-sessions';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(tenantSessionsDbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

export function parseTenantApiKeyFromRequest(req: Request): string | null {
  const h = req.headers;
  const x = (h.get('x-api-key') || '').trim();
  if (x) return x;
  const auth = (h.get('authorization') || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null;
  return null;
}

export function parseTenantSessionFromRequest(req: Request): string | null {
  const cookie = (req.headers.get('cookie') || '').trim();
  if (!cookie) return null;
  const parts = cookie.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === 'pz_tenant_session') return decodeURIComponent(v);
  }
  return null;
}

export async function resolveTenantByApiKey(apiKey: string): Promise<
  | { ok: true; tenant: TenantRecord; tenantId: string; apiKeyHash: string }
  | { ok: false; reason: string }
> {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, reason: 'Missing API key' };

  const apiKeyHash = sha256Hex(key);
  const db = await loadTenantsDb();
  const tenantId = db.apiKeyHashIndex[apiKeyHash];
  if (!tenantId) return { ok: false, reason: 'Invalid API key' };

  const tenant = db.tenants[tenantId];
  if (!tenant) return { ok: false, reason: 'Invalid API key' };

  const a = Buffer.from(tenant.apiKeyHash, 'utf8');
  const b = Buffer.from(apiKeyHash, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'Invalid API key' };

  if (tenant.status !== 'active') return { ok: false, reason: 'Tenant not active' };

  return { ok: true, tenant, tenantId, apiKeyHash };
}

export async function createTenant(params: {
  name: string;
  companyName?: string;
  clientType: string;
  sector: string;
  country: string;
  walletAddress?: string;
  kycStatus?: KycStatus;
  currency: string;
  pricingProfile: string;
  commissionProfile: string;
  taxProfile: string;
}): Promise<{ ok: true; tenant: TenantRecord; apiKey: string } | { ok: false; reason: string }> {
  try {
    const db = await loadTenantsDb();

    const tenantId = `t_${b64Url(randomBytes(12))}`;
    if (db.tenants[tenantId]) return { ok: false, reason: 'Failed to allocate tenantId' };

    const apiKey = `pz_${b64Url(randomBytes(32))}`;
    const apiKeyHash = sha256Hex(apiKey);

    const tenant: TenantRecord = {
      tenantId,
      createdAt: nowIso(),
      status: 'active',
      name: params.name,
      companyName: params.companyName ? String(params.companyName || '').trim() || undefined : undefined,
      clientType: params.clientType,
      sector: params.sector,
      country: params.country,
      walletAddress: params.walletAddress ? String(params.walletAddress || '').trim() || undefined : undefined,
      kycStatus: params.kycStatus,
      currency: params.currency,
      pricingProfile: params.pricingProfile,
      commissionProfile: params.commissionProfile,
      taxProfile: params.taxProfile,
      apiKeyHash
    };

    db.tenants[tenantId] = tenant;
    db.apiKeyHashIndex[apiKeyHash] = tenantId;

    await saveTenantsDb(db);

    return { ok: true, tenant, apiKey };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, reason: message };
  }
}
