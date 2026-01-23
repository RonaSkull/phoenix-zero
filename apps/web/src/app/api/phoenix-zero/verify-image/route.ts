import { decodeProofFromCompactString, verifyPhoenixZeroProof } from '@phoenix-zero/core';

import { requireTenant } from '../../../../lib/tenant-auth';
import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../../lib/billing-accounts';
import { recordUsage } from '../../../../lib/usage-ledger';

export const runtime = 'nodejs';

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

    const proofCompact = typeof form.get('proofCompact') === 'string' ? String(form.get('proofCompact')) : undefined;
    const proofField = form.get('proof');

    const proof =
      proofCompact != null
        ? decodeProofFromCompactString(proofCompact)
        : typeof proofField === 'string'
          ? JSON.parse(proofField)
          : proofField instanceof File
            ? JSON.parse(await proofField.text())
            : null;

    if (!proof) {
      httpStatus = 400;
      return Response.json(
        { ok: false, reason: 'Missing proof. Provide proofCompact or proof (string/file).' },
        { status: 400 }
      );
    }

    const imageBytes = new Uint8Array(await image.arrayBuffer());
    const result = verifyPhoenixZeroProof({ videoBytes: imageBytes, proof });

    ok = result.ok === true;
    httpStatus = result.ok ? 200 : 400;
    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op: 'verify_image', ok, httpStatus, startedAtMs });
  }
}
