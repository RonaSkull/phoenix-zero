export type AgentReputation = {
  agentId: string;

  ledgerRootHashB64Url: string;
  reputationHashB64Url: string;

  score: number;

  paidProofs: number;

  slashing: {
    pendingCount: number;
    pendingCents: number;
    confirmedCount: number;
    confirmedCents: number;
    canceledCount: number;
    canceledCents: number;
  };

  escrow: {
    heldOutgoingCount: number;
    heldOutgoingCents: number;

    releasedOutgoingCount: number;
    releasedOutgoingCents: number;

    releasedIncomingCount: number;
    releasedIncomingCents: number;

    refundedCount: number;
    refundedCents: number;
    refundedExpiredCount: number;
  };
};
