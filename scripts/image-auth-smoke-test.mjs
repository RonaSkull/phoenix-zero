async function fetchText(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text };
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

let cachedApiKey = null;

async function getTestApiKey(base) {
  if (cachedApiKey) return cachedApiKey;
  const predefined = (process.env.PHOENIX_ZERO_TEST_API_KEY || '').trim();
  if (predefined) {
    cachedApiKey = predefined;
    return cachedApiKey;
  }
  const adminToken = process.env.PHOENIX_ZERO_ADMIN_TOKEN || '';
  const res = await fetch(new URL('/api/admin/tenants', base).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { 'x-admin-token': adminToken } : {})
    },
    body: JSON.stringify({ name: `image-smoke-${Date.now()}` })
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`admin/tenants failed: HTTP ${res.status} ${text}`);
  const json = JSON.parse(text);
  if (!json || json.ok !== true || !json.apiKey) throw new Error('admin/tenants missing apiKey');
  cachedApiKey = String(json.apiKey);
  return cachedApiKey;
}

async function main() {
  const base = process.env.BASE_URL || 'http://localhost:3000';
  console.log('Base:', base);

  const apiKey = await getTestApiKey(base);
  console.log('TenantApiKey: OK');

  const imageUrl = new URL('/demo/assets/v1/image.png', base).toString();
  const proofUrl = new URL('/demo/assets/v1/image-proof.json', base).toString();

  console.log('imageUrl:', imageUrl);
  console.log('proofUrl:', proofUrl);

  {
    const { res } = await fetchText(imageUrl, { method: 'GET' });
    expect(res.ok, `image.png GET failed: HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    expect(ct.includes('image/png'), `image.png content-type unexpected: ${ct}`);
  }

  {
    const { res, text } = await fetchText(proofUrl, { method: 'GET' });
    expect(res.ok, `image-proof.json GET failed: HTTP ${res.status}`);
    const json = JSON.parse(text);
    expect(json && json.signatureB64Url, 'proof missing signatureB64Url');
  }

  {
    const api = new URL('/api/phoenix-zero/verify-image-by-url', base).toString();
    const { res, text } = await fetchText(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ imageUrl, proofUrl })
    });
    console.log('verify-image-by-url:', res.status, text.slice(0, 240));
    expect(res.ok, `verify-image-by-url failed: HTTP ${res.status}`);
    const json = JSON.parse(text);
    expect(json.ok === true, 'verify-image-by-url returned ok=false');
  }

  {
    const url = new URL('/api/global-image-auth', base);
    url.searchParams.set('imageUrl', imageUrl);
    url.searchParams.set('proofUrl', proofUrl);

    const { res, text } = await fetchText(url.toString(), { method: 'GET', headers: { 'x-api-key': apiKey } });
    console.log('global-image-auth:', res.status, text.slice(0, 240));
    expect(res.ok, `global-image-auth failed: HTTP ${res.status}`);
    const json = JSON.parse(text);
    expect(json.ok === true, 'global-image-auth response ok=false');
    expect(typeof json.title === 'string', 'global-image-auth missing title');
  }

  {
    const api = new URL('/api/phoenix-zero/stamp-image', base).toString();

    const imgRes = await fetch(imageUrl);
    expect(imgRes.ok, `failed to download demo image for stamping: HTTP ${imgRes.status}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    const form = new FormData();
    form.set('image', new Blob([imgBuf], { type: 'image/png' }), 'image.png');
    form.set('creatorId', 'demo');

    const { res, text } = await fetchText(api, { method: 'POST', headers: { 'x-api-key': apiKey }, body: form });
    console.log('stamp-image:', res.status, text.slice(0, 240));
    expect(res.ok, `stamp-image failed: HTTP ${res.status}`);
    const json = JSON.parse(text);
    expect(json.ok === true, 'stamp-image returned ok=false');
    expect(json.proof && json.proof.signatureB64Url, 'stamp-image missing proof.signatureB64Url');
  }

  console.log('OK: image auth smoke test passed.');
}

main().catch((e) => {
  console.error('Smoke test failed:', e);
  process.exitCode = 1;
});
