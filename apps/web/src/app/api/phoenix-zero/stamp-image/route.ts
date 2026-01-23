import {
  base64UrlToBytes,
  bytesToBase64Url,
  createPhoenixZeroProof,
  ed25519KeyPairFromPrivateKey,
  encodeProofToCompactString,
  phoenixZeroProofId
} from '@phoenix-zero/core';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getCreatorRecord } from '../../../../lib/creator-registry';
import { verifyCreatorRegistrySignature } from '../../../../lib/registry-signing';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
    }
    tenantId = auth.ctx.tenantId;

    const billing = await getOrCreateBillingAccount(auth.ctx.tenantId);
    if (!billing.ok) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: billing.reason }, { status: 400 });
    }
    if (!isBillingAccountActive(billing.account)) {
      httpStatus = 402;
      return Response.json(
        { ok: false, reason: 'Payment required', billing: { status: billing.account.status, isActive: false } },
        { status: 402 }
      );
    }

    const form = await req.formData();
    const image = form.get('image');

    if (!(image instanceof File)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing form field: image' }, { status: 400 });
    }

    const creatorId = typeof form.get('creatorId') === 'string' ? String(form.get('creatorId')) : undefined;

    const privateKeyB64Url =
      (typeof form.get('privateKeyB64Url') === 'string' ? String(form.get('privateKeyB64Url')) : undefined) ??
      process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL ??
      (await readJsonMaybe<{ privateKeyB64Url?: string }>(
        resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-ed25519.json')
      ))?.privateKeyB64Url;

    if (!privateKeyB64Url) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing signing key. Provide privateKeyB64Url or set PHOENIX_ZERO_PRIVATE_KEY_B64URL.' },
        { status: 400 }
      );
    }

    const privateKeyBytes = base64UrlToBytes(privateKeyB64Url);
    const keyPair = ed25519KeyPairFromPrivateKey(privateKeyBytes);

    const enforceRegistry = process.env.PHOENIX_ZERO_ENFORCE_CREATOR_REGISTRY === '1';
    const requireSignedRegistry = process.env.PHOENIX_ZERO_REQUIRE_SIGNED_REGISTRY === '1';
    if (enforceRegistry && creatorId) {
      if (requireSignedRegistry) {
        const trust = await verifyCreatorRegistrySignature();
        if (!trust.ok) {
          httpStatus = 503;
          return Response.json(
            { ok: false, reason: 'Creator registry is not trusted (missing/invalid signature).' },
            { status: 503 }
          );
        }
      }
      const rec = await getCreatorRecord(creatorId);
      if (rec) {
        const pub = bytesToBase64Url(keyPair.publicKey);
        if (pub !== rec.ed25519PublicKeyB64Url) {
          httpStatus = 403;
          return Response.json(
            { ok: false, reason: 'Signing key does not match creator registry for creatorId.' },
            { status: 403 }
          );
        }
      }
    }

    const imageBytes = new Uint8Array(await image.arrayBuffer());

    const proof = createPhoenixZeroProof({
      videoBytes: imageBytes,
      keyPair,
      creatorId,
      mimeType: image.type || undefined
    });

    const proofCompact = encodeProofToCompactString(proof);
    const proofId = phoenixZeroProofId(proof);

    ok = true;
    httpStatus = 200;
    return Response.json({ ok: true, proof, proofCompact, proofId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op: 'stamp_image', ok, httpStatus, startedAtMs });
  }
}
