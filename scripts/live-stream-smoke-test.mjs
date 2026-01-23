import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function baseUrl() {
  const raw = process.env.LIVE_STREAM_BASE_URL ?? 'http://localhost:3000';
  return raw.replace(/\/$/, '');
}

let apiKey = '';

async function getTestApiKey(base) {
  if (apiKey) return apiKey;
  const predefined = (process.env.PHOENIX_ZERO_TEST_API_KEY || '').trim();
  if (predefined) {
    apiKey = predefined;
    return apiKey;
  }
  const adminToken = process.env.PHOENIX_ZERO_ADMIN_TOKEN || '';
  const res = await fetch(new URL('/api/admin/tenants', base).toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { 'x-admin-token': adminToken } : {})
    },
    body: JSON.stringify({ name: `live-smoke-${Date.now()}` })
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`admin/tenants failed: HTTP ${res.status} ${text}`);
  const json = JSON.parse(text);
  if (!json || json.ok !== true || !json.apiKey) throw new Error('admin/tenants missing apiKey');
  apiKey = String(json.apiKey);
  return apiKey;
}

async function fetchText(url, init, opts) {
  const retries = Number.isFinite(opts?.retries) ? Math.max(0, Math.floor(opts.retries)) : 0;
  const retryDelayMs = Number.isFinite(opts?.retryDelayMs) ? Math.max(0, Math.floor(opts.retryDelayMs)) : 250;

  let attempt = 0;
  while (true) {
    const t0 = Date.now();
    try {
      const headers = new Headers((init && init.headers) || undefined);
      headers.set('Connection', 'close');
      if (apiKey) headers.set('x-api-key', apiKey);
      const res = await fetch(url, { ...(init || {}), headers });
      const text = await res.text().catch(() => '');
      return { res, text, ms: Date.now() - t0, attempt };
    } catch (e) {
      const ms = Date.now() - t0;
      const cause = e && typeof e === 'object' && 'cause' in e ? e.cause : undefined;
      const causeMsg = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(
        `fetch error attempt=${attempt} ms=${ms} url=${url} msg=${msg}${causeMsg ? ` cause=${causeMsg}` : ''}\n`
      );

      if (attempt >= retries) throw e;
      attempt++;
      await sleep(retryDelayMs * attempt);
    }
  }
}

async function main() {
  const api = `${baseUrl()}/api/live-stream`;

  await getTestApiKey(baseUrl());
  process.stdout.write('TenantApiKey=OK\n');
  const segmentPath = process.argv[2] ? resolve(process.argv[2]) : resolve('out/video3s.mp4');
  const segmentMime =
    process.env.LIVE_STREAM_SEGMENT_MIME ??
    (segmentPath.toLowerCase().endsWith('.webm') ? 'video/webm' : segmentPath.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream');
  const segmentSeconds = process.env.LIVE_STREAM_SEGMENT_SECONDS ? Number(process.env.LIVE_STREAM_SEGMENT_SECONDS) : 3;
  const segments = process.env.LIVE_STREAM_SEGMENTS ? Number(process.env.LIVE_STREAM_SEGMENTS) : 3;
  const appendGapMs = process.env.LIVE_STREAM_APPEND_GAP_MS ? Number(process.env.LIVE_STREAM_APPEND_GAP_MS) : 250;
  const pollMax = process.env.LIVE_STREAM_POLL_MAX ? Number(process.env.LIVE_STREAM_POLL_MAX) : 90;

  if (!existsSync(segmentPath)) {
    throw new Error(`Segment file not found: ${segmentPath}`);
  }

  const bytes = await readFile(segmentPath);

  const start = await fetchText(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'start-webcam',
      mode: 'compat',
      policy: 'sig+(wm|temporal)',
      segmentSeconds: segmentSeconds
    })
  }, { retries: 2, retryDelayMs: 500 });

  if (!start.res.ok) {
    throw new Error(`start-webcam failed: HTTP ${start.res.status} ${start.text}`);
  }

  const startJson = JSON.parse(start.text);
  const jobId = startJson.jobId;
  const ingestToken = startJson.ingestToken;
  if (!jobId) {
    throw new Error(`Missing jobId in response: ${start.text}`);
  }

  if (!ingestToken) {
    throw new Error(`Missing ingestToken in response: ${start.text}`);
  }

  process.stdout.write(`jobId=${jobId}\n`);

  let appendMaxMs = 0;
  let appendTotalMs = 0;

  const segmentMs = Number.isFinite(segmentSeconds ?? NaN) ? Math.max(1, Math.floor(segmentSeconds * 1000)) : 3000;
  const t0 = Date.now();

  for (let idx = 0; idx < segments; idx++) {
    const pad = String(idx).padStart(4, '0');
    const form = new FormData();
    form.set('action', 'append');
    form.set('jobId', jobId);
    form.set('index', String(idx));
    form.set('ingestToken', ingestToken);
    const startedAtMs = t0 + idx * segmentMs;
    const stoppedAtMs = startedAtMs + segmentMs;
    form.set('clientCaptureStartedAt', new Date(startedAtMs).toISOString());
    form.set('clientCaptureStoppedAt', new Date(stoppedAtMs).toISOString());
    form.set('clientUserAgent', 'smoke-test');

    // entropy helps Q-STEP scoring and chain hardening
    try {
      form.set('clientEntropyB64Url', randomBytes(12).toString('base64url'));
      form.set('clientEntropyFrames', '90');
    } catch {
    }

    const blob = new Blob([bytes], { type: segmentMime });
    const ext = segmentPath.toLowerCase().endsWith('.mp4') || segmentMime.includes('mp4') ? 'mp4' : 'webm';
    form.append('segment', blob, `segment-${pad}.${ext}`);

    const r = await fetchText(api, { method: 'POST', body: form }, { retries: 2, retryDelayMs: 500 });
    appendMaxMs = Math.max(appendMaxMs, r.ms);
    appendTotalMs += r.ms;
    process.stdout.write(`append idx=${idx} http=${r.res.status} ms=${r.ms}\n`);
    if (!r.res.ok) {
      throw new Error(`append failed idx=${idx}: HTTP ${r.res.status} ${r.text}`);
    }

    // best-effort telemetry update
    void fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'segment-telemetry',
        jobId,
        ingestToken,
        index: idx,
        clientUploadMs: r.ms,
        clientUserAgent: 'smoke-test'
      })
    }).catch(() => {});

    if (appendGapMs > 0) await sleep(appendGapMs);
  }

  const appendAvgMs = segments > 0 ? Math.round(appendTotalMs / segments) : 0;
  process.stdout.write(`appendAvgMs=${appendAvgMs} appendMaxMs=${appendMaxMs}\n`);

  await sleep(1000);

  const fin = await fetchText(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'finish', jobId, ingestToken })
  }, { retries: 5, retryDelayMs: 750 });
  process.stdout.write(`finish http=${fin.res.status} ms=${fin.ms} body=${fin.text.slice(0, 200)}\n`);
  if (!fin.res.ok) {
    throw new Error(`finish failed: HTTP ${fin.res.status} ${fin.text}`);
  }

  let lastStatus = 'unknown';
  let maxPollMs = 0;

  for (let i = 0; i < pollMax; i++) {
    const poll = await fetchText(`${api}?jobId=${encodeURIComponent(jobId)}&tail=6`, { method: 'GET' }, { retries: 5, retryDelayMs: 500 });
    maxPollMs = Math.max(maxPollMs, poll.ms);

    if (!poll.res.ok) {
      process.stdout.write(`poll ${i} http=${poll.res.status} ms=${poll.ms} body=${poll.text.slice(0, 200)}\n`);
      await sleep(1000);
      continue;
    }

    const json = JSON.parse(poll.text);
    lastStatus = json?.job?.status ?? 'unknown';
    const segCount = json?.job?.segmentCount ?? json?.job?.segments?.length ?? 0;
    process.stdout.write(`poll ${i} status=${lastStatus} ms=${poll.ms} segCount=${segCount}\n`);

    if (lastStatus === 'done' || lastStatus === 'error') break;
    await sleep(1000);
  }

  process.stdout.write(`pollMaxMs=${maxPollMs}\n`);

  const full = await fetchText(`${api}?jobId=${encodeURIComponent(jobId)}&full=1`, { method: 'GET' }, { retries: 5, retryDelayMs: 500 });
  process.stdout.write(`full http=${full.res.status} ms=${full.ms} bytes=${full.text.length}\n`);
  if (!full.res.ok) {
    throw new Error(`full failed: HTTP ${full.res.status} ${full.text}`);
  }

  const fullJson = JSON.parse(full.text);
  const fullJob = fullJson?.job;
  const segs = Array.isArray(fullJob?.segments) ? fullJob.segments : [];
  const okCount = segs.filter((s) => s?.verify?.ok === true).length;
  const failCount = segs.filter((s) => s?.verify?.ok === false || s?.error).length;

  process.stdout.write(`finalStatus=${fullJob?.status ?? 'unknown'} segments=${segs.length} ok=${okCount} fail=${failCount}\n`);
}

main().catch((e) => {
  const msg = e instanceof Error ? e.stack || e.message : String(e);
  process.stderr.write(msg + '\n');
  process.exit(1);
});
