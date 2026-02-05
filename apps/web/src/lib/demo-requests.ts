import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';

export type DemoRequestRecord = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  company: string;
  country?: string;
  monthlyVolume?: string;
  message?: string;
  source?: string;
  ip?: string;
  userAgent?: string;
  fpHash4?: string;
};

type DemoRequestsDb = {
  version: 1;
  requests: Record<string, DemoRequestRecord>;
  emailHashIndex: Record<string, string[]>;
};

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

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function rebuildEmailHashIndex(requests: Record<string, DemoRequestRecord>): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  for (const [key, rec] of Object.entries(requests || {})) {
    if (!rec || typeof rec !== 'object') continue;
    if (!rec.id || typeof rec.id !== 'string') continue;
    if (key !== rec.id) continue;
    const email = String(rec.email || '').trim().toLowerCase();
    if (!email) continue;
    const h = sha256Hex(email);
    const arr = idx[h] || [];
    arr.push(rec.id);
    idx[h] = arr;
  }
  return idx;
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'demo-requests.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<DemoRequestsDb> {
  const kvKey = 'demo-requests';
  const jsonFromPg = postgresEnabled() ? await readKvJson<DemoRequestsDb>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<DemoRequestsDb>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const requests: Record<string, DemoRequestRecord> =
    json &&
    json.version === 1 &&
    typeof (json as any).requests === 'object' &&
    (json as any).requests
      ? ((json as any).requests as Record<string, DemoRequestRecord>)
      : {};

  const emailHashIndex: Record<string, string[]> =
    json &&
    json.version === 1 &&
    typeof (json as any).emailHashIndex === 'object' &&
    (json as any).emailHashIndex
      ? ((json as any).emailHashIndex as Record<string, string[]>)
      : rebuildEmailHashIndex(requests);

  const normalized: DemoRequestsDb = { version: 1, requests, emailHashIndex };

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveDb(db: DemoRequestsDb): Promise<void> {
  const kvKey = 'demo-requests';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }

  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function safeTrunc(s: string, n: number): string {
  const x = String(s || '').trim();
  if (x.length <= n) return x;
  return x.slice(0, n);
}

export async function recordDemoRequest(params: {
  name: string;
  email: string;
  company: string;
  country?: string;
  monthlyVolume?: string;
  message?: string;
  source?: string;
  ip?: string;
  userAgent?: string;
  fpHash4?: string;
}): Promise<DemoRequestRecord> {
  const db = await loadDb();

  const id = `demo_${b64Url(randomBytes(16))}`;
  const createdAt = nowIso();

  const rec: DemoRequestRecord = {
    id,
    createdAt,
    name: safeTrunc(params.name, 120),
    email: safeTrunc(params.email, 160),
    company: safeTrunc(params.company, 160),
    country: params.country ? safeTrunc(params.country, 80) : undefined,
    monthlyVolume: params.monthlyVolume ? safeTrunc(params.monthlyVolume, 80) : undefined,
    message: params.message ? safeTrunc(params.message, 2000) : undefined,
    source: params.source ? safeTrunc(params.source, 120) : undefined,
    ip: params.ip ? safeTrunc(params.ip, 80) : undefined,
    userAgent: params.userAgent ? safeTrunc(params.userAgent, 240) : undefined,
    fpHash4: params.fpHash4 ? safeTrunc(params.fpHash4, 16) : undefined
  };

  db.requests[id] = rec;
  const emailHash = sha256Hex(rec.email.toLowerCase());
  const idx = db.emailHashIndex[emailHash] || [];
  idx.push(id);
  db.emailHashIndex[emailHash] = idx;

  await saveDb(db);
  return rec;
}
