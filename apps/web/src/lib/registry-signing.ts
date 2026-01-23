import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
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

type RegistryAuthorityKeyFile = { privateKeyB64Url?: string; publicKeyB64Url?: string };

type CreatorRegistry = {
  version: number;
  creators: Record<string, unknown>;
};

export type CreatorRegistrySignaturePayload = {
  v: 1;
  issuedAt: string;
  registryHashB64Url: string;
  registryVersion: number;
};

export type CreatorRegistrySignature = {
  v: 1;
  issuedAt: string;
  registryHashB64Url: string;
  registryVersion: number;
  signerPublicKeyB64Url: string;
  signatureB64Url: string;
};

function keysPath(file: string): string {
  return resolve(process.cwd(), '..', '..', 'keys', file);
}

function registryPath(): string {
  return keysPath('creator-registry.json');
}

function signaturePath(): string {
  return keysPath('creator-registry.signature.json');
}

function transparencyLogPath(): string {
  return keysPath('creator-registry.transparency.jsonl');
}

function authorityKeyPath(): string {
  return keysPath('phoenix-zero-registry-authority-ed25519.json');
}

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

export async function computeCreatorRegistryHashB64Url(): Promise<{ hashB64Url: string; registry: CreatorRegistry }> {
  const txt = await readFile(registryPath(), 'utf8');
  const parsed = JSON.parse(txt) as CreatorRegistry;
  const canonical = phoenixZeroStableStringify(parsed);
  const bytes = new TextEncoder().encode(canonical);
  return { hashB64Url: sha256B64Url(bytes), registry: parsed };
}

async function loadAuthoritySigningKey(): Promise<{ privateKey: Uint8Array; publicKeyB64Url: string } | null> {
  const envPriv = process.env.PHOENIX_ZERO_REGISTRY_PRIVATE_KEY_B64URL;
  const fromFile = await readJsonMaybe<RegistryAuthorityKeyFile>(authorityKeyPath());
  const privB64Url = envPriv ?? fromFile?.privateKeyB64Url;
  if (!privB64Url) return null;
  const kp = ed25519KeyPairFromPrivateKey(base64UrlToBytes(privB64Url));
  return { privateKey: kp.privateKey, publicKeyB64Url: bytesToBase64Url(kp.publicKey) };
}

export async function publishSignedCreatorRegistry(): Promise<CreatorRegistrySignature> {
  const key = await loadAuthoritySigningKey();
  if (!key) throw new Error('Missing registry authority signing key.');

  const { hashB64Url, registry } = await computeCreatorRegistryHashB64Url();

  const payload: CreatorRegistrySignaturePayload = {
    v: 1,
    issuedAt: new Date().toISOString(),
    registryHashB64Url: hashB64Url,
    registryVersion: Number.isFinite(registry.version as any) ? Number(registry.version) : 0
  };

  const signatureB64Url = signPhoenixZeroPayload({ payload, privateKey: key.privateKey });

  const sig: CreatorRegistrySignature = {
    v: 1,
    issuedAt: payload.issuedAt,
    registryHashB64Url: payload.registryHashB64Url,
    registryVersion: payload.registryVersion,
    signerPublicKeyB64Url: key.publicKeyB64Url,
    signatureB64Url
  };

  await writeFile(signaturePath(), JSON.stringify(sig, null, 2) + '\n', 'utf8');

  await mkdir(resolve(process.cwd(), '..', '..', 'keys'), { recursive: true });
  await appendFile(transparencyLogPath(), JSON.stringify(sig) + '\n', 'utf8');

  return sig;
}

export async function readCreatorRegistrySignature(): Promise<CreatorRegistrySignature | null> {
  return readJsonMaybe<CreatorRegistrySignature>(signaturePath());
}

export async function verifyCreatorRegistrySignature(params?: {
  trustedPublicKeyB64Url?: string;
}): Promise<{ ok: boolean; reason?: string; signature?: CreatorRegistrySignature }> {
  const signature = await readCreatorRegistrySignature();
  if (!signature) return { ok: false, reason: 'missing_signature' };

  const trusted =
    params?.trustedPublicKeyB64Url ??
    process.env.PHOENIX_ZERO_TRUSTED_REGISTRY_PUBLIC_KEY_B64URL ??
    (await readJsonMaybe<RegistryAuthorityKeyFile>(authorityKeyPath()))?.publicKeyB64Url ??
    undefined;

  if (trusted && signature.signerPublicKeyB64Url !== trusted) {
    return { ok: false, reason: 'untrusted_signer', signature };
  }

  const payload: CreatorRegistrySignaturePayload = {
    v: 1,
    issuedAt: signature.issuedAt,
    registryHashB64Url: signature.registryHashB64Url,
    registryVersion: signature.registryVersion
  };

  const sigOk = verifyPhoenixZeroPayloadSignature({
    payload,
    signatureB64Url: signature.signatureB64Url,
    publicKeyB64Url: signature.signerPublicKeyB64Url
  });
  if (!sigOk) return { ok: false, reason: 'invalid_signature', signature };

  const { hashB64Url } = await computeCreatorRegistryHashB64Url();
  if (hashB64Url !== signature.registryHashB64Url) return { ok: false, reason: 'registry_hash_mismatch', signature };

  return { ok: true, signature };
}
