import { phoenixZeroStableStringify, sha256B64Url } from '@phoenix-zero/core';

import type { PaymentProof } from './payment-proofs';

export type GuaranteeProofV1 = {
  v: 1;
  kind: 'guarantee_proof';

  proofId: string;

  createdAt: string;
  verifiedAt: string;

  payment: {
    provider: string;
    amountCents: number;
    currency: string;
  };

  task: {
    taskType: string;
    taskId?: string;
    taskInputHash: string;
    taskOutputHash: string;
  };

  signature?: {
    verified?: boolean;
    payloadHashB64Url?: string;
    publicKeyB64Url?: string;
  };

  antifraud?: {
    decision?: string;
    reason?: string;
  };

  digestB64Url: string;
};

function sha256Utf8B64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return sha256B64Url(bytes);
}

export function toPublicGuaranteeProof(p: PaymentProof): GuaranteeProofV1 | null {
  if (!p || p.status !== 'paid_confirmed') return null;

  const base = {
    v: 1 as const,
    kind: 'guarantee_proof' as const,
    proofId: String(p.id || '').trim(),
    createdAt: String(p.createdAt || ''),
    verifiedAt: String(p.verifiedAt || p.createdAt || ''),
    payment: {
      provider: String(p.paymentProvider || '').trim(),
      amountCents: typeof p.amountCents === 'number' && Number.isFinite(p.amountCents) ? Math.max(0, Math.trunc(p.amountCents)) : 0,
      currency: String(p.currency || '').trim() || 'USD'
    },
    task: {
      taskType: String(p.taskType || '').trim(),
      taskId: String(p.taskId || '').trim() || undefined,
      taskInputHash: String(p.taskInputHash || '').trim(),
      taskOutputHash: String(p.taskOutputHash || '').trim()
    },
    signature:
      p.agentEd25519PublicKeyB64Url || p.agentEd25519SignatureB64Url || typeof p.agentEd25519SignatureVerified === 'boolean'
        ? {
            verified: typeof p.agentEd25519SignatureVerified === 'boolean' ? p.agentEd25519SignatureVerified : undefined,
            payloadHashB64Url: String(p.agentEd25519SignaturePayloadHashB64Url || '').trim() || undefined,
            publicKeyB64Url: String(p.agentEd25519PublicKeyB64Url || '').trim() || undefined
          }
        : undefined,
    antifraud:
      (p as any)?.antifraudDecision || (p as any)?.antifraudReason
        ? {
            decision: String((p as any)?.antifraudDecision || '').trim() || undefined,
            reason: String((p as any)?.antifraudReason || '').trim() || undefined
          }
        : undefined
  };

  const digestB64Url = sha256Utf8B64Url(phoenixZeroStableStringify(base));
  return { ...base, digestB64Url };
}
