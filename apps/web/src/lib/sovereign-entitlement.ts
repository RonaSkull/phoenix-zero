import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, updateKvJsonLocked, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';
import { getSovereignContract, type SovereignContract, type SovereignExecutionClass } from './sovereign-contracts';

export type SovereignEntitlementReasonCode =
  | 'SOVEREIGN_NOT_ENFORCED'
  | 'NO_CONTRACT'
  | 'CONTRACT_PAUSED'
  | 'CONTRACT_EXPIRED'
  | 'CONTRACT_NOT_EFFECTIVE'
  | 'EXECUTION_CLASS_NOT_FOUND'
  | 'TASK_TYPE_NOT_ALLOWED'
  | 'DAILY_EXECUTION_LIMIT'
  | 'MONTHLY_EXECUTION_LIMIT'
  | 'INVALID_REQUEST';

export type SovereignEntitlementDecision =
  | {
      ok: true;
      allowed: true;
      contract: SovereignContract;
      executionClass: SovereignExecutionClass;
      usage?: {
        day: string;
        month: string;
        dailyExecutions: number;
        monthlyExecutions: number;
      };
    }
  | {
      ok: true;
      allowed: false;
      reasonCode: SovereignEntitlementReasonCode;
      reason: string;
    };

type SovereignExecutionUsageState = {
  day: string;
  month: string;
  dailyExecutions: number;
  monthlyExecutions: number;
};

type SovereignExecutionUsageDb = {
  version: 1;
  states: Record<string, SovereignExecutionUsageState>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function recordKey(tenantId: string, agentId: string, executionClassId: string): string {
  return `${String(tenantId || '').trim()}::${String(agentId || '').trim()}::${String(executionClassId || '').trim()}`;
}

function envBool(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

function failurePolicy(): 'on_success' | 'always' | 'refund' {
  const raw = String(process.env.PHOENIX_ZERO_SOVEREIGN_FAILURE_POLICY || '').trim().toLowerCase();
  if (raw === 'always') return 'always';
  if (raw === 'refund') return 'refund';
  return 'on_success';
}

function parseTimeOrNull(v: unknown): number | null {
  const s = String(v || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return t;
}

function resolveExecutionClass(params: {
  contract: SovereignContract;
  requestedExecutionClassId?: string;
}): SovereignExecutionClass | null {
  const requested = String(params.requestedExecutionClassId || '').trim();
  const contract = params.contract;

  if (!Array.isArray(contract.executionClasses) || contract.executionClasses.length <= 0) return null;

  if (requested) {
    for (const c of contract.executionClasses) {
      if (c && String(c.classId || '').trim() === requested) return c;
    }
    return null;
  }

  const defaultId = String(contract.defaultExecutionClassId || '').trim();
  if (defaultId) {
    for (const c of contract.executionClasses) {
      if (c && String(c.classId || '').trim() === defaultId) return c;
    }
  }

  return contract.executionClasses[0] || null;
}

function taskTypeAllowed(executionClass: SovereignExecutionClass, taskType: string): boolean {
  const list = executionClass.allowedTaskTypes;
  if (!Array.isArray(list) || list.length <= 0) return true;
  const t = String(taskType || '').trim();
  if (!t) return false;
  return list.some((x) => String(x || '').trim() === t);
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'sovereign-execution-usage.json');
}

async function loadUsageDb(): Promise<SovereignExecutionUsageDb> {
  const kvKey = 'sovereign-execution-usage';

  const jsonFromPg = postgresEnabled() ? await readKvJson<any>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<any>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: SovereignExecutionUsageDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).states === 'object'
      ? { version: 1, states: (json as any).states }
      : { version: 1, states: {} };

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveUsageDb(db: SovereignExecutionUsageDb): Promise<void> {
  const kvKey = 'sovereign-execution-usage';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function normalizeUsageState(v: any, day: string, month: string): SovereignExecutionUsageState {
  const rawDay = typeof v?.day === 'string' && v.day.length >= 10 ? String(v.day).slice(0, 10) : day;
  const rawMonth = typeof v?.month === 'string' && v.month.length >= 7 ? String(v.month).slice(0, 7) : month;

  const daily = typeof v?.dailyExecutions === 'number' && Number.isFinite(v.dailyExecutions) ? Math.max(0, Math.trunc(v.dailyExecutions)) : 0;
  const monthly = typeof v?.monthlyExecutions === 'number' && Number.isFinite(v.monthlyExecutions) ? Math.max(0, Math.trunc(v.monthlyExecutions)) : 0;

  const dayOk = rawDay === day;
  const monthOk = rawMonth === month;

  return {
    day,
    month,
    dailyExecutions: dayOk ? daily : 0,
    monthlyExecutions: monthOk ? monthly : 0
  };
}

export async function validateExecutionEntitlement(params: {
  tenantId: string;
  agentId: string;
  taskType: string;
  requestedExecutionClassId?: string;
  enforce?: boolean;
}): Promise<SovereignEntitlementDecision> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const taskType = String(params.taskType || '').trim();
  if (!tenantId || !agentId || !taskType) {
    return { ok: true, allowed: false, reasonCode: 'INVALID_REQUEST', reason: 'INVALID_REQUEST' };
  }

  const enforce = params.enforce === true;
  if (!enforce) {
    return { ok: true, allowed: false, reasonCode: 'SOVEREIGN_NOT_ENFORCED', reason: 'SOVEREIGN_NOT_ENFORCED' };
  }

  const contract = await getSovereignContract({ tenantId, agentId });
  if (!contract) {
    return { ok: true, allowed: false, reasonCode: 'NO_CONTRACT', reason: 'NO_CONTRACT' };
  }

  if (contract.status === 'paused') {
    return { ok: true, allowed: false, reasonCode: 'CONTRACT_PAUSED', reason: 'CONTRACT_PAUSED' };
  }
  if (contract.status === 'expired') {
    return { ok: true, allowed: false, reasonCode: 'CONTRACT_EXPIRED', reason: 'CONTRACT_EXPIRED' };
  }

  const effectiveAt = parseTimeOrNull(contract.effectiveAt);
  if (effectiveAt != null && Date.now() < effectiveAt) {
    return { ok: true, allowed: false, reasonCode: 'CONTRACT_NOT_EFFECTIVE', reason: 'CONTRACT_NOT_EFFECTIVE' };
  }

  const expiresAt = parseTimeOrNull(contract.expiresAt);
  if (expiresAt != null && Date.now() > expiresAt) {
    return { ok: true, allowed: false, reasonCode: 'CONTRACT_EXPIRED', reason: 'CONTRACT_EXPIRED' };
  }

  const executionClass = resolveExecutionClass({ contract, requestedExecutionClassId: params.requestedExecutionClassId });
  if (!executionClass) {
    return { ok: true, allowed: false, reasonCode: 'EXECUTION_CLASS_NOT_FOUND', reason: 'EXECUTION_CLASS_NOT_FOUND' };
  }

  if (!taskTypeAllowed(executionClass, taskType)) {
    return { ok: true, allowed: false, reasonCode: 'TASK_TYPE_NOT_ALLOWED', reason: 'TASK_TYPE_NOT_ALLOWED' };
  }

  const maxDaily =
    typeof executionClass.maxDailyExecutions === 'number' && Number.isFinite(executionClass.maxDailyExecutions)
      ? Math.max(0, Math.trunc(executionClass.maxDailyExecutions))
      : 0;
  const maxMonthly =
    typeof executionClass.maxMonthlyExecutions === 'number' && Number.isFinite(executionClass.maxMonthlyExecutions)
      ? Math.max(0, Math.trunc(executionClass.maxMonthlyExecutions))
      : 0;

  if (maxDaily > 0 || maxMonthly > 0) {
    const d = new Date();
    const day = isoDay(d);
    const month = isoMonth(d);
    const key = recordKey(tenantId, agentId, executionClass.classId);
    const db = await loadUsageDb();
    const st0 = normalizeUsageState(db.states[key], day, month);

    if (maxDaily > 0 && st0.dailyExecutions >= maxDaily) {
      return { ok: true, allowed: false, reasonCode: 'DAILY_EXECUTION_LIMIT', reason: 'DAILY_EXECUTION_LIMIT' };
    }

    if (maxMonthly > 0 && st0.monthlyExecutions >= maxMonthly) {
      return { ok: true, allowed: false, reasonCode: 'MONTHLY_EXECUTION_LIMIT', reason: 'MONTHLY_EXECUTION_LIMIT' };
    }
  }

  return { ok: true, allowed: true, contract, executionClass };
}

export async function tryConsumeExecutionEntitlement(params: {
  tenantId: string;
  agentId: string;
  contractId: string;
  executionClass: SovereignExecutionClass;
}): Promise<
  | {
      ok: true;
      allowed: true;
      usage: {
        day: string;
        month: string;
        dailyExecutions: number;
        monthlyExecutions: number;
      };
    }
  | { ok: true; allowed: false; reasonCode: 'DAILY_EXECUTION_LIMIT' | 'MONTHLY_EXECUTION_LIMIT' | 'INVALID_REQUEST'; reason: string }
> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const executionClassId = String(params.executionClass?.classId || '').trim();
  if (!tenantId || !agentId || !executionClassId) {
    return { ok: true, allowed: false, reasonCode: 'INVALID_REQUEST', reason: 'INVALID_REQUEST' };
  }

  const maxDaily =
    typeof params.executionClass.maxDailyExecutions === 'number' && Number.isFinite(params.executionClass.maxDailyExecutions)
      ? Math.max(0, Math.trunc(params.executionClass.maxDailyExecutions))
      : 0;
  const maxMonthly =
    typeof params.executionClass.maxMonthlyExecutions === 'number' && Number.isFinite(params.executionClass.maxMonthlyExecutions)
      ? Math.max(0, Math.trunc(params.executionClass.maxMonthlyExecutions))
      : 0;

  const d = new Date();
  const day = isoDay(d);
  const month = isoMonth(d);

  const key = recordKey(tenantId, agentId, executionClassId);

  if (postgresEnabled()) {
    let allowed = true;
    let reasonCode: 'DAILY_EXECUTION_LIMIT' | 'MONTHLY_EXECUTION_LIMIT' | null = null;

    const next = await updateKvJsonLocked<SovereignExecutionUsageDb>('sovereign-execution-usage', (current) => {
      const db: SovereignExecutionUsageDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? {
              version: 1,
              states: typeof (current as any).states === 'object' && (current as any).states ? (current as any).states : {}
            }
          : { version: 1, states: {} };

      const st = normalizeUsageState(db.states[key], day, month);

      const nextDaily = st.dailyExecutions + 1;
      const nextMonthly = st.monthlyExecutions + 1;

      if (maxDaily > 0 && nextDaily > maxDaily) {
        allowed = false;
        reasonCode = 'DAILY_EXECUTION_LIMIT';
        return db;
      }

      if (maxMonthly > 0 && nextMonthly > maxMonthly) {
        allowed = false;
        reasonCode = 'MONTHLY_EXECUTION_LIMIT';
        return db;
      }

      db.states[key] = {
        day,
        month,
        dailyExecutions: nextDaily,
        monthlyExecutions: nextMonthly
      };

      return db;
    });

    if (!allowed) {
      return { ok: true, allowed: false, reasonCode: reasonCode || 'DAILY_EXECUTION_LIMIT', reason: reasonCode || 'DAILY_EXECUTION_LIMIT' };
    }

    const st = (next as any)?.states?.[key];
    const usage = normalizeUsageState(st, day, month);
    return { ok: true, allowed: true, usage };
  }

  const db = await loadUsageDb();
  const st0 = normalizeUsageState(db.states[key], day, month);
  const nextDaily = st0.dailyExecutions + 1;
  const nextMonthly = st0.monthlyExecutions + 1;

  if (maxDaily > 0 && nextDaily > maxDaily) {
    return { ok: true, allowed: false, reasonCode: 'DAILY_EXECUTION_LIMIT', reason: 'DAILY_EXECUTION_LIMIT' };
  }

  if (maxMonthly > 0 && nextMonthly > maxMonthly) {
    return { ok: true, allowed: false, reasonCode: 'MONTHLY_EXECUTION_LIMIT', reason: 'MONTHLY_EXECUTION_LIMIT' };
  }

  db.states[key] = { day, month, dailyExecutions: nextDaily, monthlyExecutions: nextMonthly };
  await saveUsageDb(db);
  return { ok: true, allowed: true, usage: db.states[key] };
}

export async function tryReleaseExecutionEntitlement(params: {
  tenantId: string;
  agentId: string;
  executionClassId: string;
}): Promise<void> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const executionClassId = String(params.executionClassId || '').trim();
  if (!tenantId || !agentId || !executionClassId) return;

  const d = new Date();
  const day = isoDay(d);
  const month = isoMonth(d);
  const key = recordKey(tenantId, agentId, executionClassId);

  if (postgresEnabled()) {
    await updateKvJsonLocked<SovereignExecutionUsageDb>('sovereign-execution-usage', (current) => {
      const db: SovereignExecutionUsageDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? {
              version: 1,
              states: typeof (current as any).states === 'object' && (current as any).states ? (current as any).states : {}
            }
          : { version: 1, states: {} };

      const st0 = normalizeUsageState(db.states[key], day, month);
      db.states[key] = {
        day,
        month,
        dailyExecutions: Math.max(0, st0.dailyExecutions - 1),
        monthlyExecutions: Math.max(0, st0.monthlyExecutions - 1)
      };
      return db;
    }).catch(() => {});
    return;
  }

  const db = await loadUsageDb();
  const st0 = normalizeUsageState(db.states[key], day, month);
  db.states[key] = {
    day,
    month,
    dailyExecutions: Math.max(0, st0.dailyExecutions - 1),
    monthlyExecutions: Math.max(0, st0.monthlyExecutions - 1)
  };
  await saveUsageDb(db);
}

export async function executeWithSovereignEntitlement<T>(params: {
  tenantId: string;
  agentId: string;
  contractId: string;
  executionClass: SovereignExecutionClass;
  action: () => Promise<T>;
  releaseOnFailure?: boolean;
}): Promise<
  | { ok: true; result: T; usage: SovereignExecutionUsageState }
  | { ok: false; reasonCode: 'DAILY_EXECUTION_LIMIT' | 'MONTHLY_EXECUTION_LIMIT' | 'INVALID_REQUEST'; reason: string }
> {
  const consume = await tryConsumeExecutionEntitlement({
    tenantId: params.tenantId,
    agentId: params.agentId,
    contractId: params.contractId,
    executionClass: params.executionClass
  });

  if (!consume.allowed) {
    return { ok: false, reasonCode: consume.reasonCode, reason: consume.reason };
  }

  try {
    const result = await params.action();
    return { ok: true, result, usage: consume.usage };
  } catch (e) {
    const policy = failurePolicy();
    const shouldRelease = params.releaseOnFailure === true || policy !== 'always';
    if (shouldRelease) {
      await tryReleaseExecutionEntitlement({
        tenantId: params.tenantId,
        agentId: params.agentId,
        executionClassId: params.executionClass.classId
      }).catch(() => {});
    }
    throw e;
  }
}

export function sovereignEntitlementEnforced(): boolean {
  return envBool('PHOENIX_ZERO_SOVEREIGN_ENFORCE_ENTITLEMENT');
}

export function sovereignEntitlementDebugEnabled(): boolean {
  return envBool('PHOENIX_ZERO_SOVEREIGN_DEBUG');
}

export function sovereignEntitlementVersion(): string {
  return `sovereign-entitlement@${nowIso()}`;
}
