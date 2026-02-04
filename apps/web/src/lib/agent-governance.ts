import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, updateKvJsonLocked, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';

import { effectiveAllowedActions, getAgentRecord, type AgentCapability, type AgentRecord } from './agent-registry';

export type AgentGovernanceDecision =
  | { ok: true; allowed: true; agent: AgentRecord }
  | { ok: true; allowed: false; reason: 'NOT_REGISTERED' | 'PAUSED' | 'ACTION_NOT_ALLOWED' | 'COOLDOWN' | 'DAILY_SPEND_LIMIT'; retryAfterSeconds?: number };

type AgentGovernanceState = {
  day: string;
  dailySpendCents: number;
  lastActionAtMsByAction: Record<string, number>;
};

type AgentGovernanceDb = {
  version: 1;
  states: Record<string, AgentGovernanceState>;
};

function nowMs(): number {
  return Date.now();
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function recordKey(tenantId: string, agentId: string): string {
  return `${String(tenantId || '').trim()}::${String(agentId || '').trim()}`;
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'agent-governance.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDbFromFile(): Promise<AgentGovernanceDb> {
  const json = await readJsonMaybe<any>(dbPath());
  const normalized: AgentGovernanceDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).states === 'object'
      ? { version: 1, states: (json as any).states }
      : { version: 1, states: {} };
  return normalized;
}

async function saveDbToFile(db: AgentGovernanceDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

async function loadDb(): Promise<AgentGovernanceDb> {
  const kvKey = 'agent-governance';

  const jsonFromPg = postgresEnabled() ? await readKvJson<any>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<any>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: AgentGovernanceDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).states === 'object'
      ? { version: 1, states: (json as any).states }
      : { version: 1, states: {} };

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

function normalizeState(v: any, day: string): AgentGovernanceState {
  const last = v && typeof v.lastActionAtMsByAction === 'object' && v.lastActionAtMsByAction ? v.lastActionAtMsByAction : {};
  return {
    day: typeof v?.day === 'string' && v.day.length >= 10 ? String(v.day).slice(0, 10) : day,
    dailySpendCents:
      typeof v?.dailySpendCents === 'number' && Number.isFinite(v.dailySpendCents) ? Math.max(0, Math.trunc(v.dailySpendCents)) : 0,
    lastActionAtMsByAction: typeof last === 'object' && last ? last : {}
  };
}

export function envBool(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

export async function checkAndConsumeAgentGovernance(params: {
  tenantId: string;
  agentId: string;
  action: AgentCapability;
  amountCents?: number;
  consume?: boolean;
  nowMs?: number;
}): Promise<AgentGovernanceDecision> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) {
    return { ok: true, allowed: false, reason: 'NOT_REGISTERED' };
  }

  const agent = await getAgentRecord({ tenantId, agentId });
  if (!agent) return { ok: true, allowed: false, reason: 'NOT_REGISTERED' };
  if (agent.status !== 'active') return { ok: true, allowed: false, reason: 'PAUSED' };

  const action = params.action;
  const allowed = effectiveAllowedActions(agent);
  if (allowed.length && !allowed.includes(action)) {
    return { ok: true, allowed: false, reason: 'ACTION_NOT_ALLOWED' };
  }

  const ms = Number.isFinite(Number(params.nowMs)) ? Number(params.nowMs) : nowMs();
  const day = isoDay(ms);
  const consume = params.consume !== false;

  const cooldownSeconds = clampInt(Number(agent.policy?.cooldownSecondsByAction?.[action] ?? 0), 0, 365 * 24 * 3600);
  const maxDailySpendCents =
    typeof agent.policy?.maxDailySpendCents === 'number' && Number.isFinite(agent.policy.maxDailySpendCents)
      ? Math.max(0, Math.trunc(agent.policy.maxDailySpendCents))
      : 0;
  const amountCents =
    typeof params.amountCents === 'number' && Number.isFinite(params.amountCents) ? Math.max(0, Math.trunc(params.amountCents)) : 0;

  if (postgresEnabled()) {
    const kvKey = 'agent-governance';

    let decision: AgentGovernanceDecision = { ok: true, allowed: true, agent };

    await updateKvJsonLocked<AgentGovernanceDb>(kvKey, (current) => {
      const db: AgentGovernanceDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? {
              version: 1,
              states: typeof (current as any).states === 'object' && (current as any).states ? (current as any).states : {}
            }
          : { version: 1, states: {} };

      const key = recordKey(tenantId, agentId);
      const st0 = normalizeState(db.states[key], day);

      const st = st0.day === day ? st0 : { ...st0, day, dailySpendCents: 0 };

      const lastAt = Number(st.lastActionAtMsByAction[action] ?? NaN);
      if (cooldownSeconds > 0 && Number.isFinite(lastAt)) {
        const nextOkAt = lastAt + cooldownSeconds * 1000;
        if (ms < nextOkAt) {
          const retryAfterSeconds = Math.max(1, Math.ceil((nextOkAt - ms) / 1000));
          decision = { ok: true, allowed: false, reason: 'COOLDOWN', retryAfterSeconds };
          return db;
        }
      }

      if (maxDailySpendCents > 0 && amountCents > 0) {
        if (st.dailySpendCents + amountCents > maxDailySpendCents) {
          decision = { ok: true, allowed: false, reason: 'DAILY_SPEND_LIMIT' };
          return db;
        }
      }

      if (consume) {
        st.lastActionAtMsByAction[action] = ms;
        if (maxDailySpendCents > 0 && amountCents > 0) {
          st.dailySpendCents = Math.max(0, Math.trunc(st.dailySpendCents + amountCents));
        }
        db.states[key] = st;
      }

      decision = { ok: true, allowed: true, agent };
      return db;
    });

    return decision;
  }

  const db = await loadDbFromFile();
  const key = recordKey(tenantId, agentId);
  const st0 = normalizeState(db.states[key], day);
  const st = st0.day === day ? st0 : { ...st0, day, dailySpendCents: 0 };

  const lastAt = Number(st.lastActionAtMsByAction[action] ?? NaN);
  if (cooldownSeconds > 0 && Number.isFinite(lastAt)) {
    const nextOkAt = lastAt + cooldownSeconds * 1000;
    if (ms < nextOkAt) {
      const retryAfterSeconds = Math.max(1, Math.ceil((nextOkAt - ms) / 1000));
      return { ok: true, allowed: false, reason: 'COOLDOWN', retryAfterSeconds };
    }
  }

  if (maxDailySpendCents > 0 && amountCents > 0) {
    if (st.dailySpendCents + amountCents > maxDailySpendCents) {
      return { ok: true, allowed: false, reason: 'DAILY_SPEND_LIMIT' };
    }
  }

  if (consume) {
    st.lastActionAtMsByAction[action] = ms;
    if (maxDailySpendCents > 0 && amountCents > 0) {
      st.dailySpendCents = Math.max(0, Math.trunc(st.dailySpendCents + amountCents));
    }
    db.states[key] = st;
    await saveDbToFile(db);
  }

  return { ok: true, allowed: true, agent };
}
