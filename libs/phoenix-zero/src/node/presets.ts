import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PhoenixZeroWatermarkConfig, PhoenixZeroWatermarkRoi } from './watermark';
import type { TemporalFingerprintParams } from './temporal';

export type PhoenixZeroPlatform = 'whatsapp' | 'tiktok' | 'instagram' | 'youtube' | 'linkedin';

export type PhoenixZeroWatermarkVerifyHints = {
  yThreshold?: number;
  searchStartFrameWindow?: number;
};

export type PhoenixZeroWatermarkedPreset = {
  id: string;
  platform?: PhoenixZeroPlatform;
  durationSeconds?: number;
  watermark: Omit<PhoenixZeroWatermarkConfig, 'payloadB64Url'>;
  watermarkVerify?: PhoenixZeroWatermarkVerifyHints;
  temporal: TemporalFingerprintParams;
  madThreshold: number;
};

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

export async function probeVideoDurationSeconds(videoPath: string): Promise<number | null> {
  const ffmpegPath = await getFfmpegPath();

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-i', videoPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d: string) => (err += String(d)));
    child.on('error', (e: Error) => reject(e));
    child.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return resolve(null);
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      const ss = Number(m[3]);
      if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return resolve(null);
      resolve(hh * 3600 + mm * 60 + ss);
    });
  });
}

function defaultRois(): PhoenixZeroWatermarkRoi[] {
  return [
    { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
    { x: 0.1, y: 0.1, w: 0.35, h: 0.35 },
    { x: 0.55, y: 0.55, w: 0.35, h: 0.35 }
  ];
}

function durationBucket(
  durationSeconds: number | null | undefined
): '3-6s' | '7-10s' | '11-15s' | '16-29s' | '30-35s' | '35-45s' | '45-60s' | '60-90s' {
  const d = durationSeconds ?? 0;
  if (d <= 6) return '3-6s';
  if (d <= 10) return '7-10s';
  if (d <= 15) return '11-15s';
  if (d <= 29) return '16-29s';
  if (d <= 35) return '30-35s';
  if (d <= 45) return '35-45s';
  if (d <= 60) return '45-60s';
  return '60-90s';
}

function basePresetForBucket(bucket: ReturnType<typeof durationBucket>): {
  watermark: Omit<PhoenixZeroWatermarkConfig, 'payloadB64Url'>;
  temporal: TemporalFingerprintParams;
  madThreshold: number;
} {
  if (bucket === '3-6s') {
    return {
      watermark: {
        payloadByteLength: 2,
        bitCount: 16,
        startFrame: 6,
        frameInterval: 3,
        repeatPerBit: 2,
        brightnessDelta: 0.03,
        rois: defaultRois()
      },
      temporal: { fps: 8, scale: 64, targetLen: 24, quant: 4 },
      madThreshold: 12
    };
  }

  if (bucket === '7-10s') {
    return {
      watermark: {
        payloadByteLength: 4,
        bitCount: 32,
        startFrame: 6,
        frameInterval: 3,
        repeatPerBit: 2,
        brightnessDelta: 0.03,
        rois: defaultRois()
      },
      temporal: { fps: 8, scale: 64, targetLen: 30, quant: 4 },
      madThreshold: 12
    };
  }

  if (bucket === '11-15s') {
    return {
      watermark: {
        payloadByteLength: 6,
        bitCount: 48,
        startFrame: 6,
        frameInterval: 3,
        repeatPerBit: 2,
        brightnessDelta: 0.03,
        rois: defaultRois()
      },
      temporal: { fps: 8, scale: 64, targetLen: 36, quant: 4 },
      madThreshold: 12
    };
  }

  if (bucket === '16-29s') {
    return {
      watermark: {
        payloadByteLength: 8,
        bitCount: 64,
        startFrame: 6,
        frameInterval: 3,
        repeatPerBit: 2,
        brightnessDelta: 0.03,
        rois: defaultRois()
      },
      temporal: { fps: 8, scale: 64, targetLen: 48, quant: 4 },
      madThreshold: 12
    };
  }

  if (bucket === '30-35s') {
    return {
      watermark: {
        payloadByteLength: 12,
        bitCount: 96,
        startFrame: 6,
        frameInterval: 2,
        repeatPerBit: 1,
        brightnessDelta: 0.03,
        rois: defaultRois()
      },
      temporal: { fps: 8, scale: 64, targetLen: 60, quant: 4 },
      madThreshold: 12
    };
  }

  if (bucket === '35-45s') {
    return {
      watermark: {
        payloadByteLength: 16,
        bitCount: 128,
        startFrame: 6,
        frameInterval: 2,
        repeatPerBit: 1,
        brightnessDelta: 0.03,
        rois: defaultRois()
      },
      temporal: { fps: 8, scale: 64, targetLen: 72, quant: 4 },
      madThreshold: 12
    };
  }

  if (bucket === '45-60s') {
    return {
      watermark: {
        payloadByteLength: 20,
        bitCount: 160,
        startFrame: 6,
        frameInterval: 2,
        repeatPerBit: 1,
        brightnessDelta: 0.03,
        rois: defaultRois()
      },
      temporal: { fps: 8, scale: 64, targetLen: 84, quant: 4 },
      madThreshold: 12
    };
  }

  return {
    watermark: {
      payloadByteLength: 24,
      bitCount: 192,
      startFrame: 6,
      frameInterval: 2,
      repeatPerBit: 1,
      brightnessDelta: 0.03,
      rois: defaultRois()
    },
    temporal: { fps: 8, scale: 64, targetLen: 96, quant: 4 },
    madThreshold: 12
  };
}

export async function selectWatermarkedPreset(params: {
  videoPath: string;
  platform?: PhoenixZeroPlatform;
  presetId?: string;
}): Promise<PhoenixZeroWatermarkedPreset> {
  const durationSeconds = await probeVideoDurationSeconds(params.videoPath);
  const bucket = durationBucket(durationSeconds);

  const base = basePresetForBucket(bucket);

  const platform = params.platform;
  const id = params.presetId ?? (platform ? `${platform}:${bucket}` : `default:${bucket}`);

  if (platform === 'whatsapp') {
    const watermark =
      bucket === '3-6s'
        ? {
            ...base.watermark,
            repeatPerBit: Math.min(2, Math.max(1, base.watermark.frameInterval - 1)),
            brightnessDelta: Math.max(base.watermark.brightnessDelta, 0.04)
          }
        : base.watermark;

    return {
      id,
      platform,
      durationSeconds: durationSeconds ?? undefined,
      watermark,
      watermarkVerify: { yThreshold: 0.25, searchStartFrameWindow: 240 },
      temporal: base.temporal,
      madThreshold: base.madThreshold
    };
  }

  if (platform === 'instagram') {
    return {
      id,
      platform,
      durationSeconds: durationSeconds ?? undefined,
      watermark: base.watermark,
      watermarkVerify: { yThreshold: 0.2, searchStartFrameWindow: 24 },
      temporal: base.temporal,
      madThreshold: base.madThreshold
    };
  }

  return {
    id,
    platform,
    durationSeconds: durationSeconds ?? undefined,
    watermark: base.watermark,
    temporal: base.temporal,
    madThreshold: base.madThreshold
  };
}
