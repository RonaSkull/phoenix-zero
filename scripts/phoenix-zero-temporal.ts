import { spawn } from 'node:child_process';

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
  const mod = (await import('ffmpeg-static')) as unknown as { default?: unknown };
  const maybe = (mod as { default?: unknown }).default ?? mod;
  if (typeof maybe === 'string') return maybe;
  throw new Error('ffmpeg-static did not resolve to a path string');
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

    child.stdout.on('data', (d: string | Buffer) => {
      out += String(d);
    });

    child.stderr.on('data', (d: string | Buffer) => {
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
        samples.push(parseFloat(m[1]));
      }

      if (samples.length === 0) {
        reject(new Error('No temporal samples extracted (YAVG).'));
        return;
      }

      resolve(samples);
    });
  });
}

export async function extractTemporalFingerprint(params: {
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
