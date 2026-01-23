import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';

export type FraudAuditEvent = {
  at: string;
  kind: string;
  decision?: string;
  reasons?: string[];
  creatorId?: string;
  proofEd25519PublicKeyB64Url?: string;
  proofPqPublicKeyB64Url?: string;
  videoUrl?: string;
  proofUrl?: string;
  ip?: string;
};

function auditPath(): string {
  return join(phoenixZeroTmpDir(), 'fraud-events.jsonl');
}

export async function appendFraudEvent(event: FraudAuditEvent): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  const line = JSON.stringify(event) + '\n';
  await appendFile(auditPath(), line, 'utf8');
}
