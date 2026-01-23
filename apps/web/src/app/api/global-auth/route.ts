import { createShareLinkForTenant, mapDecisionToCard, updateShareLinkCacheForTenant } from '../../../lib/share-links';
import { requireTenant } from '../../../lib/tenant-auth';

export const runtime = 'nodejs';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function rewriteToPublicBase(params: { url: string; requestBase: string; publicBase: string }): string {
  try {
    const input = new URL(params.url);
    const req = new URL(params.requestBase);
    const pub = new URL(params.publicBase);
    if (input.protocol === req.protocol && input.host === req.host) {
      input.protocol = pub.protocol;
      input.host = pub.host;
      return input.toString();
    }
    return params.url;
  } catch {
    return params.url;
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } });
    }

    const u = new URL(req.url);

    const videoUrl = u.searchParams.get('videoUrl') ?? '';
    const proofUrl = u.searchParams.get('proofUrl') ?? '';

    if (!videoUrl || !proofUrl) {
      return Response.json(
        { ok: false, reason: 'Missing videoUrl or proofUrl' },
        { status: 400, headers: corsHeaders() }
      );
    }

    const base = `${u.protocol}//${u.host}`;

    const publicBase = (process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim();
    const shareBase = publicBase || base;

    const storedVideoUrl = publicBase ? rewriteToPublicBase({ url: videoUrl, requestBase: base, publicBase }) : videoUrl;
    const storedProofUrl = publicBase ? rewriteToPublicBase({ url: proofUrl, requestBase: base, publicBase }) : proofUrl;

    let verified = false;
    let decision: string | undefined;
    let identityStatus: string | undefined;
    let creatorId: string | undefined;
    let attestationOk = false;

    let verifyJson: any = null;

    try {
      const fwdApiKey = (req.headers.get('x-api-key') || '').trim();
      const fwdAuth = (req.headers.get('authorization') || '').trim();
      const fwdCookie = (req.headers.get('cookie') || '').trim();

      const verifyRes = await fetch(new URL('/api/phoenix-zero/verify-by-url', base), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fwdApiKey ? { 'x-api-key': fwdApiKey } : {}),
          ...(fwdAuth ? { Authorization: fwdAuth } : {}),
          ...(fwdCookie ? { Cookie: fwdCookie } : {})
        },
        body: JSON.stringify({ videoUrl, proofUrl }),
        cache: 'no-store'
      });

      verifyJson = (await verifyRes.json().catch(() => null)) as any;
      verified = Boolean(verifyJson?.ok);
      decision = typeof verifyJson?.decision === 'string' ? verifyJson.decision : undefined;
      identityStatus = typeof verifyJson?.identity?.status === 'string' ? verifyJson.identity.status : undefined;
      creatorId = typeof verifyJson?.meta?.creatorId === 'string' ? verifyJson.meta.creatorId : undefined;
      attestationOk = verifyJson?.attestation?.ok === true;
    } catch {
    }

    const mapped = mapDecisionToCard({ ok: verified, decision, identityStatus, attestationOk });

    const rec = await createShareLinkForTenant({ tenantId: auth.ctx.tenantId, videoUrl: storedVideoUrl, proofUrl: storedProofUrl });
    const shareUrl = new URL(`/s/${encodeURIComponent(rec.id)}`, shareBase).toString();

    try {
      await updateShareLinkCacheForTenant({
        tenantId: auth.ctx.tenantId,
        id: rec.id,
        cache: {
          at: new Date().toISOString(),
          ok: verified,
          decision,
          title: mapped.title,
          hint: mapped.hint,
          creatorId,
          attestationOk
        }
      });
    } catch {
    }

    return Response.json(
      {
        ok: true,
        verified,
        decision,
        title: mapped.title,
        hint: mapped.hint,
        creatorId,
        attestationOk,
        shareId: rec.id,
        shareUrl
      },
      { status: 200, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: { ...corsHeaders(), 'Cache-Control': 'no-store' } }
    );
  }
}
