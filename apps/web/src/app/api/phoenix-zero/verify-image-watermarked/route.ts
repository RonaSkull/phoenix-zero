import { verifyHybridSignature } from '@phoenix-zero/core/node';
import { computeImageDHashB64Url, dhashHammingDistance, extractInvisibleImageWatermark } from '@phoenix-zero/core/node/watermark-image';

import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { requireTenant } from '../../../../lib/tenant-auth';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

type Proof = {
  version: 4;
  createdAt: string;
  creatorId?: string;
  media: { mimeType?: string; byteLength?: number };
  watermark: {
    alg: 'grid_luma_delta_v1';
    payloadByteLength: number;
    payloadB64Url: string;
    bitCount: number;
    repeatPerBit: number;
    brightnessDelta: number;
    maxBitErrors?: number;
    grid: { x: number; y: number; w: number; h: number; rows: number; cols: number };
    analysisSize: number;
  };
  fingerprint?: {
    alg: 'dhash_v1';
    width: number;
    height: number;
    valueB64Url: string;
    maxHammingDistance?: number;
  };
  signatureMode: 'compat' | 'strict';
  hybridSignature: any;
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

    const form = await req.formData();
    const image = form.get('image');

    if (!(image instanceof File)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing form field: image' }, { status: 400 });
    }

    const proofField = form.get('proof');
    const proofCompact = typeof form.get('proofCompact') === 'string' ? String(form.get('proofCompact')) : undefined;

    const proof: Proof | null =
      proofCompact != null
        ? (JSON.parse(new TextDecoder().decode(Buffer.from(proofCompact, 'base64url'))) as Proof)
        : typeof proofField === 'string'
          ? (JSON.parse(proofField) as Proof)
          : proofField instanceof File
            ? (JSON.parse(await proofField.text()) as Proof)
            : null;

    if (!proof) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing proof. Provide proof (string/file) or proofCompact.' }, { status: 400 });
    }

    if (proof.version !== 4) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Unsupported proof version.' }, { status: 400 });
    }

    const payload = {
      version: proof.version,
      createdAt: proof.createdAt,
      creatorId: proof.creatorId,
      media: proof.media,
      watermark: proof.watermark,
      fingerprint: proof.fingerprint,
      signatureMode: proof.signatureMode
    };

    const sigResult = await verifyHybridSignature({ payload, sig: proof.hybridSignature });

    const imageBytes = new Uint8Array(await image.arrayBuffer());

    const wmCfg = {
      payloadB64Url: proof.watermark.payloadB64Url,
      payloadByteLength: proof.watermark.payloadByteLength,
      bitCount: proof.watermark.bitCount,
      repeatPerBit: proof.watermark.repeatPerBit,
      brightnessDelta: proof.watermark.brightnessDelta,
      grid: proof.watermark.grid,
      analysisSize: proof.watermark.analysisSize
    };

    const wm = await extractInvisibleImageWatermark({
      imageBytes,
      cfg: wmCfg,
      expectedPayloadB64Url: proof.watermark.payloadB64Url
    });

    const watermarkMatch = wm.extractedPayloadB64Url === proof.watermark.payloadB64Url;
    const maxBitErrors = Number.isFinite(proof.watermark.maxBitErrors) ? Number(proof.watermark.maxBitErrors) : 2;
    const bestBitErrors = typeof wm.bestBitErrors === 'number' ? wm.bestBitErrors : undefined;
    const watermarkOk = watermarkMatch || (bestBitErrors !== undefined && bestBitErrors <= maxBitErrors);

    let fingerprint: any = { present: false, ok: true as const };

    if (proof.fingerprint?.alg === 'dhash_v1') {
      const extracted = await computeImageDHashB64Url({
        imageBytes,
        width: proof.fingerprint.width,
        height: proof.fingerprint.height
      });
      const dist = dhashHammingDistance(proof.fingerprint.valueB64Url, extracted);
      const max = proof.fingerprint.maxHammingDistance ?? 14;
      fingerprint = {
        present: true,
        ok: dist <= max,
        distance: dist,
        max,
        referenceB64Url: proof.fingerprint.valueB64Url,
        extractedB64Url: extracted
      };
    }

    ok = sigResult.ok && watermarkOk && (fingerprint.present ? fingerprint.ok : true);
    httpStatus = ok ? 200 : 400;

    return Response.json(
      {
        ok,
        signature: sigResult,
        watermark: {
          ok: watermarkOk,
          expectedPayloadB64Url: proof.watermark.payloadB64Url,
          extractedPayloadB64Url: wm.extractedPayloadB64Url,
          bestBitErrors,
          maxBitErrors,
          threshold: wm.threshold,
          polarity: wm.polarity
        },
        fingerprint
      },
      { status: httpStatus }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op: 'verify_image_watermarked', ok, httpStatus, startedAtMs });
  }
}
