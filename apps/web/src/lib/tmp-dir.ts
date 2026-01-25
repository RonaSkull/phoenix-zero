import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let cachedTmpDir: string | null = null;

export function phoenixZeroTmpDir(): string {
  if (cachedTmpDir) return cachedTmpDir;
  const env = (process.env.PHOENIX_ZERO_TMP_DIR || '').trim();
  const fallback = join(tmpdir(), 'phoenix-zero', 'tmp');
  const dir = env || fallback;

  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    if (env) throw e;
    mkdirSync(fallback, { recursive: true });
    cachedTmpDir = fallback;
    return cachedTmpDir;
  }

  cachedTmpDir = dir;
  return cachedTmpDir;
}

export function ensurePhoenixZeroTmpDir(): string {
  return phoenixZeroTmpDir();
}
