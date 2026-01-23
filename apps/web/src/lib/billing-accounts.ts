import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';
import { getTenantById, listTenants } from './tenants';

export type BillingAccountStatus = 'pending' | 'paid' | 'failed' | 'grace' | 'suspended';

export type BillingAccount = {
  tenantId: string;
  status: BillingAccountStatus;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  graceUntil?: string;
  suspendedReason?: string;
};

type BillingAccountsDb = {
  version: 1;
  accounts: Record<string, BillingAccount>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'billing-accounts.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<BillingAccountsDb> {
  const json = await readJsonMaybe<BillingAccountsDb>(dbPath());
  if (!json || json.version !== 1 || typeof json.accounts !== 'object' || !json.accounts) {
    return { version: 1, accounts: {} };
  }
  return { version: 1, accounts: json.accounts };
}

async function saveDb(db: BillingAccountsDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function normalizeStatus(v: unknown): BillingAccountStatus | null {
  const t = String(v || '').trim().toLowerCase();
  if (t === 'pending') return 'pending';
  if (t === 'paid') return 'paid';
  if (t === 'failed') return 'failed';
  if (t === 'grace') return 'grace';
  if (t === 'suspended') return 'suspended';
  return null;
}

function parseIsoOrNull(v: unknown): string | undefined {
  const t = String(v || '').trim();
  if (!t) return undefined;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export async function getBillingAccount(tenantId: string): Promise<BillingAccount | null> {
  const id = String(tenantId || '').trim();
  if (!id) return null;
  const db = await loadDb();
  return db.accounts[id] || null;
}

export function isBillingAccountActive(account: BillingAccount | null): boolean {
  if (!account) return false;
  return account.status === 'paid' || account.status === 'grace';
}

export async function getOrCreateBillingAccount(tenantId: string): Promise<{ ok: true; account: BillingAccount } | { ok: false; reason: string }> {
  const id = String(tenantId || '').trim();
  if (!id) return { ok: false, reason: 'Missing tenantId' };
  const tenant = await getTenantById(id);
  if (!tenant) return { ok: false, reason: 'Tenant not found' };

  const db = await loadDb();
  const existing = db.accounts[id];
  if (existing) return { ok: true, account: existing };

  const createdAt = nowIso();
  const account: BillingAccount = {
    tenantId: id,
    status: 'pending',
    createdAt,
    updatedAt: createdAt
  };
  db.accounts[id] = account;
  await saveDb(db);
  return { ok: true, account };
}

export async function activateBillingAccount(tenantId: string): Promise<
  { ok: true; account: BillingAccount } | { ok: false; reason: string }
> {
  const out = await getOrCreateBillingAccount(tenantId);
  if (!out.ok) return out;
  if (out.account.status === 'paid') return { ok: true, account: out.account };
  return setBillingAccountStatus({ tenantId, status: 'paid' });
}

export async function setBillingAccountStatus(params: {
  tenantId: string;
  status: BillingAccountStatus;
  paidAt?: string;
  graceUntil?: string;
  suspendedReason?: string;
}): Promise<{ ok: true; account: BillingAccount } | { ok: false; reason: string }> {
  const id = String(params.tenantId || '').trim();
  if (!id) return { ok: false, reason: 'Missing tenantId' };
  const tenant = await getTenantById(id);
  if (!tenant) return { ok: false, reason: 'Tenant not found' };

  const status = normalizeStatus(params.status);
  if (!status) return { ok: false, reason: 'Invalid status' };

  const db = await loadDb();
  const existing = db.accounts[id];

  const createdAt = existing?.createdAt || nowIso();
  const updatedAt = nowIso();

  const graceUntil = parseIsoOrNull(params.graceUntil);
  const suspendedReason = String(params.suspendedReason || '').trim() || undefined;

  const paidAt =
    status === 'paid'
      ? parseIsoOrNull(params.paidAt) || (existing?.status === 'paid' ? existing?.paidAt : undefined) || nowIso()
      : undefined;

  const account: BillingAccount = {
    tenantId: id,
    status,
    createdAt,
    updatedAt,
    paidAt,
    graceUntil,
    suspendedReason
  };

  db.accounts[id] = account;
  await saveDb(db);

  return { ok: true, account };
}

export async function listBillingAccounts(params: { tenantId?: string } = {}): Promise<BillingAccount[]> {
  const db = await loadDb();
  const all = Object.values(db.accounts || {});
  const tenantId = String(params.tenantId || '').trim();
  const filtered = tenantId ? all.filter((a) => a.tenantId === tenantId) : all;
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function ensureBillingAccountsForAllTenants(): Promise<void> {
  const tenants = await listTenants();
  const db = await loadDb();
  let changed = false;
  for (const t of tenants) {
    if (!t?.tenantId) continue;
    if (db.accounts[t.tenantId]) continue;
    const createdAt = nowIso();
    db.accounts[t.tenantId] = { tenantId: t.tenantId, status: 'pending', createdAt, updatedAt: createdAt };
    changed = true;
  }
  if (changed) await saveDb(db);
}
