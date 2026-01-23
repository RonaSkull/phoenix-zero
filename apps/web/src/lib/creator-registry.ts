import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { verifyCreatorRegistrySignature } from './registry-signing';

type CreatorRecord = {
  ed25519PublicKeyB64Url: string;
  pqPublicKeyB64Url?: string;
  updatedAt?: string;
  note?: string;
};

type CreatorRegistry = {
  version: number;
  creators: Record<string, CreatorRecord>;
};

let cached: CreatorRegistry | null = null;
let cachedAt = 0;
const REGISTRY_CACHE_TTL_MS = 3000;

let trustCached: { ok: boolean; at: number; reason?: string } | null = null;
const TRUST_CACHE_TTL_MS = 3000;

async function registryTrusted(): Promise<{ ok: boolean; reason?: string }> {
  const requireSigned = process.env.PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY === '1';
  if (!requireSigned) return { ok: true };

  const now = Date.now();
  if (trustCached && now - trustCached.at < TRUST_CACHE_TTL_MS) {
    return { ok: trustCached.ok, reason: trustCached.reason };
  }

  try {
    const res = await verifyCreatorRegistrySignature();
    trustCached = { ok: res.ok, at: now, reason: res.reason };
    return { ok: res.ok, reason: res.reason };
  } catch {
    trustCached = { ok: false, at: now, reason: 'verify_error' };
    return { ok: false, reason: 'verify_error' };
  }
}

function registryPath(): string {
  return resolve(process.cwd(), '..', '..', 'keys', 'creator-registry.json');
}

export async function loadCreatorRegistry(): Promise<CreatorRegistry> {
  const now = Date.now();
  if (cached && now - cachedAt < REGISTRY_CACHE_TTL_MS) return cached;
  const txt = await readFile(registryPath(), 'utf8');
  const json = JSON.parse(txt) as CreatorRegistry;
  if (!json || typeof json !== 'object' || typeof json.version !== 'number' || !json.creators || typeof json.creators !== 'object') {
    throw new Error('Invalid creator-registry.json format.');
  }
  cached = json;
  cachedAt = now;
  return json;
}

export async function getCreatorRecord(creatorId: string): Promise<CreatorRecord | null> {
  try {
    const trust = await registryTrusted();
    if (!trust.ok) return null;
    const reg = await loadCreatorRegistry();
    const rec = reg.creators[creatorId];
    if (!rec || typeof rec.ed25519PublicKeyB64Url !== 'string') return null;
    return rec;
  } catch {
    return null;
  }
}

export async function findCreatorByPublicKeys(params: {
  ed25519PublicKeyB64Url?: string;
  pqPublicKeyB64Url?: string;
}): Promise<{ creatorId: string; record: CreatorRecord } | null> {
  const ed = typeof params.ed25519PublicKeyB64Url === 'string' ? params.ed25519PublicKeyB64Url : '';
  if (!ed) return null;

  try {
    const trust = await registryTrusted();
    if (!trust.ok) return null;
    const reg = await loadCreatorRegistry();
    for (const [creatorId, record] of Object.entries(reg.creators)) {
      if (!record || typeof record.ed25519PublicKeyB64Url !== 'string') continue;
      if (record.ed25519PublicKeyB64Url !== ed) continue;

      const expectedPq = typeof record.pqPublicKeyB64Url === 'string' ? record.pqPublicKeyB64Url : '';
      const proofPq = typeof params.pqPublicKeyB64Url === 'string' ? params.pqPublicKeyB64Url : '';
      if (expectedPq && expectedPq !== proofPq) continue;

      return { creatorId, record };
    }
    return null;
  } catch {
    return null;
  }
}
