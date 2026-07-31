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
        wellKnown: '/.well-known/ai-service.json',
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
          },
          provisioningUrl: '/ppe/signup',
          publicEndpoints: ['/api/health', '/api/pricing', '/api/capabilities', '/api/compatibility', '/verify/{proofId}', '/proofs']
        },
        pricing: {
          model: 'pay_per_execution',
          catalog: '/api/pricing',
          operationsCount: Array.from(new Set<string>(OFFERINGS.flatMap((o) => Array.from(o.allowedOperations || [])) as string[])).length
        },
        provider: {
          organization: 'Phoenix ZerØ',
          url: 'https://phoenix-zero.onrender.com',
          jurisdiction: 'Brazil (Sao Paulo)',
          dataResidency: 'US-West (infrastructure on Render Oregon); confirm database region on the Neon console'
        },
        serviceUrl: 'https://phoenix-zero.onrender.com',
        offerings: [
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
        ],
        proofs: {
          listUrl: '/proofs',
          verifyUrlTemplate: '/verify/{proofId}',
          shortUrlTemplate: '/s/{id}',
          digestAlgorithm: 'sha-256',
          digestEncoding: 'base64url',
          appendOnly: true,
          postQuantum: {
            anchorVerifyUrlTemplate: '/verify-anchor/{id}',
            note: 'Post-quantum (SPHINCS+) anchors are exposed via /verify-anchor/{id}. Do not assume every /verify proof carries an inline PQ signature until per-proof PQ display is provisioned.'
          }
        },
        webhooks: {
          idempotent: true,
          ordered: true,
          replaySafe: true,
          note: 'Replay with the same idempotency key returns 409 on reuse; ordering is guaranteed per tenant.'
        },
        sla: {
          target: '99.95%',
          currentInstanceTier: 'free',
          currentBehavior: 'Free tier spins down on inactivity (~50s cold start) and runs WEB_CONCURRENCY=1; chained agent calls may queue and exceed typical 10-30s agent timeouts.',
          guaranteedWith: 'Paid plan (Starter or above) with no spin-down and WEB_CONCURRENCY > 1.',
          note: 'The 99.95% figure is the contractual target; it is guaranteed only on a paid instance. Do not route production agent traffic through the free instance.'
        },
        environmentDetail: {
          overall: 'production',
          payments: {
            crypto: 'production (NowPayments)',
            pix: 'sandbox (Asaas; ASAAS_ENV=sandbox)'
          },
          note: "The top-level environment='production' refers to the crypto / go-live path. PIX is intentionally sandbox until compliance sign-off. If any payment key expires, the symptom appears at checkout (not in this card)."
        },
        cors: {
          requiredForAgents: true,
          note: 'Cross-origin agents and browser embeds require Access-Control-Allow-Origin on /api/* and on this document. Validate headers on the deployed instance and add permissive CORS for discovery/verify if missing.'
        },
        discovery: {
          robotsTxt: '/robots.txt',
          sitemapXml: '/sitemap.xml',
          llmsTxt: '/llms.txt',
          securityTxt: '/.well-known/security.txt',
          wellKnown: '/.well-known/ai-service.json',
          note: '/status, /trust and /api/openapi.json are intentionally NOT listed yet; they will be added once provisioned, so this card never references a 404.'
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
