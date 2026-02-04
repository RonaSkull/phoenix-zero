export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  };
}

export async function GET(_req: Request) {
  return Response.json(
    {
      ok: true,
      pricingModel: 'pay-per-execution',
      unit: 'PPO',
      currency: ['BRL', 'USD', 'USDC'],
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
      access: 'Detailed pricing requires agent signup (x-api-key)',
      flow: ['agent discovery', 'agent signup', 'pricing (authenticated)', 'checkout', 'gate', 'execute'],
      docs: {
        agentIntegrationContract: '/api/docs/agent-integration-contract',
        agentTrustModel: '/api/docs/agent-trust-model',
        discovery: '/.well-known/ai-service.json'
      }
    },
    { status: 200, headers: jsonUtf8Headers() }
  );
}
