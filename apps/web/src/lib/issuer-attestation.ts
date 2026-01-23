import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  ed25519KeyPairFromPrivateKey,
  phoenixZeroStableStringify,
  sha256B64Url,
  signPhoenixZeroPayload,
  verifyPhoenixZeroPayloadSignature
} from '@phoenix-zero/core';

type IssuerKeyFile = { privateKeyB64Url?: string; publicKeyB64Url?: string };

export type PhoenixZeroIssuerAttestationPayload = {
  v: 1;
  issuedAt: string;
  hybridId?: string;
  proofId?: string;
  creatorId?: string;
};

export type PhoenixZeroIssuerAttestation = {
  alg: 'ed25519';
  publicKeyB64Url: string;
  signatureB64Url: string;
  payload: PhoenixZeroIssuerAttestationPayload;
};

function issuerKeyPath(): string {
  return resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-issuer-ed25519.json');
}

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function loadIssuerSigningKey(): Promise<{ publicKeyB64Url: string; privateKey: Uint8Array } | null> {
  const envPriv = process.env.PHOENIX_ZERO_ISSUER_PRIVATE_KEY_B64URL;

  const fromFile = await readJsonMaybe<IssuerKeyFile>(issuerKeyPath());
  const privB64Url = envPriv ?? fromFile?.privateKeyB64Url;
  if (!privB64Url) return null;

  const priv = base64UrlToBytes(privB64Url);
  const kp = ed25519KeyPairFromPrivateKey(priv);

  return {
    privateKey: kp.privateKey,
    publicKeyB64Url: bytesToBase64Url(kp.publicKey)
  };
}

export async function getLocalIssuerPublicKeyB64Url(): Promise<string | null> {
  const key = await loadIssuerSigningKey();
  return key ? key.publicKeyB64Url : null;
}

function concat3(a: Uint8Array, b: Uint8Array, c: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength + c.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  out.set(c, a.byteLength + b.byteLength);
  return out;
}

export function computeHybridIdFromParts(params: {
  payload: unknown;
  edSigB64Url: string;
  pqSigB64Url?: string;
}): string {
  const p = new TextEncoder().encode(phoenixZeroStableStringify(params.payload));
  const a = base64UrlToBytes(params.edSigB64Url);
  const b = params.pqSigB64Url ? base64UrlToBytes(params.pqSigB64Url) : new Uint8Array();
  return sha256B64Url(concat3(p, a, b)).slice(0, 22);
}

export async function maybeCreateIssuerAttestation(params: {
  hybridId?: string;
  proofId?: string;
  creatorId?: string;
}): Promise<PhoenixZeroIssuerAttestation | null> {
  const key = await loadIssuerSigningKey();
  if (!key) return null;

  const payload: PhoenixZeroIssuerAttestationPayload = {
    v: 1,
    issuedAt: new Date().toISOString(),
    hybridId: params.hybridId,
    proofId: params.proofId,
    creatorId: params.creatorId
  };

  const signatureB64Url = signPhoenixZeroPayload({ payload, privateKey: key.privateKey });

  return {
    alg: 'ed25519',
    publicKeyB64Url: key.publicKeyB64Url,
    signatureB64Url,
    payload
  };
}

export function verifyIssuerAttestation(params: {
  attestation: unknown;
  expectedHybridId?: string;
  expectedProofId?: string;
  trustedIssuerPublicKeyB64Url?: string;
}): { present: boolean; ok: boolean; reason?: string; issuerPublicKeyB64Url?: string } {
  const a = params.attestation as any;
  if (!a || typeof a !== 'object') return { present: false, ok: false, reason: 'missing' };

  const publicKeyB64Url = typeof a.publicKeyB64Url === 'string' ? a.publicKeyB64Url : '';
  const signatureB64Url = typeof a.signatureB64Url === 'string' ? a.signatureB64Url : '';
  const payload = a.payload;

  if (!publicKeyB64Url || !signatureB64Url || !payload) {
    return { present: true, ok: false, reason: 'invalid_format', issuerPublicKeyB64Url: publicKeyB64Url || undefined };
  }

  const trusted = params.trustedIssuerPublicKeyB64Url;
  if (trusted && publicKeyB64Url !== trusted) {
    return { present: true, ok: false, reason: 'untrusted_issuer', issuerPublicKeyB64Url: publicKeyB64Url };
  }

  const sigOk = verifyPhoenixZeroPayloadSignature({ payload, signatureB64Url, publicKeyB64Url });
  if (!sigOk) {
    return { present: true, ok: false, reason: 'invalid_signature', issuerPublicKeyB64Url: publicKeyB64Url };
  }

  const hv = typeof (payload as any)?.hybridId === 'string' ? String((payload as any).hybridId) : '';
  if (params.expectedHybridId && hv && hv !== params.expectedHybridId) {
    return { present: true, ok: false, reason: 'hybrid_id_mismatch', issuerPublicKeyB64Url: publicKeyB64Url };
  }

  const pv = typeof (payload as any)?.proofId === 'string' ? String((payload as any).proofId) : '';
  if (params.expectedProofId && pv && pv !== params.expectedProofId) {
    return { present: true, ok: false, reason: 'proof_id_mismatch', issuerPublicKeyB64Url: publicKeyB64Url };
  }

  return { present: true, ok: true, issuerPublicKeyB64Url: publicKeyB64Url };
}
