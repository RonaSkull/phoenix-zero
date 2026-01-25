export type SlashReason =
  | 'invalid_signature'
  | 'replay_attack'
  | 'antifraud_block'
  | 'sla_violation'
  | 'ledger_inconsistency';

export type SlashStatus = 'pending' | 'confirmed' | 'canceled';

export type SlashEvent = {
  slashId: string;

  idempotencyKey: string;

  tenantId: string;
  agentId: string;

  currency: string;
  penaltyCents: number;

  reason: SlashReason;
  proofId?: string;
  settlementId?: string;

  ledgerRootHashB64Url: string;

  status: SlashStatus;
  pendingUntilAt: string;
  confirmedAt?: string;
  canceledAt?: string;

  version: number;
  sourceEventId?: string;
  lastUpdatedBy: string;

  createdAt: string;
  updatedAt: string;
};

export type SlashingDb = {
  version: 1;
  events: Record<string, SlashEvent>;
  byIdempotencyKey: Record<string, string>;
};
