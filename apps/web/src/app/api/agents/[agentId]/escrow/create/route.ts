import { requireTenant } from '../../../../../../lib/tenant-auth';
import { computeAgentBalance } from '../../../../../../lib/settlement/balance';
import { createEscrow, getEscrowByIdempotencyKey } from '../../../../../../lib/escrow/store';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

type Body = {
  payeeAgentId?: string;
  currency?: string;
  amountCents?: number;
  memo?: string;

  idempotencyKey?: string;
  ttlMs?: number;

  sourceEventId?: string;
  nowMs?: number;
};

export async function POST(req: Request, ctx: { params: { agentId: string } }) {
  const auth = await requireTenant(req);
  if (!auth.ok) {
    return Response.json({ ok: false, reason: auth.reason }, { status: auth.status, headers: jsonUtf8Headers() });
  }

  const payerAgentId = String(ctx?.params?.agentId || '').trim();
  if (!payerAgentId) {
    return Response.json({ ok: false, reason: 'Missing agentId' }, { status: 400, headers: jsonUtf8Headers() });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const payeeAgentId = String(body?.payeeAgentId || '').trim();
  const currency = String(body?.currency || '').trim().toUpperCase() || 'USD';
  const amountCents = Math.max(0, Math.trunc(Number(body?.amountCents ?? 0)));
  const memo = String(body?.memo || '').trim() || undefined;

  const idempotencyKey = String(body?.idempotencyKey || '').trim() || undefined;
  const ttlMs = body && typeof body.ttlMs === 'number' && Number.isFinite(body.ttlMs) ? body.ttlMs : undefined;
  const sourceEventId = String(body?.sourceEventId || '').trim() || undefined;
  const nowMs = body && typeof body.nowMs === 'number' && Number.isFinite(body.nowMs) ? body.nowMs : undefined;

  if (!payeeAgentId) {
    return Response.json({ ok: false, reason: 'Missing payeeAgentId' }, { status: 400, headers: jsonUtf8Headers() });
  }
  if (!amountCents) {
    return Response.json({ ok: false, reason: 'Missing or invalid amountCents' }, { status: 400, headers: jsonUtf8Headers() });
  }

  if (idempotencyKey) {
    const existing = await getEscrowByIdempotencyKey(idempotencyKey);
    if (existing) {
      if (
        existing.tenantId !== auth.ctx.tenantId ||
        existing.payerAgentId !== payerAgentId ||
        existing.payeeAgentId !== payeeAgentId ||
        String(existing.currency || '').trim().toUpperCase() !== currency ||
        Math.max(0, Math.trunc(Number(existing.amountCents ?? 0))) !== amountCents
      ) {
        return Response.json(
          { ok: false, reason: 'IDEMPOTENCY_KEY_CONFLICT', escrowId: existing.escrowId },
          { status: 409, headers: jsonUtf8Headers() }
        );
      }
      return Response.json({ ok: true, escrow: existing }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
    }
  }

  const bal = await computeAgentBalance({ tenantId: auth.ctx.tenantId, agentId: payerAgentId, limit: 500 });
  const b = bal.balances.find((x) => String(x?.currency || '').trim().toUpperCase() === currency);
  const available = Math.max(0, Math.trunc(Number((b as any)?.availableCents ?? 0)));
  if (available < amountCents) {
    return Response.json(
      { ok: false, reason: 'INSUFFICIENT_FUNDS', availableCents: available, requestedCents: amountCents, currency },
      { status: 409, headers: jsonUtf8Headers() }
    );
  }

  const escrow = await createEscrow({
    tenantId: auth.ctx.tenantId,
    payerAgentId,
    payeeAgentId,
    currency,
    amountCents,
    memo,
    idempotencyKey,
    ttlMs,
    sourceEventId,
    lastUpdatedBy: 'agent',
    nowMs
  });

  if (!escrow) {
    return Response.json({ ok: false, reason: 'Unable to create escrow' }, { status: 400, headers: jsonUtf8Headers() });
  }

  return Response.json({ ok: true, escrow }, { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) });
}
