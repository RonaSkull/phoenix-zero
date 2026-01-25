import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from '../tmp-dir';

type AntifraudEventsDb = {
  version: 1;
  processed: Record<string, string>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'antifraud-events.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<AntifraudEventsDb> {
  const json = await readJsonMaybe<AntifraudEventsDb>(dbPath());
  if (!json || json.version !== 1 || typeof json.processed !== 'object' || !json.processed) {
    return { version: 1, processed: {} };
  }
  return json;
}

async function saveDb(db: AntifraudEventsDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function key(source: string, eventId: string): string {
  return `${String(source || '').trim().toLowerCase()}:${String(eventId || '').trim()}`;
}

export async function isAntifraudEventProcessed(params: { source: string; eventId: string }): Promise<boolean> {
  const eventId = String(params.eventId || '').trim();
  if (!eventId) return false;
  const db = await loadDb();
  return Boolean(db.processed[key(params.source, eventId)]);
}

export async function markAntifraudEventProcessed(params: { source: string; eventId: string }): Promise<void> {
  const eventId = String(params.eventId || '').trim();
  if (!eventId) return;
  const db = await loadDb();
  db.processed[key(params.source, eventId)] = nowIso();
  await saveDb(db);
}
