import { getShareLink, mapDecisionToCard } from '../../../lib/share-links';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  if (!id) return Response.json({ ok: false, reason: 'Missing id' }, { status: 400 });

  const rec = await getShareLink(id);
  if (!rec) return Response.json({ ok: false, reason: 'Not found' }, { status: 404 });

  const cache = rec.cache;
  const mapped = cache
    ? { title: cache.title || 'Verificação', hint: cache.hint || '' }
    : mapDecisionToCard({ ok: false, decision: 'not_verified' });

  const title = mapped.title;
  const hint = mapped.hint;
  const creator = cache?.creatorId ? `Criador: ${cache.creatorId}` : '';

  const bg = cache?.decision === 'suspected_impersonation' ? '#7f1d1d' : cache?.ok ? '#065f46' : '#111827';

  return Response.json({
    ok: true,
    id,
    title,
    hint,
    creator,
    bg,
    decision: cache?.decision,
    verified: Boolean(cache?.ok)
  });
}
