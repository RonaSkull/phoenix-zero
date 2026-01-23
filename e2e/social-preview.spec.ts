import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type PlatformsFile = { platforms?: Array<{ key?: string; name?: string; ua?: string }> };

function getMetaAll(html: string, attr: 'property' | 'name', key: string): string[] {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const out: string[] = [];

  const re1 = new RegExp(
    `<meta\\s+[^>]*${attr}\\s*=\\s*(['"])${esc}\\1[^>]*content\\s*=\\s*(['"])([^'"]+)\\2[^>]*>`,
    'gi'
  );
  const re2 = new RegExp(
    `<meta\\s+[^>]*content\\s*=\\s*(['"])([^'"]+)\\1[^>]*${attr}\\s*=\\s*(['"])${esc}\\3[^>]*>`,
    'gi'
  );

  let m: RegExpExecArray | null;
  while ((m = re1.exec(html))) {
    if (m[3]) out.push(m[3]);
  }
  while ((m = re2.exec(html))) {
    if (m[2]) out.push(m[2]);
  }

  return out;
}

function getMetaFirst(html: string, attr: 'property' | 'name', key: string): string {
  const all = getMetaAll(html, attr, key);
  return all[0] || '';
}

let cachedApiKey: string | null = null;

async function getTestApiKey(request: any): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const predefined = (process.env.PHOENIX_ZERO_TEST_API_KEY || '').trim();
  if (predefined) {
    cachedApiKey = predefined;
    return cachedApiKey;
  }

  const adminToken = process.env.PHOENIX_ZERO_ADMIN_TOKEN || '';
  const res = await request.post('/api/admin/tenants', {
    headers: adminToken ? { 'x-admin-token': adminToken } : undefined,
    data: { name: `pw-e2e-${Date.now()}` }
  });

  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as any;
  expect(json && json.ok === true).toBeTruthy();
  expect(typeof json.apiKey).toBe('string');
  cachedApiKey = String(json.apiKey);
  return cachedApiKey;
}

test('share link page exposes og tags for multiple social user agents', async ({ request, baseURL }) => {
  const base = baseURL || 'http://localhost:3000';

  const videoUrl = new URL('/demo/assets/v1/watermarked.mp4', base).toString();
  const proofUrl = new URL('/demo/assets/v1/proof.json', base).toString();

  const apiKey = await getTestApiKey(request);

  const shareRes = await request.post('/api/share-link', {
    headers: { 'x-api-key': apiKey },
    data: { videoUrl, proofUrl }
  });

  expect(shareRes.ok()).toBeTruthy();
  const shareJson = (await shareRes.json()) as { shareUrl?: string };
  const shareUrl = shareJson.shareUrl || '';
  expect(shareUrl).toMatch(/^https?:\/\//);

  const platformsPath = resolve(process.cwd(), 'scripts', 'social', 'platforms.json');
  const platformsRaw = await readFile(platformsPath, 'utf8');
  const platforms = (JSON.parse(platformsRaw) as PlatformsFile).platforms || [];
  const important = new Set([
    'whatsapp',
    'instagram',
    'tiktok',
    'youtube',
    'linkedin',
    'twitter',
    'discord',
    'slack',
    'telegram',
    'facebook'
  ]);

  const selected = platforms.filter((p) => p.ua && p.name && (!p.key || important.has(String(p.key))));

  for (const p of selected) {
    const htmlRes = await request.get(shareUrl, {
      headers: { 'User-Agent': String(p.ua) }
    });

    expect(htmlRes.ok()).toBeTruthy();
    const html = await htmlRes.text();

    const ogTitle = getMetaFirst(html, 'property', 'og:title');
    const ogImages = getMetaAll(html, 'property', 'og:image');

    expect(ogTitle.length).toBeGreaterThan(0);
    expect(ogImages.length).toBeGreaterThan(0);

    const hasPng = ogImages.some((u) => u.includes('share-card-png'));
    const hasJpg = ogImages.some((u) => u.includes('share-card-jpg'));

    expect(hasPng || hasJpg).toBeTruthy();

    for (const imgUrl of ogImages.slice(0, 2)) {
      const head = await request.head(imgUrl, { headers: { 'User-Agent': String(p.ua) } });
      expect(head.ok()).toBeTruthy();
      const ctype = head.headers()['content-type'] || '';
      expect(ctype).toMatch(/^image\/(png|jpeg)/);
    }
  }
});
