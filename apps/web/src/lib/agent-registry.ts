import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, updateKvJsonLocked, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';

export type AgentCapability =
  | 'checkout:create'
  | 'checkout:status'
  | 'gate:read'
  | 'execute'
  | 'ledger:read'
  | 'events:read'
  | 'identity:read'
  | 'identity:write';

export type AgentPolicy = {
  maxDailySpendCents?: number;
  cooldownSecondsByAction?: Partial<Record<AgentCapability, number>>;
  allowedActions?: AgentCapability[];
};

export type AgentRecord = {
  tenantId: string;
  agentId: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'paused';
  agentName?: string;
  ed25519PublicKeyB64Url?: string;
  capabilityScope?: AgentCapability[];
  policy?: AgentPolicy;
};

type AgentRegistryDb = {
  version: 1;
  records: Record<string, AgentRecord>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'agent-registry.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDbFromFile(): Promise<AgentRegistryDb> {
  const json = await readJsonMaybe<any>(dbPath());
  const normalized: AgentRegistryDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).records === 'object'
      ? { version: 1, records: (json as any).records }
      : { version: 1, records: {} };
  return normalized;
}

async function saveDbToFile(db: AgentRegistryDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function normalizeCapability(v: unknown): AgentCapability | null {
  const s = String(v || '')
    .trim()
    .toLowerCase();
  if (
    s === 'checkout:create' ||
    s === 'checkout:status' ||
    s === 'gate:read' ||
    s === 'execute' ||
    s === 'ledger:read' ||
    s === 'events:read' ||
    s === 'identity:read' ||
    s === 'identity:write'
  )
    return s;
  return null;
}

function normalizeCapabilityList(v: unknown): AgentCapability[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: AgentCapability[] = [];
  for (const x of v) {
    const cap = normalizeCapability(x);
    if (!cap) continue;
    if (!out.includes(cap)) out.push(cap);
  }
  return out.length ? out : undefined;
}

function normalizePolicy(v: unknown): AgentPolicy | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const maxDailySpendCentsRaw = (v as any).maxDailySpendCents;
  const maxDailySpendCents =
    typeof maxDailySpendCentsRaw === 'number' && Number.isFinite(maxDailySpendCentsRaw)
      ? Math.max(0, Math.trunc(maxDailySpendCentsRaw))
      : undefined;

  const cooldownSecondsByActionRaw = (v as any).cooldownSecondsByAction;
  const cooldownSecondsByAction: AgentPolicy['cooldownSecondsByAction'] =
    cooldownSecondsByActionRaw && typeof cooldownSecondsByActionRaw === 'object' ? {} : undefined;

  if (cooldownSecondsByAction) {
    for (const [k, val] of Object.entries(cooldownSecondsByActionRaw as any)) {
      const cap = normalizeCapability(k);
      if (!cap) continue;
      const n = Number(val);
      if (!Number.isFinite(n)) continue;
      const sec = Math.max(0, Math.trunc(n));
      (cooldownSecondsByAction as any)[cap] = sec;
    }
  }

  const allowedActions = normalizeCapabilityList((v as any).allowedActions);

  const out: AgentPolicy = {
    maxDailySpendCents,
    cooldownSecondsByAction: cooldownSecondsByAction && Object.keys(cooldownSecondsByAction).length ? cooldownSecondsByAction : undefined,
    allowedActions
  };

  if (out.maxDailySpendCents === undefined && out.cooldownSecondsByAction === undefined && out.allowedActions === undefined) {
    return undefined;
  }

  return out;
}

function recordKey(tenantId: string, agentId: string): string {
  return `${String(tenantId || '').trim()}::${String(agentId || '').trim()}`;
}

async function loadDb(): Promise<AgentRegistryDb> {
  const kvKey = 'agent-registry';

  const jsonFromPg = postgresEnabled() ? await readKvJson<any>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<any>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: AgentRegistryDb =
    json && typeof json === 'object' && (json as any).version === 1 && typeof (json as any).records === 'object'
      ? { version: 1, records: (json as any).records }
      : { version: 1, records: {} };

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

export async function getAgentRecord(params: {
  tenantId: string;
  agentId: string;
}): Promise<AgentRecord | null> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return null;
  const db = await loadDb();
  return db.records[recordKey(tenantId, agentId)] || null;
}

export async function upsertAgentRecord(params: {
  tenantId: string;
  agentId: string;
  agentName?: string;
  ed25519PublicKeyB64Url?: string;
  capabilityScope?: unknown;
  policy?: unknown;
  status?: 'active' | 'paused';
}): Promise<AgentRecord | null> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return null;

  const agentName = String(params.agentName || '').trim() || undefined;
  const ed25519PublicKeyB64Url = String(params.ed25519PublicKeyB64Url || '').trim() || undefined;
  const capabilityScope = normalizeCapabilityList(params.capabilityScope);
  const policy = normalizePolicy(params.policy);

  const key = recordKey(tenantId, agentId);

  if (postgresEnabled()) {
    const kvKey = 'agent-registry';
    const nextDb = await updateKvJsonLocked<AgentRegistryDb>(kvKey, (current) => {
      const db: AgentRegistryDb =
        current && typeof current === 'object' && (current as any).version === 1
          ? ({
              version: 1,
              records: typeof (current as any).records === 'object' && (current as any).records ? (current as any).records : {}
            } as any)
          : { version: 1, records: {} };

      const existing = db.records[key];
      const createdAt = existing?.createdAt || nowIso();
      const updatedAt = nowIso();

      db.records[key] = {
        tenantId,
        agentId,
        createdAt,
        updatedAt,
        status: params.status || existing?.status || 'active',
        agentName: agentName ?? existing?.agentName,
        ed25519PublicKeyB64Url: ed25519PublicKeyB64Url ?? existing?.ed25519PublicKeyB64Url,
        capabilityScope: capabilityScope ?? existing?.capabilityScope,
        policy: policy ?? existing?.policy
      };

      return db;
    });

    return nextDb.records[key] || null;
  }

  const db = await loadDbFromFile();
  const existing = db.records[key];
  const createdAt = existing?.createdAt || nowIso();
  const updatedAt = nowIso();

  db.records[key] = {
    tenantId,
    agentId,
    createdAt,
    updatedAt,
    status: params.status || existing?.status || 'active',
    agentName: agentName ?? existing?.agentName,
    ed25519PublicKeyB64Url: ed25519PublicKeyB64Url ?? existing?.ed25519PublicKeyB64Url,
    capabilityScope: capabilityScope ?? existing?.capabilityScope,
    policy: policy ?? existing?.policy
  };

  await saveDbToFile(db);
  return db.records[key] || null;
}

export function agentHasCapability(params: {
  agent: AgentRecord;
  capability: AgentCapability | string;
  allowWildcard?: boolean;
}): boolean {
  const cap = normalizeCapability(params.capability);
  if (!cap) return false;

  const allowWildcard = params.allowWildcard !== false;
  const scope = Array.isArray(params.agent.capabilityScope) ? params.agent.capabilityScope : [];

  if (scope.includes(cap)) return true;

  if (allowWildcard && cap.startsWith('execute') && scope.includes('execute')) return true;

  return false;
}

export function effectiveAllowedActions(agent: AgentRecord): AgentCapability[] {
  const policyAllowed = Array.isArray(agent.policy?.allowedActions) ? agent.policy?.allowedActions : [];
  const scope = Array.isArray(agent.capabilityScope) ? agent.capabilityScope : [];
  const combined = [...scope, ...policyAllowed].filter(Boolean) as AgentCapability[];
  return Array.from(new Set(combined));
}
