import { ImageResponse } from 'next/og';
import React from 'react';

export const runtime = 'edge';

function toAsciiSafe(s: string): string {
  const noEmoji = s.replace(/✅/g, '+').replace(/\s+/g, ' ').trim();
  const normalized = noEmoji.normalize('NFKD');
  const withoutDiacritics = normalized.replace(/[\u0300-\u036f]/g, '');
  return withoutDiacritics.replace(/[^ -~]/g, '').trim();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return new Response('Missing id', { status: 400 });

    const dataUrl = new URL(`/api/share-card-data?id=${encodeURIComponent(id)}`, url.origin);
    const res = await fetch(dataUrl.toString(), { cache: 'no-store' });
    if (!res.ok) return new Response('Not found', { status: 404 });
    const data = (await res.json().catch(() => null)) as any;
    if (!data?.ok) return new Response('Not found', { status: 404 });

    const title = toAsciiSafe(typeof data.title === 'string' ? data.title : 'Verificacao');
    const hint = toAsciiSafe(typeof data.hint === 'string' ? data.hint : '');
    const creator = toAsciiSafe(typeof data.creator === 'string' ? data.creator : '');
    const rawBg = typeof data.bg === 'string' ? data.bg.trim() : '';
    const bg = /^#([0-9a-fA-F]{6})$/.test(rawBg) ? rawBg : '#111827';

    const rootStyle: React.CSSProperties = {
      width: '1200px',
      height: '630px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '60px',
      backgroundColor: bg,
      color: '#ffffff',
      fontFamily: 'sans-serif'
    };

    const el = React.createElement(
      'div',
      { style: rootStyle },
      React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        React.createElement(
          'div',
          { style: { display: 'flex', fontSize: 64, fontWeight: 700, lineHeight: 1.05 } },
          title
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', marginTop: 24, fontSize: 30, opacity: 0.95, lineHeight: 1.25 } },
          hint
        )
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        React.createElement('div', { style: { display: 'flex', fontSize: 26, opacity: 0.9 } }, creator),
        React.createElement('div', { style: { display: 'flex', fontSize: 22, opacity: 0.75 } }, 'Phoenix ZerØ')
      )
    );

    return new ImageResponse(el, {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`share-card-png error: ${msg}`, { status: 500 });
  }
}

export async function HEAD(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return new Response(null, { status: 400 });

    const dataUrl = new URL(`/api/share-card-data?id=${encodeURIComponent(id)}`, url.origin);
    const res = await fetch(dataUrl.toString(), { cache: 'no-store' });
    if (!res.ok) return new Response(null, { status: 404 });
    const data = (await res.json().catch(() => null)) as any;
    if (!data?.ok) return new Response(null, { status: 404 });

    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
      }
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
