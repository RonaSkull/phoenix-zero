import { getPricingProfile } from '../../../lib/pricing';

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
          docs: '/api/docs/ai-service-discovery'
        },
        auth: {
          public: ['/.well-known/ai-service.json', '/api/pricing', '/api/compatibility', '/api/docs/ai-service-discovery', '/api/capabilities'],
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
          execute: 'taskId is treated as an idempotency key per agentId+tenantId'
        }
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
