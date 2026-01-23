import {
  base64UrlToBytes,
  bytesToBase64Url,
  createPhoenixZeroProof,
  ed25519KeyPairFromPrivateKey,
  encodeProofToCompactString,
  phoenixZeroProofId
} from '@phoenix-zero/core';

import { getCreatorRecord } from '../../../../lib/creator-registry';
import { verifyCreatorRegistrySignature } from '../../../../lib/registry-signing';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

const MAX_VIDEO_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_STAMP_MAX_VIDEO_BYTES', 50 * 1024 * 1024));
const ALLOWED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

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
    const video = form.get('video');

    if (!(video instanceof File)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing form field: video' }, { status: 400 });
    }

    if (Number.isFinite(video.size) && video.size > MAX_VIDEO_BYTES) {
      httpStatus = 413;
      return Response.json({ ok: false, reason: 'File too large' }, { status: 413 });
    }

    if (video.type && !ALLOWED_MIME.has(video.type)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Invalid file type' }, { status: 400 });
    }

    const creatorId = typeof form.get('creatorId') === 'string' ? String(form.get('creatorId')) : undefined;

    const privateKeyB64Url =
      (typeof form.get('privateKeyB64Url') === 'string' ? String(form.get('privateKeyB64Url')) : undefined) ??
      process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL;

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

    const videoBytes = new Uint8Array(await video.arrayBuffer());

    const proof = createPhoenixZeroProof({
      videoBytes,
      keyPair,
      creatorId,
      mimeType: video.type || undefined
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
    void recordUsage({ req, tenantId, op: 'stamp_video', ok, httpStatus, startedAtMs });
  }
}
