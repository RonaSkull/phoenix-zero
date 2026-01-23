import { bytesToBase64Url, base64UrlToBytes } from '../core';

export type PqAlg = 'sphincs';

export type PqKeyPair = {
  alg: PqAlg;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
};

type SphincsModule = {
  sphincs?: {
    keyPair?: () => Promise<any>;
    signDetached?: (message: Uint8Array, privateKey: Uint8Array) => Promise<Uint8Array>;
    verifyDetached?: (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array) => Promise<boolean>;
  };
};

async function loadSphincs(): Promise<SphincsModule> {
  try {
    const mod = (await import('sphincs')) as unknown as SphincsModule & { default?: any };
    return (mod as any).default ?? mod;
  } catch (e) {
    throw new Error('SPHINCS+ module not available. Install dependency: npm i sphincs');
  }
}

function toU8(x: unknown): Uint8Array {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (Array.isArray(x)) return new Uint8Array(x);
  throw new Error('Unsupported binary type from sphincs module');
}

function normalizeKeypair(kp: any): PqKeyPair {
  const pub = kp.publicKey ?? kp.public ?? kp.pk;
  const sec = kp.privateKey ?? kp.secretKey ?? kp.secret ?? kp.sk;
  if (!pub || !sec) throw new Error('Unrecognized sphincs keypair shape');
  return { alg: 'sphincs', publicKey: toU8(pub), privateKey: toU8(sec) };
}

export async function sphincsAvailable(): Promise<boolean> {
  try {
    await loadSphincs();
    return true;
  } catch {
    return false;
  }
}

export async function generateSphincsKeyPair(): Promise<PqKeyPair> {
  const sphincs = await loadSphincs();
  if (!sphincs.sphincs || typeof sphincs.sphincs.keyPair !== 'function') {
    throw new Error('sphincs.sphincs.keyPair() not found');
  }
  const kp = await sphincs.sphincs.keyPair();
  return normalizeKeypair(kp);
}

export async function sphincsSign(params: { message: Uint8Array; privateKey: Uint8Array }): Promise<Uint8Array> {
  const sphincs = await loadSphincs();
  if (!sphincs.sphincs || typeof sphincs.sphincs.signDetached !== 'function') {
    throw new Error('sphincs.sphincs.signDetached() not found');
  }
  const sig = await sphincs.sphincs.signDetached(params.message, params.privateKey);
  return toU8(sig);
}

export async function sphincsVerify(params: {
  message: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
}): Promise<boolean> {
  const sphincs = await loadSphincs();
  if (!sphincs.sphincs || typeof sphincs.sphincs.verifyDetached !== 'function') {
    throw new Error('sphincs.sphincs.verifyDetached() not found');
  }
  const ok = await sphincs.sphincs.verifyDetached(params.signature, params.message, params.publicKey);
  return Boolean(ok);
}

export function pqPrivateKeyFromB64Url(b64: string): Uint8Array {
  return base64UrlToBytes(b64);
}

export function pqPublicKeyFromB64Url(b64: string): Uint8Array {
  return base64UrlToBytes(b64);
}

export function pqKeyToB64Url(key: Uint8Array): string {
  return bytesToBase64Url(key);
}
