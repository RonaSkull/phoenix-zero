import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';

export type ShareLinkCache = {
  at: string;
  ok: boolean;
  decision?: string;
  title?: string;
  hint?: string;
  creatorId?: string;
  attestationOk?: boolean;
};

export type ShareLinkRecord = {
  id: string;
  createdAt: string;
  videoUrl: string;
  proofUrl: string;
  cache?: ShareLinkCache;
};

type ShareLinksDb = {
  version: 1;
  links: Record<string, ShareLinkRecord>;
  tenantByShareId: Record<string, string>;
};

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'share-links.json');
}

function b64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function loadDb(): Promise<ShareLinksDb> {
  try {
    const txt = await readFile(dbPath(), 'utf8');
    const json = JSON.parse(txt) as ShareLinksDb;
    if (!json || typeof json !== 'object' || json.version !== 1 || !json.links || typeof json.links !== 'object') {
      return { version: 1, links: {}, tenantByShareId: {} };
    }
    if (!json.tenantByShareId || typeof json.tenantByShareId !== 'object') {
      return { version: 1, links: json.links ?? {}, tenantByShareId: {} };
    }
    return json;
  } catch {
    return { version: 1, links: {}, tenantByShareId: {} };
  }
}

async function saveDb(db: ShareLinksDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

export async function createShareLink(params: { videoUrl: string; proofUrl: string }): Promise<ShareLinkRecord> {
  const db = await loadDb();

  let id = '';
  for (let i = 0; i < 5; i++) {
    id = b64Url(randomBytes(9));
    if (!db.links[id]) break;
  }
  if (!id || db.links[id]) throw new Error('Failed to allocate share id');

  const rec: ShareLinkRecord = {
    id,
    createdAt: new Date().toISOString(),
    videoUrl: params.videoUrl,
    proofUrl: params.proofUrl
  };

  db.links[id] = rec;
  await saveDb(db);
  return rec;
}

export async function createShareLinkForTenant(params: {
  tenantId: string;
  videoUrl: string;
  proofUrl: string;
}): Promise<ShareLinkRecord> {
  const db = await loadDb();

  let id = '';
  for (let i = 0; i < 5; i++) {
    id = b64Url(randomBytes(9));
    if (!db.links[id]) break;
  }
  if (!id || db.links[id]) throw new Error('Failed to allocate share id');

  const rec: ShareLinkRecord = {
    id,
    createdAt: new Date().toISOString(),
    videoUrl: params.videoUrl,
    proofUrl: params.proofUrl
  };

  db.links[id] = rec;
  db.tenantByShareId[id] = params.tenantId;
  await saveDb(db);
  return rec;
}

export async function getShareLink(id: string): Promise<ShareLinkRecord | null> {
  const db = await loadDb();
  const rec = db.links[id];
  return rec ?? null;
}

export async function updateShareLinkCache(id: string, cache: ShareLinkCache): Promise<ShareLinkRecord | null> {
  const db = await loadDb();
  const rec = db.links[id];
  if (!rec) return null;
  rec.cache = cache;
  db.links[id] = rec;
  await saveDb(db);
  return rec;
}

export async function updateShareLinkCacheForTenant(params: {
  tenantId: string;
  id: string;
  cache: ShareLinkCache;
}): Promise<ShareLinkRecord | null> {
  const db = await loadDb();
  const owner = db.tenantByShareId[params.id];
  if (!owner || owner !== params.tenantId) return null;
  const rec = db.links[params.id];
  if (!rec) return null;
  rec.cache = params.cache;
  db.links[params.id] = rec;
  await saveDb(db);
  return rec;
}

export function mapDecisionToCard(params: {
  ok: boolean;
  decision?: string;
  identityStatus?: string;
  attestationOk?: boolean;
}): { title: string; hint: string } {
  const decision = params.decision || '';
  const attOk = params.attestationOk === true;

  if (decision === 'suspected_impersonation') {
    return { title: 'Suspeito (possível impostor)', hint: 'A prova parece válida, mas a identidade não confere com o registro.' };
  }

  if (decision === 'verified') {
    return { title: attOk ? 'Autêntico ✅+' : 'Autêntico ✅', hint: 'Assinatura válida, vínculo com o vídeo confirmado e criador verificado.' };
  }

  if (decision === 'verified_unregistered_creator') {
    const unknown = params.identityStatus === 'unknown';
    return {
      title: unknown ? (attOk ? 'Autêntico ✅+ (criador não informado)' : 'Autêntico (criador não informado)') : attOk ? 'Autêntico ✅+ (criador não verificado)' : 'Autêntico (criador não verificado)',
      hint: unknown
        ? 'Assinatura válida e vínculo com o vídeo confirmado, mas o criador não foi informado na prova.'
        : 'Assinatura válida e vínculo com o vídeo confirmado, mas o criador não está registrado.'
    };
  }

  if (params.ok) {
    return { title: attOk ? 'Autêntico ✅+' : 'Autêntico ✅', hint: 'Assinatura válida e vínculo com o vídeo confirmado.' };
  }

  return { title: 'Não verificado', hint: 'Não foi possível confirmar autenticidade com a prova fornecida.' };
}
