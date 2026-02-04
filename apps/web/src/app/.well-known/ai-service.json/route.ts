import { getPricingProfile } from '../../../lib/pricing';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  };
}

export async function GET() {
  try {
    const pricingProfile = await getPricingProfile('default', 'USD');

    const hasPublicTenantConfigured = Boolean((process.env.PHOENIX_ZERO_PUBLIC_API_KEY || '').trim());

    return Response.json(
      {
        ok: true,
        serviceId: 'phoenix-zero-ppe-v1',
        protocolVersion: '2026-01-v1',
        description: 'Phoenix Zero Pay-Per-Execution (PPE) — payment-gated execution for autonomous agents.',
        endpoints: {
          capabilities: '/api/capabilities',
          pricing: '/api/pricing',
          compatibility: '/api/compatibility',
          checkoutCreate: '/api/checkout/create',
          checkoutStatus: '/api/checkout/status?paymentId=...',
          gate: '/api/agents/{agentId}/gate',
          execute: '/api/agents/{agentId}/execute'
        },
        docs: {
          discovery: '/api/docs/ai-service-discovery',
          agentIntegrationContract: '/api/docs/agent-integration-contract',
          goLiveContract: '/api/docs/go-live-contract',
          agentTrustModel: '/api/docs/agent-trust-model',
          howAgentsPay: '/api/docs/how-agents-pay'
        },
        docsContentTypes: {
          default: 'text/markdown; charset=utf-8',
          browser: 'text/html; charset=utf-8',
          forceMarkdown: '?format=md',
          forceHtml: '?format=html'
        },
        auth: {
          public: {
            enabled: hasPublicTenantConfigured,
            note: 'If public tenant is disabled, agents MUST obtain x-api-key via POST /api/public/agent-signup before calling tenant-scoped endpoints.'
          },
          tenant: {
            header: 'x-api-key',
            alternative: 'Authorization: Bearer <apiKey>'
          }
        },
        pricing: {
          model: 'pay_per_execution_units',
          catalog: '/api/pricing',
          quote: '/api/pricing/quote',
          operationsCount: Object.keys(pricingProfile.basePriceCentsByOp || {}).length
        },
        payment: {
          providers: [
            { providerHint: 'pix', currency: 'BRL' },
            { providerHint: 'crypto', currency: 'USD|USDC' }
          ],
          currencyRules: {
            pix: { requiredCurrency: 'BRL' },
            crypto: { allowedCurrencies: ['USD', 'USDC'] }
          },
          idempotency: {
            checkoutCreateHeader: 'x-idempotency-key'
          }
        }
      },
      { status: 200, headers: jsonUtf8Headers() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, reason: 'AI_SERVICE_DISCOVERY_FAILED', error: msg },
      { status: 500, headers: jsonUtf8Headers() }
    );
  }
}
