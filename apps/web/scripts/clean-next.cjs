const path = require('path');
const fs = require('fs/promises');

const distDir = process.platform === 'win32' ? '.next-win' : '.next';
const nextDir = path.join(__dirname, '..', distDir);

function isWindowsLockedTraceError(err) {
  if (!err || process.platform !== 'win32') return false;
  if (err.code !== 'EPERM' && err.code !== 'EACCES' && err.code !== 'EBUSY') return false;

  const p = String(err.path || '');
  if (!p) return false;

  const tracePath = path.join(nextDir, 'trace');
  return p === tracePath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rmDirWithRetries(dir, opts) {
  const { attempts, baseDelayMs } = opts;
  let lastErr = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (err && err.code === 'ENOENT') return;

      lastErr = err;
      const retryable = err && ['EPERM', 'EACCES', 'ENOTEMPTY', 'EBUSY'].includes(err.code);
      if (!retryable) throw err;

      await sleep(baseDelayMs * (i + 1));
    }
  }

  if (lastErr) throw lastErr;
}

(async () => {
  try {
    await rmDirWithRetries(nextDir, { attempts: 10, baseDelayMs: 150 });
  } catch (err) {
    if (!isWindowsLockedTraceError(err)) throw err;
    console.warn('[clean-next] warning: Windows file lock prevented deleting .next trace; continuing:', err.path);
  }

  if (process.platform === 'win32') {
    const legacyNextDir = path.join(__dirname, '..', '.next');
    try {
      await rmDirWithRetries(legacyNextDir, { attempts: 2, baseDelayMs: 50 });
    } catch {
      // ignore
    }
  }
})().catch((err) => {
  console.error('[clean-next] failed to remove .next:', err);
  process.exitCode = 1;
});
