import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';
import { getTenantById } from './tenants';
import { estimatePilUnits, readUsageLedgerEntries, type UsageLedgerEntry } from './usage-ledger';

export type InvoiceSnapshotItem = {
  currency: string;
  valueEvent: string;
  product?: string;
  plan?: string;
  authenticityLevel?: string;
  units: number;
  pilUnits: number;
  amountCents: number;
  count: number;
};

export type InvoiceSnapshot = {
  id: string;
  status: 'locked';
  createdAt: string;
  tenantId: string;
  period: { from: string; to: string };
  totals: Record<string, number>;
  pil: { totalUnits: number };
  items: InvoiceSnapshotItem[];
  meta: { matchedEntries: number; groups: number };
};

type SnapshotsDb = {
  version: 1;
  snapshots: Record<string, InvoiceSnapshot>;
};

function snapshotsDbPath(): string {
  return join(phoenixZeroTmpDir(), 'invoice-snapshots.json');
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadSnapshotsDb(): Promise<SnapshotsDb> {
  const json = await readJsonMaybe<SnapshotsDb>(snapshotsDbPath());
  if (!json || json.version !== 1 || typeof json.snapshots !== 'object') {
    return { version: 1, snapshots: {} };
  }
  return json;
}

async function saveSnapshotsDb(db: SnapshotsDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(snapshotsDbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function parseIsoDateMs(s: string): number | null {
  const t = String(s || '').trim();
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function pickString(maybe: unknown): string | undefined {
  const t = typeof maybe === 'string' ? maybe.trim() : '';
  return t ? t : undefined;
}

function clampUnits(x: unknown): number {
  const n = Number(x ?? NaN);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(1_000_000, Math.trunc(n)));
}

function entryToPilUnits(params: {
  entry: UsageLedgerEntry;
  product?: string;
  plan?: string;
  authenticityLevel?: string;
  units: number;
}): number {
  const e = params.entry;
  if (typeof e.pilUnits === 'number' && Number.isFinite(e.pilUnits)) return Math.max(1, Math.trunc(e.pilUnits));

  const sourceVector = pickString((e.contextSnapshot as any)?.sourceVector);
  const durationSecondsRaw = (e.contextSnapshot as any)?.durationSeconds;
  const durationSeconds =
    typeof durationSecondsRaw === 'number' && Number.isFinite(durationSecondsRaw)
      ? Math.max(0, Math.trunc(durationSecondsRaw))
      : undefined;

  return estimatePilUnits({
    op: e.op,
    product: params.product,
    authenticityLevel: params.authenticityLevel,
    sourceVector,
    units: params.units,
    durationSeconds
  });
}

export async function createLockedInvoiceSnapshot(params: {
  tenantId: string;
  from: string;
  to: string;
  includePreviews?: boolean;
  includeUnpriced?: boolean;
}): Promise<{ ok: true; snapshot: InvoiceSnapshot } | { ok: false; reason: string }> {
  const tenantId = String(params.tenantId || '').trim();
  if (!tenantId) return { ok: false, reason: 'Missing tenantId' };

  const tenant = await getTenantById(tenantId);
  if (!tenant) return { ok: false, reason: 'Tenant not found' };

  const fromMs = parseIsoDateMs(params.from);
  const toMs = parseIsoDateMs(params.to);
  if (fromMs === null || toMs === null) return { ok: false, reason: 'Invalid from/to' };
  if (toMs < fromMs) return { ok: false, reason: 'Invalid period (to < from)' };

  const normalizedFrom = new Date(fromMs).toISOString();
  const normalizedTo = new Date(toMs).toISOString();

  const db = await loadSnapshotsDb();
  for (const snap of Object.values(db.snapshots || {})) {
    if (!snap) continue;
    if (snap.tenantId !== tenantId) continue;
    if (snap.period?.from !== normalizedFrom) continue;
    if (snap.period?.to !== normalizedTo) continue;
    return { ok: true, snapshot: snap };
  }

  const includePreviews = params.includePreviews === true;
  const includeUnpriced = params.includeUnpriced === true;

  const entries = await readUsageLedgerEntries();

  const groups = new Map<string, InvoiceSnapshotItem>();
  const totalsByCurrency = new Map<string, number>();
  let totalPilUnits = 0;
  let matched = 0;

  for (const e of entries) {
    if (!e) continue;
    if (!e.tenantId || e.tenantId !== tenantId) continue;
    if (!e.ok) continue;

    const atMs = Number.isFinite(Date.parse(e.at)) ? Date.parse(e.at) : null;
    if (atMs !== null && atMs < fromMs) continue;
    if (atMs !== null && atMs > toMs) continue;

    const hasPrice = typeof e.finalPriceCents === 'number' && Number.isFinite(e.finalPriceCents);
    if (!includeUnpriced && !hasPrice) continue;
    if (!includePreviews && (e.op === 'pricing_preview' || e.op === 'pricing_quote')) continue;

    const currency = (e.currency || '').trim() || tenant.currency || 'USD';
    const units = clampUnits(e.units ?? (e.contextSnapshot as any)?.units ?? 1);

    const valueEvent = (e.valueEvent || e.op || 'unknown').trim() || 'unknown';

    const product =
      pickString(e.product) ||
      pickString((e.contextSnapshot as any)?.product) ||
      undefined;

    const plan = pickString(e.plan) || pickString((e.contextSnapshot as any)?.plan) || undefined;

    const authenticityLevel =
      pickString(e.authenticityLevel) || pickString((e.contextSnapshot as any)?.authenticityLevel) || undefined;

    const pilUnits = entryToPilUnits({ entry: e, product, plan, authenticityLevel, units });

    const amountCents = hasPrice ? Math.max(0, Math.trunc(e.finalPriceCents as number)) : 0;

    const key = [currency, valueEvent, product || '', plan || '', authenticityLevel || ''].join('|');

    const prev = groups.get(key);
    if (prev) {
      prev.units += units;
      prev.pilUnits += pilUnits;
      prev.amountCents += amountCents;
      prev.count += 1;
    } else {
      groups.set(key, {
        currency,
        valueEvent,
        product,
        plan,
        authenticityLevel,
        units,
        pilUnits,
        amountCents,
        count: 1
      });
    }

    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + amountCents);
    totalPilUnits += pilUnits;
    matched += 1;
  }

  const items = [...groups.values()].sort((a, b) => b.amountCents - a.amountCents);

  const snapshot: InvoiceSnapshot = {
    id: `inv_${b64Url(randomBytes(12))}`,
    status: 'locked',
    createdAt: new Date().toISOString(),
    tenantId,
    period: { from: normalizedFrom, to: normalizedTo },
    totals: Object.fromEntries([...totalsByCurrency.entries()]),
    pil: { totalUnits: totalPilUnits },
    items,
    meta: { matchedEntries: matched, groups: items.length }
  };

  db.snapshots[snapshot.id] = snapshot;
  await saveSnapshotsDb(db);

  return { ok: true, snapshot };
}

export async function getInvoiceSnapshotById(id: string): Promise<InvoiceSnapshot | null> {
  const key = String(id || '').trim();
  if (!key) return null;
  const db = await loadSnapshotsDb();
  return db.snapshots[key] || null;
}

export async function listInvoiceSnapshots(params: { tenantId?: string } = {}): Promise<InvoiceSnapshot[]> {
  const db = await loadSnapshotsDb();
  const all = Object.values(db.snapshots || {});
  const tenantId = String(params.tenantId || '').trim();
  const filtered = tenantId ? all.filter((s) => s.tenantId === tenantId) : all;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
