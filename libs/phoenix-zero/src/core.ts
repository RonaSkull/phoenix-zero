import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { base64url } from '@scure/base';

export type PhoenixZeroFeatures = {
  type: 'sha256';
  valueB64Url: string;
};

export type PhoenixZeroProofPayload = {
  version: 1;
  createdAt: string;
  creatorId?: string;
  media: {
    mimeType?: string;
    byteLength: number;
  };
  features: PhoenixZeroFeatures;
  signerPublicKeyB64Url: string;
  signatureAlg: 'ed25519';
};

export type PhoenixZeroProof = PhoenixZeroProofPayload & {
  signatureB64Url: string;
};

export type PhoenixZeroVerifyResult =
  | { ok: true }
  | { ok: false; reason: string };

export type PhoenixZeroKeyPair = {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const items = keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${items.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function phoenixZeroStableStringify(value: unknown): string {
  return stableStringify(value);
}

function getCryptoRandomBytes(length: number): Uint8Array {
  const g = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto?.getRandomValues) {
    const out = new Uint8Array(length);
    g.crypto.getRandomValues(out);
    return out;
  }

  throw new Error('Secure random unavailable in this runtime');
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return base64url.encode(bytes);
}

export function base64UrlToBytes(b64Url: string): Uint8Array {
  return base64url.decode(b64Url);
}

export function sha256B64Url(bytes: Uint8Array): string {
  return bytesToBase64Url(sha256(bytes));
}

export function generateEd25519KeyPair(
  rng: (length: number) => Uint8Array = getCryptoRandomBytes
): PhoenixZeroKeyPair {
  const privateKey = rng(32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function ed25519KeyPairFromPrivateKey(privateKey: Uint8Array): PhoenixZeroKeyPair {
  if (privateKey.byteLength !== 32) {
    throw new Error('Ed25519 private key must be 32 bytes');
  }
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function createPhoenixZeroProof(params: {
  videoBytes: Uint8Array;
  keyPair: PhoenixZeroKeyPair;
  creatorId?: string;
  mimeType?: string;
}): PhoenixZeroProof {
  const createdAt = new Date().toISOString();
  const features: PhoenixZeroFeatures = {
    type: 'sha256',
    valueB64Url: sha256B64Url(params.videoBytes)
  };

  const payload: PhoenixZeroProofPayload = {
    version: 1,
    createdAt,
    creatorId: params.creatorId,
    media: {
      mimeType: params.mimeType,
      byteLength: params.videoBytes.byteLength
    },
    features,
    signerPublicKeyB64Url: bytesToBase64Url(params.keyPair.publicKey),
    signatureAlg: 'ed25519'
  };

  const payloadBytes = utf8ToBytes(stableStringify(payload));
  const signature = ed25519.sign(payloadBytes, params.keyPair.privateKey);

  const proof: PhoenixZeroProof = {
    ...payload,
    signatureB64Url: bytesToBase64Url(signature)
  };

  return proof;
}

export function verifyPhoenixZeroProof(params: {
  videoBytes: Uint8Array;
  proof: PhoenixZeroProof;
}): PhoenixZeroVerifyResult {
  if (params.proof.version !== 1) {
    return { ok: false, reason: 'Unsupported proof version' };
  }

  if (params.proof.signatureAlg !== 'ed25519') {
    return { ok: false, reason: 'Unsupported signature algorithm' };
  }

  const recomputed = sha256B64Url(params.videoBytes);
  if (recomputed !== params.proof.features.valueB64Url) {
    return { ok: false, reason: 'Content fingerprint mismatch' };
  }

  const payload: PhoenixZeroProofPayload = {
    version: 1,
    createdAt: params.proof.createdAt,
    creatorId: params.proof.creatorId,
    media: params.proof.media,
    features: params.proof.features,
    signerPublicKeyB64Url: params.proof.signerPublicKeyB64Url,
    signatureAlg: 'ed25519'
  };

  const payloadBytes = utf8ToBytes(stableStringify(payload));
  const signatureBytes = base64UrlToBytes(params.proof.signatureB64Url);
  const pubBytes = base64UrlToBytes(params.proof.signerPublicKeyB64Url);

  const ok = ed25519.verify(signatureBytes, payloadBytes, pubBytes);
  if (!ok) return { ok: false, reason: 'Invalid signature' };

  return { ok: true };
}

export function encodeProofToCompactString(proof: PhoenixZeroProof): string {
  const json = stableStringify(proof);
  return bytesToBase64Url(utf8ToBytes(json));
}

export function decodeProofFromCompactString(compact: string): PhoenixZeroProof {
  const bytes = base64UrlToBytes(compact);
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json) as PhoenixZeroProof;
  return parsed;
}

export function phoenixZeroProofId(proof: PhoenixZeroProof): string {
  const a = base64UrlToBytes(proof.signerPublicKeyB64Url);
  const b = base64UrlToBytes(proof.signatureB64Url);
  return sha256B64Url(concatBytes(a, b)).slice(0, 22);
}

export function signPhoenixZeroPayload(params: { payload: unknown; privateKey: Uint8Array }): string {
  const payloadBytes = utf8ToBytes(stableStringify(params.payload));
  const signature = ed25519.sign(payloadBytes, params.privateKey);
  return bytesToBase64Url(signature);
}

export function verifyPhoenixZeroPayloadSignature(params: {
  payload: unknown;
  signatureB64Url: string;
  publicKeyB64Url: string;
}): boolean {
  const payloadBytes = utf8ToBytes(stableStringify(params.payload));
  const signatureBytes = base64UrlToBytes(params.signatureB64Url);
  const pubBytes = base64UrlToBytes(params.publicKeyB64Url);
  return ed25519.verify(signatureBytes, payloadBytes, pubBytes);
}
