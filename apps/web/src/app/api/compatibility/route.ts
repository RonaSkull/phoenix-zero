import { getPublicBaseUrl } from '../../../lib/social-preview';

import { requireTenant } from '../../../lib/tenant-auth';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const runtime = 'nodejs';

function requestBaseFromReq(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  if (!host) return url.origin;
  return `${proto}://${host}`;
}

function getMeta(html: string, attr: 'property' | 'name', key: string): string {
  const re = new RegExp(`${attr}="${key}"\\s+content="([^"]+)"`, 'i');
  const m = re.exec(html);
  return m && m[1] ? m[1] : '';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMetaAll(html: string, attr: 'property' | 'name', key: string): string[] {
  const re = new RegExp(`${attr}="${escapeRegExp(key)}"\\s+content="([^"]+)"`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const v = m[1] ? String(m[1]).trim() : '';
    if (v) out.push(v);
  }
  return Array.from(new Set(out));
}

function isSovereignOperation(operation: string): boolean {
  const op = String(operation || '').trim().toLowerCase();
  if (!op) return false;
  const sovereign = new Set(['reconcile_psp', 'payout_mass', 'audit_bc_compliance']);
  if (sovereign.has(op)) return true;
  if (op.startsWith('reconcile_')) return true;
  if (op.startsWith('settle_')) return true;
  if (op.startsWith('payout_')) return true;
  if (op.startsWith('audit_')) return true;
  return false;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const action = (url.searchParams.get('action') || 'inspect').trim();

    const base = getPublicBaseUrl(requestBaseFromReq(req));

    if (action === 'makeShare') {
      const auth = await requireTenant(req);
      if (!auth.ok) {
        return Response.json(
          { ok: false, reason: auth.reason },
          { status: auth.status, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const assetVersionRaw = (url.searchParams.get('assetVersion') || 'v1').trim();
      const assetVersion = assetVersionRaw === 'v2' ? 'v2' : 'v1';

      const videoUrl =
        (url.searchParams.get('videoUrl') || '').trim() ||
        new URL(`/demo/assets/${assetVersion}/watermarked.mp4`, base).toString();
      const proofUrl =
        (url.searchParams.get('proofUrl') || '').trim() || new URL(`/demo/assets/${assetVersion}/proof.json`, base).toString();

      const fwdApiKey = (req.headers.get('x-api-key') || '').trim();
      const fwdAuth = (req.headers.get('authorization') || '').trim();
      const fwdCookie = (req.headers.get('cookie') || '').trim();

      const shareRes = await fetch(new URL('/api/share-link', base).toString(), {
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

      const shareJson = (await shareRes.json().catch(() => null)) as any;
      if (!shareRes.ok || !shareJson?.ok || typeof shareJson?.id !== 'string') {
        return Response.json(
          { ok: false, reason: 'Failed to create share link', status: shareRes.status, response: shareJson },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      const id = shareJson.id as string;
      const shareUrl = typeof shareJson.shareUrl === 'string' ? shareJson.shareUrl : new URL(`/s/${encodeURIComponent(id)}`, base).toString();
      const ogImageJpg = new URL(`/api/share-card-jpg?id=${encodeURIComponent(id)}`, base).toString();
      const ogImagePng = new URL(`/api/share-card-png?id=${encodeURIComponent(id)}`, base).toString();
      const ogImage = ogImageJpg;

      return Response.json(
        {
          ok: true,
          id,
          shareUrl,
          ogImage,
          ogImageJpg,
          ogImagePng,
          demo: { assetVersion, videoUrl, proofUrl }
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (action === 'inspect') {
      const id = (url.searchParams.get('id') || '').trim();
      const ua = (url.searchParams.get('ua') || '').trim();

      if (!id) return Response.json({ ok: false, reason: 'Missing id' }, { status: 400 });

      const shareUrl = new URL(`/s/${encodeURIComponent(id)}`, base).toString();

      const htmlRes = await fetch(shareUrl, {
        method: 'GET',
        headers: ua ? { 'User-Agent': ua } : undefined,
        cache: 'no-store'
      });

      const html = await htmlRes.text();

      const ogTitle = getMeta(html, 'property', 'og:title');
      const ogDesc = getMeta(html, 'property', 'og:description');
      const ogImages = getMetaAll(html, 'property', 'og:image');
      const ogImage = ogImages[0] || '';
      const twCard = getMeta(html, 'name', 'twitter:card');
      const twImages = getMetaAll(html, 'name', 'twitter:image');
      const twImage = twImages[0] || '';

      const ogImagesHead: Array<{
        url: string;
        status: number | null;
        contentType: string | null;
        cacheControl: string | null;
        contentLength: string | null;
      }> = [];

      for (const imgUrl of ogImages) {
        try {
          const headRes = await fetch(imgUrl, { method: 'HEAD', headers: ua ? { 'User-Agent': ua } : undefined, cache: 'no-store' });
          ogImagesHead.push({
            url: imgUrl,
            status: headRes.status,
            contentType: headRes.headers.get('content-type'),
            cacheControl: headRes.headers.get('cache-control'),
            contentLength: headRes.headers.get('content-length')
          });
        } catch {
          ogImagesHead.push({ url: imgUrl, status: null, contentType: null, cacheControl: null, contentLength: null });
        }
      }

      return Response.json(
        {
          ok: true,
          id,
          shareUrl,
          httpStatus: htmlRes.status,
          tags: {
            ogTitle,
            ogDesc,
            ogImage,
            ogImages,
            twitterCard: twCard,
            twitterImage: twImage,
            twitterImages: twImages
          },
          ogImageHead: ogImagesHead[0] ? { status: ogImagesHead[0].status, contentType: ogImagesHead[0].contentType } : { status: null, contentType: null },
          ogImagesHead
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (action === 'platforms') {
      const fallback = [
        { key: 'whatsapp', name: 'WhatsApp', ua: 'WhatsApp/2.23.0' },
        { key: 'telegram', name: 'Telegram', ua: 'TelegramBot (like TwitterBot)' },
        { key: 'instagram', name: 'Instagram', ua: 'Instagram 155.0.0.37.107' },
        { key: 'linkedin', name: 'LinkedIn', ua: 'LinkedInBot/1.0' },
        { key: 'tiktok', name: 'TikTok', ua: 'TikTok 26.2.1' },
        {
          key: 'youtube',
          name: 'YouTube/Googlebot',
          ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        },
        { key: 'discord', name: 'Discord', ua: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)' },
        { key: 'slack', name: 'Slack', ua: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' },
        { key: 'twitter', name: 'X/Twitter', ua: 'Twitterbot/1.0' },
        { key: 'facebook', name: 'Facebook', ua: 'facebookexternalhit/1.1' }
      ];

      try {
        const fp = resolve(process.cwd(), '..', '..', 'scripts', 'social', 'platforms.json');
        const txt = await readFile(fp, 'utf8');
        const json = JSON.parse(txt) as any;
        const arr = Array.isArray(json?.platforms) ? json.platforms : [];
        const platforms = arr
          .map((p: any) => ({
            key: typeof p?.key === 'string' ? p.key : '',
            name: typeof p?.name === 'string' ? p.name : '',
            ua: typeof p?.ua === 'string' ? p.ua : ''
          }))
          .filter((p: any) => Boolean(p.key && p.ua));

        return Response.json(
          { ok: true, platforms: platforms.length ? platforms : fallback },
          { status: 200, headers: { 'Cache-Control': 'no-store' } }
        );
      } catch {
        return Response.json({ ok: true, platforms: fallback }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
      }
    }

    return Response.json({ ok: false, reason: 'Unknown action' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, reason: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | null
      | {
          operation?: string;
          intent?: string;
          agentType?: string;
          supportsPpo?: boolean;
        };

    const operation = String(body?.operation || '').trim().toLowerCase();
    const intent = String(body?.intent || '').trim().toLowerCase();

    if (!operation) {
      return Response.json(
        { ok: false, compatible: false, reasonCode: 'MISSING_FIELDS', message: 'Missing operation', missingFields: ['operation'] },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (isSovereignOperation(operation)) {
      return Response.json(
        {
          ok: true,
          compatible: false,
          reasonCode: 'CUSTOM_PRICING_REQUIRED',
          message: 'Sovereign operations require an enterprise contract.'
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const supportedOperations = new Set(['protect_video', 'protect_image', 'protect_audio', 'protect_live', 'protect_report']);
    if (!supportedOperations.has(operation)) {
      return Response.json(
        {
          ok: true,
          compatible: false,
          reasonCode: 'UNSUPPORTED_OPERATION',
          message: `Operation '${operation}' is not supported.`,
          suggestions: [{ operation: 'protect_video' }],
          requiredCapabilities: ['ppo-gated-execution', 'replay-safe']
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (intent && intent.includes('live') && operation !== 'protect_live') {
      return Response.json(
        {
          ok: true,
          compatible: false,
          reasonCode: 'UNSUPPORTED_INTENT',
          message: `Intent '${intent}' is not supported for '${operation}'.`,
          suggestions: [{ operation: 'protect_live', intent }],
          requiredCapabilities: ['ppo-gated-execution', 'replay-safe']
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return Response.json(
      {
        ok: true,
        compatible: true,
        operation,
        intent: intent || undefined,
        agentPolicy: {
          requiresProofOfPayment: true,
          executionWithoutPPO: 'deny'
        }
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, compatible: false, reasonCode: 'INTERNAL', message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
