import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { base64UrlToBytes, bytesToBase64Url, ed25519KeyPairFromPrivateKey, sha256B64Url } from '@phoenix-zero/core';
import {
  createHybridSignature,
  embedInvisibleWatermark,
  extractTemporalFingerprintFromVideoPath,
  generateSphincsKeyPair,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  type PhoenixZeroHybridMode
} from '@phoenix-zero/core/node';

import { createLiveSessionProof } from '../../../../../../live/authenticator';
import { LiveBroadcaster } from '../../../../../../live/broadcaster';
import { LiveVerifier } from '../../../../../../live/verifier';
import type {
  PhoenixZeroLiveSegmentPayload,
  PhoenixZeroLiveSegmentProof,
  PhoenixZeroLiveSegmentVerifyResult,
  PhoenixZeroLiveSessionProof,
  PhoenixZeroLiveVerifyPolicy
} from '../../../../../../live/protocols/realtime';

import { getOrCreateBillingAccount, isBillingAccountActive } from '../../../lib/billing-accounts';
import { requireTenant } from '../../../lib/tenant-auth';
import { recordUsage, type UsageOp } from '../../../lib/usage-ledger';

export const runtime = 'nodejs';

type JobStatus = 'running' | 'done' | 'error';

type JobSegment = {
  index: number;
  videoFile: string;
  proofFile: string;
  verify?: PhoenixZeroLiveSegmentVerifyResult;
  error?: string;
  qstepSegmentHashB64Url?: string;
  qstepChainHashB64Url?: string;
  qstepDurationMs?: number;
  qstepGapMs?: number;
  qstepScore?: number;
  clientEntropyB64Url?: string;
  clientEntropyFrames?: number;
  clientCaptureStartedAt?: string;
  clientCaptureStoppedAt?: string;
  clientUploadMs?: number;
  clientUserAgent?: string;
  serverReceivedAt?: string;
  serverProcessedAt?: string;
  serverProcessingMs?: number;
};

type JobState = {
  tenantId: string;
  jobId: string;
  createdAt: string;
  status: JobStatus;
  policy: PhoenixZeroLiveVerifyPolicy;
  sessionProof: PhoenixZeroLiveSessionProof;
  segments: JobSegment[];
  error?: string;
  finishRequestedAt?: string;
  qstepSeed: string;
  qstepCount?: number;
  qstepScore?: number;
  qstepStatus?: 'valid' | 'degraded' | 'invalid';
  qstepLastHashB64Url?: string;
  usage?: {
    ingestRequests?: number;
    ingestSegments?: number;
    ingestBytes?: number;
    telemetryRequests?: number;
    finishRequests?: number;
    cancelRequests?: number;
    totalClientUploadMs?: number;
    firstServerReceivedAt?: string;
    lastServerReceivedAt?: string;
    costUnits?: number;
  };
};

type SigningKeys = {
  privateKeyB64Url: string;
  pqPrivateKeyB64Url?: string;
  pqPublicKeyB64Url?: string;
};

type JobSecrets = SigningKeys & {
  ingestTokenB64Url: string;
};

const jobs = new Map<string, JobState>();
const secrets = new Map<string, JobSecrets>();
const ingestQueues = new Map<string, Promise<void>>();

function safeEqualString(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff && xff.trim()) return xff.split(',')[0]?.trim() || 'unknown';
  const xrip = req.headers.get('x-real-ip');
  if (xrip && xrip.trim()) return xrip.trim();
  return 'unknown';
}

function getEnvInt(name: string, fallback: number): number {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function shouldPersistJobSecrets(): boolean {
  const raw = (process.env.PHOENIX_ZERO_LIVE_STREAM_PERSIST_SECRETS || '').trim();
  if (raw === '1') return true;
  if (raw === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

const ALLOW_LIVE_STREAM_LEGACY_DIR =
  process.env.PHOENIX_ZERO_LIVE_STREAM_ALLOW_LEGACY_DIR === '1' || process.env.NODE_ENV !== 'production';

const MAX_START_VIDEO_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_LIVE_STREAM_MAX_START_VIDEO_BYTES', 50 * 1024 * 1024));
const MAX_SEGMENT_BYTES = Math.max(1, getEnvInt('PHOENIX_ZERO_LIVE_STREAM_MAX_SEGMENT_BYTES', 25 * 1024 * 1024));

type RateWindow = { startMs: number; count: number };
const rateWindows = new Map<string, RateWindow>();

function rateHit(params: { key: string; limit: number; windowMs: number }): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const existing = rateWindows.get(params.key);
  const startMs = existing?.startMs ?? now;
  const count = existing?.count ?? 0;
  const elapsed = now - startMs;
  if (elapsed >= params.windowMs) {
    rateWindows.set(params.key, { startMs: now, count: 1 });
    return { ok: true };
  }
  if (count >= params.limit) {
    const retryAfterMs = Math.max(0, params.windowMs - elapsed);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  rateWindows.set(params.key, { startMs, count: count + 1 });
  return { ok: true };
}

function rateLimitedResponse(retryAfterSec: number): Response {
  return Response.json(
    { ok: false, reason: 'Rate limited' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSec)
      }
    }
  );
}

function ensureUsage(job: JobState): NonNullable<JobState['usage']> {
  if (!job.usage) job.usage = {};
  return job.usage;
}

const persistDebounce = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout> | null;
    pending: JobState | null;
    inFlight: Promise<void>;
  }
>();

function sha256B64UrlFromString(input: string): string {
  const bytes = createHash('sha256').update(input).digest();
  return bytesToBase64Url(bytes);
}

function sha256B64UrlFromBytes(input: Uint8Array): string {
  const bytes = createHash('sha256').update(input).digest();
  return bytesToBase64Url(bytes);
}

function parseIsoMs(maybe: string | undefined): number | null {
  if (!maybe) return null;
  const t = Date.parse(maybe);
  if (!Number.isFinite(t)) return null;
  return t;
}

function computeQstepScore(params: {
  expectedSegmentMs: number;
  durationMs: number | null;
  gapMs: number | null;
  entropyPresent: boolean;
}): number {
  let score = 100;
  const expected = Math.max(500, Math.floor(params.expectedSegmentMs));

  if (!params.entropyPresent) score -= 20;

  if (params.durationMs === null) {
    score -= 15;
  } else {
    const min = Math.floor(expected * 0.65);
    const max = Math.floor(expected * 1.6);
    if (params.durationMs < min || params.durationMs > max) score -= 35;
  }

  if (params.gapMs === null) {
    score -= 10;
  } else {
    const min = Math.floor(expected * 0.35);
    const max = Math.floor(expected * 2.8);
    if (params.gapMs < min || params.gapMs > max) score -= 25;
  }

  return Math.max(0, Math.min(100, score));
}

let cachedGeneratedPqKeys: { pqPrivateKeyB64Url: string; pqPublicKeyB64Url: string } | null = null;

const finishFinalizersQueued = new Set<string>();

function jobStatePath(jobDir: string): string {
  return join(jobDir, 'job.json');
}

function jobSecretsPath(jobDir: string): string {
  return join(jobDir, 'secrets.json');
}

async function persistJobState(params: { jobDir: string; job: JobState }): Promise<void> {
  const entry =
    persistDebounce.get(params.jobDir) ??
    ({ timer: null, pending: null, inFlight: Promise.resolve() } as {
      timer: ReturnType<typeof setTimeout> | null;
      pending: JobState | null;
      inFlight: Promise<void>;
    });

  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.pending = null;

  entry.inFlight = entry.inFlight
    .then(() => writeFile(jobStatePath(params.jobDir), JSON.stringify(params.job), 'utf8'))
    .catch(() => {
    });

  persistDebounce.set(params.jobDir, entry);
  await entry.inFlight;

  if (params.job.status !== 'running' && !entry.timer) {
    persistDebounce.delete(params.jobDir);
  }
}

function persistJobStateDebounced(params: { jobDir: string; job: JobState; delayMs?: number }): void {
  const delayMs = Number.isFinite(params.delayMs ?? NaN) ? Math.max(0, Math.floor(params.delayMs as number)) : 250;
  const existing = persistDebounce.get(params.jobDir) ?? {
    timer: null as ReturnType<typeof setTimeout> | null,
    pending: null as JobState | null,
    inFlight: Promise.resolve()
  };

  existing.pending = params.job;
  if (existing.timer) clearTimeout(existing.timer);
  existing.timer = setTimeout(() => {
    existing.timer = null;
    const job = existing.pending;
    if (!job) return;
    existing.inFlight = existing.inFlight
      .then(() => writeFile(jobStatePath(params.jobDir), JSON.stringify(job), 'utf8'))
      .catch(() => {
      });
  }, delayMs);

  persistDebounce.set(params.jobDir, existing);
}

async function persistJobSecrets(params: { jobDir: string; jobSecrets: JobSecrets }): Promise<void> {
  if (!shouldPersistJobSecrets()) return;
  await writeFile(jobSecretsPath(params.jobDir), JSON.stringify(params.jobSecrets), 'utf8');
}

function jobId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function liveStreamRootDir(): string {
  const env = process.env.LIVE_STREAM_DIR;
  if (env && env.trim()) return env.trim();
  return join(tmpdir(), 'phoenix-zero', 'live-stream');
}

async function getFfmpegPath(): Promise<string> {
  const env = process.env.PHOENIX_ZERO_FFMPEG_PATH ?? process.env.FFMPEG_PATH;
  if (env && existsSync(env)) return env;

  const mod = (await import('ffmpeg-static')) as unknown as { default?: unknown };
  const maybe = (mod as { default?: unknown }).default ?? mod;
  if (typeof maybe === 'string' && existsSync(maybe)) return maybe;

  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  {
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      const p = resolve(dir, 'node_modules', 'ffmpeg-static', bin);
      if (existsSync(p)) return p;
      const next = resolve(dir, '..');
      if (next === dir) break;
      dir = next;
    }
  }

  throw new Error(
    `FFmpeg binary not found. Set PHOENIX_ZERO_FFMPEG_PATH to an existing ffmpeg executable. Resolved ffmpeg-static path was: ${
      typeof maybe === 'string' ? maybe : '[non-string]'
    }`
  );
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => {
      err += String(d);
    });
    child.on('error', (e: Error) => reject(e));
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(err || `ffmpeg exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });
}

async function transcodeToMp4(params: { inputPath: string; outPath: string }): Promise<void> {
  const ffmpegPath = await getFfmpegPath();
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    params.inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    params.outPath
  ];
  await run(ffmpegPath, args);
}

function samplesToBytes(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] ?? 0;
  return out;
}

function watermarkPayloadForSegment(params: { sessionId: string; segmentIndex: number; payloadByteLength: number }): string {
  const hash = createHash('sha256')
    .update(`${params.sessionId}:${params.segmentIndex}`)
    .digest();
  const bytes = new Uint8Array(hash).slice(0, params.payloadByteLength);
  return bytesToBase64Url(bytes);
}

async function readJsonMaybe<T>(filePath: string): Promise<T | null> {
  try {
    const txt = await readFile(filePath, 'utf8');
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function jobDirForId(id: string): string {
  const primary = join(liveStreamRootDir(), id);
  const legacy = join(process.cwd(), 'tmp', 'live-stream', id);

  if (existsSync(jobStatePath(primary)) || existsSync(jobSecretsPath(primary))) return primary;
  if (ALLOW_LIVE_STREAM_LEGACY_DIR) {
    if (existsSync(jobStatePath(legacy)) || existsSync(jobSecretsPath(legacy))) return legacy;
  }
  return primary;
}

async function loadJobFromDisk(id: string): Promise<JobState | null> {
  const existing = jobs.get(id);
  if (existing) return existing;

  const jobDir = jobDirForId(id);
  const p = jobStatePath(jobDir);
  if (!existsSync(p)) return null;
  const maybe = await readJsonMaybe<JobState>(p);
  if (!maybe) return null;

  if (!(maybe as any).qstepSeed) {
    (maybe as any).qstepSeed = bytesToBase64Url(randomBytes(16));
    await persistJobState({ jobDir, job: maybe });
  }

  jobs.set(id, maybe);
  return maybe;
}

async function loadJobSecretsFromDisk(params: { jobId: string; jobDir: string }): Promise<JobSecrets | null> {
  const existing = secrets.get(params.jobId);
  if (existing) return existing;

  const p = jobSecretsPath(params.jobDir);
  if (!existsSync(p)) return null;
  const maybe = await readJsonMaybe<JobSecrets>(p);
  if (!maybe?.privateKeyB64Url) return null;
  if (!(maybe as any).ingestTokenB64Url) {
    (maybe as any).ingestTokenB64Url = bytesToBase64Url(randomBytes(24));
    await persistJobSecrets({ jobDir: params.jobDir, jobSecrets: maybe as any });
  }
  secrets.set(params.jobId, maybe as any);
  return maybe as any;
}

async function resolveSigningKeys(params: {
  mode: PhoenixZeroHybridMode;
  privateKeyB64Url?: string;
}): Promise<SigningKeys> {
  const privateKeyB64Url =
    params.privateKeyB64Url ??
    process.env.PHOENIX_ZERO_PRIVATE_KEY_B64URL ??
    (await readJsonMaybe<{ privateKeyB64Url?: string }>(
      resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-ed25519.json')
    ))?.privateKeyB64Url;

  if (!privateKeyB64Url) {
    throw new Error(
      'Missing Ed25519 signing key. Provide privateKeyB64Url or set PHOENIX_ZERO_PRIVATE_KEY_B64URL (or run npm run keygen).'
    );
  }

  // Validate private key length early.
  ed25519KeyPairFromPrivateKey(base64UrlToBytes(privateKeyB64Url));

  const pqPriv = process.env.PHOENIX_ZERO_PQ_PRIVATE_KEY_B64URL;
  const pqPub = process.env.PHOENIX_ZERO_PQ_PUBLIC_KEY_B64URL;

  const pqFromFile = await readJsonMaybe<{ privateKeyB64Url?: string; publicKeyB64Url?: string }>(
    resolve(process.cwd(), '..', '..', 'keys', 'phoenix-zero-sphincs.json')
  );

  let pqPrivateKeyB64Url = pqPriv ?? pqFromFile?.privateKeyB64Url;
  let pqPublicKeyB64Url = pqPub ?? pqFromFile?.publicKeyB64Url;

  if (params.mode === 'strict' && (!pqPrivateKeyB64Url || !pqPublicKeyB64Url)) {
    if (!cachedGeneratedPqKeys) {
      const kp = await generateSphincsKeyPair();
      cachedGeneratedPqKeys = {
        pqPrivateKeyB64Url: bytesToBase64Url(kp.privateKey),
        pqPublicKeyB64Url: bytesToBase64Url(kp.publicKey)
      };
    }
    pqPrivateKeyB64Url = cachedGeneratedPqKeys.pqPrivateKeyB64Url;
    pqPublicKeyB64Url = cachedGeneratedPqKeys.pqPublicKeyB64Url;
  }

  // Validate PQ keys if present.
  if (pqPrivateKeyB64Url && pqPublicKeyB64Url) {
    pqPrivateKeyFromB64Url(pqPrivateKeyB64Url);
    pqPublicKeyFromB64Url(pqPublicKeyB64Url);
  }

  return { privateKeyB64Url, pqPrivateKeyB64Url, pqPublicKeyB64Url };
}

async function startJob(params: {
  tenantId: string;
  jobId: string;
  inputVideoPath: string;
  outDir: string;
  creatorId?: string;
  segmentSeconds: number;
  mode: PhoenixZeroHybridMode;
  policy: PhoenixZeroLiveVerifyPolicy;
  privateKeyB64Url?: string;
  wmThreshold?: number;
  wmSearchWindow?: number;
}): Promise<JobState> {
  const signingKeys = await resolveSigningKeys({ mode: params.mode, privateKeyB64Url: params.privateKeyB64Url });
  const keys: JobSecrets = { ...signingKeys, ingestTokenB64Url: bytesToBase64Url(randomBytes(24)) };

  const sessionProof = await createLiveSessionProof({
    creatorId: params.creatorId,
    segmentSeconds: params.segmentSeconds,
    mode: params.mode,
    privateKeyB64Url: signingKeys.privateKeyB64Url,
    pqPrivateKeyB64Url: signingKeys.pqPrivateKeyB64Url,
    pqPublicKeyB64Url: signingKeys.pqPublicKeyB64Url,
    watermarkVerify:
      params.wmThreshold !== undefined || params.wmSearchWindow !== undefined
        ? { yThreshold: params.wmThreshold, searchStartFrameWindow: params.wmSearchWindow }
        : undefined
  });

  secrets.set(params.jobId, keys);
  await persistJobSecrets({ jobDir: params.outDir, jobSecrets: keys });

  const state: JobState = {
    tenantId: params.tenantId,
    jobId: params.jobId,
    createdAt: new Date().toISOString(),
    status: 'running',
    policy: params.policy,
    sessionProof,
    segments: [],
    qstepSeed: bytesToBase64Url(randomBytes(16))
  };

  jobs.set(params.jobId, state);
  await persistJobState({ jobDir: params.outDir, job: state });

  const broadcaster = new LiveBroadcaster();
  const verifier = new LiveVerifier();

  void (async () => {
    try {
      await broadcaster.broadcastFromFileToSegments({
        inputVideoPath: params.inputVideoPath,
        outDir: params.outDir,
        sessionProof,
        privateKeyB64Url: signingKeys.privateKeyB64Url,
        pqPrivateKeyB64Url: signingKeys.pqPrivateKeyB64Url,
        pqPublicKeyB64Url: signingKeys.pqPublicKeyB64Url,
        onSegment: async (seg) => {
          const verify = await verifier.verifySegment({
            videoPath: seg.videoPath,
            segmentProof: seg.proof,
            sessionProof,
            policy: params.policy,
            wmThreshold: params.wmThreshold,
            wmSearchWindow: params.wmSearchWindow
          });

          const curr = jobs.get(params.jobId);
          if (!curr) return;
          curr.segments.push({
            index: seg.index,
            videoFile: basename(seg.videoPath),
            proofFile: basename(seg.proofPath),
            verify
          });
          persistJobStateDebounced({ jobDir: params.outDir, job: curr });
        }
      });

      const curr = jobs.get(params.jobId);
      if (!curr) return;
      curr.status = 'done';
      await persistJobState({ jobDir: params.outDir, job: curr });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const curr = jobs.get(params.jobId);
      if (!curr) return;
      curr.status = 'error';
      curr.error = message;
      await persistJobState({ jobDir: params.outDir, job: curr });
    }
  })();

  return state;
}

async function startWebcamJob(params: {
  tenantId: string;
  jobId: string;
  outDir: string;
  creatorId?: string;
  segmentSeconds: number;
  mode: PhoenixZeroHybridMode;
  policy: PhoenixZeroLiveVerifyPolicy;
  privateKeyB64Url?: string;
  wmThreshold?: number;
  wmSearchWindow?: number;
}): Promise<JobState> {
  const signingKeys = await resolveSigningKeys({ mode: params.mode, privateKeyB64Url: params.privateKeyB64Url });
  const keys: JobSecrets = { ...signingKeys, ingestTokenB64Url: bytesToBase64Url(randomBytes(24)) };

  const sessionProof = await createLiveSessionProof({
    creatorId: params.creatorId,
    segmentSeconds: params.segmentSeconds,
    mode: params.mode,
    privateKeyB64Url: signingKeys.privateKeyB64Url,
    pqPrivateKeyB64Url: signingKeys.pqPrivateKeyB64Url,
    pqPublicKeyB64Url: signingKeys.pqPublicKeyB64Url,
    watermarkVerify:
      params.wmThreshold !== undefined || params.wmSearchWindow !== undefined
        ? { yThreshold: params.wmThreshold, searchStartFrameWindow: params.wmSearchWindow }
        : undefined
  });

  secrets.set(params.jobId, keys);
  await persistJobSecrets({ jobDir: params.outDir, jobSecrets: keys });

  const state: JobState = {
    tenantId: params.tenantId,
    jobId: params.jobId,
    createdAt: new Date().toISOString(),
    status: 'running',
    policy: params.policy,
    sessionProof,
    segments: [],
    qstepSeed: bytesToBase64Url(randomBytes(16))
  };

  jobs.set(params.jobId, state);
  await mkdir(join(params.outDir, 'tmp'), { recursive: true });
  await mkdir(join(params.outDir, 'segments'), { recursive: true });

  await persistJobState({ jobDir: params.outDir, job: state });

  return state;
}

function enqueueIngest(jobId: string, task: () => Promise<void>): Promise<void> {
  const prev = ingestQueues.get(jobId) ?? Promise.resolve();
  const next = prev.then(task);
  ingestQueues.set(
    jobId,
    next.catch(() => {
    })
  );
  return next;
}

async function appendWebcamSegment(params: {
  jobId: string;
  outDir: string;
  index: number;
  segmentFile: File;
  serverReceivedAt?: string;
  clientCaptureStartedAt?: string;
  clientCaptureStoppedAt?: string;
  clientUploadMs?: number;
  clientUserAgent?: string;
  clientEntropyB64Url?: string;
  clientEntropyFrames?: number;
  wmThreshold?: number;
  wmSearchWindow?: number;
}): Promise<void> {
  const job = jobs.get(params.jobId);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'running') return;

  const existing = job.segments.find((s) => s.index === params.index);
  if (existing && (existing.verify || existing.error)) return;

  const keys = secrets.get(params.jobId);
  if (!keys) throw new Error('Missing job keys');

  const mime = String((params.segmentFile as any).type ?? '');
  const name = String((params.segmentFile as any).name ?? '');
  const isMp4 = mime.includes('mp4') || name.toLowerCase().endsWith('.mp4');
  const ext = isMp4 ? 'mp4' : 'webm';
  const pad = String(params.index).padStart(4, '0');

  const tmpDir = join(params.outDir, 'tmp');
  const segDir = join(params.outDir, 'segments');
  await mkdir(tmpDir, { recursive: true });
  await mkdir(segDir, { recursive: true });

  const uploadPath = join(tmpDir, `seg-${pad}-upload.${ext}`);
  const rawMp4Path = join(tmpDir, `seg-${pad}-raw.mp4`);
  const watermarkedPath = join(segDir, `seg-${pad}.mp4`);
  const proofPath = join(segDir, `seg-${pad}.proof.json`);

  const entry: JobSegment =
    existing ??
    {
      index: params.index,
      videoFile: basename(watermarkedPath),
      proofFile: basename(proofPath)
    };

  if (!existing) job.segments.push(entry);

  if (params.clientCaptureStartedAt) entry.clientCaptureStartedAt = params.clientCaptureStartedAt;
  if (params.clientCaptureStoppedAt) entry.clientCaptureStoppedAt = params.clientCaptureStoppedAt;
  if (params.clientUploadMs !== undefined) entry.clientUploadMs = params.clientUploadMs;
  if (params.clientUserAgent) entry.clientUserAgent = params.clientUserAgent;
  if (params.clientEntropyB64Url) entry.clientEntropyB64Url = params.clientEntropyB64Url;
  if (params.clientEntropyFrames !== undefined) entry.clientEntropyFrames = params.clientEntropyFrames;
  if (params.serverReceivedAt) entry.serverReceivedAt = params.serverReceivedAt;

  persistJobStateDebounced({ jobDir: params.outDir, job });

  const startedAtMs = Date.now();

  const bytesU8 = new Uint8Array(await params.segmentFile.arrayBuffer());
  const bytes = Buffer.from(bytesU8);
  await writeFile(uploadPath, bytes);

  const qstepSegmentHashB64Url = sha256B64UrlFromBytes(bytesU8);
  const expectedSegmentMs = Math.max(500, Math.floor((job.sessionProof.segmentSeconds || 3) * 1000));
  const startedAtMsClient = parseIsoMs(params.clientCaptureStartedAt);
  const stoppedAtMsClient = parseIsoMs(params.clientCaptureStoppedAt);
  const durationMs =
    startedAtMsClient !== null && stoppedAtMsClient !== null ? Math.max(0, Math.floor(stoppedAtMsClient - startedAtMsClient)) : null;

  const prevSeg = job.segments
    .filter((s) => s.index < params.index)
    .sort((a, b) => b.index - a.index)[0];
  const prevStartedAtMsClient = parseIsoMs(prevSeg?.clientCaptureStartedAt);
  const gapMs =
    startedAtMsClient !== null && prevStartedAtMsClient !== null
      ? Math.max(0, Math.floor(startedAtMsClient - prevStartedAtMsClient))
      : null;

  const prevChain = job.qstepLastHashB64Url ?? sha256B64UrlFromString(job.qstepSeed);
  const qstepChainHashB64Url = sha256B64UrlFromString(
    `${job.qstepSeed}:${prevChain}:${params.index}:${qstepSegmentHashB64Url}:${params.clientEntropyB64Url ?? ''}:${params.clientEntropyFrames ?? ''}:${params.serverReceivedAt ?? ''}:${durationMs ?? ''}:${gapMs ?? ''}`
  );
  const qstepScore = computeQstepScore({ expectedSegmentMs, durationMs, gapMs, entropyPresent: Boolean(params.clientEntropyB64Url) });

  entry.qstepSegmentHashB64Url = qstepSegmentHashB64Url;
  entry.qstepChainHashB64Url = qstepChainHashB64Url;
  if (durationMs !== null) entry.qstepDurationMs = durationMs;
  if (gapMs !== null) entry.qstepGapMs = gapMs;
  entry.qstepScore = qstepScore;

  const prevCount = Number.isFinite(job.qstepCount ?? NaN) ? Math.max(0, Math.floor(job.qstepCount as number)) : 0;
  const nextCount = prevCount + 1;
  const prevAvg = Number.isFinite(job.qstepScore ?? NaN) ? Math.max(0, Math.min(100, Math.floor(job.qstepScore as number))) : 100;
  const nextAvg = Math.round((prevAvg * prevCount + qstepScore) / nextCount);
  job.qstepCount = nextCount;
  job.qstepScore = nextAvg;
  job.qstepLastHashB64Url = qstepChainHashB64Url;
  job.qstepStatus = nextAvg >= 80 ? 'valid' : nextAvg >= 50 ? 'degraded' : 'invalid';

  const mp4InputPath = isMp4 ? uploadPath : rawMp4Path;
  if (!isMp4) {
    await transcodeToMp4({ inputPath: uploadPath, outPath: rawMp4Path });
  }

  const payloadB64Url = watermarkPayloadForSegment({
    sessionId: job.sessionProof.sessionId,
    segmentIndex: params.index,
    payloadByteLength: job.sessionProof.watermarkTemplate.payloadByteLength
  });

  const wmCfg = {
    ...job.sessionProof.watermarkTemplate,
    payloadB64Url
  };

  await embedInvisibleWatermark({ inputPath: mp4InputPath, outputPath: watermarkedPath, cfg: wmCfg });

  const temporal = await extractTemporalFingerprintFromVideoPath({
    videoPath: watermarkedPath,
    cfg: job.sessionProof.temporal.cfg
  });

  const temporalHash = sha256B64Url(samplesToBytes(temporal.samples));

  const payload: PhoenixZeroLiveSegmentPayload = {
    version: 1,
    createdAt: new Date().toISOString(),
    sessionId: job.sessionProof.sessionId,
    segmentIndex: params.index,
    watermark: wmCfg,
    temporal: {
      alg: 'signalstats_yavg_v1',
      cfg: temporal.cfg,
      samples: temporal.samples,
      hashB64Url: temporalHash,
      madThreshold: job.sessionProof.temporal.madThreshold
    },
    signatureMode: job.sessionProof.signatureMode
  };

  const ed = ed25519KeyPairFromPrivateKey(base64UrlToBytes(keys.privateKeyB64Url));
  const pqKeys =
    keys.pqPrivateKeyB64Url && keys.pqPublicKeyB64Url
      ? {
          alg: 'sphincs' as const,
          privateKey: pqPrivateKeyFromB64Url(keys.pqPrivateKeyB64Url),
          publicKey: pqPublicKeyFromB64Url(keys.pqPublicKeyB64Url)
        }
      : undefined;

  const hybridSignature = await createHybridSignature({
    payload,
    mode: job.sessionProof.signatureMode,
    ed25519: { privateKey: ed.privateKey, publicKey: ed.publicKey },
    pq: pqKeys
  });

  const proof: PhoenixZeroLiveSegmentProof = { ...payload, hybridSignature };
  await writeFile(proofPath, JSON.stringify(proof), 'utf8');

  const verifier = new LiveVerifier();
  const verify = await verifier.verifySegment({
    videoPath: watermarkedPath,
    segmentProof: proof,
    sessionProof: job.sessionProof,
    policy: job.policy,
    wmThreshold: params.wmThreshold,
    wmSearchWindow: params.wmSearchWindow
  });

  entry.verify = verify;
  entry.serverProcessedAt = new Date().toISOString();
  entry.serverProcessingMs = Math.max(0, Date.now() - startedAtMs);
  persistJobStateDebounced({ jobDir: params.outDir, job });
}

export async function GET(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
    }
    tenantId = auth.ctx.tenantId;

    const billing = await getOrCreateBillingAccount(auth.ctx.tenantId);
    if (!billing.ok) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: billing.reason }, { status: 400 });
    }
    if (!isBillingAccountActive(billing.account)) {
      httpStatus = 402;
      return Response.json(
        { ok: false, reason: 'Payment required', billing: { status: billing.account.status, isActive: false } },
        { status: 402 }
      );
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('jobId') ?? undefined;

    if (!id) {
      ok = true;
      httpStatus = 200;
      return Response.json({
        ok: true,
        jobs: Array.from(jobs.values())
          .filter((j) => j.tenantId === auth.ctx.tenantId)
          .map((j) => ({ jobId: j.jobId, status: j.status }))
      });
    }

    const job = await loadJobFromDisk(id);
    if (!job) {
      httpStatus = 404;
      return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
    }

    if (!job.tenantId || job.tenantId !== auth.ctx.tenantId) {
      httpStatus = 404;
      return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
    }

    const jobId = job.jobId;

    const qstepReport = url.searchParams.get('qstep') === '1';
    if (qstepReport) {
      const expectedSegmentMs = Math.max(500, Math.floor((job.sessionProof.segmentSeconds || 3) * 1000));

      async function tryReadUploadBytes(segIndex: number): Promise<{ bytes: Uint8Array; filename: string } | null> {
        const pad = String(segIndex).padStart(4, '0');
        const tmpDir = join(jobDirForId(jobId), 'tmp');
        const candidates = [`seg-${pad}-upload.mp4`, `seg-${pad}-upload.webm`];
        for (const name of candidates) {
          const p = join(tmpDir, name);
          if (!existsSync(p)) continue;
          try {
            const buf = await readFile(p);
            return { bytes: new Uint8Array(buf), filename: name };
          } catch {
          }
        }
        return null;
      }

      const segs = job.segments.slice().sort((a, b) => a.index - b.index);
      const seedHash = sha256B64UrlFromString(job.qstepSeed);
      let prevChain = seedHash;

      let count = 0;
      let avg = 100;
      let lastChain: string | undefined;
      let allChainOk = true;

      const reportSegments: any[] = [];
      for (const s of segs) {
        const upload = await tryReadUploadBytes(s.index);
        const recomputedSegmentHash = upload ? sha256B64UrlFromBytes(upload.bytes) : undefined;

        const durationMs = typeof s.qstepDurationMs === 'number' ? s.qstepDurationMs : null;
        const gapMs = typeof s.qstepGapMs === 'number' ? s.qstepGapMs : null;

        const clientEntropyB64Url = typeof s.clientEntropyB64Url === 'string' ? s.clientEntropyB64Url : '';
        const clientEntropyFrames = s.clientEntropyFrames !== undefined ? String(s.clientEntropyFrames) : '';
        const serverReceivedAt = typeof s.serverReceivedAt === 'string' ? s.serverReceivedAt : '';

        const segHashForChain = recomputedSegmentHash ?? s.qstepSegmentHashB64Url ?? '';
        const chain = sha256B64UrlFromString(
          `${job.qstepSeed}:${prevChain}:${s.index}:${segHashForChain}:${clientEntropyB64Url}:${clientEntropyFrames}:${serverReceivedAt}:${durationMs ?? ''}:${gapMs ?? ''}`
        );

        const score = computeQstepScore({ expectedSegmentMs, durationMs, gapMs, entropyPresent: Boolean(s.clientEntropyB64Url) });
        const storedChain = typeof s.qstepChainHashB64Url === 'string' ? s.qstepChainHashB64Url : undefined;
        const storedSegHash = typeof s.qstepSegmentHashB64Url === 'string' ? s.qstepSegmentHashB64Url : undefined;

        const segmentHashOk = recomputedSegmentHash ? recomputedSegmentHash === storedSegHash : null;
        const chainOk = storedChain ? chain === storedChain : null;
        if (chainOk === false) allChainOk = false;

        prevChain = chain;
        lastChain = chain;
        count += 1;
        avg = Math.round((avg * (count - 1) + score) / count);

        reportSegments.push({
          index: s.index,
          uploadFile: upload?.filename,
          storedSegmentHashB64Url: storedSegHash,
          recomputedSegmentHashB64Url: recomputedSegmentHash,
          segmentHashOk,
          storedChainHashB64Url: storedChain,
          recomputedChainHashB64Url: chain,
          chainOk,
          storedScore: typeof s.qstepScore === 'number' ? s.qstepScore : undefined,
          recomputedScore: score,
          durationMs,
          gapMs,
          entropyPresent: Boolean(s.clientEntropyB64Url)
        });
      }

      const computedStatus = avg >= 80 ? 'valid' : avg >= 50 ? 'degraded' : 'invalid';
      const lastHashMatches = lastChain ? lastChain === job.qstepLastHashB64Url : null;

      ok = true;
      httpStatus = 200;
      return Response.json({
        ok: true,
        qstep: {
          seedHashB64Url: seedHash,
          computedAvgScore: avg,
          computedStatus,
          computedLastHashB64Url: lastChain,
          storedAvgScore: job.qstepScore,
          storedStatus: job.qstepStatus,
          storedLastHashB64Url: job.qstepLastHashB64Url,
          lastHashMatches,
          allChainOk,
          segmentCount: reportSegments.length,
          segments: reportSegments
        }
      });
    }

    const full = url.searchParams.get('full') === '1';

    const download = url.searchParams.get('download');
    if (download) {
      if (download === 'job') {
        const bytes = await readFile(jobStatePath(jobDirForId(id)));
        ok = true;
        httpStatus = 200;
        return new Response(bytes, {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="job-${job.jobId}.json"`
          }
        });
      }

      const index = Number(url.searchParams.get('index'));
      if (!Number.isFinite(index)) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: 'Missing index' }, { status: 400 });
      }
      const seg = job.segments.find((s) => s.index === index);
      if (!seg) {
        httpStatus = 404;
        return Response.json({ ok: false, reason: 'Segment not found' }, { status: 404 });
      }

      const baseDir = join(jobDirForId(job.jobId), 'segments');
      const filePath = join(baseDir, download === 'proof' ? seg.proofFile : seg.videoFile);
      const bytes = await readFile(filePath);

      ok = true;
      httpStatus = 200;
      return new Response(bytes, {
        headers: {
          'Content-Type': download === 'proof' ? 'application/json' : 'video/mp4',
          'Content-Disposition': `attachment; filename="${download === 'proof' ? seg.proofFile : seg.videoFile}"`
        }
      });
    }

    if (full) {
      ok = true;
      httpStatus = 200;
      return Response.json({ ok: true, job });
    }

    const tail = Number(url.searchParams.get('tail'));
    const tailN = Number.isFinite(tail) ? Math.max(1, Math.min(200, Math.floor(tail))) : 6;

    const segmentCount = job.segments.length;
    const summaryAnyFail = job.segments.some((s) => s.error || s.verify?.ok === false);
    const summaryAnyOk = job.segments.some((s) => s.verify?.ok === true);

    const start = Math.max(0, segmentCount - tailN);
    const segments = job.segments.slice(start).map((s) => ({
      index: s.index,
      videoFile: s.videoFile,
      proofFile: s.proofFile,
      error: s.error,
      verify: s.verify ? { ok: s.verify.ok } : undefined,
      qstepScore: s.qstepScore
    }));

    ok = true;
    httpStatus = 200;
    return Response.json({
      ok: true,
      job: {
        jobId: job.jobId,
        createdAt: job.createdAt,
        status: job.status,
        policy: job.policy,
        sessionProof: null,
        segments,
        error: job.error,
        finishRequestedAt: job.finishRequestedAt,
        segmentCount,
        summaryAnyOk,
        summaryAnyFail,
        qstepScore: job.qstepScore,
        qstepStatus: job.qstepStatus
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op: 'live_get', ok, httpStatus, startedAtMs });
  }
}

export async function POST(req: Request) {
  const startedAtMs = Date.now();
  let tenantId: string | null = null;
  let ok = false;
  let httpStatus = 500;
  let op: UsageOp = 'live_start';
  let action: string | undefined;
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      httpStatus = auth.status;
      return Response.json({ ok: false, reason: auth.reason }, { status: auth.status });
    }
    tenantId = auth.ctx.tenantId;

    const billing = await getOrCreateBillingAccount(auth.ctx.tenantId);
    if (!billing.ok) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: billing.reason }, { status: 400 });
    }
    if (!isBillingAccountActive(billing.account)) {
      httpStatus = 402;
      return Response.json(
        { ok: false, reason: 'Payment required', billing: { status: billing.account.status, isActive: false } },
        { status: 402 }
      );
    }

    const contentType = req.headers.get('content-type') ?? '';

    if (!contentType.includes('multipart/form-data')) {
      const body = (await req.json().catch(() => null)) as
        | null
        | {
            action?: string;
            jobId?: string;
            index?: number;
            creatorId?: string;
            segmentSeconds?: number;
            mode?: string;
            policy?: string;
            wmThreshold?: number;
            wmSearchWindow?: number;
            privateKeyB64Url?: string;
            clientUploadMs?: number;
            clientUserAgent?: string;
            ingestToken?: string;
          };

      action = typeof body?.action === 'string' ? body.action : undefined;
      if (action === 'cancel') op = 'live_cancel';
      else if (action === 'finish') op = 'live_finish';
      else if (action === 'segment-telemetry') op = 'live_telemetry';
      else if (action === 'start-webcam') op = 'live_start';

      if (body?.action === 'cancel' && body.jobId) {
        const ingestToken = body.ingestToken;
        if (!ingestToken) {
          httpStatus = 401;
          return Response.json({ ok: false, reason: 'Missing ingestToken' }, { status: 401 });
        }
        const ip = getClientIp(req);
        {
          const hitIp = rateHit({ key: `live:cancel:ip:${ip}`, limit: 30, windowMs: 60_000 });
          if (!hitIp.ok) {
            httpStatus = 429;
            return rateLimitedResponse(hitIp.retryAfterSec);
          }
          const hitJob = rateHit({ key: `live:cancel:job:${body.jobId}`, limit: 10, windowMs: 60_000 });
          if (!hitJob.ok) {
            httpStatus = 429;
            return rateLimitedResponse(hitJob.retryAfterSec);
          }
        }
        const jobDir = jobDirForId(body.jobId);
        const keys = await loadJobSecretsFromDisk({ jobId: body.jobId, jobDir });
        if (!keys) {
          httpStatus = 404;
          return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
        }
        if (!safeEqualString(ingestToken, keys.ingestTokenB64Url)) {
          httpStatus = 403;
          return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 403 });
        }
        const job = await loadJobFromDisk(body.jobId);
        if (job) {
          if (!job.tenantId || job.tenantId !== auth.ctx.tenantId) {
            httpStatus = 404;
            return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
          }
          const usage = ensureUsage(job);
          usage.cancelRequests = (usage.cancelRequests ?? 0) + 1;
          persistJobStateDebounced({ jobDir, job });
        }
        jobs.delete(body.jobId);
        secrets.delete(body.jobId);
        ingestQueues.delete(body.jobId);
        finishFinalizersQueued.delete(body.jobId);
        ok = true;
        httpStatus = 200;
        return Response.json({ ok: true });
      }

      if (body?.action === 'finish' && body.jobId) {
        const ingestToken = body.ingestToken;
        if (!ingestToken) {
          httpStatus = 401;
          return Response.json({ ok: false, reason: 'Missing ingestToken' }, { status: 401 });
        }
        const ip = getClientIp(req);
        {
          const hitIp = rateHit({ key: `live:finish:ip:${ip}`, limit: 60, windowMs: 60_000 });
          if (!hitIp.ok) {
            httpStatus = 429;
            return rateLimitedResponse(hitIp.retryAfterSec);
          }
          const hitJob = rateHit({ key: `live:finish:job:${body.jobId}`, limit: 10, windowMs: 60_000 });
          if (!hitJob.ok) {
            httpStatus = 429;
            return rateLimitedResponse(hitJob.retryAfterSec);
          }
        }
        const finishJobId = body.jobId;
        const job = await loadJobFromDisk(finishJobId);
        if (!job) {
          httpStatus = 404;
          return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
        }
        if (!job.tenantId || job.tenantId !== auth.ctx.tenantId) {
          httpStatus = 404;
          return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
        }
        const jobDir = jobDirForId(finishJobId);
        const keys = await loadJobSecretsFromDisk({ jobId: finishJobId, jobDir });
        if (!keys) {
          httpStatus = 404;
          return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
        }
        if (!safeEqualString(ingestToken, keys.ingestTokenB64Url)) {
          httpStatus = 403;
          return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 403 });
        }

        {
          const usage = ensureUsage(job);
          usage.finishRequests = (usage.finishRequests ?? 0) + 1;
        }

        if (!job.finishRequestedAt) job.finishRequestedAt = new Date().toISOString();
        await persistJobState({ jobDir, job });

        if (!finishFinalizersQueued.has(finishJobId)) {
          finishFinalizersQueued.add(finishJobId);
          void enqueueIngest(finishJobId, async () => {
            const curr = jobs.get(finishJobId) ?? (await loadJobFromDisk(finishJobId));
            if (!curr) return;
            if (curr.status === 'running') curr.status = 'done';
            await persistJobState({ jobDir, job: curr });
            ingestQueues.delete(finishJobId);
            finishFinalizersQueued.delete(finishJobId);
          });
        }

        ok = true;
        httpStatus = 200;
        return Response.json({ ok: true });
      }

      if (body?.action === 'segment-telemetry' && body.jobId) {
        const ingestToken = body.ingestToken;
        if (!ingestToken) {
          httpStatus = 401;
          return Response.json({ ok: false, reason: 'Missing ingestToken' }, { status: 401 });
        }
        const ip = getClientIp(req);
        {
          const hitIp = rateHit({ key: `live:telemetry:ip:${ip}`, limit: 240, windowMs: 60_000 });
          if (!hitIp.ok) {
            httpStatus = 429;
            return rateLimitedResponse(hitIp.retryAfterSec);
          }
          const hitJob = rateHit({ key: `live:telemetry:job:${body.jobId}`, limit: 240, windowMs: 60_000 });
          if (!hitJob.ok) {
            httpStatus = 429;
            return rateLimitedResponse(hitJob.retryAfterSec);
          }
        }
        const index = Number(body.index);
        if (!Number.isFinite(index) || index < 0) {
          httpStatus = 400;
          return Response.json({ ok: false, reason: 'Invalid index' }, { status: 400 });
        }

        const job = await loadJobFromDisk(body.jobId);
        if (!job) {
          httpStatus = 404;
          return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
        }
        if (!job.tenantId || job.tenantId !== auth.ctx.tenantId) {
          httpStatus = 404;
          return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
        }

        const jobDir = jobDirForId(body.jobId);
        const keys = await loadJobSecretsFromDisk({ jobId: body.jobId, jobDir });
        if (!keys) {
          httpStatus = 404;
          return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
        }
        if (!safeEqualString(ingestToken, keys.ingestTokenB64Url)) {
          httpStatus = 403;
          return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 403 });
        }
        const pad = String(index).padStart(4, '0');
        const seg = job.segments.find((s) => s.index === index);

        const uploadMs = Number(body.clientUploadMs);
        const ua = typeof body.clientUserAgent === 'string' ? body.clientUserAgent : undefined;

        {
          const usage = ensureUsage(job);
          usage.telemetryRequests = (usage.telemetryRequests ?? 0) + 1;
          if (Number.isFinite(uploadMs)) usage.totalClientUploadMs = (usage.totalClientUploadMs ?? 0) + uploadMs;
        }

        if (!seg) {
          job.segments.push({
            index,
            videoFile: `seg-${pad}.mp4`,
            proofFile: `seg-${pad}.proof.json`,
            clientUploadMs: Number.isFinite(uploadMs) ? uploadMs : undefined,
            clientUserAgent: ua
          });
        } else {
          if (Number.isFinite(uploadMs)) seg.clientUploadMs = uploadMs;
          if (ua) seg.clientUserAgent = ua;
        }

        persistJobStateDebounced({ jobDir, job });
        ok = true;
        httpStatus = 200;
        return Response.json({ ok: true });
      }

      if (body?.action === 'start-webcam') {
        op = 'live_start';
        const mode = (typeof body.mode === 'string' ? body.mode : 'strict') as PhoenixZeroHybridMode;
        const policy = (typeof body.policy === 'string' ? body.policy : 'sig+(wm|temporal)') as PhoenixZeroLiveVerifyPolicy;
        const segmentSeconds = Number.isFinite(body.segmentSeconds ?? NaN) ? Number(body.segmentSeconds) : 3;
        const creatorId = typeof body.creatorId === 'string' ? String(body.creatorId) : undefined;
        const wmThreshold = Number.isFinite(body.wmThreshold ?? NaN) ? Number(body.wmThreshold) : undefined;
        const wmSearchWindow = Number.isFinite(body.wmSearchWindow ?? NaN) ? Number(body.wmSearchWindow) : undefined;
        const privateKeyB64Url = typeof body.privateKeyB64Url === 'string' ? String(body.privateKeyB64Url) : undefined;

        const rootTmp = liveStreamRootDir();
        await mkdir(rootTmp, { recursive: true });

        const id = jobId();
        const jobDir = join(rootTmp, id);
        await mkdir(jobDir, { recursive: true });

        await startWebcamJob({
          tenantId: auth.ctx.tenantId,
          jobId: id,
          outDir: jobDir,
          creatorId,
          segmentSeconds: Number.isFinite(segmentSeconds) && segmentSeconds > 0 ? segmentSeconds : 3,
          mode: mode === 'compat' ? 'compat' : 'strict',
          policy: policy === 'sig+wm+temporal' ? 'sig+wm+temporal' : 'sig+(wm|temporal)',
          privateKeyB64Url,
          wmThreshold,
          wmSearchWindow
        });

        const keys = await loadJobSecretsFromDisk({ jobId: id, jobDir });
        if (!keys) {
          httpStatus = 500;
          return Response.json({ ok: false, reason: 'Missing job keys' }, { status: 500 });
        }
        ok = true;
        httpStatus = 200;
        return Response.json({ ok: true, jobId: id, ingestToken: keys.ingestTokenB64Url });
      }

      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Unsupported request. Use multipart/form-data with action=start.' }, { status: 400 });
    }

    const form = await req.formData();
    action = typeof form.get('action') === 'string' ? String(form.get('action')) : 'start';
    op = action === 'append' ? 'live_append' : 'live_start';

    if (action === 'append') {
      const id = typeof form.get('jobId') === 'string' ? String(form.get('jobId')) : undefined;
      const index = typeof form.get('index') === 'string' ? Number(String(form.get('index'))) : NaN;
      const seg = form.get('segment');
      const ingestToken = typeof form.get('ingestToken') === 'string' ? String(form.get('ingestToken')) : undefined;
      const wmThreshold = typeof form.get('wmThreshold') === 'string' ? Number(String(form.get('wmThreshold'))) : undefined;
      const wmSearchWindow = typeof form.get('wmSearchWindow') === 'string' ? Number(String(form.get('wmSearchWindow'))) : undefined;
      const clientCaptureStartedAt =
        typeof form.get('clientCaptureStartedAt') === 'string' ? String(form.get('clientCaptureStartedAt')) : undefined;
      const clientCaptureStoppedAt =
        typeof form.get('clientCaptureStoppedAt') === 'string' ? String(form.get('clientCaptureStoppedAt')) : undefined;
      const clientUploadMs = typeof form.get('clientUploadMs') === 'string' ? Number(String(form.get('clientUploadMs'))) : undefined;
      const clientUserAgent = typeof form.get('clientUserAgent') === 'string' ? String(form.get('clientUserAgent')) : undefined;
      const clientEntropyB64Url =
        typeof form.get('clientEntropyB64Url') === 'string' ? String(form.get('clientEntropyB64Url')) : undefined;
      const clientEntropyFrames =
        typeof form.get('clientEntropyFrames') === 'string' ? Number(String(form.get('clientEntropyFrames'))) : undefined;

      if (!id) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: 'Missing form field: jobId' }, { status: 400 });
      }
      if (!Number.isFinite(index) || index < 0) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: 'Invalid index' }, { status: 400 });
      }
      if (!(seg instanceof File)) {
        httpStatus = 400;
        return Response.json({ ok: false, reason: 'Missing form field: segment' }, { status: 400 });
      }
      if (!ingestToken) {
        httpStatus = 401;
        return Response.json({ ok: false, reason: 'Missing ingestToken' }, { status: 401 });
      }

      if (Number.isFinite(seg.size) && seg.size > MAX_SEGMENT_BYTES) {
        httpStatus = 413;
        return Response.json({ ok: false, reason: 'Segment too large' }, { status: 413 });
      }

      const ip = getClientIp(req);
      {
        const hitIp = rateHit({ key: `live:append:ip:${ip}`, limit: 240, windowMs: 60_000 });
        if (!hitIp.ok) {
          httpStatus = 429;
          return rateLimitedResponse(hitIp.retryAfterSec);
        }
        const hitJob = rateHit({ key: `live:append:job:${id}`, limit: 60, windowMs: 60_000 });
        if (!hitJob.ok) {
          httpStatus = 429;
          return rateLimitedResponse(hitJob.retryAfterSec);
        }
      }

      const jobDir = jobDirForId(id);
      const serverReceivedAt = new Date().toISOString();

      const keys = await loadJobSecretsFromDisk({ jobId: id, jobDir });
      if (!keys) {
        httpStatus = 404;
        return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
      }
      if (!safeEqualString(ingestToken, keys.ingestTokenB64Url)) {
        httpStatus = 403;
        return Response.json({ ok: false, reason: 'Unauthorized' }, { status: 403 });
      }

      const job = await loadJobFromDisk(id);
      if (!job) {
        httpStatus = 404;
        return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
      }
      if (!job.tenantId || job.tenantId !== auth.ctx.tenantId) {
        httpStatus = 404;
        return Response.json({ ok: false, reason: 'Job not found' }, { status: 404 });
      }
      if (job.finishRequestedAt) {
        httpStatus = 409;
        return Response.json({ ok: false, reason: 'Finish already requested' }, { status: 409 });
      }

      {
        const pad = String(index).padStart(4, '0');
        const existing = job.segments.find((s) => s.index === index);
        if (!existing) {
          job.segments.push({
            index,
            videoFile: `seg-${pad}.mp4`,
            proofFile: `seg-${pad}.proof.json`,
            clientEntropyB64Url,
            clientEntropyFrames: Number.isFinite(clientEntropyFrames ?? NaN) ? clientEntropyFrames : undefined,
            clientCaptureStartedAt,
            clientCaptureStoppedAt,
            clientUploadMs: Number.isFinite(clientUploadMs ?? NaN) ? clientUploadMs : undefined,
            clientUserAgent,
            serverReceivedAt
          });
        } else {
          if (clientCaptureStartedAt) existing.clientCaptureStartedAt = clientCaptureStartedAt;
          if (clientCaptureStoppedAt) existing.clientCaptureStoppedAt = clientCaptureStoppedAt;
          if (Number.isFinite(clientUploadMs ?? NaN)) existing.clientUploadMs = clientUploadMs;
          if (clientUserAgent) existing.clientUserAgent = clientUserAgent;
          if (clientEntropyB64Url) existing.clientEntropyB64Url = clientEntropyB64Url;
          if (Number.isFinite(clientEntropyFrames ?? NaN)) existing.clientEntropyFrames = clientEntropyFrames;
          existing.serverReceivedAt = serverReceivedAt;
        }

        {
          const usage = ensureUsage(job);
          usage.ingestRequests = (usage.ingestRequests ?? 0) + 1;
          usage.lastServerReceivedAt = serverReceivedAt;
          if (!usage.firstServerReceivedAt) usage.firstServerReceivedAt = serverReceivedAt;
          if (!existing) {
            usage.ingestSegments = (usage.ingestSegments ?? 0) + 1;
            usage.costUnits = (usage.costUnits ?? 0) + 1;
          }
          const size = (seg as File).size;
          if (Number.isFinite(size)) usage.ingestBytes = (usage.ingestBytes ?? 0) + size;
        }

        await persistJobState({ jobDir, job });
      }

      void enqueueIngest(id, async () => {
        try {
          await appendWebcamSegment({
            jobId: id,
            outDir: jobDir,
            index,
            segmentFile: seg,
            serverReceivedAt,
            clientCaptureStartedAt,
            clientCaptureStoppedAt,
            clientUploadMs: Number.isFinite(clientUploadMs ?? NaN) ? clientUploadMs : undefined,
            clientUserAgent,
            clientEntropyB64Url,
            clientEntropyFrames: Number.isFinite(clientEntropyFrames ?? NaN) ? clientEntropyFrames : undefined,
            wmThreshold: Number.isFinite(wmThreshold ?? NaN) ? wmThreshold : undefined,
            wmSearchWindow: Number.isFinite(wmSearchWindow ?? NaN) ? wmSearchWindow : undefined
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const curr = jobs.get(id);
          if (!curr) return;
          const currSeg = curr.segments.find((s) => s.index === index);
          if (currSeg) currSeg.error = message;
          curr.status = 'error';
          curr.error = message;
          await persistJobState({ jobDir, job: curr });
        }
      });

      ok = true;
      httpStatus = 200;
      return Response.json({ ok: true });
    }

    if (action !== 'start') {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Unsupported action' }, { status: 400 });
    }

    const video = form.get('video');
    if (!(video instanceof File)) {
      httpStatus = 400;
      return Response.json({ ok: false, reason: 'Missing form field: video' }, { status: 400 });
    }

    if (Number.isFinite(video.size) && video.size > MAX_START_VIDEO_BYTES) {
      httpStatus = 413;
      return Response.json({ ok: false, reason: 'File too large' }, { status: 413 });
    }

    const creatorId = typeof form.get('creatorId') === 'string' ? String(form.get('creatorId')) : undefined;

    const mode = (typeof form.get('mode') === 'string' ? form.get('mode') : 'strict') as PhoenixZeroHybridMode;
    const segmentSeconds = typeof form.get('segmentSeconds') === 'string' ? Number(String(form.get('segmentSeconds'))) : 3;
    const policy = (typeof form.get('policy') === 'string' ? form.get('policy') : 'sig+(wm|temporal)') as PhoenixZeroLiveVerifyPolicy;

    const wmThreshold = typeof form.get('wmThreshold') === 'string' ? Number(String(form.get('wmThreshold'))) : undefined;
    const wmSearchWindow = typeof form.get('wmSearchWindow') === 'string' ? Number(String(form.get('wmSearchWindow'))) : undefined;

    const privateKeyB64Url =
      typeof form.get('privateKeyB64Url') === 'string' ? String(form.get('privateKeyB64Url')) : undefined;

    const rootTmp = liveStreamRootDir();
    await mkdir(rootTmp, { recursive: true });

    const id = jobId();
    const jobDir = join(rootTmp, id);
    await mkdir(jobDir, { recursive: true });

    const inputPath = join(jobDir, 'input.mp4');
    await writeFile(inputPath, Buffer.from(new Uint8Array(await video.arrayBuffer())));

    await startJob({
      tenantId: auth.ctx.tenantId,
      jobId: id,
      inputVideoPath: inputPath,
      outDir: jobDir,
      creatorId,
      segmentSeconds: Number.isFinite(segmentSeconds) && segmentSeconds > 0 ? segmentSeconds : 3,
      mode: mode === 'compat' ? 'compat' : 'strict',
      policy: policy === 'sig+wm+temporal' ? 'sig+wm+temporal' : 'sig+(wm|temporal)',
      privateKeyB64Url,
      wmThreshold: Number.isFinite(wmThreshold ?? NaN) ? wmThreshold : undefined,
      wmSearchWindow: Number.isFinite(wmSearchWindow ?? NaN) ? wmSearchWindow : undefined
    });

    const keys = await loadJobSecretsFromDisk({ jobId: id, jobDir });
    if (!keys) {
      httpStatus = 500;
      return Response.json({ ok: false, reason: 'Missing job keys' }, { status: 500 });
    }
    ok = true;
    httpStatus = 200;
    return Response.json({ ok: true, jobId: id, ingestToken: keys.ingestTokenB64Url });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    ok = false;
    httpStatus = 500;
    return Response.json({ ok: false, reason: message }, { status: 500 });
  } finally {
    void recordUsage({ req, tenantId, op, ok, httpStatus, startedAtMs, meta: action ? { action } : undefined });
  }
}
