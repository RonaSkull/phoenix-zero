import { getShareLink, mapDecisionToCard } from '../../../lib/share-links';

export const runtime = 'nodejs';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return new Response('Missing id', { status: 400 });

  const rec = await getShareLink(id);
  if (!rec) return new Response('Not found', { status: 404 });

  const cache = rec.cache;
  const mapped = cache
    ? { title: cache.title || 'Verificação', hint: cache.hint || '' }
    : mapDecisionToCard({ ok: false, decision: 'not_verified' });

  const title = escapeXml(mapped.title);
  const hint = escapeXml(mapped.hint);
  const creator = escapeXml(cache?.creatorId ? `Criador: ${cache.creatorId}` : '');

  const bg = cache?.decision === 'suspected_impersonation' ? '#7f1d1d' : cache?.ok ? '#065f46' : '#111827';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${bg}"/>
  <text x="60" y="170" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${title}</text>
  <text x="60" y="250" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#ffffff" opacity="0.95">${hint}</text>
  <text x="60" y="560" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#ffffff" opacity="0.9">${creator}</text>
  <text x="60" y="610" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#ffffff" opacity="0.75">Phoenix Zero</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    }
  });
}

export async function HEAD(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return new Response(null, { status: 400 });

  const rec = await getShareLink(id);
  if (!rec) return new Response(null, { status: 404 });

  return new Response(null, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
    }
  });
}
