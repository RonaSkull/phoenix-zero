import { NextResponse, type NextRequest } from 'next/server';

import { computeAgentScoreFromHeaders, isAgentScore } from './lib/agent-fingerprint';

function b64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] as number);
  const b64 = btoa(s);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function newFp(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `fp_${b64Url(bytes)}`;
}

export function middleware(req: NextRequest) {
  const sovereignMode = String(process.env.SOVEREIGN_MODE || '').trim().toLowerCase() === 'true';
  if (sovereignMode) {
    const path = req.nextUrl.pathname || '/';
    const blockedPrefixes = [
      '/api/phoenix-zero',
      '/api/global-',
      '/phoenix-zero-',
      '/global',
      '/ppe',
      '/demo',
      '/pricing',
      '/tools',
      '/agent-playground.html',
      '/playground.html'
    ];

    const isBlocked = blockedPrefixes.some((p) => {
      if (path === p) return true;
      if (p.endsWith('-')) return path.startsWith(p);
      return path.startsWith(`${p}/`);
    });

    if (isBlocked) {
      return new NextResponse(null, { status: 404 });
    }
  }

  const existing = req.cookies.get('pz_fp')?.value || '';
  const fp = existing || newFp();

  const agentScore = computeAgentScoreFromHeaders(req.headers);
  const isAgent = isAgentScore(agentScore);

  const proto = (req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '') || '').trim().toLowerCase();
  const secureCookie = proto === 'https';

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pz-fp', fp);
  requestHeaders.set('x-pz-agent-score', String(agentScore));
  requestHeaders.set('x-pz-agent', isAgent ? '1' : '0');

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  if (!existing) {
    res.cookies.set({
      name: 'pz_fp',
      value: fp,
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      path: '/',
      maxAge: 60 * 60 * 24 * 365
    });
  }

  return res;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/agent-playground.html',
    '/playground.html',
    '/phoenix-zero-:path*',
    '/ppe/:path*',
    '/pricing/:path*',
    '/global/:path*',
    '/demo/:path*',
    '/tools/:path*'
  ]
};
