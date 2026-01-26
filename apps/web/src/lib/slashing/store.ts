import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, writeKvJson } from '../pg-kv';
import { phoenixZeroTmpDir } from '../tmp-dir';
import { computeAgentLedger } from '../agent-ledger';
import { getPaymentProofById } from '../payment-proofs';

import type { SlashEvent, SlashReason, SlashingDb } from './types';

function isoAtMs(ms: number): string {
  return new Date(ms).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'slashing.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<SlashingDb> {
  const kvKey = 'slashing';
  const jsonFromPg = postgresEnabled() ? await readKvJson<any>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<any>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: SlashingDb = !json || json.version !== 1
    ? { version: 1, events: {}, byIdempotencyKey: {} }
    : {
        version: 1,
        events: typeof json.events === 'object' && json.events ? json.events : {},
        byIdempotencyKey:
          (typeof json.byIdempotencyKey === 'object' && json.byIdempotencyKey ? json.byIdempotencyKey : null) ||
          (typeof json.byKey === 'object' && json.byKey ? json.byKey : {})
      };

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveDb(db: SlashingDb): Promise<void> {
  const kvKey = 'slashing';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function normalizeReason(v: unknown): SlashReason | null {
  const t = String(v || '').trim().toLowerCase();
  if (t === 'invalid_signature') return 'invalid_signature';
  if (t === 'replay_attack') return 'replay_attack';
  if (t === 'antifraud_block') return 'antifraud_block';
  if (t === 'sla_violation') return 'sla_violation';
  if (t === 'ledger_inconsistency') return 'ledger_inconsistency';
  return null;
}

function defaultIdempotencyKey(params: {
  tenantId: string;
  agentId: string;
  reason: SlashReason;
  currency: string;
  penaltyCents: number;
  proofId?: string;
  settlementId?: string;
}): string {
  return [
    String(params.tenantId || '').trim(),
    String(params.agentId || '').trim(),
    String(params.reason || '').trim(),
    String(params.currency || '').trim(),
    String(Math.max(0, Math.trunc(Number(params.penaltyCents ?? 0)))),
    String(params.proofId || '').trim(),
    String(params.settlementId || '').trim()
  ].join('|');
}

function parseIsoOrNull(v: unknown): string | null {
  const t = String(v || '').trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function getSlashById(id: string): Promise<SlashEvent | null> {
  const slashId = String(id || '').trim();
  if (!slashId) return null;
  const db = await loadDb();
  return db.events[slashId] || null;
}

export async function listSlashesByAgent(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<SlashEvent[]> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return [];
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 200))));

  const db = await loadDb();
  const out = Object.values(db.events || {}).filter((e) => e && e.tenantId === tenantId && e.agentId === agentId);
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out.slice(0, limit);
}

export async function ensurePendingSlash(params: {
  tenantId: string;
  agentId: string;
  currency: string;
  reason: SlashReason;
  penaltyCents: number;
  proofId?: string;
  settlementId?: string;
  idempotencyKey?: string;
  contestWindowMs?: number;
  sourceEventId?: string;
  lastUpdatedBy?: string;
  nowMs?: number;
}): Promise<SlashEvent | null> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const currency = String(params.currency || '').trim() || 'USD';
  const reason = normalizeReason(params.reason);
  if (!tenantId || !agentId || !reason) return null;

  const proofId = String(params.proofId || '').trim() || undefined;
  const settlementId = String(params.settlementId || '').trim() || undefined;
  const penaltyCents = Math.max(0, Math.trunc(Number(params.penaltyCents ?? 0)));
  if (!penaltyCents) return null;

  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();

  const contestWindowMs = Math.max(0, Math.trunc(Number(params.contestWindowMs ?? 3600_000)));

  const idempotencyKey =
    String(params.idempotencyKey || '').trim() ||
    defaultIdempotencyKey({ tenantId, agentId, reason, currency, penaltyCents, proofId, settlementId });

  const db = await loadDb();
  const existingId = db.byIdempotencyKey[idempotencyKey];
  if (existingId) {
    const existing = db.events[existingId];
    if (!existing) return null;

    const nextSourceEventId = String(params.sourceEventId || '').trim() || undefined;
    if (nextSourceEventId && !existing.sourceEventId) {
      const updatedAt = isoAtMs(nowMs);
      const next: SlashEvent = {
        ...existing,
        version: Math.max(1, Math.trunc(existing.version || 1)) + 1,
        sourceEventId: nextSourceEventId,
        lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
        updatedAt
      };
      db.events[existingId] = next;
      await saveDb(db);
      return next;
    }

    return existing;
  }

  const createdAt = isoAtMs(nowMs);
  const updatedAt = createdAt;

  const ledger = await computeAgentLedger({ tenantId, agentId, limit: 500 });
  const pendingUntilAt = isoAtMs(nowMs + contestWindowMs);

  const event: SlashEvent = {
    slashId: `sl_${b64Url(randomBytes(12))}`,

    idempotencyKey,
    tenantId,
    agentId,
    currency,
    penaltyCents,
    reason,
    proofId,
    settlementId,
    ledgerRootHashB64Url: String((ledger as any)?.rootHashB64Url || ''),
    status: 'pending',
    pendingUntilAt,
    version: 1,
    sourceEventId: String(params.sourceEventId || '').trim() || undefined,
    lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
    createdAt,
    updatedAt
  };

  db.events[event.slashId] = event;
  db.byIdempotencyKey[idempotencyKey] = event.slashId;
  await saveDb(db);
  return event;
}

export async function ensurePendingSlashForProof(params: {
  proofId: string;
  reason: SlashReason;
  penaltyCents?: number;
  idempotencyKey?: string;
  contestWindowMs?: number;
  sourceEventId?: string;
  lastUpdatedBy?: string;
  nowMs?: number;
}): Promise<SlashEvent | null> {
  const proofId = String(params.proofId || '').trim();
  if (!proofId) return null;
  const proof = await getPaymentProofById(proofId);
  if (!proof) return null;

  const tenantId = String((proof as any).tenantId || '').trim();
  const agentId = String((proof as any).agentId || '').trim();
  const currency = String((proof as any).currency || '').trim() || 'USD';
  const penaltyCents =
    typeof params.penaltyCents === 'number' && Number.isFinite(params.penaltyCents)
      ? Math.max(0, Math.trunc(params.penaltyCents))
      : Math.max(0, Math.trunc(Number((proof as any).amountCents ?? 0)));

  return ensurePendingSlash({
    tenantId,
    agentId,
    currency,
    reason: params.reason,
    penaltyCents,
    proofId,
    idempotencyKey: params.idempotencyKey,
    contestWindowMs: params.contestWindowMs,
    sourceEventId: params.sourceEventId,
    lastUpdatedBy: params.lastUpdatedBy,
    nowMs: params.nowMs
  });
}

async function hasValidContestation(params: {
  tenantId: string;
  agentId: string;
  contestProofId?: string;
}): Promise<boolean> {
  const contestProofId = String(params.contestProofId || '').trim();
  if (!contestProofId) return false;

  const proof = await getPaymentProofById(contestProofId);
  if (!proof) return false;

  if (String((proof as any).tenantId || '').trim() !== params.tenantId) return false;
  if (String((proof as any).agentId || '').trim() !== params.agentId) return false;
  if (String((proof as any).status || '') !== 'paid_confirmed') return false;

  const pk = String((proof as any).agentEd25519PublicKeyB64Url || '').trim();
  const sig = String((proof as any).agentEd25519SignatureB64Url || '').trim();
  if (pk || sig) {
    if ((proof as any).agentEd25519SignatureVerified !== true) return false;
  }

  return true;
}

export async function contestSlash(params: {
  tenantId: string;
  agentId: string;
  slashId: string;
  contestProofId?: string;
  sourceEventId?: string;
  lastUpdatedBy?: string;
  nowMs?: number;
}): Promise<SlashEvent | null> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const slashId = String(params.slashId || '').trim();
  if (!tenantId || !agentId || !slashId) return null;

  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();

  const db = await loadDb();
  const existing = db.events[slashId];
  if (!existing) return null;
  if (existing.tenantId !== tenantId || existing.agentId !== agentId) return null;
  if (existing.status !== 'pending') return existing;

  const untilMs = Date.parse(String(existing.pendingUntilAt || ''));
  if (!Number.isFinite(untilMs)) return existing;
  if (nowMs > untilMs) return existing;

  const ok = await hasValidContestation({ tenantId, agentId, contestProofId: params.contestProofId });
  if (!ok) return existing;

  const updatedAt = isoAtMs(nowMs);
  const next: SlashEvent = {
    ...existing,
    status: 'canceled',
    canceledAt: existing.canceledAt || updatedAt,
    version: Math.max(1, Math.trunc(existing.version || 1)) + 1,
    sourceEventId: String(params.sourceEventId || '').trim() || existing.sourceEventId,
    lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
    updatedAt
  };

  db.events[slashId] = next;
  await saveDb(db);
  return next;
}

export async function advanceSlashes(params: { nowMs?: number; limit?: number } = {}): Promise<{ advanced: number }> {
  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();
  const limit = Math.max(1, Math.min(5000, Math.trunc(Number(params.limit ?? 5000))));

  const db = await loadDb();
  let advanced = 0;

  for (const e of Object.values(db.events || {})) {
    if (!e) continue;
    if (advanced >= limit) break;
    if (e.status !== 'pending') continue;

    const untilMs = Date.parse(String(e.pendingUntilAt || ''));
    if (!Number.isFinite(untilMs)) continue;
    if (untilMs > nowMs) continue;

    const updatedAt = isoAtMs(nowMs);
    db.events[e.slashId] = {
      ...e,
      status: 'confirmed',
      confirmedAt: e.confirmedAt || updatedAt,
      version: Math.max(1, Math.trunc(e.version || 1)) + 1,
      lastUpdatedBy: 'system',
      updatedAt
    };

    advanced += 1;
  }

  if (advanced > 0) await saveDb(db);
  return { advanced };
}

export async function sumConfirmedSlashesByCurrency(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<Record<string, number>> {
  const events = await listSlashesByAgent({ tenantId: params.tenantId, agentId: params.agentId, limit: params.limit ?? 500 });
  const out: Record<string, number> = {};
  for (const e of events) {
    if (!e) continue;
    if (e.status !== 'confirmed') continue;
    const c = String(e.currency || '').trim() || 'USD';
    out[c] = (out[c] || 0) + Math.max(0, Math.trunc(Number(e.penaltyCents ?? 0)));
  }
  return out;
}

export async function updateSlashLedgerRootHash(params: {
  tenantId: string;
  agentId: string;
  slashId: string;
  ledgerRootHashB64Url: string;
}): Promise<void> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const slashId = String(params.slashId || '').trim();
  const ledgerRootHashB64Url = String(params.ledgerRootHashB64Url || '').trim();
  if (!tenantId || !agentId || !slashId || !ledgerRootHashB64Url) return;

  const db = await loadDb();
  const existing = db.events[slashId];
  if (!existing) return;
  if (existing.tenantId !== tenantId || existing.agentId !== agentId) return;
  if (existing.ledgerRootHashB64Url === ledgerRootHashB64Url) return;

  const updatedAt = nowIso();
  db.events[slashId] = {
    ...existing,
    ledgerRootHashB64Url,
    version: Math.max(1, Math.trunc(existing.version || 1)) + 1,
    updatedAt
  };

  await saveDb(db);
}

export async function parseContestationWindowMsFromSlash(e: SlashEvent): Promise<number | null> {
  const created = parseIsoOrNull(e.createdAt);
  const until = parseIsoOrNull(e.pendingUntilAt);
  if (!created || !until) return null;
  const ms = Date.parse(until) - Date.parse(created);
  return Number.isFinite(ms) ? ms : null;
}
