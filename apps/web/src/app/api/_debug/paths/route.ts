import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { requireAdminToken } from '../../../../lib/tenant-auth';
import { phoenixZeroTmpDir } from '../../../../lib/tmp-dir';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

async function fileInfo(path: string): Promise<{ path: string; exists: boolean; sizeBytes?: number; mtimeMs?: number }> {
  try {
    const s = await stat(path);
    return { path, exists: true, sizeBytes: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return { path, exists: false };
  }
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json({ ok: false, reason: 'Not found' }, { status: 404, headers: jsonUtf8Headers() });
  }

  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const dir = phoenixZeroTmpDir();

  const files = await Promise.all([
    fileInfo(join(dir, 'payment-intents.json')),
    fileInfo(join(dir, 'payment-proofs.json')),
    fileInfo(join(dir, 'payment-webhook-events.json')),
    fileInfo(join(dir, 'billing-accounts.json')),
    fileInfo(join(dir, 'tenants.json'))
  ]);

  return Response.json(
    {
      ok: true,
      tmp: {
        phoenixZeroTmpDir: dir,
        osTmpDir: tmpdir(),
        env: {
          PHOENIX_ZERO_TMP_DIR: String(process.env.PHOENIX_ZERO_TMP_DIR || ''),
          TEMP: String(process.env.TEMP || ''),
          TMP: String(process.env.TMP || ''),
          NODE_ENV: String(process.env.NODE_ENV || '')
        }
      },
      files
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
