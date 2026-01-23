import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { sha256B64Url, bytesToBase64Url, base64UrlToBytes, ed25519KeyPairFromPrivateKey } from '@phoenix-zero/core';
import {
  createHybridSignature,
  embedInvisibleWatermark,
  extractTemporalFingerprintFromVideoPath,
  pqPrivateKeyFromB64Url,
  pqPublicKeyFromB64Url,
  probeVideoDurationSeconds,
  type PhoenixZeroHybridMode
} from '@phoenix-zero/core/node';

import type { PhoenixZeroLiveSegmentPayload, PhoenixZeroLiveSegmentProof, PhoenixZeroLiveSessionProof } from '../protocols/realtime';

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
  return new Promise((resolve, reject) => {
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
      resolve();
    });
  });
}

function watermarkPayloadForSegment(params: { sessionId: string; segmentIndex: number; payloadByteLength: number }): string {
  const hash = createHash('sha256')
    .update(`${params.sessionId}:${params.segmentIndex}`)
    .digest();
  const bytes = new Uint8Array(hash).slice(0, params.payloadByteLength);
  return bytesToBase64Url(bytes);
}

async function cutSegment(params: { inputPath: string; outPath: string; ss: number; t: number }): Promise<void> {
  const ffmpegPath = await getFfmpegPath();
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(params.ss),
    '-t',
    String(params.t),
    '-i',
    params.inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
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

export async function broadcastFromFileToSegments(params: {
  inputVideoPath: string;
  outDir: string;
  sessionProof: PhoenixZeroLiveSessionProof;
  privateKeyB64Url: string;
  pqPrivateKeyB64Url?: string;
  pqPublicKeyB64Url?: string;
  onSegment?: (segment: { index: number; videoPath: string; proofPath: string; proof: PhoenixZeroLiveSegmentProof }) => void | Promise<void>;
}): Promise<{ sessionProofPath: string; segments: { index: number; videoPath: string; proofPath: string; proof: PhoenixZeroLiveSegmentProof }[] }> {
  await mkdir(params.outDir, { recursive: true });

  const sessionProofPath = join(params.outDir, 'session.proof.json');
  await writeFile(sessionProofPath, JSON.stringify(params.sessionProof, null, 2), 'utf8');

  const duration = (await probeVideoDurationSeconds(params.inputVideoPath)) ?? 0;
  const segmentSeconds = Math.max(1, params.sessionProof.segmentSeconds);
  const segmentCount = Math.max(1, Math.ceil(duration / segmentSeconds));

  const tmpDir = join(params.outDir, 'tmp');
  const segDir = join(params.outDir, 'segments');
  await mkdir(tmpDir, { recursive: true });
  await mkdir(segDir, { recursive: true });

  const ed = ed25519KeyPairFromPrivateKey(base64UrlToBytes(params.privateKeyB64Url));
  const pqKeys =
    params.pqPrivateKeyB64Url && params.pqPublicKeyB64Url
      ? {
          alg: 'sphincs' as const,
          privateKey: pqPrivateKeyFromB64Url(params.pqPrivateKeyB64Url),
          publicKey: pqPublicKeyFromB64Url(params.pqPublicKeyB64Url)
        }
      : undefined;

  const mode: PhoenixZeroHybridMode = params.sessionProof.signatureMode;

  const out: { index: number; videoPath: string; proofPath: string; proof: PhoenixZeroLiveSegmentProof }[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const ss = i * segmentSeconds;

    const rawPath = join(tmpDir, `seg-${String(i).padStart(4, '0')}-raw.mp4`);
    const watermarkedPath = join(segDir, `seg-${String(i).padStart(4, '0')}.mp4`);
    const proofPath = join(segDir, `seg-${String(i).padStart(4, '0')}.proof.json`);

    await cutSegment({ inputPath: params.inputVideoPath, outPath: rawPath, ss, t: segmentSeconds });

    const payloadB64Url = watermarkPayloadForSegment({
      sessionId: params.sessionProof.sessionId,
      segmentIndex: i,
      payloadByteLength: params.sessionProof.watermarkTemplate.payloadByteLength
    });

    const wmCfg = {
      ...params.sessionProof.watermarkTemplate,
      payloadB64Url
    };

    await embedInvisibleWatermark({ inputPath: rawPath, outputPath: watermarkedPath, cfg: wmCfg });

    const temporal = await extractTemporalFingerprintFromVideoPath({
      videoPath: watermarkedPath,
      cfg: params.sessionProof.temporal.cfg
    });
    const temporalHash = sha256B64Url(samplesToBytes(temporal.samples));

    const payload: PhoenixZeroLiveSegmentPayload = {
      version: 1,
      createdAt: new Date().toISOString(),
      sessionId: params.sessionProof.sessionId,
      segmentIndex: i,
      watermark: wmCfg,
      temporal: {
        alg: 'signalstats_yavg_v1',
        cfg: temporal.cfg,
        samples: temporal.samples,
        hashB64Url: temporalHash,
        madThreshold: params.sessionProof.temporal.madThreshold
      },
      signatureMode: mode
    };

    const hybridSignature = await createHybridSignature({
      payload,
      mode,
      ed25519: { privateKey: ed.privateKey, publicKey: ed.publicKey },
      pq: pqKeys
    });

    const proof: PhoenixZeroLiveSegmentProof = { ...payload, hybridSignature };
    await writeFile(proofPath, JSON.stringify(proof, null, 2), 'utf8');

    const seg = { index: i, videoPath: watermarkedPath, proofPath, proof };
    out.push(seg);
    await params.onSegment?.(seg);
  }

  return { sessionProofPath, segments: out };
}

export class LiveBroadcaster {
  async broadcastFromFileToSegments(params: {
    inputVideoPath: string;
    outDir: string;
    sessionProof: PhoenixZeroLiveSessionProof;
    privateKeyB64Url: string;
    pqPrivateKeyB64Url?: string;
    pqPublicKeyB64Url?: string;
    onSegment?: (segment: { index: number; videoPath: string; proofPath: string; proof: PhoenixZeroLiveSegmentProof }) => void | Promise<void>;
  }): Promise<{
    sessionProofPath: string;
    segments: { index: number; videoPath: string; proofPath: string; proof: PhoenixZeroLiveSegmentProof }[];
  }> {
    return broadcastFromFileToSegments(params);
  }
}
