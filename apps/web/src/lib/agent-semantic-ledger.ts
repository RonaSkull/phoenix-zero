import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, updateKvJsonLocked, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';

export type SemanticLedgerAction =
  | 'signup'
  | 'register'
  | 'identity:update'
  | 'key_rotated'
  | 'checkout_create'
  | 'checkout_paid'
  | 'gate_check'
  | 'execute';

export type SemanticLedgerEvent = {
  eventId: string;
  tenantId: string;
  agentId: string;
  action: SemanticLedgerAction;
  ts: string;

  ok?: boolean;
  reason?: string;
  confidence?: number;
  modelUsed?: string;

  amountCents?: number;
  currency?: string;
  checkoutId?: string;
  paymentIntentId?: string;
  proofId?: string;

  taskId?: string;
  taskType?: string;

  requireSignature?: boolean;
  signatureB64Url?: string;

  meta?: Record<string, unknown>;
};

type SemanticLedgerDb = {
  version: 1;
  eventsByAgentKey: Record<string, SemanticLedgerEvent[]>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function eventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function recordKey(tenantId: string, agentId: string): string {
  return `${String(tenantId || '').trim()}::${String(agentId || '').trim()}`;
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'agent-semantic-ledger.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDbFromFile(): Promise<SemanticLedgerDb> {
  const json = await readJsonMaybe<any>(dbPath());
  const normalized: SemanticLedgerDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).eventsByAgentKey === 'object'
      ? { version: 1, eventsByAgentKey: (json as any).eventsByAgentKey }
      : { version: 1, eventsByAgentKey: {} };
  return normalized;
}

async function saveDbToFile(db: SemanticLedgerDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

async function loadDb(): Promise<SemanticLedgerDb> {
  const kvKey = 'agent-semantic-ledger';

  const jsonFromPg = postgresEnabled() ? await readKvJson<any>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<any>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: SemanticLedgerDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).eventsByAgentKey === 'object'
      ? { version: 1, eventsByAgentKey: (json as any).eventsByAgentKey }
      : { version: 1, eventsByAgentKey: {} };

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

export async function appendSemanticEvent(params: Omit<SemanticLedgerEvent, 'eventId' | 'ts'> & { eventId?: string; ts?: string }): Promise<void> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return;

  const ev: SemanticLedgerEvent = {
    eventId: String(params.eventId || '').trim() || eventId(),
    tenantId,
    agentId,
    action: params.action,
    ts: String(params.ts || '').trim() || nowIso(),

    ok: typeof params.ok === 'boolean' ? params.ok : undefined,
    reason: typeof params.reason === 'string' ? params.reason : undefined,
    confidence:
      typeof params.confidence === 'number' && Number.isFinite(params.confidence)
        ? Math.max(0, Math.min(1, params.confidence))
        : undefined,
    modelUsed: typeof params.modelUsed === 'string' ? params.modelUsed : undefined,

    amountCents:
      typeof params.amountCents === 'number' && Number.isFinite(params.amountCents) ? Math.max(0, Math.trunc(params.amountCents)) : undefined,
    currency: typeof params.currency === 'string' ? params.currency : undefined,
    checkoutId: typeof params.checkoutId === 'string' ? params.checkoutId : undefined,
    paymentIntentId: typeof params.paymentIntentId === 'string' ? params.paymentIntentId : undefined,
    proofId: typeof params.proofId === 'string' ? params.proofId : undefined,

    taskId: typeof params.taskId === 'string' ? params.taskId : undefined,
    taskType: typeof params.taskType === 'string' ? params.taskType : undefined,

    requireSignature: typeof params.requireSignature === 'boolean' ? params.requireSignature : undefined,
    signatureB64Url: typeof params.signatureB64Url === 'string' ? params.signatureB64Url : undefined,

    meta: params.meta && typeof params.meta === 'object' ? params.meta : undefined
  };

  const key = recordKey(tenantId, agentId);
  const maxEvents = clampInt(Number(process.env.PHOENIX_ZERO_SEMANTIC_LEDGER_MAX_EVENTS || 2000), 50, 50_000);

  if (postgresEnabled()) {
    const kvKey = 'agent-semantic-ledger';
    await updateKvJsonLocked<SemanticLedgerDb>(kvKey, (current) => {
      const db: SemanticLedgerDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? {
              version: 1,
              eventsByAgentKey:
                typeof (current as any).eventsByAgentKey === 'object' && (current as any).eventsByAgentKey
                  ? (current as any).eventsByAgentKey
                  : {}
            }
          : { version: 1, eventsByAgentKey: {} };

      const arr = Array.isArray(db.eventsByAgentKey[key]) ? db.eventsByAgentKey[key] : [];
      arr.push(ev);
      if (arr.length > maxEvents) {
        db.eventsByAgentKey[key] = arr.slice(arr.length - maxEvents);
      } else {
        db.eventsByAgentKey[key] = arr;
      }
      return db;
    });
    return;
  }

  const db = await loadDbFromFile();
  const arr = Array.isArray(db.eventsByAgentKey[key]) ? db.eventsByAgentKey[key] : [];
  arr.push(ev);
  db.eventsByAgentKey[key] = arr.length > maxEvents ? arr.slice(arr.length - maxEvents) : arr;
  await saveDbToFile(db);
}

export async function listSemanticEvents(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<SemanticLedgerEvent[]> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return [];

  const limit = clampInt(Number(params.limit ?? 200), 1, 5000);
  const db = await loadDb();
  const key = recordKey(tenantId, agentId);
  const arr = Array.isArray(db.eventsByAgentKey[key]) ? db.eventsByAgentKey[key] : [];
  return arr.slice(Math.max(0, arr.length - limit));
}

export async function listSemanticEventsPage(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
  cursor?: string;
}): Promise<{ events: SemanticLedgerEvent[]; nextCursor: string | null }> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return { events: [], nextCursor: null };

  const limit = clampInt(Number(params.limit ?? 200), 1, 5000);
  const cursor = String(params.cursor || '').trim() || undefined;

  const db = await loadDb();
  const key = recordKey(tenantId, agentId);
  const arr = Array.isArray(db.eventsByAgentKey[key]) ? db.eventsByAgentKey[key] : [];

  let endExclusive = arr.length;
  if (cursor) {
    const idx = arr.findIndex((e) => e && typeof e.eventId === 'string' && e.eventId === cursor);
    if (idx >= 0) endExclusive = idx;
    else endExclusive = 0;
  }

  const startIdx = Math.max(0, endExclusive - limit);
  const pageChron = arr.slice(startIdx, endExclusive);
  const page = pageChron.slice().reverse();
  const hasMore = startIdx > 0;
  const oldest = pageChron.length ? pageChron[0] : null;
  const nextCursor = hasMore && oldest ? oldest.eventId : null;
  return { events: page, nextCursor };
}

export async function listSemanticEventsAll(params?: {
  tenantId?: string;
  limit?: number;
}): Promise<SemanticLedgerEvent[]> {
  const tenantId = String(params?.tenantId || '').trim() || undefined;
  const limit = clampInt(Number(params?.limit ?? 5000), 1, 100_000);

  const db = await loadDb();
  const all: SemanticLedgerEvent[] = [];
  for (const arr of Object.values(db.eventsByAgentKey || {})) {
    if (!Array.isArray(arr)) continue;
    for (const ev of arr) {
      if (!ev || typeof ev !== 'object') continue;
      if (tenantId && String((ev as any).tenantId || '').trim() !== tenantId) continue;
      all.push(ev as SemanticLedgerEvent);
    }
  }

  all.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return all.slice(0, limit);
}
