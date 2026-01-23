import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  phoenixZeroStableStringify,
  sha256B64Url,
  signPhoenixZeroPayload,
  verifyPhoenixZeroPayloadSignature
} from '../core';

import { sphincsAvailable, sphincsSign, sphincsVerify } from './pq-sphincs';

export type PhoenixZeroHybridMode = 'compat' | 'strict';

export type PhoenixZeroHybridSignature = {
  ed25519: {
    signatureB64Url: string;
    publicKeyB64Url: string;
  };
  pq?: {
    alg: 'sphincs';
    signatureB64Url: string;
    publicKeyB64Url: string;
  };
  mode: PhoenixZeroHybridMode;
  hybridId: string;
};

export type PhoenixZeroHybridVerifyResult =
  | {
      ok: true;
      ed25519Ok: true;
      pqOk: boolean;
      mode: PhoenixZeroHybridMode;
      pqPresent: boolean;
      pqAvailable: boolean;
    }
  | {
      ok: false;
      reason: string;
      ed25519Ok: boolean;
      pqOk: boolean;
      mode: PhoenixZeroHybridMode;
      pqPresent: boolean;
      pqAvailable: boolean;
    };

function computeHybridId(params: {
  payload: unknown;
  edSigB64Url: string;
  pqSigB64Url?: string;
}): string {
  const p = utf8ToBytes(phoenixZeroStableStringify(params.payload));
  const a = base64UrlToBytes(params.edSigB64Url);
  const b = params.pqSigB64Url ? base64UrlToBytes(params.pqSigB64Url) : new Uint8Array();
  return sha256B64Url(concatBytes(p, a, b)).slice(0, 22);
}

export async function createHybridSignature(params: {
  payload: unknown;
  mode: PhoenixZeroHybridMode;
  ed25519: { privateKey: Uint8Array; publicKey: Uint8Array };
  pq?: { alg: 'sphincs'; privateKey: Uint8Array; publicKey: Uint8Array };
}): Promise<PhoenixZeroHybridSignature> {
  const edSig = signPhoenixZeroPayload({ payload: params.payload, privateKey: params.ed25519.privateKey });

  let pqSig: string | undefined;
  let pqPublicKeyB64Url: string | undefined;

  if (params.pq) {
    const msg = utf8ToBytes(phoenixZeroStableStringify(params.payload));
    const sigBytes = await sphincsSign({ message: msg, privateKey: params.pq.privateKey });
    pqSig = bytesToBase64Url(sigBytes);
    pqPublicKeyB64Url = bytesToBase64Url(params.pq.publicKey);
  }

  const hybridId = computeHybridId({ payload: params.payload, edSigB64Url: edSig, pqSigB64Url: pqSig });

  return {
    ed25519: {
      signatureB64Url: edSig,
      publicKeyB64Url: bytesToBase64Url(params.ed25519.publicKey)
    },
    pq:
      pqSig && pqPublicKeyB64Url
        ? { alg: 'sphincs', signatureB64Url: pqSig, publicKeyB64Url: pqPublicKeyB64Url }
        : undefined,
    mode: params.mode,
    hybridId
  };
}

export async function verifyHybridSignature(params: {
  payload: unknown;
  sig: PhoenixZeroHybridSignature;
}): Promise<PhoenixZeroHybridVerifyResult> {
  const edOk = verifyPhoenixZeroPayloadSignature({
    payload: params.payload,
    signatureB64Url: params.sig.ed25519.signatureB64Url,
    publicKeyB64Url: params.sig.ed25519.publicKeyB64Url
  });

  const pqPresent = Boolean(params.sig.pq);
  const pqAvail = await sphincsAvailable();

  let pqOk = false;
  if (pqPresent) {
    if (!pqAvail) {
      pqOk = false;
    } else {
      const msg = utf8ToBytes(phoenixZeroStableStringify(params.payload));
      pqOk = await sphincsVerify({
        message: msg,
        signature: base64UrlToBytes(params.sig.pq!.signatureB64Url),
        publicKey: base64UrlToBytes(params.sig.pq!.publicKeyB64Url)
      });
    }
  }

  if (!edOk) {
    return {
      ok: false,
      reason: 'Invalid Ed25519 signature',
      ed25519Ok: false,
      pqOk,
      mode: params.sig.mode,
      pqPresent,
      pqAvailable: pqAvail
    };
  }

  if (params.sig.mode === 'strict') {
    if (!pqPresent) {
      return {
        ok: false,
        reason: 'PQ signature missing (strict mode)',
        ed25519Ok: true,
        pqOk: false,
        mode: params.sig.mode,
        pqPresent,
        pqAvailable: pqAvail
      };
    }
    if (!pqAvail) {
      return {
        ok: false,
        reason: 'PQ module unavailable (strict mode)',
        ed25519Ok: true,
        pqOk: false,
        mode: params.sig.mode,
        pqPresent,
        pqAvailable: pqAvail
      };
    }
    if (!pqOk) {
      return {
        ok: false,
        reason: 'Invalid PQ signature (strict mode)',
        ed25519Ok: true,
        pqOk: false,
        mode: params.sig.mode,
        pqPresent,
        pqAvailable: pqAvail
      };
    }
  }

  return {
    ok: true,
    ed25519Ok: true,
    pqOk,
    mode: params.sig.mode,
    pqPresent,
    pqAvailable: pqAvail
  };
}
