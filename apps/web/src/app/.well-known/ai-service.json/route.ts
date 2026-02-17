export const runtime = 'nodejs';

const OFFERINGS = [
  {
    offeringId: 'exchange',
    allowedOperations: ['reconcile_psp', 'audit_bc_compliance']
  },
  {
    offeringId: 'banking',
    allowedOperations: ['reconcile_psp', 'audit_bc_compliance']
  },
  {
    offeringId: 'ai-marketplace',
    allowedOperations: ['agent_compute']
  },
  {
    offeringId: 'gaming',
    allowedOperations: ['payout_mass']
  }
] as const;

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  };
}

export async function GET() {
  try {
    const hasPublicTenantConfigured = Boolean((process.env.PHOENIX_ZERO_PUBLIC_API_KEY || '').trim());

    return Response.json(
      {
        ok: true,
        serviceId: 'sovereign-ppe-v1',
        protocolVersion: '2026-01-v1',
        description: 'Sovereign Pay-Per-Execution (PPE) — cryptographic proof and settlement assurance for agents.',
        endpoints: {
          capabilities: '/api/capabilities',
          pricing: '/api/pricing',
          compatibility: '/api/compatibility',
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
          model: 'pay_per_execution',
          catalog: '/api/pricing',
          operationsCount: Array.from(new Set<string>(OFFERINGS.flatMap((o) => Array.from(o.allowedOperations || [])) as string[])).length
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
