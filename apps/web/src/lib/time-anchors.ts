import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  ed25519KeyPairFromPrivateKey,
  phoenixZeroStableStringify,
  sha256B64Url
} from '@phoenix-zero/core';
import {
  createHybridSignature,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  verifyHybridSignature,
  type PhoenixZeroHybridMode,
  type PhoenixZeroHybridSignature
} from '@phoenix-zero/core/node';

export type TimeAnchorKind = 'live' | 'vod';

export type TimeAnchorPayload = {
  version: 1;
  createdAt: string;
  anchorId: string;
  creatorId?: string;
  clientId?: string;
  anchorProfileId?: string;
  kind: TimeAnchorKind;
  contentCommit: {
    alg: 'sha256_b64url_v1';
    value: string;
  };
  expiresAt: string;
  signatureMode: PhoenixZeroHybridMode;
};

export type TimeAnchorRecord = TimeAnchorPayload & {
  hybridSignature: PhoenixZeroHybridSignature;
};

type TimeAnchorsDb = {
  version: 1;
  anchors: Record<string, TimeAnchorRecord>;
  tenantByAnchorId: Record<string, string>;
};

type KeyFile = { privateKeyB64Url?: string; publicKeyB64Url?: string };

type PqKeyFile = { privateKeyB64Url?: string; publicKeyB64Url?: string };

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'time-anchors.json');
}

export async function getTimeAnchorForTenant(params: { anchorId: string; tenantId: string }): Promise<TimeAnchorRecord | null> {
  const db = await loadDb();
  const owner = db.tenantByAnchorId[params.anchorId];
  if (!owner || owner !== params.tenantId) return null;
  return db.anchors[params.anchorId] ?? null;
}

function transparencyLogPath(): string {
  return join(phoenixZeroTmpDir(), 'time-anchors.transparency.jsonl');
}

 type TimeAnchorVerificationTokenDb = {
   version: 1;
   tokens: Record<
     string,
     {
       anchorId: string;
       contentCommitB64Url: string;
       createdAt: string;
     }
   >;
 };

 function verificationTokenDbPath(): string {
   return join(phoenixZeroTmpDir(), 'time-anchor-verification-tokens.json');
 }

function keysPath(file: string): string {
  return resolve(process.cwd(), '..', '..', 'keys', file);
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<TimeAnchorsDb> {
  try {
    const txt = await readFile(dbPath(), 'utf8');
    const json = JSON.parse(txt) as TimeAnchorsDb;
    if (!json || typeof json !== 'object' || json.version !== 1 || !json.anchors || typeof json.anchors !== 'object') {
      return { version: 1, anchors: {}, tenantByAnchorId: {} };
    }
    if (!json.tenantByAnchorId || typeof json.tenantByAnchorId !== 'object') {
      return { version: 1, anchors: json.anchors ?? {}, tenantByAnchorId: {} };
    }
    return json;
  } catch {
    return { version: 1, anchors: {}, tenantByAnchorId: {} };
  }
}

 async function loadVerificationTokenDb(): Promise<TimeAnchorVerificationTokenDb> {
   try {
     const txt = await readFile(verificationTokenDbPath(), 'utf8');
     const json = JSON.parse(txt) as TimeAnchorVerificationTokenDb;
     if (!json || typeof json !== 'object' || json.version !== 1 || !json.tokens || typeof json.tokens !== 'object') {
       return { version: 1, tokens: {} };
     }
     return json;
   } catch {
     return { version: 1, tokens: {} };
   }
 }

async function saveDb(db: TimeAnchorsDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

 async function saveVerificationTokenDb(db: TimeAnchorVerificationTokenDb): Promise<void> {
   await mkdir(phoenixZeroTmpDir(), { recursive: true });
   await writeFile(verificationTokenDbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
 }

function nowIso(): string {
  return new Date().toISOString();
}

 export async function createTimeAnchorVerificationToken(params: {
   anchorId: string;
   contentCommitB64Url: string;
 }): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
   try {
     const db = await loadVerificationTokenDb();

     let token = '';
     for (let i = 0; i < 5; i++) {
       token = b64Url(randomBytes(9));
       if (!db.tokens[token]) break;
     }
     if (!token || db.tokens[token]) return { ok: false, reason: 'Failed to allocate verification token' };

     db.tokens[token] = {
       anchorId: params.anchorId,
       contentCommitB64Url: params.contentCommitB64Url,
       createdAt: nowIso()
     };

     await saveVerificationTokenDb(db);
     return { ok: true, token };
   } catch (e) {
     const message = e instanceof Error ? e.message : 'Unknown error';
     return { ok: false, reason: message };
   }
 }

 export async function resolveTimeAnchorVerificationToken(params: {
   anchorId: string;
   token: string;
 }): Promise<{ ok: true; contentCommitB64Url: string } | { ok: false; reason: string }> {
   try {
     const db = await loadVerificationTokenDb();
     const rec = db.tokens[params.token];
     if (!rec) return { ok: false, reason: 'Invalid verification token' };
     if (rec.anchorId !== params.anchorId) return { ok: false, reason: 'Invalid verification token' };
     return { ok: true, contentCommitB64Url: rec.contentCommitB64Url };
   } catch (e) {
     const message = e instanceof Error ? e.message : 'Unknown error';
     return { ok: false, reason: message };
   }
 }

function nowMs(): number {
  return Date.now();
}

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

async function loadSigningKeys(mode: PhoenixZeroHybridMode): Promise<
  | {
      mode: PhoenixZeroHybridMode;
      ed: { privateKey: Uint8Array; publicKey: Uint8Array };
      pq?: { alg: 'sphincs'; privateKey: Uint8Array; publicKey: Uint8Array };
    }
  | { error: string }
> {
  const privateKeyB64Url =
    (process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL || '').trim() ||
    (await readJsonMaybe<KeyFile>(keysPath('phoenix-zero-ed25519.json')))?.privateKeyB64Url ||
    '';

  if (!privateKeyB64Url) {
    return { error: 'Missing signing key. Set PHOENIX_ZERO_PRIVATE_KEY_B64URL or provide keys/phoenix-zero-ed25519.json.' };
  }

  const ed = ed25519KeyPairFromPrivateKey(base64UrlToBytes(privateKeyB64Url));

  if (mode !== 'strict') {
    return { mode, ed: { privateKey: ed.privateKey, publicKey: ed.publicKey } };
  }

  const pqPrivEnv = (process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL || '').trim();
  const pqPubEnv = (process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL || '').trim();
  const pqFromFile = await readJsonMaybe<PqKeyFile>(keysPath('phoenix-zero-sphincs.json'));

  const pqPriv = pqPrivEnv || pqFromFile?.privateKeyB64Url || '';
  const pqPub = pqPubEnv || pqFromFile?.publicKeyB64Url || '';

  if (pqPriv && pqPub) {
    return {
      mode,
      ed: { privateKey: ed.privateKey, publicKey: ed.publicKey },
      pq: {
        alg: 'sphincs',
        privateKey: pqPrivateKeyFromB64Url(pqPriv),
        publicKey: pqPublicKeyFromB64Url(pqPub)
      }
    };
  }

  const kp = await generateSphincsKeyPair();
  return { mode, ed: { privateKey: ed.privateKey, publicKey: ed.publicKey }, pq: { alg: 'sphincs', privateKey: kp.privateKey, publicKey: kp.publicKey } };
}

async function readLastTransparencyHash(): Promise<string> {
  try {
    const txt = await readFile(transparencyLogPath(), 'utf8');
    const lines = txt.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const last = lines[lines.length - 1];
    if (!last) return '';
    const parsed = JSON.parse(last) as { entryHash?: string };
    return typeof parsed?.entryHash === 'string' ? parsed.entryHash : '';
  } catch {
    return '';
  }
}

async function appendTransparencyEntry(entry: {
  anchorId: string;
  createdAt: string;
  expiresAt: string;
  creatorId?: string;
  kind: TimeAnchorKind;
  contentCommit: { alg: 'sha256_b64url_v1'; value: string };
  hybridId: string;
}) {
  const prevHash = await readLastTransparencyHash();
  const core = {
    v: 1 as const,
    anchorId: entry.anchorId,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    creatorId: entry.creatorId,
    kind: entry.kind,
    contentCommit: entry.contentCommit,
    hybridId: entry.hybridId
  };
  const canonical = phoenixZeroStableStringify(core);
  const bytes = new TextEncoder().encode(prevHash + canonical);
  const entryHash = sha256B64Url(bytes);

  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await appendFile(transparencyLogPath(), JSON.stringify({ ...core, prevHash, entryHash }) + '\n', 'utf8');
}

export async function createTimeAnchor(params: {
  tenantId?: string;
  creatorId?: string;
  clientId?: string;
  anchorProfileId?: string;
  kind: TimeAnchorKind;
  contentCommitB64Url: string;
  ttlSeconds?: number;
  mode?: PhoenixZeroHybridMode;
}): Promise<{ ok: true; record: TimeAnchorRecord } | { ok: false; reason: string }> {
  const mode = params.mode ?? 'compat';
  const maxTtlSeconds = params.kind === 'live' ? 24 * 3600 : 10 * 365 * 24 * 3600;
  const defaultTtlSeconds = params.kind === 'live' ? 30 : 365 * 24 * 3600;
  const minTtlSeconds = params.kind === 'live' ? 5 : 1;
  const ttlSeconds = Math.max(minTtlSeconds, Math.min(maxTtlSeconds, params.ttlSeconds ?? defaultTtlSeconds));

  const keys = await loadSigningKeys(mode);
  if ('error' in keys) return { ok: false, reason: keys.error };

  const db = await loadDb();

  let anchorId = '';
  for (let i = 0; i < 5; i++) {
    anchorId = b64Url(randomBytes(16)).slice(0, 22);
    if (!db.anchors[anchorId]) break;
  }
  if (!anchorId || db.anchors[anchorId]) return { ok: false, reason: 'Failed to allocate anchor id' };

  const createdAt = nowIso();
  const expiresAt = new Date(nowMs() + ttlSeconds * 1000).toISOString();

  const payload: TimeAnchorPayload = {
    version: 1,
    createdAt,
    anchorId,
    creatorId: params.creatorId,
    clientId: params.clientId,
    anchorProfileId: params.anchorProfileId,
    kind: params.kind,
    contentCommit: { alg: 'sha256_b64url_v1', value: params.contentCommitB64Url },
    expiresAt,
    signatureMode: mode
  };

  const hybridSignature = await createHybridSignature({ payload, mode, ed25519: keys.ed, pq: keys.pq });

  const record: TimeAnchorRecord = { ...payload, hybridSignature };
  db.anchors[anchorId] = record;
  if (params.tenantId) db.tenantByAnchorId[anchorId] = params.tenantId;
  await saveDb(db);

  await appendTransparencyEntry({
    anchorId,
    createdAt,
    expiresAt,
    creatorId: params.creatorId,
    kind: params.kind,
    contentCommit: record.contentCommit,
    hybridId: record.hybridSignature.hybridId
  }).catch(() => {});

  return { ok: true, record };
}

export async function getTimeAnchor(anchorId: string): Promise<TimeAnchorRecord | null> {
  const db = await loadDb();
  return db.anchors[anchorId] ?? null;
}

export type TimeAnchorWindow = 'valid' | 'expired';

export type TimeAnchorVerifyResult = {
  ok: boolean;
  anchorId: string;
  window: TimeAnchorWindow;
  now: string;
  createdAt?: string;
  expiresAt?: string;
  creatorId?: string;
  clientId?: string;
  anchorProfileId?: string;
  kind?: TimeAnchorKind;
  contentCommit?: { alg: 'sha256_b64url_v1'; value: string };
  coincidence: boolean;
  confidence: number;
  signature: Awaited<ReturnType<typeof verifyHybridSignature>> | null;
};

export async function verifyTimeAnchor(params: {
  anchorId: string;
  contentCommitB64Url?: string;
}): Promise<TimeAnchorVerifyResult> {
  const rec = await getTimeAnchor(params.anchorId);
  const now = nowIso();

  if (!rec) {
    return {
      ok: false,
      anchorId: params.anchorId,
      window: 'expired',
      now,
      coincidence: false,
      confidence: 0,
      signature: null
    };
  }

  const payload: TimeAnchorPayload = {
    version: rec.version,
    createdAt: rec.createdAt,
    anchorId: rec.anchorId,
    creatorId: rec.creatorId,
    clientId: rec.clientId,
    anchorProfileId: rec.anchorProfileId,
    kind: rec.kind,
    contentCommit: rec.contentCommit,
    expiresAt: rec.expiresAt,
    signatureMode: rec.signatureMode
  };

  const signature = await verifyHybridSignature({ payload, sig: rec.hybridSignature });

  const expMs = Date.parse(rec.expiresAt);
  const window: TimeAnchorWindow = Number.isFinite(expMs) && nowMs() <= expMs ? 'valid' : 'expired';

  const wantCommit = (params.contentCommitB64Url || '').trim();
  const coincidence = Boolean(wantCommit) && wantCommit === rec.contentCommit.value && window === 'valid' && signature.ok;

  const ok = signature.ok && window === 'valid';
  const confidence = coincidence ? 1 : ok ? 0.75 : 0;

  return {
    ok,
    anchorId: rec.anchorId,
    window,
    now,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    creatorId: rec.creatorId,
    clientId: rec.clientId,
    anchorProfileId: rec.anchorProfileId,
    kind: rec.kind,
    contentCommit: rec.contentCommit,
    coincidence,
    confidence,
    signature
  };
}
