import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { phoenixZeroTmpDir } from './tmp-dir';

export type UsageOp =
  | 'payment_received'
  | 'stamp_video'
  | 'stamp_video_watermarked'
  | 'stamp_image'
  | 'stamp_image_watermarked'
  | 'stamp_audio_watermarked'
  | 'verify_video'
  | 'verify_video_watermarked'
  | 'verify_image'
  | 'verify_image_watermarked'
  | 'verify_audio'
  | 'verify_by_url'
  | 'verify_image_by_url'
  | 'verify_image_watermarked_by_url'
  | 'verify_audio_by_url'
  | 'time_anchor_create'
  | 'time_anchor_get'
  | 'public_anchor_get'
  | 'share_link_create'
  | 'pricing_quote'
  | 'pricing_preview'
  | 'live_start'
  | 'live_append'
  | 'live_finish'
  | 'live_cancel'
  | 'live_get'
  | 'live_telemetry';

export type UsageLedgerEntry = {
  at: string;
  tenantId: string | null;
  op: UsageOp;
  ok: boolean;
  httpStatus: number;
  durationMs: number;
  requestPath: string;
  valueEvent?: string;
  product?: string;
  plan?: string;
  authenticityLevel?: string;
  units?: number;
  pilUnits?: number;
  finalPriceCents?: number;
  currency?: string;
  contextSnapshot?: Record<string, any>;
  meta?: Record<string, any>;
};

function normalizeKey(x: unknown): string {
  return String(x || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function estimatePilUnits(params: {
  op?: UsageOp | string;
  product?: string;
  authenticityLevel?: string;
  sourceVector?: string;
  units?: number;
  durationSeconds?: number;
}): number {
  const units = clampInt(Number(params.units ?? 1), 1, 1_000_000);

  const product = normalizeKey(params.product);
  const op = normalizeKey(params.op);

  let base = 0;
  if (product === 'video_protection') base = 18;
  else if (product === 'image_protection') base = 8;
  else if (product === 'audio_protection') base = 10;
  else if (product === 'live_protection') base = 30;
  else if (product === 'document_protection') base = 22;

  if (base <= 0) {
    if (op.includes('stamp_video')) base = 18;
    else if (op.includes('verify_video')) base = 12;
    else if (op.includes('stamp_image')) base = 8;
    else if (op.includes('verify_image')) base = 6;
    else if (op.includes('verify_audio') || op.includes('stamp_audio')) base = 8;
    else if (op.startsWith('live_')) base = 30;
    else if (op === 'pricing_preview' || op === 'pricing_quote') base = 6;
    else if (op.includes('time_anchor')) base = 4;
    else if (op.includes('share_link')) base = 2;
    else base = 3;
  }

  const auth = normalizeKey(params.authenticityLevel);
  const mAuth = auth === 'forensic' || auth === 'pericial' || auth === 'judicial' ? 2.0 : auth === 'legal' ? 1.5 : auth === 'commercial' ? 1.2 : 1.0;

  const vec = String(params.sourceVector || '').trim().toUpperCase();
  const mVec = vec === 'HYBRID' ? 1.8 : vec === 'LIVE' ? 1.1 : 1.0;

  const durationSecondsRaw = Number(params.durationSeconds ?? NaN);
  const durationSeconds = Number.isFinite(durationSecondsRaw) ? Math.max(0, Math.trunc(durationSecondsRaw)) : 0;
  const durationFactor = (() => {
    if (durationSeconds <= 0) return 1;
    const mins = durationSeconds / 60;
    const t = mins / 15;
    return Math.max(0.25, Math.min(10, t));
  })();

  const durationApplies = product === 'live_protection' || op.startsWith('live_') || vec === 'LIVE' || vec === 'HYBRID';
  const mDur = durationApplies ? durationFactor : 1;

  const pil = Math.max(1, Math.trunc(base * mAuth * mVec * mDur * units));
  return pil;
}

function safeRequestPath(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return '';
  }
}

function ledgerPath(): string {
  return join(phoenixZeroTmpDir(), 'usage-ledger.jsonl');
}

export async function appendUsage(entry: UsageLedgerEntry): Promise<void> {
  await mkdir(phoenixZeroTmpDir(), { recursive: true });
  await appendFile(ledgerPath(), JSON.stringify(entry) + '\n', 'utf8');
}

export async function recordUsage(params: {
  req: Request;
  tenantId: string | null;
  op: UsageOp;
  ok: boolean;
  httpStatus: number;
  startedAtMs: number;
  valueEvent?: string;
  product?: string;
  plan?: string;
  authenticityLevel?: string;
  units?: number;
  pilUnits?: number;
  finalPriceCents?: number;
  currency?: string;
  contextSnapshot?: Record<string, any>;
  meta?: Record<string, any>;
}): Promise<void> {
  const durationMs = Math.max(0, Date.now() - params.startedAtMs);
  const ctx = params.contextSnapshot;
  const productFromCtx = typeof ctx?.product === 'string' ? (ctx.product as string) : undefined;
  const authFromCtx = typeof ctx?.authenticityLevel === 'string' ? (ctx.authenticityLevel as string) : undefined;
  const unitsFromCtx = typeof ctx?.units === 'number' ? (ctx.units as number) : undefined;
  const sourceVectorFromCtx = typeof ctx?.sourceVector === 'string' ? (ctx.sourceVector as string) : undefined;
  const durationSecondsFromCtx = typeof ctx?.durationSeconds === 'number' ? (ctx.durationSeconds as number) : undefined;

  const derivedPilUnits =
    typeof params.pilUnits === 'number' && Number.isFinite(params.pilUnits)
      ? Math.max(1, Math.trunc(params.pilUnits))
      : estimatePilUnits({
          op: params.op,
          product: params.product || productFromCtx,
          authenticityLevel: params.authenticityLevel || authFromCtx,
          sourceVector: sourceVectorFromCtx,
          units: params.units ?? unitsFromCtx,
          durationSeconds: durationSecondsFromCtx
        });

  const entry: UsageLedgerEntry = {
    at: new Date().toISOString(),
    tenantId: params.tenantId,
    op: params.op,
    ok: params.ok,
    httpStatus: params.httpStatus,
    durationMs,
    requestPath: safeRequestPath(params.req),
    valueEvent: params.valueEvent,
    product: params.product,
    plan: params.plan,
    authenticityLevel: params.authenticityLevel,
    units: params.units,
    pilUnits: derivedPilUnits,
    finalPriceCents: params.finalPriceCents,
    currency: params.currency,
    contextSnapshot: params.contextSnapshot,
    meta: params.meta
  };
  try {
    await appendUsage(entry);
  } catch {
  }
}

export async function readUsageLedgerEntries(): Promise<UsageLedgerEntry[]> {
  try {
    const txt = await readFile(ledgerPath(), 'utf8');
    const lines = txt.split(/\r?\n/);
    const out: UsageLedgerEntry[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const parsed = JSON.parse(t) as UsageLedgerEntry;
        if (!parsed || typeof parsed !== 'object') continue;
        out.push(parsed);
      } catch {
      }
    }
    return out;
  } catch {
    return [];
  }
}
