import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';

export type SourceVector = 'LIVE' | 'RECORDED' | 'HYBRID';

export type ObservationStateMachine =
  | 'OBSERVING'
  | 'CLASSIFIED'
  | 'PROTECTION_ENFORCED'
  | 'QUOTED'
  | 'ACTIVATED'
  | 'TERMINATED';

export type ObservationState = {
  sessionId: string;
  tenantId: string | null;
  state: ObservationStateMachine;
  sourceVector: SourceVector | null;
  confidence: number;
  temporalFlow: number;
  causalIntegrity: number;
  syntheticProbability: number;
  locked: boolean;
  observedAt: number;
  classifiedAt?: number;
  enforcedAt?: number;
  proofHash: string;
  hash: string;
};

type StoredSession = {
  sessionId: string;
  tenantId: string | null;
  observedAt: number;
  sourceVector: SourceVector;
  finalConfidence: number;
};

type SessionsDb = {
  version: 1;
  sessions: Record<string, StoredSession>;
};

function sessionsDbPath(): string {
  return join(phoenixZeroTmpDir(), 'observation-sessions.json');
}

function nowMs(): number {
  return Date.now();
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<SessionsDb> {
  const json = await readJsonMaybe<SessionsDb>(sessionsDbPath());
  if (!json || json.version !== 1 || typeof json.sessions !== 'object') {
    return { version: 1, sessions: {} };
  }
  return json;
}

async function saveDb(db: SessionsDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(sessionsDbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function pickSourceVector(sessionId: string): SourceVector {
  const hex = sha256Hex(sessionId);
  const b = parseInt(hex.slice(0, 2), 16);
  if (b >= 240) return 'HYBRID';
  if (b >= 170) return 'RECORDED';
  return 'LIVE';
}

function pickFinalConfidence(sessionId: string, source: SourceVector): number {
  const hex = sha256Hex(sessionId + '|' + source);
  const b = parseInt(hex.slice(2, 4), 16);
  const base = source === 'HYBRID' ? 88 : source === 'LIVE' ? 90 : 86;
  const spread = source === 'HYBRID' ? 10 : 8;
  return clampInt(base + Math.floor((b / 255) * spread), 50, 99);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export async function startObservationSession(params: {
  tenantId: string | null;
}): Promise<ObservationState> {
  const db = await loadDb();
  const sessionId = `obs_${b64Url(randomBytes(18))}`;
  const observedAt = nowMs();
  const sourceVector = pickSourceVector(sessionId);
  const finalConfidence = pickFinalConfidence(sessionId, sourceVector);

  db.sessions[sessionId] = { sessionId, tenantId: params.tenantId, observedAt, sourceVector, finalConfidence };
  await saveDb(db);

  return getObservationState(sessionId);
}

export async function getObservationState(sessionId: string): Promise<ObservationState> {
  const db = await loadDb();
  const rec = db.sessions[sessionId];
  if (!rec) {
    const observedAt = nowMs();
    const proofHash = sha256Hex(`${sessionId}|${observedAt}|`);
    return {
      sessionId,
      tenantId: null,
      state: 'TERMINATED',
      sourceVector: null,
      confidence: 0,
      temporalFlow: 0,
      causalIntegrity: 0,
      syntheticProbability: 0,
      locked: true,
      observedAt,
      proofHash,
      hash: proofHash
    };
  }

  const t = nowMs();
  const classifyDelayMs = 2600;
  const showVectorDelayMs = 900;

  const classifiedAt = rec.observedAt + classifyDelayMs;
  const isClassified = t >= classifiedAt;
  const progress = clamp01((t - rec.observedAt) / classifyDelayMs);

  const sourceVector = t >= rec.observedAt + showVectorDelayMs ? rec.sourceVector : null;

  const confidence = clampInt(lerp(35, rec.finalConfidence, Math.pow(progress, 0.9)), 0, 100);

  const baseTemporal = rec.sourceVector === 'LIVE' ? 0.86 : rec.sourceVector === 'RECORDED' ? 0.78 : 0.55;
  const baseCausal = rec.sourceVector === 'LIVE' ? 0.84 : rec.sourceVector === 'RECORDED' ? 0.8 : 0.52;
  const baseSynthetic = rec.sourceVector === 'LIVE' ? 0.18 : rec.sourceVector === 'RECORDED' ? 0.26 : 0.78;

  const jitterKey = sha256Hex(`${rec.sessionId}|${Math.floor(t / 220)}`);
  const jitter = (parseInt(jitterKey.slice(0, 2), 16) / 255 - 0.5) * 0.06;

  const temporalFlow = clamp01(lerp(0.12, baseTemporal, progress) + jitter);
  const causalIntegrity = clamp01(lerp(0.1, baseCausal, progress) + jitter);
  const syntheticProbability = clamp01(lerp(0.88, baseSynthetic, progress) - jitter);

  const state: ObservationStateMachine = isClassified ? 'CLASSIFIED' : 'OBSERVING';
  const enforcedAt = isClassified && rec.sourceVector === 'HYBRID' ? classifiedAt : undefined;

  const proofHash = sha256Hex(`${rec.sessionId}|${rec.observedAt}|${classifiedAt}|${rec.sourceVector}|${enforcedAt ?? ''}`);

  return {
    sessionId: rec.sessionId,
    tenantId: rec.tenantId,
    state,
    sourceVector: isClassified ? rec.sourceVector : sourceVector,
    confidence,
    temporalFlow,
    causalIntegrity,
    syntheticProbability,
    locked: true,
    observedAt: rec.observedAt,
    classifiedAt,
    enforcedAt,
    proofHash,
    hash: proofHash
  };
}
