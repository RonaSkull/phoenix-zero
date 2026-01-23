import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function phoenixZeroTmpDir(): string {
  const env = (process.env.PHOENIX_ZERO_TMP_DIR || '').trim();
  if (env) return env;
  return join(tmpdir(), 'phoenix-zero', 'tmp');
}
