import { expect, test } from '@playwright/test';

let cachedPublicSessionId: string | null = null;
let cachedTenantApiKey: string | null = null;

let cachedPublicTenantCheck:
  | { ok: true }
  | { ok: false; status: number; reason: string; raw: string }
  | null = null;

async function readJsonResponse(res: any): Promise<{ raw: string; json: any | null }> {
  const raw = await res.text();
  try {
    return { raw, json: raw ? JSON.parse(raw) : null };
  } catch {
    return { raw, json: null };
  }
}

async function ensurePublicTenantReadyOrSkip(request: any): Promise<void> {
  if (cachedPublicTenantCheck?.ok === true) return;
  if (cachedPublicTenantCheck?.ok === false) {
    if (
      cachedPublicTenantCheck.status === 500 &&
      /public tenant is not configured/i.test(cachedPublicTenantCheck.reason || cachedPublicTenantCheck.raw)
    ) {
      test.skip(true, cachedPublicTenantCheck.reason || cachedPublicTenantCheck.raw || 'Public tenant is not configured');
    }
    throw new Error(
      `Public tenant probe failed: HTTP ${cachedPublicTenantCheck.status}: ${cachedPublicTenantCheck.reason || cachedPublicTenantCheck.raw}`
    );
  }

  const probe = await request.post('/api/observe/start');
  if (probe.ok()) {
    cachedPublicTenantCheck = { ok: true };
    return;
  }

  const parsed = await readJsonResponse(probe);
  const reason = String(parsed.json?.reason || '').trim();
  cachedPublicTenantCheck = { ok: false, status: probe.status(), reason, raw: parsed.raw };

  if (probe.status() === 500 && /public tenant is not configured/i.test(reason || parsed.raw)) {
    test.skip(true, reason || parsed.raw || 'Public tenant is not configured');
  }

  throw new Error(`Public tenant probe failed: HTTP ${probe.status()}: ${reason || parsed.raw}`);
}

async function getTestApiKey(request: any): Promise<string> {
  if (cachedTenantApiKey) return cachedTenantApiKey;

  const predefined = (process.env.PHOENIX_ZERO_TEST_API_KEY || '').trim();
  if (predefined) {
    cachedTenantApiKey = predefined;
    return cachedTenantApiKey;
  }

  const adminToken = process.env.PHOENIX_ZERO_ADMIN_TOKEN || '';
  const res = await request.post('/api/admin/tenants', {
    headers: adminToken ? { 'x-admin-token': adminToken } : undefined,
    data: { name: `pw-pricing-${Date.now()}` }
  });

  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as any;
  expect(json && json.ok === true).toBeTruthy();
  expect(typeof json.apiKey).toBe('string');
  cachedTenantApiKey = String(json.apiKey);
  return cachedTenantApiKey;
}

async function startPublicObservationSession(request: any): Promise<string> {
  if (cachedPublicSessionId) return cachedPublicSessionId;

  await ensurePublicTenantReadyOrSkip(request);

  const res = await request.post('/api/observe/start');
  expect(res.ok()).toBeTruthy();
  const json = (await res.json()) as any;
  expect(json && json.ok === true).toBeTruthy();
  const sid = String(json?.state?.sessionId || '').trim();
  expect(sid).toMatch(/^obs_/);
  cachedPublicSessionId = sid;
  return sid;
}

async function waitUntilClassified(request: any, sessionId: string, timeoutMs = 8000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request.get(`/api/observe/state?sessionId=${encodeURIComponent(sessionId)}`);
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as any;
    const state = json?.state;
    if (state?.state === 'CLASSIFIED') return state;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for CLASSIFIED observation state');
}

test.describe('pricing anti-bypass', () => {
  test('public pricing preview requires sessionId', async ({ request }) => {
    await ensurePublicTenantReadyOrSkip(request);
    const res = await request.post('/api/pricing/preview', {
      data: {
        product: 'video_protection',
        exposure: 'public',
        persistence: 'short',
        authenticityLevel: 'social',
        units: 1
      }
    });

    expect(res.status()).toBe(400);
    const json = (await res.json()) as any;
    expect(json && json.ok === false).toBeTruthy();
    expect(String(json.reason || '')).toMatch(/sessionId/i);
  });

  test('public preview blocks OBSERVING and allows CLASSIFIED sessionId', async ({ request }) => {
    await ensurePublicTenantReadyOrSkip(request);
    const sid = await startPublicObservationSession(request);

    const early = await request.post('/api/pricing/preview', {
      data: {
        product: 'video_protection',
        exposure: 'public',
        persistence: 'short',
        authenticityLevel: 'social',
        units: 1,
        sessionId: sid
      }
    });
    if (early.status() === 409) {
      const earlyJson = (await early.json()) as any;
      expect(earlyJson && earlyJson.ok === false).toBeTruthy();
    } else {
      expect([200, 409]).toContain(early.status());
    }

    await waitUntilClassified(request, sid);

    const okRes = await request.post('/api/pricing/preview', {
      data: {
        product: 'video_protection',
        exposure: 'public',
        persistence: 'short',
        authenticityLevel: 'social',
        units: 1,
        sessionId: sid
      }
    });

    expect(okRes.ok()).toBeTruthy();
    const okJson = (await okRes.json()) as any;
    expect(okJson && okJson.ok === true).toBeTruthy();
    expect(typeof okJson.finalPriceCents).toBe('number');
  });

  test('public preview debug includes guaranteeWindow breakdown', async ({ request }) => {
    await ensurePublicTenantReadyOrSkip(request);
    const sid = await startPublicObservationSession(request);
    await waitUntilClassified(request, sid);

    const res = await request.post('/api/pricing/preview?debug=1', {
      data: {
        product: 'video_protection',
        exposure: 'public',
        persistence: 'short',
        authenticityLevel: 'social',
        units: 1,
        guaranteeWindow: 'qa_v42_1',
        durationSeconds: 12,
        sessionId: sid
      }
    });

    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as any;
    expect(json && json.ok === true).toBeTruthy();
    expect(json.debug).toBeTruthy();
    expect(String(json.debug?.multiplierKeys?.guaranteeKey || '')).toBe('qa_v42_1');
    expect(typeof json.debug?.multipliers?.guaranteeWindow).toBe('number');
  });

  test('pricing/protect without sessionId redirects to /pricing/observe', async ({ page }) => {
    await page.goto('/pricing/protect', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/pricing\/observe/);
  });

  test('HYBRID enforces forensic authenticityLevel (no downgrade)', async ({ request }) => {
    const apiKey = await getTestApiKey(request);

    const res = await request.post('/api/pricing/preview?debug=1', {
      headers: { 'x-api-key': apiKey },
      data: {
        product: 'video_protection',
        exposure: 'public',
        persistence: 'short',
        authenticityLevel: 'social',
        units: 1,
        sourceVector: 'HYBRID'
      }
    });

    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as any;
    expect(json && json.ok === true).toBeTruthy();
    expect(String(json?.scope?.authenticityLevel || '')).toBe('forensic');
  });
});
