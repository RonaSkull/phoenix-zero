export type SocialPlatform =
  | 'whatsapp'
  | 'telegram'
  | 'instagram'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'discord'
  | 'slack'
  | 'twitter'
  | 'facebook'
  | 'generic';

export function getPublicBaseUrl(requestBase: string): string {
  const envBase = (process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || '').trim();
  return envBase || requestBase;
}

export function detectSocialPlatform(userAgent: string): SocialPlatform {
  const ua = userAgent || '';

  if (/WhatsApp/i.test(ua)) return 'whatsapp';
  if (/TelegramBot|Telegram/i.test(ua)) return 'telegram';
  if (/LinkedInBot/i.test(ua)) return 'linkedin';
  if (/Discordbot/i.test(ua)) return 'discord';
  if (/Slackbot/i.test(ua)) return 'slack';
  if (/Twitterbot/i.test(ua)) return 'twitter';
  if (/facebookexternalhit|Facebot/i.test(ua)) return 'facebook';

  if (/Instagram/i.test(ua)) return 'instagram';
  if (/TikTok/i.test(ua)) return 'tiktok';
  if (/Googlebot|AdsBot-Google|Mediapartners-Google/i.test(ua)) return 'youtube';

  return 'generic';
}

export function isPreviewUserAgent(userAgent: string): boolean {
  const p = detectSocialPlatform(userAgent);
  if (p !== 'generic') return true;
  return /bot|crawler|spider|preview|embed/i.test(userAgent || '');
}

export function previewCacheControl(kind: 'html' | 'image' | 'data'): string {
  if (kind === 'image') {
    return 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';
  }
  if (kind === 'html') {
    return 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';
  }
  return 'no-store';
}
