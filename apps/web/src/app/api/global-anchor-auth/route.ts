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

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type AnchorVerifyJson = {
  ok: boolean;
  anchorId?: string;
  verified?: {
    ok: boolean;
    window: 'valid' | 'expired';
    coincidence: boolean;
    confidence: number;
    creatorId?: string;
    kind?: 'live' | 'vod';
    createdAt?: string;
    expiresAt?: string;
  };
  record?: {
    anchorId: string;
    createdAt: string;
    expiresAt: string;
    creatorId?: string;
    kind: 'live' | 'vod';
    contentCommit: { alg: 'sha256_b64url_v1'; value: string };
  };
  reason?: string;
};

function mapAnchorToCard(params: {
  anchor?: AnchorVerifyJson | null;
  hasContentCommit: boolean;
}): { verified: boolean; decision: string; title: string; hint: string } {
  const a = params.anchor;
  const v = a?.verified;

  if (!a || !a.ok || !v) {
    return {
      verified: false,
      decision: 'not_found',
      title: 'Âncora — Não encontrada',
      hint: 'Âncora não encontrada ou indisponível.'
    };
  }

  if (v.window === 'expired') {
    return {
      verified: false,
      decision: 'expired',
      title: 'Âncora — Expirada',
      hint: 'A janela de verificação expirou.'
    };
  }

  if (!v.ok) {
    return {
      verified: false,
      decision: 'not_verified',
      title: 'Âncora — Inválida',
      hint: 'Não foi possível confirmar autenticidade.'
    };
  }

  if (!params.hasContentCommit) {
    return {
      verified: false,
      decision: 'inconclusive',
      title: 'Âncora — Verificação parcial',
      hint: 'A prova temporal está válida, mas o emissor não forneceu verificação completa para este conteúdo.'
    };
  }

  if (!v.coincidence) {
    return {
      verified: false,
      decision: 'content_mismatch',
      title: 'Âncora — Conteúdo não confere',
      hint: 'A âncora é válida, mas não coincide com o conteúdo informado.'
    };
  }

  return {
    verified: true,
    decision: 'verified',
    title: 'Âncora — Verificada ✅',
    hint: 'Coincidência ativa confirmada.'
  };
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
    const anchorId = (u.searchParams.get('anchorId') || '').trim();
    const contentCommit = (u.searchParams.get('contentCommit') || '').trim();
    const v = (u.searchParams.get('v') || '').trim();

    if (!anchorId) {
      return Response.json({ ok: false, reason: 'Missing anchorId' }, { status: 400, headers: jsonUtf8Headers() });
    }

    const base = `${u.protocol}//${u.host}`;
    const apiQuery = v ? `?v=${encodeURIComponent(v)}` : contentCommit ? `?contentCommit=${encodeURIComponent(contentCommit)}` : '';
    const apiUrl = new URL(`/api/public-anchor/${encodeURIComponent(anchorId)}${apiQuery}`, base).toString();

    const res = await fetch(apiUrl, { method: 'GET', cache: 'no-store' });
    const json = (await res.json().catch(() => null)) as AnchorVerifyJson | null;

    const mapped = mapAnchorToCard({ anchor: json, hasContentCommit: Boolean(contentCommit || v) });

    const shareQuery = v ? `?v=${encodeURIComponent(v)}` : contentCommit ? `?contentCommit=${encodeURIComponent(contentCommit)}` : '';
    const shareUrl = new URL(`/verify-anchor/${encodeURIComponent(anchorId)}${shareQuery}`, base).toString();

    return Response.json(
      {
        ok: true,
        anchorId,
        verified: mapped.verified,
        decision: mapped.decision,
        title: mapped.title,
        hint: mapped.hint,
        confidence: json?.verified?.confidence ?? 0,
        shareUrl,
        record: json?.record ?? null
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
