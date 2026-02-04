import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, updateKvJsonLocked, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';

export type SovereignContractStatus = 'active' | 'paused' | 'expired';

export type SovereignExecutionClass = {
  classId: string;
  currency: string;
  pricePerExecutionCents: number;
  allowedTaskTypes?: string[];
  maxDailyExecutions?: number;
  maxMonthlyExecutions?: number;
};

export type SovereignContract = {
  contractId: string;
  tenantId: string;
  agentId: string;
  status: SovereignContractStatus;
  createdAt: string;
  updatedAt: string;
  effectiveAt?: string;
  expiresAt?: string;
  defaultExecutionClassId?: string;
  executionClasses: SovereignExecutionClass[];
  meta?: Record<string, any>;
};

type SovereignContractsDb = {
  version: 1;
  contracts: Record<string, SovereignContract>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'sovereign-contracts.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function recordKey(tenantId: string, agentId: string): string {
  return `${String(tenantId || '').trim()}::${String(agentId || '').trim()}`;
}

function normalizeId(x: unknown): string {
  return String(x || '').trim();
}

function normalizeStrList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    const s = String(x || '').trim();
    if (!s) continue;
    if (!out.includes(s)) out.push(s);
  }
  return out.length ? out : undefined;
}

function normalizeExecutionClass(v: any, currencyFallback: string): SovereignExecutionClass | null {
  if (!v || typeof v !== 'object') return null;
  const classId = normalizeId(v.classId);
  if (!classId) return null;
  const currency = normalizeId(v.currency) || currencyFallback || 'USD';
  const priceRaw = Number(v.pricePerExecutionCents ?? NaN);
  const pricePerExecutionCents = Number.isFinite(priceRaw) ? Math.max(0, Math.trunc(priceRaw)) : 0;

  const maxDailyRaw = Number(v.maxDailyExecutions ?? NaN);
  const maxDailyExecutions = Number.isFinite(maxDailyRaw) ? Math.max(0, Math.trunc(maxDailyRaw)) : undefined;

  const maxMonthlyRaw = Number(v.maxMonthlyExecutions ?? NaN);
  const maxMonthlyExecutions = Number.isFinite(maxMonthlyRaw) ? Math.max(0, Math.trunc(maxMonthlyRaw)) : undefined;

  const allowedTaskTypes = normalizeStrList(v.allowedTaskTypes);

  return {
    classId,
    currency,
    pricePerExecutionCents,
    allowedTaskTypes,
    maxDailyExecutions,
    maxMonthlyExecutions
  };
}

function normalizeContract(v: any): SovereignContract | null {
  if (!v || typeof v !== 'object') return null;

  const contractId = normalizeId(v.contractId);
  const tenantId = normalizeId(v.tenantId);
  const agentId = normalizeId(v.agentId);

  if (!contractId || !tenantId || !agentId) return null;

  const statusRaw = String(v.status || '').trim().toLowerCase();
  const status: SovereignContractStatus = statusRaw === 'paused' || statusRaw === 'expired' ? statusRaw : 'active';

  const createdAt = normalizeId(v.createdAt) || nowIso();
  const updatedAt = normalizeId(v.updatedAt) || createdAt;

  const effectiveAt = normalizeId(v.effectiveAt) || undefined;
  const expiresAt = normalizeId(v.expiresAt) || undefined;

  const defaultExecutionClassId = normalizeId(v.defaultExecutionClassId) || undefined;

  const execRaw = Array.isArray(v.executionClasses) ? v.executionClasses : [];
  const currencyFallback = normalizeId(v.currency) || 'USD';
  const executionClasses = execRaw
    .map((x: any) => normalizeExecutionClass(x, currencyFallback))
    .filter(Boolean) as SovereignExecutionClass[];

  const meta = v.meta && typeof v.meta === 'object' ? (v.meta as Record<string, any>) : undefined;

  return {
    contractId,
    tenantId,
    agentId,
    status,
    createdAt,
    updatedAt,
    effectiveAt,
    expiresAt,
    defaultExecutionClassId,
    executionClasses,
    meta
  };
}

async function loadDb(): Promise<SovereignContractsDb> {
  const kvKey = 'sovereign-contracts';

  const jsonFromPg = postgresEnabled() ? await readKvJson<any>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<any>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: SovereignContractsDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).contracts === 'object'
      ? { version: 1, contracts: (json as any).contracts }
      : { version: 1, contracts: {} };

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveDb(db: SovereignContractsDb): Promise<void> {
  const kvKey = 'sovereign-contracts';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

export async function getSovereignContract(params: {
  tenantId: string;
  agentId: string;
}): Promise<SovereignContract | null> {
  const tenantId = normalizeId(params.tenantId);
  const agentId = normalizeId(params.agentId);
  if (!tenantId || !agentId) return null;

  const db = await loadDb();
  const existing = db.contracts[recordKey(tenantId, agentId)] || null;
  const normalized = existing ? normalizeContract(existing) : null;
  return normalized;
}

export async function upsertSovereignContract(params: {
  contract: SovereignContract;
}): Promise<{ ok: true; contract: SovereignContract } | { ok: false; reason: string }> {
  const normalized = normalizeContract(params.contract);
  if (!normalized) return { ok: false, reason: 'Invalid contract' };

  const key = recordKey(normalized.tenantId, normalized.agentId);

  if (postgresEnabled()) {
    const next = await updateKvJsonLocked<SovereignContractsDb>('sovereign-contracts', (current) => {
      const db: SovereignContractsDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? {
              version: 1,
              contracts: typeof (current as any).contracts === 'object' && (current as any).contracts ? (current as any).contracts : {}
            }
          : { version: 1, contracts: {} };

      const existing = db.contracts[key];
      const createdAt = normalizeId((existing as any)?.createdAt) || normalized.createdAt || nowIso();
      db.contracts[key] = {
        ...normalized,
        createdAt,
        updatedAt: nowIso()
      };
      return db;
    });

    const saved = (next as any)?.contracts?.[key] as SovereignContract | undefined;
    const savedNorm = saved ? normalizeContract(saved) : null;
    if (!savedNorm) return { ok: false, reason: 'Failed to save contract' };
    return { ok: true, contract: savedNorm };
  }

  const db = await loadDb();
  const existing = db.contracts[key];
  const createdAt = normalizeId((existing as any)?.createdAt) || normalized.createdAt || nowIso();
  db.contracts[key] = { ...normalized, createdAt, updatedAt: nowIso() };
  await saveDb(db);

  const savedNorm = normalizeContract(db.contracts[key]);
  if (!savedNorm) return { ok: false, reason: 'Failed to save contract' };
  return { ok: true, contract: savedNorm };
}

export async function deleteSovereignContract(params: {
  tenantId: string;
  agentId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tenantId = normalizeId(params.tenantId);
  const agentId = normalizeId(params.agentId);
  if (!tenantId || !agentId) return { ok: false, reason: 'Invalid tenantId/agentId' };

  const key = recordKey(tenantId, agentId);

  if (postgresEnabled()) {
    await updateKvJsonLocked<SovereignContractsDb>('sovereign-contracts', (current) => {
      const db: SovereignContractsDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? {
              version: 1,
              contracts: typeof (current as any).contracts === 'object' && (current as any).contracts ? (current as any).contracts : {}
            }
          : { version: 1, contracts: {} };

      delete db.contracts[key];
      return db;
    });
    return { ok: true };
  }

  const db = await loadDb();
  delete db.contracts[key];
  await saveDb(db);
  return { ok: true };
}
