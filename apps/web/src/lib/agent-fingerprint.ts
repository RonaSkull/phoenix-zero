export type KycStatus = 'none' | 'light' | 'full';

export type AgentFingerprint = {
  fp: string | null;
  agentScore: number;
  isAgent: boolean;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normHeader(h: Headers, name: string): string {
  return String(h.get(name) || '').trim();
}

export function computeAgentScoreFromHeaders(headers: Headers): number {
  let score = 0;

  const ua = normHeader(headers, 'user-agent');
  const accept = normHeader(headers, 'accept');
  const al = normHeader(headers, 'accept-language');
  const sfm = normHeader(headers, 'sec-fetch-mode');
  const sfs = normHeader(headers, 'sec-fetch-site');
  const sfu = normHeader(headers, 'sec-fetch-user');

  if (!ua) score += 25;

  const uaLower = ua.toLowerCase();
  if (uaLower.includes('curl') || uaLower.includes('wget')) score += 45;
  else if (uaLower.includes('python') || uaLower.includes('aiohttp')) score += 35;
  else if (uaLower.includes('node') || uaLower.includes('undici') || uaLower.includes('node-fetch')) score += 30;
  else if (uaLower.includes('axios') || uaLower.includes('postman') || uaLower.includes('insomnia')) score += 25;

  const looksBrowser = uaLower.includes('mozilla/') || uaLower.includes('chrome/') || uaLower.includes('safari/') || uaLower.includes('firefox/');
  if (looksBrowser) score -= 10;

  if (!accept) score += 10;
  if (!al) score += 12;

  if (!sfm && !sfs && !sfu) score += 18;

  const hasApiKey = Boolean(normHeader(headers, 'x-api-key')) || normHeader(headers, 'authorization').toLowerCase().startsWith('bearer ');
  if (hasApiKey) score += 8;

  return clampInt(score, 0, 100);
}

export function isAgentScore(score: number): boolean {
  return clampInt(score, 0, 100) >= 70;
}

export function parseCookie(cookieHeader: string, key: string): string | null {
  const raw = String(cookieHeader || '').trim();
  if (!raw) return null;
  const parts = raw.split(';');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === key) {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return null;
}

export function fingerprintFromRequest(req: Request): AgentFingerprint {
  const h = req.headers;
  const fpHeader = String(h.get('x-pz-fp') || '').trim();
  const fpCookie = parseCookie(String(h.get('cookie') || ''), 'pz_fp');
  const fp = fpHeader || fpCookie || null;

  const scoreHeader = String(h.get('x-pz-agent-score') || '').trim();
  const parsedScore = Number(scoreHeader);
  const score = Number.isFinite(parsedScore) ? clampInt(parsedScore, 0, 100) : computeAgentScoreFromHeaders(h);

  const isAgentHeader = String(h.get('x-pz-agent') || '').trim().toLowerCase();
  const isAgent = isAgentHeader === '1' || isAgentHeader === 'true' || isAgentHeader === 'yes' || isAgentScore(score);

  return { fp, agentScore: score, isAgent };
}

export function computeClientRiskScore(params: {
  agentScore: number;
  kycStatus: KycStatus;
  company?: string;
  country?: string;
  walletAddress?: string;
}): number {
  let score = clampInt(params.agentScore, 0, 100);

  const company = String(params.company || '').trim();
  const country = String(params.country || '').trim();
  const wallet = String(params.walletAddress || '').trim();

  if (params.kycStatus === 'none') score += 12;
  if (!company) score += 10;
  if (!country || country.toLowerCase() === 'unknown') score += 6;
  if (!wallet) score += 12;

  return clampInt(score, 0, 100);
}
