export type EscrowStatus = 'held' | 'released' | 'refunded';

export type EscrowRefundReason = 'manual' | 'expired';

export type EscrowEntry = {
  escrowId: string;
  idempotencyKey: string;

  tenantId: string;
  payerAgentId: string;
  payeeAgentId: string;

  currency: string;
  amountCents: number;
  memo?: string;

  payerLedgerRootHashB64Url: string;

  status: EscrowStatus;
  expiresAt: string;

  releasedAt?: string;
  refundedAt?: string;
  refundReason?: EscrowRefundReason;

  version: number;
  sourceEventId?: string;
  lastUpdatedBy: string;

  createdAt: string;
  updatedAt: string;
};

export type EscrowDb = {
  version: 1;
  entries: Record<string, EscrowEntry>;
  byIdempotencyKey: Record<string, string>;
};
