import { requireTenantOrPublic } from '../../../lib/tenant-auth';
import { getCommissionProfile, getPricingProfile, getTaxProfile } from '../../../lib/pricing';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function normalizeKey(x: unknown): string {
  return String(x || '').trim().toLowerCase();
}

function isSovereignTenant(tenant: any): boolean {
  const ct = String(tenant?.clientType || '').trim().toLowerCase();
  return ct === 'sovereign';
}

export async function GET(req: Request) {
  const startedAtMs = Date.now();
  try {
    const auth = await requireTenantOrPublic(req);
    if (!auth.ok) {
      const reason = String(auth.reason || 'Unauthorized');
      const isPublicNotConfigured = reason.toLowerCase().includes('public tenant is not configured');
      if (isPublicNotConfigured) {
        return Response.json(
          {
            ok: false,
            reasonCode: 'PUBLIC_PRICING_DISABLED',
            reason:
              'Public pricing is disabled. Create an agent session to obtain an x-api-key, then retry GET /api/pricing with x-api-key.',
            nextSteps: [
              { method: 'POST', path: '/api/public/agent-signup', purpose: 'Obtain x-api-key (tenant credential)' },
              { method: 'GET', path: '/api/pricing', headers: { 'x-api-key': 'YOUR_KEY' } },
              { method: 'GET', path: '/api/compatibility' }
            ],
            docs: {
              agentIntegrationContract: '/api/docs/agent-integration-contract',
              agentTrustModel: '/api/docs/agent-trust-model',
              discovery: '/.well-known/ai-service.json'
            }
          },
          { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
        );
      }
      return Response.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const tenant = auth.ctx.tenant;
    const tenantId = auth.ctx.tenantId;

    const sovereign = {
      enabled: isSovereignTenant(tenant),
      reason: isSovereignTenant(tenant) ? null : 'CUSTOM_PRICING_REQUIRED',
      commercialModel: {
        kind: 'gmv_fee_with_minimum',
        feeBps: 15,
        minimumMonthlyUsd: 15000,
        slaTarget: '99.95%'
      },
      operations: [
        {
          taskType: 'reconcile_psp',
          description: 'Multi-acquirer / multi-PSP reconciliation (batch hashed input + verifiable proof).'
        },
        {
          taskType: 'payout_mass',
          description: 'Mass payouts with deterministic audit trail and public proof per confirmed batch.'
        },
        {
          taskType: 'audit_bc_compliance',
          description: 'Compliance-grade audit batch with verifiable proof and ledger traceability.'
        }
      ],
      docs: {
        overview: '/faq',
        proofVerification: '/verify/<proofId>',
        ledger: '/api/agents/{agentId}/ledger'
      }
    };

    const pricingProfile = await getPricingProfile(tenant.pricingProfile, tenant.currency || 'USD');
    const commissionProfile = await getCommissionProfile(tenant.commissionProfile);
    const taxProfile = await getTaxProfile(tenant.taxProfile);

    const ops = Object.entries(pricingProfile.basePriceCentsByOp || {})
      .map(([operation, basePriceCents]) => ({
        operation: normalizeKey(operation),
        basePriceCents: Math.max(0, Math.trunc(Number(basePriceCents ?? 0)))
      }))
      .filter((x) => Boolean(x.operation));

    ops.sort((a, b) => a.operation.localeCompare(b.operation));

    const examples = {
      checkoutCreate: {
        providerHint: 'pix',
        currency: 'BRL',
        pricingProfileId: tenant.pricingProfile,
        lineItems: [
          {
            operation: 'protect_video',
            product: 'video_protection',
            units: 10,
            country: tenant.country,
            clientType: tenant.clientType,
            sector: tenant.sector
          }
        ],
        proofMeta: {
          agentId: 'agent://your-agent',
          taskId: 'task_123',
          taskType: 'protect_video',
          taskInputHash: 'sha256:...',
          taskOutputHash: 'sha256:...'
        }
      },
      checkoutCreateCrypto: {
        providerHint: 'crypto',
        currency: pricingProfile.currency,
        pricingProfileId: tenant.pricingProfile,
        lineItems: [
          {
            operation: 'protect_video',
            product: 'video_protection',
            units: 10,
            country: tenant.country,
            clientType: tenant.clientType,
            sector: tenant.sector
          }
        ],
        proofMeta: {
          agentId: 'agent://your-agent',
          taskId: 'task_123',
          taskType: 'protect_video',
          taskInputHash: 'sha256:...',
          taskOutputHash: 'sha256:...'
        }
      },
      execute: {
        method: 'POST',
        path: '/api/agents/{agentId}/execute',
        body: {
          taskId: 'task_123',
          taskType: 'protect_video'
        }
      },
      pricingQuote: {
        method: 'POST',
        path: '/api/pricing/quote',
        body: {
          operation: 'protect_video',
          currency: pricingProfile.currency,
          units: 10,
          country: tenant.country,
          clientType: tenant.clientType,
          sector: tenant.sector
        }
      }
    };

    const schema = {
      operation: 'string (e.g. protect_video)',
      product: 'string (e.g. video_protection)',
      units: 'int >= 1 (PPO balance debits 1 unit per execution by default)',
      pricingProfileId: 'string (optional override)',
      pricingVersionId: 'string (optional; if supported by checkout)',
      providerHint: 'string (pix | crypto)',
      currency: 'string (PIX requires BRL; crypto supports USD/USDC depending on availability)',
      proofMeta: {
        agentId: 'string',
        taskId: 'string',
        taskType: 'string (MUST equal lineItems.operation)',
        taskInputHash: 'string',
        taskOutputHash: 'string'
      }
    };

    const discoveryMetadata = {
      serviceId: 'phoenix-zero-ppe-v1',
      wellKnownUrl: '/.well-known/ai-service.json',
      capabilities: ['ppo-gated-execution', 'agent-executable', 'replay-safe', 'settlement-aware']
    };

    const agentPolicy = {
      requiresProofOfPayment: true,
      enforcement: 'hard',
      executionWithoutPPO: 'deny',
      onUnsupportedOperation: {
        action: 'reject',
        feedback: {
          type: 'machine-readable',
          endpoint: '/api/compatibility',
          reasonCodes: ['UNSUPPORTED_OPERATION', 'MISSING_FIELDS', 'CUSTOM_PRICING_REQUIRED']
        }
      }
    };

    return Response.json(
      {
        ok: true,
        pricingModel: 'pay_per_execution_units',
        updatedAt: new Date().toISOString(),
        discoveryMetadata,
        agentPolicy,
        isPublicTenant: auth.isPublic,
        tenantId,
        currency: pricingProfile.currency,
        payment: {
          providers: [
            { providerHint: 'pix', currency: 'BRL', note: 'PIX via Asaas requires BRL' },
            { providerHint: 'crypto', currency: 'USD|USDC', note: 'Crypto via NowPayments typically uses USD/USDC' }
          ],
          currencyRules: {
            pix: { requiredCurrency: 'BRL' },
            crypto: { allowedCurrencies: ['USD', 'USDC'] }
          }
        },
        pricingProfileId: pricingProfile.id,
        operations: ops,
        sovereign,
        multipliers: {
          clientType: pricingProfile.multiplierByClientType || {},
          sector: pricingProfile.multiplierBySector || {},
          country: pricingProfile.multiplierByCountry || {},
          reach: pricingProfile.multiplierByReach || {},
          exposure: pricingProfile.multiplierByExposure || {},
          persistence: pricingProfile.multiplierByPersistence || {},
          guaranteeWindow: pricingProfile.multiplierByGuaranteeWindow || {},
          proofGrade: pricingProfile.multiplierByProofGrade || {},
          authenticityLevel: pricingProfile.multiplierByAuthenticityLevel || {},
          riskProfile: pricingProfile.multiplierByRiskProfile || {},
          plan: pricingProfile.multiplierByPlan || {},
          durationBucket: pricingProfile.multiplierByDurationBucket || {},
          sizeMbBucket: pricingProfile.multiplierBySizeMbBucket || {},
          pagesBucket: pricingProfile.multiplierByPagesBucket || {}
        },
        fees: {
          platformFeeBps: commissionProfile.platformFeeBps,
          partnerShareBps: commissionProfile.partnerShareBps
        },
        taxes: {
          taxBpsByCountry: taxProfile.taxBpsByCountry || {}
        },
        ppo: {
          model: 'units_balance',
          debitRule: '1 unit is consumed per /execute call (current backend behavior)',
          invariant: 'proofMeta.taskType must match lineItems.operation'
        },
        endpoints: {
          preview: '/api/pricing/preview',
          quote: '/api/pricing/quote',
          checkoutCreate: '/api/checkout/create',
          execute: '/api/agents/{agentId}/execute',
          paymentProofById: '/api/payment-proofs/{id}'
        },
        schema,
        examples,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Math.max(0, Date.now() - startedAtMs)
        }
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: 'PRICING_FAILED', error: msg },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
