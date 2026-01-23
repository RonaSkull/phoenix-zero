import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type TemporalFingerprintParams = {
  fps: number;
  scale: number;
  targetLen: number;
  quant: number;
};

function resample(samples: number[], targetLen: number): number[] {
  if (targetLen <= 0) return [];
  if (samples.length === 0) return Array.from({ length: targetLen }, () => 0);
  if (samples.length === targetLen) return samples.slice();
  if (targetLen === 1) return [samples[0] ?? 0];

  const out: number[] = [];
  const maxIdx = samples.length - 1;

  for (let i = 0; i < targetLen; i++) {
    const t = (i * maxIdx) / (targetLen - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, maxIdx);
    const frac = t - i0;
    const a = samples[i0] ?? 0;
    const b = samples[i1] ?? 0;
    out.push(a * (1 - frac) + b * frac);
  }

  return out;
}

function quantize(samples: number[], quant: number): number[] {
  const q = quant <= 0 ? 1 : quant;
  return samples.map((v) => {
    const clamped = Math.max(0, Math.min(255, v));
    return Math.round(clamped / q);
  });
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

function runFfmpegCollectYavg(params: { videoPath: string; fps: number; scale: number }): Promise<number[]> {
  return new Promise(async (resolve, reject) => {
    const ffmpegPath = await getFfmpegPath();

    const vf = `fps=${params.fps},scale=${params.scale}:${params.scale}:flags=bicubic,format=gray,signalstats,metadata=print:file=-`;

    const child = spawn(
      ffmpegPath,
      ['-hide_banner', '-loglevel', 'error', '-i', params.videoPath, '-an', '-vf', vf, '-f', 'null', '-'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let out = '';
    let err = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (d: string) => {
      out += String(d);
    });

    child.stderr.on('data', (d: string) => {
      err += String(d);
    });

    child.on('error', (e: Error) => reject(e));

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(err || `ffmpeg exited with code ${code}`));
        return;
      }

      const lines = out.split(/\r?\n/);
      const samples: number[] = [];
      for (const line of lines) {
        const m = line.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
        if (!m) continue;
        const v = m[1];
        if (!v) continue;
        samples.push(parseFloat(v));
      }

      if (samples.length === 0) {
        reject(new Error('No temporal samples extracted (YAVG).'));
        return;
      }

      resolve(samples);
    });
  });
}

export async function extractTemporalFingerprintFromVideoPath(params: {
  videoPath: string;
  cfg: TemporalFingerprintParams;
}): Promise<{ cfg: TemporalFingerprintParams; samples: number[] }> {
  const raw = await runFfmpegCollectYavg({
    videoPath: params.videoPath,
    fps: params.cfg.fps,
    scale: params.cfg.scale
  });

  const rs = resample(raw, params.cfg.targetLen);
  const q = quantize(rs, params.cfg.quant);

  return { cfg: params.cfg, samples: q };
}
