import { access, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { bytesToBase64Url } from '@phoenix-zero/core';
import { type PhoenixZeroAudioWatermarkConfig } from '@phoenix-zero/core/node';

export const runtime = 'nodejs';

function makeSinePcm(params: { seconds: number; sampleRate: number; hz: number }): Int16Array {
  const n = Math.max(1, Math.floor(params.seconds * params.sampleRate));
  const pcm = new Int16Array(n);
  const amp = 0.2;
  for (let i = 0; i < n; i++) {
    const t = i / params.sampleRate;
    const v = Math.sin(2 * Math.PI * params.hz * t) * amp;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }

  return pcm;
}

function wavFromPcmI16(params: { samples: Int16Array; sampleRate: number; channels: number }): Uint8Array {
  const bytesPerSample = 2;
  const blockAlign = params.channels * bytesPerSample;
  const byteRate = params.sampleRate * blockAlign;
  const dataSize = params.samples.length * bytesPerSample;
  const riffSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;

  buf.write('RIFF', o);
  o += 4;
  buf.writeUInt32LE(riffSize, o);
  o += 4;
  buf.write('WAVE', o);
  o += 4;

  buf.write('fmt ', o);
  o += 4;
  buf.writeUInt32LE(16, o);
  o += 4;
  buf.writeUInt16LE(1, o);
  o += 2;
  buf.writeUInt16LE(params.channels, o);
  o += 2;
  buf.writeUInt32LE(params.sampleRate, o);
  o += 4;
  buf.writeUInt32LE(byteRate, o);
  o += 4;
  buf.writeUInt16LE(blockAlign, o);
  o += 2;
  buf.writeUInt16LE(16, o);
  o += 2;

  buf.write('data', o);
  o += 4;
  buf.writeUInt32LE(dataSize, o);
  o += 4;

  for (let i = 0; i < params.samples.length; i++) {
    buf.writeInt16LE(params.samples[i] ?? 0, o);
    o += 2;
  }

  return new Uint8Array(buf);
}

function clampI16(n: number): number {
  if (n < -32768) return -32768;
  if (n > 32767) return 32767;
  return n;
}

function bytesToBits(bytes: Uint8Array, bitCount: number): number[] {
  const bits: number[] = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  return bits.slice(0, bitCount);
}

function embedWatermarkInPcm(params: { samples: Int16Array; cfg: PhoenixZeroAudioWatermarkConfig }): void {
  const cfg = params.cfg;
  const payloadBytes = new Uint8Array([0x13, 0x37, 0xc0, 0xde]);
  const bits = bytesToBits(payloadBytes.slice(0, cfg.payloadByteLength), cfg.bitCount);

  const windowSamples = Math.max(1, Math.floor((cfg.sampleRate * cfg.windowMs) / 1000));
  const rp = Math.max(1, Math.floor(cfg.repeatPerBit));
  const requiredWindows = cfg.startWindow + cfg.bitCount * rp * 2;
  const requiredSamples = requiredWindows * windowSamples;
  if (params.samples.length < requiredSamples) throw new Error('audio too short for watermark');

  const delta = Math.max(0, Math.min(0.2, cfg.gainDelta));

  for (let i = 0; i < cfg.bitCount; i++) {
    const bit = bits[i] ?? 0;
    for (let r = 0; r < rp; r++) {
      const baseWindow = cfg.startWindow + (i * rp + r) * 2;
      const w0 = baseWindow;
      const w1 = baseWindow + 1;

      const gain0 = bit === 1 ? 1 - delta : 1 + delta;
      const gain1 = bit === 1 ? 1 + delta : 1 - delta;

      const s0 = w0 * windowSamples;
      const s1 = w1 * windowSamples;

      for (let j = 0; j < windowSamples; j++) {
        const a = s0 + j;
        const b = s1 + j;
        params.samples[a] = clampI16(Math.round((params.samples[a] ?? 0) * gain0));
        params.samples[b] = clampI16(Math.round((params.samples[b] ?? 0) * gain1));
      }
    }
  }
}

function demoConfig(): { cfg: PhoenixZeroAudioWatermarkConfig; payloadBytes: Uint8Array } {
  const payloadBytes = new Uint8Array([0x13, 0x37, 0xc0, 0xde]);
  const cfg: PhoenixZeroAudioWatermarkConfig = {
    payloadB64Url: bytesToBase64Url(payloadBytes),
    payloadByteLength: 4,
    bitCount: 32,
    sampleRate: 16000,
    windowMs: 25,
    repeatPerBit: 2,
    startWindow: 10,
    gainDelta: 0.08
  };
  return { cfg, payloadBytes };
}

async function pickAudioPath(): Promise<string | null> {
  const v2 = resolve(process.cwd(), '..', '..', 'platform-tests', 'demo-assets', 'v2', 'audio-wm.wav');
  try {
    await access(v2);
    return v2;
  } catch {
    return null;
  }
}

async function buildWatermarkedWavBytes(): Promise<Uint8Array> {
  const { cfg } = demoConfig();
  const pcm = makeSinePcm({ seconds: 6, sampleRate: cfg.sampleRate, hz: 440 });
  embedWatermarkInPcm({ samples: pcm, cfg });
  return wavFromPcmI16({ samples: pcm, sampleRate: cfg.sampleRate, channels: 1 });
}

export async function GET() {
  const audioPath = await pickAudioPath();
  const bytes = audioPath ? await readFile(audioPath) : Buffer.from(await buildWatermarkedWavBytes());

  return new Response(bytes, {
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-store'
    }
  });
}

export async function HEAD() {
  try {
    const audioPath = await pickAudioPath();
    if (!audioPath) {
      const res = await GET();
      if (!res.ok) return new Response(null, { status: res.status });
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Cache-Control': 'no-store'
        }
      });
    }

    const info = await stat(audioPath);
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(info.size),
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
