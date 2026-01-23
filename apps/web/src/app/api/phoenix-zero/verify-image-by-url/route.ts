import { lookup } from 'node:dns/promises';

import { verifyPhoenixZeroProof } from '@phoenix-zero/core';

import { getCreatorRecord } from '../../../../lib/creator-registry';
import { assessIdentity } from '../../../../lib/identity';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

const ALLOW_LOCALHOST_VERIFY =
  process.env.PHOENIX_ZERO_VERIFY_URL_ALLOW_LOCALHOST === '1' || process.env.NODE_ENV !== 'production';

function getRequestHost(req: Request): string {
  const xfHost = (req.headers.get('x-forwarded-host') || '').split(',')[0]?.trim();
  const host = (xfHost || req.headers.get('host') || '').trim();
  return host.toLowerCase();
}

function isPrivateIp(ip: string): boolean {
  const v = ip.trim();

  if (v === '127.0.0.1' || v === '0.0.0.0') return true;
  if (v === '::1') return true;
  if (v.startsWith('fe80:')) return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;

  const m = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/.exec(v);
  if (!m) return false;

  const a = Number(m[1]);
  const b = Number(m[2]);

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

async function assertPublicHttpUrl(url: URL, requestHost: string) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL must be http(s).');
  }

  if (url.username || url.password) {
    throw new Error('URL must not include credentials.');
  }

  const host = url.hostname.toLowerCase();
  const reqHost = ((requestHost || '').split(',')[0] || '').trim().toLowerCase();
  const reqHostNoPort = ((reqHost.split(':')[0] || '')).trim();
  const sameOrigin = Boolean(reqHostNoPort) && host === reqHostNoPort;

  if (!ALLOW_LOCALHOST_VERIFY && !sameOrigin) {
    if (host === 'localhost') throw new Error('Refusing localhost URL.');
  }

  if (!ALLOW_LOCALHOST_VERIFY && !sameOrigin) {
    const resolved = await lookup(host, { all: true, verbatim: true });
    for (const r of resolved) {
      if (isPrivateIp(r.address)) throw new Error('Refusing private network URL.');
    }
  }
}

async function fetchBytes(params: { url: URL; maxBytes: number }): Promise<Uint8Array> {
  const res = await fetch(params.url.toString(), { redirect: 'manual' });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`Refusing redirect (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt || `HTTP ${res.status}`);
  }

  const len = res.headers.get('content-length');
  if (len) {
    const n = Number(len);
    if (Number.isFinite(n) && n > params.maxBytes) {
      throw new Error(`Response too large (${n} bytes).`);
    }
  }

  if (!res.body) throw new Error('Missing response body.');

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > params.maxBytes) {
      throw new Error(`Response too large (>${params.maxBytes} bytes).`);
    }

    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }

  return out;
}

type Proof = {
  version: 1;
  createdAt: string;
  creatorId?: string;
  media: {
    mimeType?: string;
    byteLength: number;
  };
  features: {
    type: 'sha256';
    valueB64Url: string;
  };
  signerPublicKeyB64Url: string;
  signatureAlg: 'ed25519';
  signatureB64Url: string;
};

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

    const body = (await req.json().catch(() => null)) as null | { imageUrl?: string; proofUrl?: string };

    const imageUrlStr = body?.imageUrl;
    const proofUrlStr = body?.proofUrl;

    if (!imageUrlStr || !proofUrlStr) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing imageUrl or proofUrl.' }, { status: 400 });
    }

    const imageUrl = new URL(imageUrlStr);
    const proofUrl = new URL(proofUrlStr);

    const requestHost = getRequestHost(req);

    await assertPublicHttpUrl(imageUrl, requestHost);
    await assertPublicHttpUrl(proofUrl, requestHost);

    const proofBytes = await fetchBytes({ url: proofUrl, maxBytes: 1024 * 1024 });
    const proofTxt = new TextDecoder().decode(proofBytes);
    const proof = JSON.parse(proofTxt) as Proof;

    const imageBytes = await fetchBytes({ url: imageUrl, maxBytes: 50 * 1024 * 1024 });

    const result = verifyPhoenixZeroProof({ videoBytes: imageBytes, proof: proof as any });

    const registryRecord = proof.creatorId ? await getCreatorRecord(proof.creatorId) : null;

    const registryRecordEdOnly = registryRecord
      ? {
          ed25519PublicKeyB64Url: registryRecord.ed25519PublicKeyB64Url
        }
      : null;

    const identity = assessIdentity({
      creatorId: proof.creatorId,
      registryRecord: registryRecordEdOnly,
      proofEd25519PublicKeyB64Url: proof.signerPublicKeyB64Url,
      proofPqPublicKeyB64Url: undefined
    });

    const decision =
      !result.ok
        ? 'not_verified'
        : identity.status === 'mismatch'
          ? 'suspected_impersonation'
          : identity.status === 'match'
            ? 'verified'
            : 'verified_unregistered_creator';

    ok = result.ok === true;
    httpStatus = ok ? 200 : 400;
    return Response.json(
      {
        ok: result.ok,
        decision,
        identity,
        meta: {
          imageUrl: imageUrl.toString(),
          proofUrl: proofUrl.toString(),
          creatorId: proof.creatorId,
          createdAt: proof.createdAt
        }
      },
      { status: httpStatus }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op: 'verify_image_by_url', ok, httpStatus, startedAtMs });
  }
}
