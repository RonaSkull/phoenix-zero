import { listPaymentProofsByAgent, type PaymentProof } from './payment-proofs';

type GateReason =
  | 'NO_PPO'
  | 'NO_MATCHING_PPO'
  | 'MISSING_SIGNATURE'
  | 'INVALID_SIGNATURE';

export type PpoGateDecision = {
  ok: true;
  allowed: boolean;
  reason?: GateReason;
  agentId: string;
  taskId?: string;
  taskType?: string;
  proofId?: string;
  proof?: PaymentProof;
};

function selectMatchingPaidProof(params: {
  proofs: PaymentProof[];
  taskId?: string;
  taskType?: string;
}): PaymentProof | null {
  for (const p of params.proofs || []) {
    if (!p || p.status !== 'paid_confirmed') continue;
    if (params.taskId && String((p as any)?.taskId || '').trim() !== params.taskId) continue;
    if (params.taskType && String((p as any)?.taskType || '').trim() !== params.taskType) continue;
    return p;
  }
  return null;
}

function parseBool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

export async function checkPpoGate(params: {
  tenantId: string;
  agentId: string;
  taskId?: string;
  taskType?: string;
  requireSignature?: boolean;
  limit?: number;
}): Promise<PpoGateDecision> {
  const agentId = String(params.agentId || '').trim();
  const taskId = String(params.taskId || '').trim() || undefined;
  const taskType = String(params.taskType || '').trim() || undefined;
  const requireSignature = parseBool(params.requireSignature);
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(params.limit ?? 500))));

  const proofs = await listPaymentProofsByAgent({ tenantId: params.tenantId, agentId, limit });
  const proof = selectMatchingPaidProof({ proofs, taskId, taskType });

  if (!proof) {
    return {
      ok: true,
      allowed: false,
      reason: taskId || taskType ? 'NO_MATCHING_PPO' : 'NO_PPO',
      agentId,
      taskId,
      taskType
    };
  }

  const hasAnySigFields =
    !!String((proof as any)?.agentEd25519PublicKeyB64Url || '').trim() ||
    !!String((proof as any)?.agentEd25519SignatureB64Url || '').trim() ||
    typeof (proof as any)?.agentEd25519SignatureVerified === 'boolean';

  const signatureVerified = (proof as any)?.agentEd25519SignatureVerified;
  const pubKey = String((proof as any)?.agentEd25519PublicKeyB64Url || '').trim();
  const sig = String((proof as any)?.agentEd25519SignatureB64Url || '').trim();

  if (requireSignature) {
    if (!pubKey || !sig) {
      return {
        ok: true,
        allowed: false,
        reason: 'MISSING_SIGNATURE',
        agentId,
        taskId,
        taskType,
        proofId: proof.id
      };
    }
    if (signatureVerified !== true) {
      return {
        ok: true,
        allowed: false,
        reason: 'INVALID_SIGNATURE',
        agentId,
        taskId,
        taskType,
        proofId: proof.id
      };
    }
  } else if (hasAnySigFields && signatureVerified === false) {
    return {
      ok: true,
      allowed: false,
      reason: 'INVALID_SIGNATURE',
      agentId,
      taskId,
      taskType,
      proofId: proof.id
    };
  }

  return {
    ok: true,
    allowed: true,
    agentId,
    taskId,
    taskType,
    proofId: proof.id,
    proof
  };
}

export class PpoGateBlockedError extends Error {
  readonly gate: PpoGateDecision;

  constructor(gate: PpoGateDecision) {
    super(`[PPO-GATE] blocked: ${gate.reason || 'unknown'}`);
    this.name = 'PpoGateBlockedError';
    this.gate = gate;
  }
}

export async function executeWithPPOGate<T>(params: {
  tenantId: string;
  agentId: string;
  taskId: string;
  taskType: string;
  requireSignature?: boolean;
  limit?: number;
  action: () => Promise<T>;
}): Promise<T> {
  const gate = await checkPpoGate({
    tenantId: params.tenantId,
    agentId: params.agentId,
    taskId: params.taskId,
    taskType: params.taskType,
    requireSignature: params.requireSignature,
    limit: params.limit
  });

  if (!gate.allowed) {
    throw new PpoGateBlockedError(gate);
  }

  return params.action();
}
