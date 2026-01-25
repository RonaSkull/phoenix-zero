import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroStableStringify, sha256B64Url, verifyPhoenixZeroPayloadSignature } from '@phoenix-zero/core';

import { phoenixZeroTmpDir } from './tmp-dir';

import type { AntifraudDecision } from './antifraud/types';

type PaymentProvider = 'pix' | 'card' | 'crypto';
type PaymentStatus = 'pending' | 'paid' | 'failed';

type PpoMetaSignaturePayload = {
  v: 1;
  kind: 'ppo_meta';
  tenantId: string;
  agentId: string;
  taskId: string;
  taskType: string;
  taskInputHash: string;
  taskOutputHash: string;
};

type PaymentIntent = {
  id: string;
  tenantId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  providerPaymentId?: string;
  amountCents: number;
  currency: string;
  proofMeta?: {
    agentId: string;
    taskId?: string;
    taskType: string;
    taskInputHash: string;
    taskOutputHash: string;
    agentEd25519PublicKeyB64Url?: string;
    agentEd25519SignatureB64Url?: string;

    customerContact?: {
      whatsappNumber?: string;
      telegramChatId?: string;
    };
  };
};

export type PaymentProofStatus = 'pending' | 'paid_confirmed' | 'failed' | 'disputed';

export type CustomerContact = {
  whatsappNumber?: string;
  telegramChatId?: string;
};

export type PaymentProofNotificationChannel = 'telegram' | 'whatsapp';

export type PaymentProofNotificationReceipt = {
  ok: boolean;
  at: string;
  providerMessageId?: string;
  error?: string;
};

export type PaymentProof = {
  id: string;
  createdAt: string;
  verifiedAt?: string;

  tenantId: string;

  paymentId: string;
  paymentProvider: PaymentProvider;
  providerPaymentId: string;

  amountCents: number;
  currency: string;

  agentId: string;
  taskId?: string;
  taskType: string;
  taskInputHash: string;
  taskOutputHash: string;
  agentEd25519PublicKeyB64Url?: string;
  agentEd25519SignatureB64Url?: string;
  agentEd25519SignatureVerified?: boolean;
  agentEd25519SignaturePayloadHashB64Url?: string;

  antifraudDecision?: AntifraudDecision;
  antifraudReason?: string;

  customerContact?: CustomerContact;
  customerNotifications?: Partial<Record<PaymentProofNotificationChannel, PaymentProofNotificationReceipt>>;

  status: PaymentProofStatus;
};

type PaymentProofsDb = {
  version: 1;
  proofs: Record<string, PaymentProof>;
  byProviderPaymentId: Record<string, string>;
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

function sha256JsonB64Url(payload: unknown): string {
  const canonical = phoenixZeroStableStringify(payload);
  const bytes = new TextEncoder().encode(canonical);
  return sha256B64Url(bytes);
}

function dbPath(): string {
  return join(phoenixZeroTmpDir(), 'payment-proofs.json');
}

async function readJsonMaybe<T>(path: string): Promise<T | null> {
  try {
    const txt = await readFile(path, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadDb(): Promise<PaymentProofsDb> {
  const json = await readJsonMaybe<any>(dbPath());
  if (!json || json.version !== 1) {
    return { version: 1, proofs: {}, byProviderPaymentId: {} };
  }
  return {
    version: 1,
    proofs: typeof json.proofs === 'object' && json.proofs ? json.proofs : {},
    byProviderPaymentId:
      typeof json.byProviderPaymentId === 'object' && json.byProviderPaymentId ? json.byProviderPaymentId : {}
  };
}

async function saveDb(db: PaymentProofsDb): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await writeFile(dbPath(), JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function providerPaymentKey(provider: string, providerPaymentId: string): string {
  return `${String(provider || '').trim().toLowerCase()}:${String(providerPaymentId || '').trim()}`;
}

function statusToProofStatus(status: PaymentStatus): PaymentProofStatus {
  return status === 'paid' ? 'paid_confirmed' : status === 'failed' ? 'failed' : 'pending';
}

export async function getPaymentProofById(id: string): Promise<PaymentProof | null> {
  const key = String(id || '').trim();
  if (!key) return null;
  const db = await loadDb();
  return db.proofs[key] || null;
}

export async function recordPaymentProofNotification(params: {
  id: string;
  channel: PaymentProofNotificationChannel;
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}): Promise<PaymentProof | null> {
  const id = String(params.id || '').trim();
  if (!id) return null;

  const channel = String(params.channel || '').trim().toLowerCase();
  if (channel !== 'telegram' && channel !== 'whatsapp') return null;

  const db = await loadDb();
  const existing = db.proofs[id];
  if (!existing) return null;

  const at = nowIso();
  const receipt: PaymentProofNotificationReceipt = {
    ok: Boolean(params.ok),
    at,
    providerMessageId: String(params.providerMessageId || '').trim() || undefined,
    error: String(params.error || '').trim() || undefined
  };

  const current = ((existing as any).customerNotifications || {}) as Record<string, PaymentProofNotificationReceipt>;
  const nextNotifications = { ...current, [channel]: receipt };

  const next: PaymentProof = {
    ...existing,
    customerNotifications: nextNotifications
  };

  db.proofs[id] = next;
  await saveDb(db);
  return next;
}

function parseIsoMs(s: string): number {
  const t = Date.parse(String(s || ''));
  return Number.isFinite(t) ? t : 0;
}

export async function tryReservePaymentProofNotification(params: {
  id: string;
  channel: PaymentProofNotificationChannel;
  minRetryAfterSeconds?: number;
}): Promise<{ ok: true } | { ok: false; reason: 'already_sent' | 'rate_limited' | 'not_found' | 'invalid' }> {
  const id = String(params.id || '').trim();
  if (!id) return { ok: false, reason: 'invalid' };

  const channel = String(params.channel || '').trim().toLowerCase();
  if (channel !== 'telegram' && channel !== 'whatsapp') return { ok: false, reason: 'invalid' };

  const minRetryAfterSeconds = Math.max(1, Math.min(3600, Math.trunc(Number(params.minRetryAfterSeconds ?? 30))));
  const nowMs = Date.now();

  const db = await loadDb();
  const existing = db.proofs[id];
  if (!existing) return { ok: false, reason: 'not_found' };

  const current = ((existing as any).customerNotifications || {}) as Record<string, PaymentProofNotificationReceipt>;
  const prior = current[channel] as PaymentProofNotificationReceipt | undefined;
  if (prior && prior.ok === true) return { ok: false, reason: 'already_sent' };

  if (prior) {
    const ageMs = nowMs - parseIsoMs(String(prior.at || ''));
    if (ageMs >= 0 && ageMs < minRetryAfterSeconds * 1000) return { ok: false, reason: 'rate_limited' };
  }

  const at = nowIso();
  const reserved: PaymentProofNotificationReceipt = {
    ok: false,
    at,
    error: 'reserved'
  };

  const next: PaymentProof = {
    ...existing,
    customerNotifications: { ...current, [channel]: reserved }
  };

  db.proofs[id] = next;
  await saveDb(db);
  return { ok: true };
}

export async function getPaymentProofByProviderPaymentId(params: {
  provider: PaymentProvider;
  providerPaymentId: string;
}): Promise<PaymentProof | null> {
  const ppid = String(params.providerPaymentId || '').trim();
  if (!ppid) return null;
  const db = await loadDb();
  const id = db.byProviderPaymentId[providerPaymentKey(params.provider, ppid)];
  if (!id) return null;
  return db.proofs[id] || null;
}

export async function listPaymentProofsByAgent(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<PaymentProof[]> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  if (!tenantId || !agentId) return [];
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 200))));
  const db = await loadDb();
  const proofs = Object.values(db.proofs || {}).filter((p) => p && p.tenantId === tenantId && p.agentId === agentId);
  proofs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return proofs.slice(0, limit);
}

export async function listPaymentProofs(params?: {
  status?: PaymentProofStatus;
  limit?: number;
}): Promise<PaymentProof[]> {
  const status = params?.status;
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params?.limit ?? 100))));
  const db = await loadDb();
  let proofs = Object.values(db.proofs || {}).filter(Boolean) as PaymentProof[];
  if (status) proofs = proofs.filter((p) => p.status === status);
  proofs.sort((a, b) => String(b.verifiedAt || b.createdAt).localeCompare(String(a.verifiedAt || a.createdAt)));
  return proofs.slice(0, limit);
}

export async function ensurePaymentProofForIntent(intent: PaymentIntent): Promise<PaymentProof | null> {
  const providerPaymentId = String(intent.providerPaymentId || '').trim();
  if (!providerPaymentId) return null;

  const existing = await getPaymentProofByProviderPaymentId({ provider: intent.provider, providerPaymentId });
  if (existing) {
    if (existing.status !== statusToProofStatus(intent.status)) {
      await updatePaymentProofStatus({ id: existing.id, status: intent.status });
      return (await getPaymentProofById(existing.id)) || existing;
    }
    return existing;
  }

  const meta = (intent as any)?.proofMeta || (intent as any)?.meta || null;
  const agentId = String(meta?.agentId || '').trim();
  const taskId = String(meta?.taskId || '').trim() || undefined;
  const taskType = String(meta?.taskType || '').trim();
  const taskInputHash = String(meta?.taskInputHash || '').trim();
  const taskOutputHash = String(meta?.taskOutputHash || '').trim();
  const agentEd25519PublicKeyB64Url = String(meta?.agentEd25519PublicKeyB64Url || '').trim() || undefined;
  const agentEd25519SignatureB64Url = String(meta?.agentEd25519SignatureB64Url || '').trim() || undefined;

  const customerContact: CustomerContact | undefined =
    meta?.customerContact &&
    (String(meta.customerContact.whatsappNumber || '').trim() || String(meta.customerContact.telegramChatId || '').trim())
      ? {
          whatsappNumber: String(meta.customerContact.whatsappNumber || '').trim() || undefined,
          telegramChatId: String(meta.customerContact.telegramChatId || '').trim() || undefined
        }
      : undefined;

  if (!agentId || !taskType || !taskInputHash || !taskOutputHash) return null;

  let agentEd25519SignatureVerified: boolean | undefined = undefined;
  let agentEd25519SignaturePayloadHashB64Url: string | undefined = undefined;
  if (agentEd25519PublicKeyB64Url || agentEd25519SignatureB64Url) {
    agentEd25519SignatureVerified = false;
    if (agentEd25519PublicKeyB64Url && agentEd25519SignatureB64Url && taskId) {
      const payload: PpoMetaSignaturePayload = {
        v: 1,
        kind: 'ppo_meta',
        tenantId: String(intent.tenantId || '').trim(),
        agentId,
        taskId,
        taskType,
        taskInputHash,
        taskOutputHash
      };
      agentEd25519SignaturePayloadHashB64Url = sha256JsonB64Url(payload);
      agentEd25519SignatureVerified = verifyPhoenixZeroPayloadSignature({
        payload,
        signatureB64Url: agentEd25519SignatureB64Url,
        publicKeyB64Url: agentEd25519PublicKeyB64Url
      });
    }
  }

  const createdAt = nowIso();
  const proof: PaymentProof = {
    id: `ppo_${b64Url(randomBytes(12))}`,
    createdAt,
    verifiedAt: intent.status === 'paid' ? createdAt : undefined,
    tenantId: intent.tenantId,
    paymentId: intent.id,
    paymentProvider: intent.provider,
    providerPaymentId,
    amountCents: Math.max(0, Math.trunc(intent.amountCents)),
    currency: String(intent.currency || '').trim() || 'USD',
    agentId,
    taskId,
    taskType,
    taskInputHash,
    taskOutputHash,
    agentEd25519PublicKeyB64Url,
    agentEd25519SignatureB64Url,
    agentEd25519SignatureVerified,
    agentEd25519SignaturePayloadHashB64Url,
    customerContact,
    status: statusToProofStatus(intent.status)
  };

  const db = await loadDb();
  db.proofs[proof.id] = proof;
  db.byProviderPaymentId[providerPaymentKey(intent.provider, providerPaymentId)] = proof.id;
  await saveDb(db);

  if (process.env.NODE_ENV !== 'production') {
    console.info('[PPO] created', {
      proofId: proof.id,
      agentId: proof.agentId,
      paymentId: proof.paymentId,
      provider: proof.paymentProvider,
      providerPaymentId: proof.providerPaymentId,
      status: proof.status,
      amountCents: proof.amountCents,
      currency: proof.currency,
      tmpDir: phoenixZeroTmpDir(),
      dbPath: dbPath()
    });
  }
  return proof;
}

export async function updatePaymentProofStatus(params: { id: string; status: PaymentStatus }): Promise<void> {
  const id = String(params.id || '').trim();
  if (!id) return;
  const db = await loadDb();
  const existing = db.proofs[id];
  if (!existing) return;

  const nextStatus = statusToProofStatus(params.status);
  const verifiedAt = nextStatus === 'paid_confirmed' ? existing.verifiedAt || nowIso() : existing.verifiedAt;

  db.proofs[id] = { ...existing, status: nextStatus, verifiedAt };
  await saveDb(db);
}

export async function updatePaymentProofAntifraud(params: {
  id: string;
  decision: AntifraudDecision;
  reason?: string;
}): Promise<PaymentProof | null> {
  const id = String(params.id || '').trim();
  if (!id) return null;

  const decision = String(params.decision || '').trim().toLowerCase();
  if (decision !== 'clear' && decision !== 'review' && decision !== 'blocked') return null;

  const db = await loadDb();
  const existing = db.proofs[id];
  if (!existing) return null;

  const nextDecision = decision as AntifraudDecision;
  const nextReason = String(params.reason || '').trim() || undefined;

  const sameDecision = String((existing as any).antifraudDecision || '') === nextDecision;
  const sameReason = String((existing as any).antifraudReason || '') === String(nextReason || '');
  if (sameDecision && sameReason) return existing;

  const next: PaymentProof = {
    ...existing,
    antifraudDecision: nextDecision,
    antifraudReason: nextReason
  };

  db.proofs[id] = next;
  await saveDb(db);
  return next;
}
