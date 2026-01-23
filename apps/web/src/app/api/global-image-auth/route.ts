import { requireTenant } from '../../../lib/tenant-auth';

export const runtime = 'nodejs';

function mapDecisionToImageCard(params: {
  ok: boolean;
  decision?: string;
  identityStatus?: string;
}): { title: string; hint: string } {
  const decision = params.decision || '';

  if (decision === 'suspected_impersonation') {
    return { title: 'Suspeito (possível impostor)', hint: 'A prova parece válida, mas a identidade não confere com o registro.' };
  }

  if (decision === 'verified') {
    return { title: 'Autêntico ✅', hint: 'Assinatura válida, vínculo com a imagem confirmado e criador verificado.' };
  }

  if (decision === 'verified_unregistered_creator') {
    const unknown = params.identityStatus === 'unknown';
    return {
      title: unknown ? 'Autêntico (criador não informado)' : 'Autêntico (criador não verificado)',
      hint: unknown
        ? 'Assinatura válida e vínculo com a imagem confirmado, mas o criador não foi informado na prova.'
        : 'Assinatura válida e vínculo com a imagem confirmado, mas o criador não está registrado.'
    };
  }

  if (params.ok) {
    return { title: 'Autêntico ✅', hint: 'Assinatura válida e vínculo com a imagem confirmado.' };
  }

  return { title: 'Não verificado', hint: 'Não foi possível confirmar autenticidade com a prova fornecida.' };
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
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
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }

    const u = new URL(req.url);

    const imageUrl = u.searchParams.get('imageUrl') ?? '';
    const proofUrl = u.searchParams.get('proofUrl') ?? '';

    if (!imageUrl || !proofUrl) {
      return Response.json(
        { ok: false, reason: 'Missing imageUrl or proofUrl' },
        { status: 400, headers: jsonUtf8Headers() }
      );
    }

    const base = `${u.protocol}//${u.host}`;

    const publicBase = (process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim();

    const storedImageUrl = publicBase ? rewriteToPublicBase({ url: imageUrl, requestBase: base, publicBase }) : imageUrl;
    const storedProofUrl = publicBase ? rewriteToPublicBase({ url: proofUrl, requestBase: base, publicBase }) : proofUrl;

    let verified = false;
    let decision: string | undefined;
    let identityStatus: string | undefined;
    let creatorId: string | undefined;

    let usedWatermarked = false;

    let verifyJson: any = null;

    try {
      const fwdApiKey = (req.headers.get('x-api-key') || '').trim();
      const fwdAuth = (req.headers.get('authorization') || '').trim();
      const fwdCookie = (req.headers.get('cookie') || '').trim();

      const verifyRes = await fetch(new URL('/api/phoenix-zero/verify-image-by-url', base), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fwdApiKey ? { 'x-api-key': fwdApiKey } : {}),
          ...(fwdAuth ? { Authorization: fwdAuth } : {}),
          ...(fwdCookie ? { Cookie: fwdCookie } : {})
        },
        body: JSON.stringify({ imageUrl, proofUrl }),
        cache: 'no-store'
      });

      verifyJson = (await verifyRes.json().catch(() => null)) as any;
      verified = Boolean(verifyJson?.ok);
      decision = typeof verifyJson?.decision === 'string' ? verifyJson.decision : undefined;
      identityStatus = typeof verifyJson?.identity?.status === 'string' ? verifyJson.identity.status : undefined;
      creatorId = typeof verifyJson?.meta?.creatorId === 'string' ? verifyJson.meta.creatorId : undefined;
    } catch {
    }

    if (!verified) {
      try {
        const fwdApiKey = (req.headers.get('x-api-key') || '').trim();
        const fwdAuth = (req.headers.get('authorization') || '').trim();
        const fwdCookie = (req.headers.get('cookie') || '').trim();

        const verifyRes = await fetch(new URL('/api/phoenix-zero/verify-image-watermarked-by-url', base), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(fwdApiKey ? { 'x-api-key': fwdApiKey } : {}),
            ...(fwdAuth ? { Authorization: fwdAuth } : {}),
            ...(fwdCookie ? { Cookie: fwdCookie } : {})
          },
          body: JSON.stringify({ imageUrl, proofUrl }),
          cache: 'no-store'
        });

        verifyJson = (await verifyRes.json().catch(() => null)) as any;
        verified = Boolean(verifyJson?.ok);
        decision = typeof verifyJson?.decision === 'string' ? verifyJson.decision : undefined;
        identityStatus = typeof verifyJson?.identity?.status === 'string' ? verifyJson.identity.status : undefined;
        creatorId =
          (typeof verifyJson?.meta?.creatorId === 'string' ? verifyJson.meta.creatorId : undefined) ??
          (typeof verifyJson?.identity?.creatorId === 'string' ? verifyJson.identity.creatorId : undefined);
        usedWatermarked = true;
      } catch {
      }
    }

    const mapped = mapDecisionToImageCard({ ok: verified, decision, identityStatus });

    const shareBase = publicBase || base;
    const sharePath = usedWatermarked ? '/verify-image-wm' : '/verify-image';
    const shareUrl = new URL(
      `${sharePath}?imageUrl=${encodeURIComponent(storedImageUrl)}&proofUrl=${encodeURIComponent(storedProofUrl)}`,
      shareBase
    ).toString();

    return Response.json(
      {
        ok: true,
        verified,
        decision,
        title: mapped.title,
        hint: mapped.hint,
        creatorId,
        shareUrl
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json(
      { ok: false, reason: message },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
