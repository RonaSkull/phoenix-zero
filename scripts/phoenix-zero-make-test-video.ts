import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function getFfmpegPath(): Promise<string> {
  const mod = (await import('ffmpeg-static')) as unknown as { default?: unknown };
  const maybe = (mod as { default?: unknown }).default ?? mod;
  if (typeof maybe === 'string') return maybe;
  throw new Error('ffmpeg-static did not resolve to a path string');
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
      if (code !== 0) return reject(new Error(err || `ffmpeg exited with code ${code}`));
      resolve();
    });
  });
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val && !val.startsWith('--')) {
      args[key] = val;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const out = args.out ?? './out/video3s.mp4';
  const duration = args.duration ? Number(args.duration) : 3;
  const size = args.size ?? '720x1280';
  const fps = args.fps ? Number(args.fps) : 30;

  await mkdir(dirname(out), { recursive: true });

  const ffmpegPath = await getFfmpegPath();

  const cmdArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${duration}:size=${size}:rate=${fps}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=1000:duration=${duration}`,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
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
    out
  ];

  await run(ffmpegPath, cmdArgs);
  process.stdout.write(out + '\n');
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  process.stderr.write(message + '\n');
  process.exit(1);
});
