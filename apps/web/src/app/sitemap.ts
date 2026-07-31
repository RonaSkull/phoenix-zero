import type { MetadataRoute } from 'next';

type Freq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

function entry(path: string, priority: number, changeFrequency: Freq) {
  return {
    url: `https://phoenix-zero.onrender.com${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority
  };
}

// Only routes confirmed HTTP 200 on the deployed instance are listed here,
// so the sitemap never references a 404. /demo is intentionally excluded
// (returns error at runtime); API routes and the /provas alias are excluded
// (/proofs is the canonical). Add new paths only after verifying 200.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    entry('/', 1.0, 'daily'),
    entry('/proofs', 0.9, 'daily'),
    entry('/enterprise-demo', 0.8, 'monthly'),
    entry('/ai-agents', 0.8, 'monthly'),
    entry('/pricing', 0.7, 'monthly'),
    entry('/hardening', 0.7, 'monthly'),
    entry('/faq', 0.6, 'monthly'),
    entry('/for-banking', 0.7, 'monthly'),
    entry('/for-exchanges', 0.7, 'monthly'),
    entry('/for-gaming', 0.7, 'monthly'),
    entry('/for-ai-marketplaces', 0.7, 'monthly')
  ];
}
