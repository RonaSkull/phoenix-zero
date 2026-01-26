import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { postgresEnabled, readKvJson, writeKvJson } from './pg-kv';
import { phoenixZeroTmpDir } from './tmp-dir';

type WebhookEventsDb = {
  version: 1;
  processed: Record<string, string>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'payment-webhook-events.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<WebhookEventsDb> {
  const kvKey = 'payment-webhook-events';
  const jsonFromPg = postgresEnabled() ? await readKvJson<WebhookEventsDb>(kvKey) : null;
  const jsonFromFile = jsonFromPg ? null : await readJsonMaybe<WebhookEventsDb>(dbPath());
  const json = jsonFromPg || jsonFromFile;

  const normalized: WebhookEventsDb = !json || json.version !== 1 || typeof json.processed !== 'object' || !json.processed
    ? { version: 1, processed: {} }
    : json;

  if (!jsonFromPg && jsonFromFile && postgresEnabled()) {
    await writeKvJson(kvKey, normalized);
  }

  return normalized;
}

async function saveDb(db: WebhookEventsDb): Promise<void> {
  const kvKey = 'payment-webhook-events';
  if (postgresEnabled()) {
    await writeKvJson(kvKey, db);
    return;
  }
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function key(provider: string, eventId: string): string {
  return `${String(provider || '').trim().toLowerCase()}:${String(eventId || '').trim()}`;
}

export async function isWebhookEventProcessed(params: {
  provider: string;
  eventId: string;
}): Promise<boolean> {
  const eventId = String(params.eventId || '').trim();
  if (!eventId) return false;
  const db = await loadDb();
  return Boolean(db.processed[key(params.provider, eventId)]);
}

export async function markWebhookEventProcessed(params: {
  provider: string;
  eventId: string;
}): Promise<void> {
  const eventId = String(params.eventId || '').trim();
  if (!eventId) return;
  const db = await loadDb();
  db.processed[key(params.provider, eventId)] = nowIso();
  await saveDb(db);
}
