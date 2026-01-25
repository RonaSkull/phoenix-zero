import { listSettlementsByAgent } from './store';

import { listSlashesByAgent } from '../slashing/store';

import { listEscrowsByAgent } from '../escrow/store';

export type CurrencyBalance = {
  currency: string;
  availableCents: number;
  heldCents: number;
  pendingCents: number;
  revertedCents: number;
  expiredCents: number;
  pendingSlashCents: number;
  slashedCents: number;
};

export async function computeAgentBalance(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<{ agentId: string; balances: CurrencyBalance[] }> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 500))));

  const settlements = await listSettlementsByAgent({ tenantId, agentId, limit });
  const slashes = await listSlashesByAgent({ tenantId, agentId, limit });
  const escrows = await listEscrowsByAgent({ tenantId, agentId, limit });

  const byCurrency: Record<string, CurrencyBalance> = {};
  for (const s of settlements) {
    const currency = String(s.currency || '').trim() || 'USD';
    if (!byCurrency[currency]) {
      byCurrency[currency] = {
        currency,
        availableCents: 0,
        heldCents: 0,
        pendingCents: 0,
        revertedCents: 0,
        expiredCents: 0,
        pendingSlashCents: 0,
        slashedCents: 0
      };
    }

    const amt = Math.max(0, Math.trunc(Number(s.amountCents ?? 0)));
    if (s.status === 'settled') byCurrency[currency].availableCents += amt;
    else if (s.status === 'pending') byCurrency[currency].pendingCents += amt;
    else if (s.status === 'reverted') byCurrency[currency].revertedCents += amt;
    else if (s.status === 'expired') byCurrency[currency].expiredCents += amt;
    else if (s.status === 'blocked') byCurrency[currency].heldCents += amt;
  }

  const escrowHeldOutgoingByCurrency: Record<string, number> = {};
  const escrowReleasedOutgoingByCurrency: Record<string, number> = {};

  for (const e of escrows) {
    const currency = String((e as any)?.currency || '').trim() || 'USD';
    if (!byCurrency[currency]) {
      byCurrency[currency] = {
        currency,
        availableCents: 0,
        heldCents: 0,
        pendingCents: 0,
        revertedCents: 0,
        expiredCents: 0,
        pendingSlashCents: 0,
        slashedCents: 0
      };
    }

    const amt = Math.max(0, Math.trunc(Number((e as any)?.amountCents ?? 0)));
    const status = String((e as any)?.status || '').trim();
    const payerAgentId = String((e as any)?.payerAgentId || '').trim();
    const payeeAgentId = String((e as any)?.payeeAgentId || '').trim();

    if (status === 'held') {
      if (payerAgentId === agentId) {
        byCurrency[currency].heldCents += amt;
        escrowHeldOutgoingByCurrency[currency] = (escrowHeldOutgoingByCurrency[currency] || 0) + amt;
      }
    } else if (status === 'released') {
      if (payerAgentId === agentId) {
        escrowReleasedOutgoingByCurrency[currency] = (escrowReleasedOutgoingByCurrency[currency] || 0) + amt;
      }
      if (payeeAgentId === agentId) {
        byCurrency[currency].availableCents += amt;
      }
    }
  }

  for (const e of slashes) {
    const currency = String((e as any)?.currency || '').trim() || 'USD';
    if (!byCurrency[currency]) {
      byCurrency[currency] = {
        currency,
        availableCents: 0,
        heldCents: 0,
        pendingCents: 0,
        revertedCents: 0,
        expiredCents: 0,
        pendingSlashCents: 0,
        slashedCents: 0
      };
    }

    const amt = Math.max(0, Math.trunc(Number((e as any)?.penaltyCents ?? 0)));
    const status = String((e as any)?.status || '').trim();
    if (status === 'pending') {
      byCurrency[currency].pendingSlashCents += amt;
      byCurrency[currency].heldCents += amt;
    } else if (status === 'confirmed') {
      byCurrency[currency].slashedCents += amt;
    }
  }

  for (const b of Object.values(byCurrency)) {
    const reserve =
      Math.max(0, Math.trunc(Number(b.pendingSlashCents ?? 0))) +
      Math.max(0, Math.trunc(Number(b.slashedCents ?? 0))) +
      Math.max(0, Math.trunc(Number(escrowHeldOutgoingByCurrency[b.currency] ?? 0))) +
      Math.max(0, Math.trunc(Number(escrowReleasedOutgoingByCurrency[b.currency] ?? 0)));
    b.availableCents = Math.max(0, Math.trunc(Number(b.availableCents ?? 0)) - reserve);
  }

  const balances = Object.values(byCurrency).sort((a, b) => a.currency.localeCompare(b.currency));
  return { agentId, balances };
}
