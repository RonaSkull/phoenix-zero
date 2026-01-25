import type { PaymentProof } from './payment-proofs';
import { listPaymentProofsByAgent } from './payment-proofs';

import { phoenixZeroStableStringify, sha256B64Url } from '@phoenix-zero/core';

export type AgentLedger = {
  agentId: string;
  rootHashB64Url: string;

  totalProofs: number;
  paidProofs: number;

  totalsByCurrency: Record<string, { paidProofs: number; totalValueMinorUnits: number }>;
  primaryCurrency: string | null;
  totalValueMinorUnits: number;

  byTaskType: Record<
    string,
    {
      count: number;
      paidCount: number;
      totalsByCurrency: Record<string, number>;
      lastExecutionAt: string | null;
    }
  >;

  firstExecutionAt: string | null;
  lastExecutionAt: string | null;
};

function isIsoString(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 10;
}

function normalizeCurrency(v: unknown): string {
  const c = String(v || '').trim().toUpperCase();
  return c || 'USD';
}

function amountMinorUnits(p: PaymentProof): number {
  const n = (p as any)?.amountCents;
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function sha256Utf8B64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return sha256B64Url(bytes);
}

function computeLedgerRootHashB64Url(proofs: PaymentProof[]): string {
  const sorted = [...(proofs || [])].sort((a, b) => {
    const aCreated = String((a as any)?.createdAt || '');
    const bCreated = String((b as any)?.createdAt || '');
    const c = aCreated.localeCompare(bCreated);
    if (c) return c;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });

  let prevHash = sha256Utf8B64Url('genesis');
  for (const p of sorted) {
    const entry = {
      v: 1,
      id: String((p as any)?.id || ''),
      createdAt: String((p as any)?.createdAt || ''),
      paymentProvider: String((p as any)?.paymentProvider || ''),
      providerPaymentId: String((p as any)?.providerPaymentId || ''),
      amountCents: amountMinorUnits(p),
      currency: normalizeCurrency((p as any)?.currency),
      agentId: String((p as any)?.agentId || ''),
      taskId: String((p as any)?.taskId || '') || undefined,
      taskType: String((p as any)?.taskType || ''),
      taskInputHash: String((p as any)?.taskInputHash || ''),
      taskOutputHash: String((p as any)?.taskOutputHash || ''),
      status: String((p as any)?.status || ''),
      agentEd25519PublicKeyB64Url: String((p as any)?.agentEd25519PublicKeyB64Url || '') || undefined,
      agentEd25519SignatureB64Url: String((p as any)?.agentEd25519SignatureB64Url || '') || undefined,
      agentEd25519SignatureVerified:
        typeof (p as any)?.agentEd25519SignatureVerified === 'boolean' ? (p as any).agentEd25519SignatureVerified : undefined,
      agentEd25519SignaturePayloadHashB64Url: String((p as any)?.agentEd25519SignaturePayloadHashB64Url || '') || undefined
    };

    prevHash = sha256Utf8B64Url(`${prevHash}\n${phoenixZeroStableStringify(entry)}`);
  }
  return prevHash;
}

export async function computeAgentLedger(params: {
  tenantId: string;
  agentId: string;
  limit?: number;
}): Promise<AgentLedger> {
  const tenantId = String(params.tenantId || '').trim();
  const agentId = String(params.agentId || '').trim();

  const proofs = await listPaymentProofsByAgent({ tenantId, agentId, limit: params.limit ?? 500 });
  const rootHashB64Url = computeLedgerRootHashB64Url(proofs);

  let firstExecutionAt: string | null = null;
  let lastExecutionAt: string | null = null;

  const byTaskType: AgentLedger['byTaskType'] = {};
  const totalsByCurrency: AgentLedger['totalsByCurrency'] = {};

  let paidProofs = 0;

  for (const p of proofs) {
    const createdAt = isIsoString((p as any)?.createdAt) ? String((p as any).createdAt) : null;
    if (createdAt) {
      if (!firstExecutionAt || createdAt < firstExecutionAt) firstExecutionAt = createdAt;
      if (!lastExecutionAt || createdAt > lastExecutionAt) lastExecutionAt = createdAt;
    }

    const taskType = String((p as any)?.taskType || '').trim() || 'unknown';
    if (!byTaskType[taskType]) {
      byTaskType[taskType] = { count: 0, paidCount: 0, totalsByCurrency: {}, lastExecutionAt: null };
    }

    byTaskType[taskType].count += 1;
    if (createdAt && (!byTaskType[taskType].lastExecutionAt || createdAt > byTaskType[taskType].lastExecutionAt)) {
      byTaskType[taskType].lastExecutionAt = createdAt;
    }

    if (p.status === 'paid_confirmed') {
      paidProofs += 1;
      byTaskType[taskType].paidCount += 1;

      const currency = normalizeCurrency((p as any)?.currency);
      const amt = amountMinorUnits(p);

      totalsByCurrency[currency] = totalsByCurrency[currency] || { paidProofs: 0, totalValueMinorUnits: 0 };
      totalsByCurrency[currency].paidProofs += 1;
      totalsByCurrency[currency].totalValueMinorUnits += amt;

      byTaskType[taskType].totalsByCurrency[currency] = (byTaskType[taskType].totalsByCurrency[currency] || 0) + amt;
    }
  }

  const primaryCurrency = Object.entries(totalsByCurrency)
    .sort((a, b) => b[1].paidProofs - a[1].paidProofs || b[1].totalValueMinorUnits - a[1].totalValueMinorUnits)
    .map(([c]) => c)[0];

  return {
    agentId,
    rootHashB64Url,
    totalProofs: proofs.length,
    paidProofs,
    totalsByCurrency,
    primaryCurrency: primaryCurrency || null,
    totalValueMinorUnits: primaryCurrency ? totalsByCurrency[primaryCurrency]?.totalValueMinorUnits || 0 : 0,
    byTaskType,
    firstExecutionAt,
    lastExecutionAt
  };
}
