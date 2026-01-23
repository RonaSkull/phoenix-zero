import { headers } from 'next/headers';

import { getShareLink, mapDecisionToCard, updateShareLinkCacheForTenant } from '../../../lib/share-links';
import { resolveTenantBySessionToken } from '../../../lib/tenants';
import { getPublicBaseUrl, isPreviewUserAgent } from '../../../lib/social-preview';

export const runtime = 'nodejs';

function requestBaseUrl(): string {
  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  if (!host) return '';
  return `${proto}://${host}`;
}

function isPreviewBot(): boolean {
  const ua = headers().get('user-agent') ?? '';
  return isPreviewUserAgent(ua);
}

export async function generateMetadata(props: { params: { id: string } }) {
  const id = props.params.id;
  const rec = await getShareLink(id);
  if (!rec) {
    return {
      title: 'Phoenix Zero — Link inválido',
      robots: { index: false, follow: false }
    };
  }

  const cache = rec.cache;
  const title = cache?.title || 'Phoenix Zero — Verificação';
  const description = cache?.hint || 'Verificação automática de autenticidade.';

  const base = getPublicBaseUrl(requestBaseUrl());
  const imgJpg = base
    ? new URL(`/api/share-card-jpg?id=${encodeURIComponent(id)}`, base).toString()
    : `/api/share-card-jpg?id=${encodeURIComponent(id)}`;
  const imgPng = base
    ? new URL(`/api/share-card-png?id=${encodeURIComponent(id)}`, base).toString()
    : `/api/share-card-png?id=${encodeURIComponent(id)}`;

  const canonical = base ? new URL(`/s/${encodeURIComponent(id)}`, base).toString() : `/s/${encodeURIComponent(id)}`;

  return {
    title,
    description,
    openGraph: {
      url: canonical,
      type: 'website',
      siteName: 'Phoenix Zero',
      title,
      description,
      images: [
        { url: imgJpg, width: 1200, height: 630, alt: title, type: 'image/jpeg' },
        { url: imgPng, width: 1200, height: 630, alt: title, type: 'image/png' }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imgJpg]
    }
  };
}

async function refreshCacheIfNeeded(id: string, rec: { videoUrl: string; proofUrl: string; cache?: any } | null) {
  if (!rec) return null;
  if (isPreviewBot() && rec.cache?.at) return rec;
  const cookie = headers().get('cookie') ?? '';
  const hasTenantSession = cookie.includes('pz_tenant_session=');
  if (!hasTenantSession) return rec;

  const m = /(?:^|;\s*)pz_tenant_session=([^;]+)/.exec(cookie);
  const sessionToken = m ? decodeURIComponent(m[1] || '') : '';
  const resolved = sessionToken ? await resolveTenantBySessionToken(sessionToken).catch(() => null) : null;
  const tenantId = resolved && (resolved as any).ok ? (resolved as any).tenantId : '';
  if (!tenantId) return rec;

  const cache = rec.cache;
  const now = Date.now();
  const atMs = cache?.at ? Date.parse(cache.at) : NaN;
  const ttlMs = 10 * 60_000;
  if (Number.isFinite(atMs) && now - atMs < ttlMs) return rec;

  try {
    const base = requestBaseUrl();
    const verifyUrl = base ? new URL('/api/phoenix-zero/verify-by-url', base).toString() : '';
    if (!verifyUrl) return rec;

    const res = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ videoUrl: rec.videoUrl, proofUrl: rec.proofUrl }),
      cache: 'no-store'
    });

    const json = (await res.json().catch(() => null)) as any;
    const ok = Boolean(json?.ok);
    const decision = typeof json?.decision === 'string' ? json.decision : undefined;
    const identityStatus = typeof json?.identity?.status === 'string' ? json.identity.status : undefined;
    const creatorId = typeof json?.meta?.creatorId === 'string' ? json.meta.creatorId : undefined;
    const attOk = json?.attestation?.ok === true;

    const mapped = mapDecisionToCard({ ok, decision, identityStatus, attestationOk: attOk });

    const updated = await updateShareLinkCacheForTenant({
      tenantId,
      id,
      cache: {
        at: new Date().toISOString(),
        ok,
        decision,
        title: mapped.title,
        hint: mapped.hint,
        creatorId,
        attestationOk: attOk
      }
    });

    return updated;
  } catch {
    return rec;
  }
}

export default async function SharePage(props: { params: { id: string } }) {
  const id = props.params.id;
  const initial = await getShareLink(id);
  if (!initial) {
    return (
      <main style={{ maxWidth: 920, padding: 16 }}>
        <h1>Link inválido</h1>
      </main>
    );
  }

  const rec = await refreshCacheIfNeeded(id, initial);
  const cache = rec?.cache;

  const mapped = mapDecisionToCard({
    ok: Boolean(cache?.ok),
    decision: typeof cache?.decision === 'string' ? cache.decision : undefined,
    identityStatus: undefined,
    attestationOk: cache?.attestationOk === true
  });

  const title = mapped.title;
  const hint = mapped.hint;

  return (
    <main style={{ maxWidth: 920, padding: 16 }}>
      <h1>{title}</h1>
      <p style={{ marginTop: 10 }}>{hint}</p>

      {cache?.creatorId ? (
        <p style={{ marginTop: 10 }}>
          <strong>Criador:</strong> {cache.creatorId}
        </p>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <a href={`/verify?videoUrl=${encodeURIComponent(rec?.videoUrl ?? '')}&proofUrl=${encodeURIComponent(rec?.proofUrl ?? '')}&pageUrl=${encodeURIComponent(`/s/${id}`)}`}
        >
          Abrir detalhes
        </a>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
        <div>
          <a href={rec?.videoUrl ?? ''} target="_blank" rel="noreferrer">
            Abrir vídeo
          </a>
        </div>
        <div>
          <a href={rec?.proofUrl ?? ''} target="_blank" rel="noreferrer">
            Abrir prova
          </a>
        </div>
      </div>
    </main>
  );
}
