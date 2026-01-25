import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from '../tmp-dir';
import { computeAgentLedger } from '../agent-ledger';

import type { EscrowDb, EscrowEntry, EscrowRefundReason } from './types';

function isoAtMs(ms: number): string {
  return new Date(ms).toISOString();
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'escrow.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<EscrowDb> {
  const json = await readJsonMaybe<any>(dbPath());
  if (!json || json.version !== 1) {
    return { version: 1, entries: {}, byIdempotencyKey: {} };
  }
  return {
    version: 1,
    entries: typeof json.entries === 'object' && json.entries ? json.entries : {},
    byIdempotencyKey: typeof json.byIdempotencyKey === 'object' && json.byIdempotencyKey ? json.byIdempotencyKey : {}
  };
}

async function saveDb(db: EscrowDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function defaultIdempotencyKey(params: {
  tenantId: string;
  payerAgentId: string;
  payeeAgentId: string;
  currency: string;
  amountCents: number;
  memo?: string;
}): string {
  return [
    String(params.tenantId || '').trim(),
    String(params.payerAgentId || '').trim(),
    String(params.payeeAgentId || '').trim(),
    String(params.currency || '').trim().toUpperCase(),
    String(Math.max(0, Math.trunc(Number(params.amountCents ?? 0)))),
    String(params.memo || '').trim()
  ].join('|');
}

export async function getEscrowById(id: string): Promise<EscrowEntry | null> {
  const escrowId = String(id || '').trim();
  if (!escrowId) return null;
  const db = await loadDb();
  return db.entries[escrowId] || null;
}

export async function getEscrowByIdempotencyKey(idempotencyKey: string): Promise<EscrowEntry | null> {
  const key = String(idempotencyKey || '').trim();
  if (!key) return null;
  const db = await loadDb();
  const escrowId = db.byIdempotencyKey[key];
  if (!escrowId) return null;
  return db.entries[escrowId] || null;
}

export async function listEscrowsByAgent(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<EscrowEntry[]> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return [];

  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 200))));

  const db = await loadDb();
  const out = Object.values(db.entries || {}).filter((e) =>
    e && e.tenantId === tenantId && (e.payerAgentId === agentId || e.payeeAgentId === agentId)
  );
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out.slice(0, limit);
}

export async function createEscrow(params: {
  tenantId: string;
  payerAgentId: string;
  payeeAgentId: string;
  currency: string;
  amountCents: number;
  memo?: string;

  idempotencyKey?: string;
  ttlMs?: number;

  sourceEventId?: string;
  lastUpdatedBy?: string;
  nowMs?: number;
}): Promise<EscrowEntry | null> {
  const tenantId = String(params.tenantId || '').trim();
  const payerAgentId = String(params.payerAgentId || '').trim();
  const payeeAgentId = String(params.payeeAgentId || '').trim();
  const currency = String(params.currency || '').trim().toUpperCase() || 'USD';
  const amountCents = Math.max(0, Math.trunc(Number(params.amountCents ?? 0)));
  const memo = String(params.memo || '').trim() || undefined;

  if (!tenantId || !payerAgentId || !payeeAgentId) return null;
  if (payerAgentId === payeeAgentId) return null;
  if (!amountCents) return null;

  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();
  const ttlMs = clampInt(Number(params.ttlMs ?? 7 * 24 * 3600_000), 0, 30 * 24 * 3600_000);

  const idempotencyKey =
    String(params.idempotencyKey || '').trim() || defaultIdempotencyKey({ tenantId, payerAgentId, payeeAgentId, currency, amountCents, memo });

  const db = await loadDb();
  const existingId = db.byIdempotencyKey[idempotencyKey];
  if (existingId) {
    const existing = db.entries[existingId];
    if (!existing) {
      delete db.byIdempotencyKey[idempotencyKey];
    } else {
      const nextSourceEventId = String(params.sourceEventId || '').trim() || undefined;
      if (nextSourceEventId && !existing.sourceEventId) {
        const updatedAt = isoAtMs(nowMs);
        const next: EscrowEntry = {
          ...existing,
          version: Math.max(1, Math.trunc(existing.version || 1)) + 1,
          sourceEventId: nextSourceEventId,
          lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
          updatedAt
        };
        db.entries[existingId] = next;
        await saveDb(db);
        return next;
      }

      return existing;
    }
  }

  const createdAt = isoAtMs(nowMs);
  const updatedAt = createdAt;

  const ledger = await computeAgentLedger({ tenantId, agentId: payerAgentId, limit: 500 });

  const entry: EscrowEntry = {
    escrowId: `esc_${b64Url(randomBytes(12))}`,
    idempotencyKey,

    tenantId,
    payerAgentId,
    payeeAgentId,

    currency,
    amountCents,
    memo,

    payerLedgerRootHashB64Url: String((ledger as any)?.rootHashB64Url || ''),

    status: 'held',
    expiresAt: isoAtMs(nowMs + ttlMs),

    version: 1,
    sourceEventId: String(params.sourceEventId || '').trim() || undefined,
    lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',

    createdAt,
    updatedAt
  };

  db.entries[entry.escrowId] = entry;
  db.byIdempotencyKey[idempotencyKey] = entry.escrowId;
  await saveDb(db);
  return entry;
}

async function resolveToRefunded(params: {
  db: EscrowDb;
  existing: EscrowEntry;
  nowMs: number;
  reason: EscrowRefundReason;
  sourceEventId?: string;
  lastUpdatedBy?: string;
}): Promise<EscrowEntry> {
  const updatedAt = isoAtMs(params.nowMs);
  const next: EscrowEntry = {
    ...params.existing,
    status: 'refunded',
    refundedAt: params.existing.refundedAt || updatedAt,
    refundReason: params.reason,
    version: Math.max(1, Math.trunc(params.existing.version || 1)) + 1,
    sourceEventId: String(params.sourceEventId || '').trim() || params.existing.sourceEventId,
    lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
    updatedAt
  };
  params.db.entries[params.existing.escrowId] = next;
  await saveDb(params.db);
  return next;
}

export async function releaseEscrow(params: {
  tenantId: string;
  payerAgentId: string;
  escrowId: string;
  sourceEventId?: string;
  lastUpdatedBy?: string;
  nowMs?: number;
}): Promise<EscrowEntry | null> {
  const tenantId = String(params.tenantId || '').trim();
  const payerAgentId = String(params.payerAgentId || '').trim();
  const escrowId = String(params.escrowId || '').trim();
  if (!tenantId || !payerAgentId || !escrowId) return null;

  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();

  const db = await loadDb();
  const existing = db.entries[escrowId];
  if (!existing) return null;
  if (existing.tenantId !== tenantId) return null;
  if (existing.payerAgentId !== payerAgentId) return null;

  if (existing.status !== 'held') return existing;

  const expMs = Date.parse(String(existing.expiresAt || ''));
  if (Number.isFinite(expMs) && nowMs > expMs) {
    return resolveToRefunded({
      db,
      existing,
      nowMs,
      reason: 'expired',
      sourceEventId: params.sourceEventId,
      lastUpdatedBy: params.lastUpdatedBy
    });
  }

  const updatedAt = isoAtMs(nowMs);
  const next: EscrowEntry = {
    ...existing,
    status: 'released',
    releasedAt: existing.releasedAt || updatedAt,
    version: Math.max(1, Math.trunc(existing.version || 1)) + 1,
    sourceEventId: String(params.sourceEventId || '').trim() || existing.sourceEventId,
    lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
    updatedAt
  };

  db.entries[escrowId] = next;
  await saveDb(db);
  return next;
}

export async function refundEscrow(params: {
  tenantId: string;
  payerAgentId: string;
  escrowId: string;
  sourceEventId?: string;
  lastUpdatedBy?: string;
  nowMs?: number;
}): Promise<EscrowEntry | null> {
  const tenantId = String(params.tenantId || '').trim();
  const payerAgentId = String(params.payerAgentId || '').trim();
  const escrowId = String(params.escrowId || '').trim();
  if (!tenantId || !payerAgentId || !escrowId) return null;

  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();

  const db = await loadDb();
  const existing = db.entries[escrowId];
  if (!existing) return null;
  if (existing.tenantId !== tenantId) return null;
  if (existing.payerAgentId !== payerAgentId) return null;

  if (existing.status !== 'held') return existing;

  return resolveToRefunded({
    db,
    existing,
    nowMs,
    reason: 'manual',
    sourceEventId: params.sourceEventId,
    lastUpdatedBy: params.lastUpdatedBy
  });
}

export async function advanceEscrows(params: { nowMs?: number; limit?: number } = {}): Promise<{ advanced: number }> {
  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();
  const limit = Math.max(1, Math.min(5000, Math.trunc(Number(params.limit ?? 5000))));

  const db = await loadDb();
  let advanced = 0;

  for (const e of Object.values(db.entries || {})) {
    if (!e) continue;
    if (advanced >= limit) break;
    if (e.status !== 'held') continue;

    const expMs = Date.parse(String(e.expiresAt || ''));
    if (!Number.isFinite(expMs)) continue;
    if (expMs > nowMs) continue;

    const updatedAt = isoAtMs(nowMs);
    db.entries[e.escrowId] = {
      ...e,
      status: 'refunded',
      refundedAt: e.refundedAt || updatedAt,
      refundReason: 'expired',
      version: Math.max(1, Math.trunc(e.version || 1)) + 1,
      lastUpdatedBy: 'system',
      updatedAt
    };
    advanced += 1;
  }

  if (advanced > 0) await saveDb(db);
  return { advanced };
}

export async function sumReleasedIncomingByCurrency(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<Record<string, number>> {
  const events = await listEscrowsByAgent({ tenantId: params.tenantId, agentId: params.agentId, limit: params.limit ?? 500 });
  const out: Record<string, number> = {};
  for (const e of events) {
    if (!e) continue;
    if (e.status !== 'released') continue;
    if (e.payeeAgentId !== params.agentId) continue;
    const c = String(e.currency || '').trim().toUpperCase() || 'USD';
    out[c] = (out[c] || 0) + Math.max(0, Math.trunc(Number(e.amountCents ?? 0)));
  }
  return out;
}

export async function sumReleasedOutgoingByCurrency(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<Record<string, number>> {
  const events = await listEscrowsByAgent({ tenantId: params.tenantId, agentId: params.agentId, limit: params.limit ?? 500 });
  const out: Record<string, number> = {};
  for (const e of events) {
    if (!e) continue;
    if (e.status !== 'released') continue;
    if (e.payerAgentId !== params.agentId) continue;
    const c = String(e.currency || '').trim().toUpperCase() || 'USD';
    out[c] = (out[c] || 0) + Math.max(0, Math.trunc(Number(e.amountCents ?? 0)));
  }
  return out;
}
