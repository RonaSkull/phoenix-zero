import { phoenixZeroStableStringify, sha256B64Url } from '@phoenix-zero/core';

import { computeAgentLedger } from '../agent-ledger';
import { listSlashesByAgent } from '../slashing/store';
import { listEscrowsByAgent } from '../escrow/store';

import type { AgentReputation } from './types';

function sha256Utf8B64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return sha256B64Url(bytes);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function computeAgentReputation(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<AgentReputation> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 500))));

  const ledger = await computeAgentLedger({ tenantId, agentId, limit });
  const slashes = await listSlashesByAgent({ tenantId, agentId, limit });
  const escrows = await listEscrowsByAgent({ tenantId, agentId, limit });

  let pendingCount = 0;
  let pendingCents = 0;
  let confirmedCount = 0;
  let confirmedCents = 0;
  let canceledCount = 0;
  let canceledCents = 0;

  for (const s of slashes) {
    const status = String((s as any)?.status || '').trim();
    const amt = Math.max(0, Math.trunc(Number((s as any)?.penaltyCents ?? 0)));
    if (status === 'pending') {
      pendingCount += 1;
      pendingCents += amt;
    } else if (status === 'confirmed') {
      confirmedCount += 1;
      confirmedCents += amt;
    } else if (status === 'canceled') {
      canceledCount += 1;
      canceledCents += amt;
    }
  }

  let heldOutgoingCount = 0;
  let heldOutgoingCents = 0;

  let releasedOutgoingCount = 0;
  let releasedOutgoingCents = 0;

  let releasedIncomingCount = 0;
  let releasedIncomingCents = 0;

  let refundedCount = 0;
  let refundedCents = 0;
  let refundedExpiredCount = 0;

  for (const e of escrows) {
    const status = String((e as any)?.status || '').trim();
    const amt = Math.max(0, Math.trunc(Number((e as any)?.amountCents ?? 0)));
    const payerAgentId = String((e as any)?.payerAgentId || '').trim();
    const payeeAgentId = String((e as any)?.payeeAgentId || '').trim();

    if (status === 'held') {
      if (payerAgentId === agentId) {
        heldOutgoingCount += 1;
        heldOutgoingCents += amt;
      }
    } else if (status === 'released') {
      if (payerAgentId === agentId) {
        releasedOutgoingCount += 1;
        releasedOutgoingCents += amt;
      }
      if (payeeAgentId === agentId) {
        releasedIncomingCount += 1;
        releasedIncomingCents += amt;
      }
    } else if (status === 'refunded') {
      refundedCount += 1;
      refundedCents += amt;
      if (String((e as any)?.refundReason || '').trim() === 'expired') refundedExpiredCount += 1;
    }
  }

  const paidProofs = Math.max(0, Math.trunc(Number((ledger as any)?.paidProofs ?? 0)));

  const base = clampInt(paidProofs * 10, 0, 1000);
  const penalty =
    confirmedCount * 200 +
    pendingCount * 50 +
    clampInt(Math.floor(confirmedCents / 1000), 0, 500) +
    clampInt(Math.floor(pendingCents / 1000), 0, 250) +
    refundedExpiredCount * 5;

  const score = clampInt(base - penalty, 0, 1000);

  const repInput = {
    v: 1,
    agentId,
    ledgerRootHashB64Url: String((ledger as any)?.rootHashB64Url || ''),
    paidProofs,
    slashing: { pendingCount, pendingCents, confirmedCount, confirmedCents, canceledCount, canceledCents },
    escrow: {
      heldOutgoingCount,
      heldOutgoingCents,
      releasedOutgoingCount,
      releasedOutgoingCents,
      releasedIncomingCount,
      releasedIncomingCents,
      refundedCount,
      refundedCents,
      refundedExpiredCount
    },
    score
  };

  const reputationHashB64Url = sha256Utf8B64Url(phoenixZeroStableStringify(repInput));

  return {
    agentId,
    ledgerRootHashB64Url: String((ledger as any)?.rootHashB64Url || ''),
    reputationHashB64Url,
    score,
    paidProofs,
    slashing: { pendingCount, pendingCents, confirmedCount, confirmedCents, canceledCount, canceledCents },
    escrow: {
      heldOutgoingCount,
      heldOutgoingCents,
      releasedOutgoingCount,
      releasedOutgoingCents,
      releasedIncomingCount,
      releasedIncomingCents,
      refundedCount,
      refundedCents,
      refundedExpiredCount
    }
  };
}
