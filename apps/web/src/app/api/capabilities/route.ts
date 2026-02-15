import { getPricingProfile } from '../../../lib/pricing';

export const runtime = 'nodejs';

const OFFERINGS = [
  {
    offeringId: 'exchange',
    name: 'Exchange',
    landingUrl: '/for-exchanges',
    templateUrl: '/templates/exchange_settlement_template.csv',
    defaultTaskTypes: ['reconcile_psp'],
    allowedOperations: ['reconcile_psp', 'audit_bc_compliance'],
    pricingHint: 'enterprise_volume_tiered'
  },
  {
    offeringId: 'banking',
    name: 'Banking',
    landingUrl: '/for-banking',
    templateUrl: '/templates/banking_reconciliation_template.csv',
    defaultTaskTypes: ['reconcile_psp'],
    allowedOperations: ['reconcile_psp', 'audit_bc_compliance'],
    pricingHint: 'enterprise_volume_tiered'
  },
  {
    offeringId: 'ai-marketplace',
    name: 'AI Marketplace',
    landingUrl: '/for-ai-marketplaces',
    templateUrl: '/templates/ai_marketplace_template.csv',
    defaultTaskTypes: ['agent_compute'],
    allowedOperations: ['agent_compute'],
    pricingHint: 'usage_based_ppe'
  },
  {
    offeringId: 'gaming',
    name: 'Gaming',
    landingUrl: '/for-gaming',
    templateUrl: '/templates/gaming_tournament_template.csv',
    defaultTaskTypes: ['payout_mass'],
    allowedOperations: ['payout_mass'],
    pricingHint: 'enterprise_volume_tiered'
  }
] as const;

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

function normalizeKey(x: unknown): string {
  return String(x || '').trim().toLowerCase();
}

export async function GET() {
  try {
    const pricingProfile = await getPricingProfile('default', 'USD');

    const operations = Object.keys(pricingProfile.basePriceCentsByOp || {})
      .map((x) => normalizeKey(x))
      .filter((x) => Boolean(x));

    operations.sort((a, b) => a.localeCompare(b));

    const hasPublicTenantConfigured = Boolean((process.env.PHOENIX_ZERO_PUBLIC_API_KEY || '').trim());

    return Response.json(
      {
        ok: true,
        serviceId: 'phoenix-zero-ppe-v1',
        discovery: {
          wellKnown: '/.well-known/ai-service.json',
          pricing: '/api/pricing',
          compatibility: '/api/compatibility',
          docs: '/api/docs/ai-service-discovery',
          goLiveContract: '/api/docs/go-live-contract',
          agentIntegrationContract: '/api/docs/agent-integration-contract',
          howAgentsPay: '/api/docs/how-agents-pay'
        },
        auth: {
          public: [
            '/.well-known/ai-service.json',
            '/api/pricing',
            '/api/compatibility',
            '/api/docs/ai-service-discovery',
            '/api/docs/go-live-contract',
            '/api/docs/agent-integration-contract',
            '/api/docs/how-agents-pay',
            '/api/capabilities'
          ],
          tenantApiKey: ['/api/checkout/create', '/api/checkout/status/*', '/api/agents/{agentId}/execute']
        },
        pricing: {
          defaultProfileId: pricingProfile.id,
          defaultCurrency: pricingProfile.currency,
          operations
        },
        publicTenant: {
          configured: hasPublicTenantConfigured,
          notes: 'Public pricing requires PHOENIX_ZERO_PUBLIC_API_KEY to be configured on the server'
        },
        idempotency: {
          webhooks: true,
          checkoutCreate: 'x-idempotency-key makes POST /api/checkout/create replay-safe per tenant'
        },
        offerings: OFFERINGS
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: 'CAPABILITIES_FAILED', error: msg },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
