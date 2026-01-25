import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from '../tmp-dir';
import type { PaymentProof } from '../payment-proofs';

import type { SettlementEntry, SettlementProvider, SettlementsDb } from './types';

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
  return join(phoenixZeroTmpDir(), 'settlements.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<SettlementsDb> {
  const json = await readJsonMaybe<any>(dbPath());
  if (!json || json.version !== 1) {
    return { version: 1, entries: {}, byProofId: {} };
  }
  return {
    version: 1,
    entries: typeof json.entries === 'object' && json.entries ? json.entries : {},
    byProofId: typeof json.byProofId === 'object' && json.byProofId ? json.byProofId : {}
  };
}

async function saveDb(db: SettlementsDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function normalizeProvider(v: unknown): SettlementProvider {
  const t = String(v || '').trim().toLowerCase();
  if (t === 'pix') return 'pix';
  if (t === 'crypto') return 'crypto';
  if (t === 'card') return 'card';
  return 'pix';
}

function parseIsoOrNull(v: unknown): string | null {
  const t = String(v || '').trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function providerRiskMs(provider: SettlementProvider): number {
  if (provider === 'pix') return 0;
  if (provider === 'crypto') return 0;
  return 7 * 24 * 60 * 60 * 1000;
}

function computeRiskWindowEndsAt(params: { provider: SettlementProvider; paidAt: string }): string {
  const paidMs = Date.parse(params.paidAt);
  const riskMs = providerRiskMs(params.provider);
  const baseMs = Number.isFinite(paidMs) ? paidMs : Date.now();
  return new Date(baseMs + riskMs).toISOString();
}

function sanitizeAntifraudDecision(v: unknown): 'clear' | 'review' | 'blocked' | undefined {
  const t = String(v || '').trim().toLowerCase();
  if (t === 'clear') return 'clear';
  if (t === 'review') return 'review';
  if (t === 'blocked') return 'blocked';
  return undefined;
}

export async function getSettlementById(id: string): Promise<SettlementEntry | null> {
  const key = String(id || '').trim();
  if (!key) return null;
  const db = await loadDb();
  return db.entries[key] || null;
}

export async function getSettlementByProofId(proofId: string): Promise<SettlementEntry | null> {
  const pid = String(proofId || '').trim();
  if (!pid) return null;
  const db = await loadDb();
  const id = db.byProofId[pid];
  if (!id) return null;
  return db.entries[id] || null;
}

export async function ensureSettlementForProof(params: {
  proof: PaymentProof;
  paidAt?: string;
  sourceEventId?: string;
  lastUpdatedBy?: string;
}): Promise<SettlementEntry | null> {
  const proof = params.proof;
  if (!proof || typeof proof !== 'object') return null;

  const proofId = String(proof.id || '').trim();
  const tenantId = String(proof.tenantId || '').trim();
  const agentId = String(proof.agentId || '').trim();
  const providerPaymentId = String(proof.providerPaymentId || '').trim();

  if (!proofId || !tenantId || !agentId || !providerPaymentId) return null;
  if (String(proof.status || '') !== 'paid_confirmed') return null;

  const db = await loadDb();
  const existingId = db.byProofId[proofId];
  if (existingId) {
    const existing = db.entries[existingId];
    if (!existing) return null;

    const nextSourceEventId = String(params.sourceEventId || '').trim() || undefined;
    const nextAntifraudDecision = sanitizeAntifraudDecision((proof as any)?.antifraudDecision);
    const nextAntifraudReason = String((proof as any)?.antifraudReason || '').trim() || undefined;

    const shouldSetSourceEventId = Boolean(nextSourceEventId && !existing.sourceEventId);
    const shouldUpdateAntifraud =
      Boolean(nextAntifraudDecision) &&
      (String(existing.antifraudDecision || '') !== String(nextAntifraudDecision || '') ||
        String(existing.antifraudReason || '') !== String(nextAntifraudReason || ''));

    if (shouldSetSourceEventId || shouldUpdateAntifraud) {
      const updatedAt = nowIso();
      const next: SettlementEntry = {
        ...existing,
        version: Math.max(1, Math.trunc(existing.version || 1)) + 1,
        sourceEventId: shouldSetSourceEventId ? nextSourceEventId : existing.sourceEventId,
        antifraudDecision: shouldUpdateAntifraud ? nextAntifraudDecision : existing.antifraudDecision,
        antifraudReason: shouldUpdateAntifraud ? nextAntifraudReason : existing.antifraudReason,
        lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
        updatedAt
      };
      db.entries[existingId] = next;
      await saveDb(db);
      return next;
    }

    return existing;
  }

  const createdAt = nowIso();
  const updatedAt = createdAt;

  const provider = normalizeProvider((proof as any).paymentProvider);
  const paidAt =
    parseIsoOrNull(params.paidAt) ||
    parseIsoOrNull((proof as any).verifiedAt) ||
    parseIsoOrNull((proof as any).createdAt) ||
    createdAt;

  const entry: SettlementEntry = {
    settlementId: `set_${b64Url(randomBytes(12))}`,

    proofId,
    paymentId: String((proof as any).paymentId || '').trim(),

    tenantId,
    agentId,

    amountCents: Math.max(0, Math.trunc(Number((proof as any).amountCents ?? 0))),
    currency: String((proof as any).currency || '').trim() || 'USD',

    provider,
    providerPaymentId,

    status: 'pending',

    paidAt,
    riskWindowEndsAt: computeRiskWindowEndsAt({ provider, paidAt }),

    version: 1,
    sourceEventId: String(params.sourceEventId || '').trim() || undefined,
    lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',

    antifraudDecision: sanitizeAntifraudDecision((proof as any)?.antifraudDecision),
    antifraudReason: String((proof as any)?.antifraudReason || '').trim() || undefined,

    createdAt,
    updatedAt
  };

  db.entries[entry.settlementId] = entry;
  db.byProofId[proofId] = entry.settlementId;
  await saveDb(db);
  return entry;
}

export async function listSettlementsByAgent(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<SettlementEntry[]> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return [];
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 200))));

  const db = await loadDb();
  const out = Object.values(db.entries || {}).filter((e) => e && e.tenantId === tenantId && e.agentId === agentId);
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out.slice(0, limit);
}

export async function advanceSettlements(params: { nowMs?: number; limit?: number } = {}): Promise<{ advanced: number }> {
  const nowMs = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : Date.now();
  const limit = Math.max(1, Math.min(5000, Math.trunc(Number(params.limit ?? 5000))));

  const db = await loadDb();
  let advanced = 0;

  for (const s of Object.values(db.entries || {})) {
    if (!s) continue;
    if (advanced >= limit) break;

    if (s.status !== 'pending') continue;

    const antifraudDecision = String((s as any).antifraudDecision || '').trim();
    if (antifraudDecision === 'blocked') {
      const updatedAt = nowIso();
      db.entries[s.settlementId] = {
        ...s,
        status: 'blocked',
        blockedAt: s.blockedAt || updatedAt,
        version: Math.max(1, Math.trunc(s.version || 1)) + 1,
        lastUpdatedBy: 'system',
        updatedAt
      };
      advanced += 1;
      continue;
    }
    if (antifraudDecision === 'review') continue;

    const dueMs = Date.parse(String(s.riskWindowEndsAt || ''));
    if (!Number.isFinite(dueMs)) continue;
    if (dueMs > nowMs) continue;

    const updatedAt = nowIso();
    db.entries[s.settlementId] = {
      ...s,
      status: 'settled',
      settledAt: s.settledAt || updatedAt,
      version: Math.max(1, Math.trunc(s.version || 1)) + 1,
      lastUpdatedBy: 'system',
      updatedAt
    };

    advanced += 1;
  }

  if (advanced > 0) await saveDb(db);
  return { advanced };
}

export async function revertSettlement(params: {
  proofId?: string;
  settlementId?: string;
  sourceEventId?: string;
  lastUpdatedBy?: string;
}): Promise<SettlementEntry | null> {
  const settlementId = String(params.settlementId || '').trim();
  const proofId = String(params.proofId || '').trim();

  const db = await loadDb();

  const id = settlementId || (proofId ? db.byProofId[proofId] : '');
  if (!id) return null;

  const existing = db.entries[id];
  if (!existing) return null;

  if (existing.status === 'reverted') return existing;

  const updatedAt = nowIso();
  const next: SettlementEntry = {
    ...existing,
    status: 'reverted',
    revertedAt: existing.revertedAt || updatedAt,
    version: Math.max(1, Math.trunc(existing.version || 1)) + 1,
    sourceEventId: String(params.sourceEventId || '').trim() || existing.sourceEventId,
    lastUpdatedBy: String(params.lastUpdatedBy || '').trim() || 'system',
    updatedAt
  };

  db.entries[id] = next;
  await saveDb(db);
  return next;
}
