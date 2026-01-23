import sharp from 'sharp';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800'
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    if (!id) return new Response('Missing id', { status: 400 });

    const svgUrl = new URL(`/api/share-card?id=${encodeURIComponent(id)}`, url.origin);
    const svgRes = await fetch(svgUrl.toString(), { cache: 'no-store' });
    if (!svgRes.ok) return new Response('Not found', { status: 404 });

    const svg = await svgRes.text();
    const jpg = await sharp(Buffer.from(svg), { density: 300 })
      .jpeg({ quality: 85, progressive: false, chromaSubsampling: '4:4:4' })
      .toBuffer();

    const body = new ArrayBuffer(jpg.byteLength);
    new Uint8Array(body).set(jpg);

    return new Response(body, {
      status: 200,
      headers: {
        ...CACHE_HEADERS,
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpg.byteLength)
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`share-card-jpg error: ${msg}`, { status: 500 });
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
        ...CACHE_HEADERS,
        'Content-Type': 'image/jpeg'
      }
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
