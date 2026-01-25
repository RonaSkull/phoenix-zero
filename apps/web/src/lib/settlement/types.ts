import type { AntifraudDecision } from '../antifraud/types';

export type SettlementStatus = 'pending' | 'settled' | 'reverted' | 'expired' | 'blocked';

export type SettlementProvider = 'pix' | 'card' | 'crypto';

export type SettlementEntry = {
  settlementId: string;

  proofId: string;
  paymentId: string;

  tenantId: string;
  agentId: string;

  amountCents: number;
  currency: string;

  provider: SettlementProvider;
  providerPaymentId: string;

  status: SettlementStatus;

  paidAt: string;
  riskWindowEndsAt: string;

  settledAt?: string;
  revertedAt?: string;
  blockedAt?: string;

  version: number;
  sourceEventId?: string;
  lastUpdatedBy: string;

  antifraudDecision?: AntifraudDecision;
  antifraudReason?: string;

  createdAt: string;
  updatedAt: string;
};

export type SettlementsDb = {
  version: 1;
  entries: Record<string, SettlementEntry>;
  byProofId: Record<string, string>;
};
