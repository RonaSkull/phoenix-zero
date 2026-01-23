import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type FraudWatchlist = {
  version: number;
  blockedCreators?: string[];
  blockedEd25519PublicKeys?: string[];
  blockedPqPublicKeys?: string[];
};

let cached: FraudWatchlist | null = null;
let cachedAt = 0;
const WATCHLIST_CACHE_TTL_MS = 3000;

function watchlistPath(): string {
  return resolve(process.cwd(), '..', '..', 'keys', 'fraud-watchlist.json');
}

export async function loadFraudWatchlist(): Promise<FraudWatchlist> {
  const now = Date.now();
  if (cached && now - cachedAt < WATCHLIST_CACHE_TTL_MS) return cached;
  try {
    const txt = await readFile(watchlistPath(), 'utf8');
    const json = JSON.parse(txt) as FraudWatchlist;
    if (!json || typeof json !== 'object' || typeof json.version !== 'number') {
      cached = { version: 1 };
      cachedAt = now;
      return cached;
    }
    cached = json;
    cachedAt = now;
    return cached;
  } catch {
    cached = { version: 1 };
    cachedAt = now;
    return cached;
  }
}

export async function checkWatchlist(params: {
  creatorId?: string;
  ed25519PublicKeyB64Url?: string;
  pqPublicKeyB64Url?: string;
}): Promise<{ blocked: boolean; reasons: string[] }> {
  const wl = await loadFraudWatchlist();
  const reasons: string[] = [];

  const creatorId = params.creatorId;
  const ed = params.ed25519PublicKeyB64Url;
  const pq = params.pqPublicKeyB64Url;

  const blockedCreators = Array.isArray(wl.blockedCreators) ? wl.blockedCreators : [];
  const blockedEd = Array.isArray(wl.blockedEd25519PublicKeys) ? wl.blockedEd25519PublicKeys : [];
  const blockedPq = Array.isArray(wl.blockedPqPublicKeys) ? wl.blockedPqPublicKeys : [];

  if (creatorId && blockedCreators.includes(creatorId)) reasons.push('creatorId_blocked');
  if (ed && blockedEd.includes(ed)) reasons.push('ed25519_key_blocked');
  if (pq && blockedPq.includes(pq)) reasons.push('pq_key_blocked');

  return { blocked: reasons.length > 0, reasons };
}
