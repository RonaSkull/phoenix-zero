import { requireTenant } from '../../../../lib/tenant-auth';
import { getSovereignContract } from '../../../../lib/sovereign-contracts';
import {
  sovereignEntitlementDebugEnabled,
  sovereignEntitlementEnforced,
  sovereignEntitlementVersion
} from '../../../../lib/sovereign-entitlement';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function clampNonEmpty(s: unknown): string {
  return String(s || '').trim();
}

export async function GET(req: Request) {
  try {
    const auth = await requireTenant(req);
    if (!auth.ok) {
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const u = new URL(req.url);
    const agentId = clampNonEmpty(u.searchParams.get('agentId'));
    if (!agentId) {
      return Response.json(
        { ok: false, reason: 'Missing agentId', reasonCode: 'MISSING_AGENT_ID' },
        { status: 400, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const contract = await getSovereignContract({ tenantId: auth.ctx.tenantId, agentId });
    if (!contract) {
      return Response.json(
        { ok: false, reason: 'NO_CONTRACT', reasonCode: 'NO_CONTRACT' },
        { status: 404, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    return Response.json(
      {
        ok: true,
        tenantId: auth.ctx.tenantId,
        agentId,
        sovereign: {
          enforced: sovereignEntitlementEnforced(),
          debug: sovereignEntitlementDebugEnabled(),
          version: sovereignEntitlementVersion()
        },
        contract: {
          contractId: contract.contractId,
          status: contract.status,
          effectiveAt: contract.effectiveAt,
          expiresAt: contract.expiresAt,
          defaultExecutionClassId: contract.defaultExecutionClassId,
          executionClasses: (contract.executionClasses || []).map((c) => ({
            classId: String(c.classId || '').trim(),
            currency: String(c.currency || '').trim() || 'USD',
            pricePerExecutionCents: Math.max(0, Math.trunc(Number(c.pricePerExecutionCents ?? 0))),
            allowedTaskTypes: Array.isArray(c.allowedTaskTypes) ? c.allowedTaskTypes : undefined,
            maxDailyExecutions:
              typeof c.maxDailyExecutions === 'number' && Number.isFinite(c.maxDailyExecutions)
                ? Math.max(0, Math.trunc(c.maxDailyExecutions))
                : undefined,
            maxMonthlyExecutions:
              typeof c.maxMonthlyExecutions === 'number' && Number.isFinite(c.maxMonthlyExecutions)
                ? Math.max(0, Math.trunc(c.maxMonthlyExecutions))
                : undefined
          }))
        }
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: 'PRICING_CONTRACT_FAILED', error: msg },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
