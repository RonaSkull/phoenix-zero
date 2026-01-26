import { requireAdminToken } from '../../../../../lib/tenant-auth';
import { ensurePendingSlashForProof } from '../../../../../lib/slashing/store';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type Body = {
  proofId?: string;
  reason?: 'invalid_signature' | 'replay_attack' | 'antifraud_block' | 'sla_violation' | 'ledger_inconsistency';
  penaltyCents?: number;
  idempotencyKey?: string;
  contestWindowMs?: number;
  sourceEventId?: string;
  nowMs?: number;
};

export async function POST(req: Request) {
  const admin = requireAdminToken(req);
  if (!admin.ok) {
    return Response.json({ ok: false, reason: admin.reason }, { status: admin.status, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const proofId = String(body?.proofId || '').trim();
  const reason = String(body?.reason || '').trim() as any;
  const penaltyCents = body && typeof body.penaltyCents === 'number' && Number.isFinite(body.penaltyCents) ? body.penaltyCents : undefined;
  const idempotencyKey = String(body?.idempotencyKey || '').trim() || undefined;
  const contestWindowMs =
    body && typeof body.contestWindowMs === 'number' && Number.isFinite(body.contestWindowMs) ? body.contestWindowMs : undefined;
  const sourceEventId = String(body?.sourceEventId || '').trim() || undefined;
  const nowMs = body && typeof body.nowMs === 'number' && Number.isFinite(body.nowMs) ? body.nowMs : undefined;

  if (!proofId) {
    return Response.json({ ok: false, reason: 'Missing proofId' }, { status: 400, headers: jsonUtf8Headers() });
  }
  if (!reason) {
    return Response.json({ ok: false, reason: 'Missing reason' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const out = await ensurePendingSlashForProof({
    proofId,
    reason,
    penaltyCents,
    idempotencyKey,
    contestWindowMs,
    sourceEventId,
    lastUpdatedBy: 'admin',
    nowMs
  });

  if (!out) {
    return Response.json({ ok: false, reason: 'Unable to create slash (proof missing or invalid input)' }, { status: 400, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true, slash: out }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
