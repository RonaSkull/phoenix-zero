export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET() {
  return Response.json(
    {
      serviceId: 'phoenix-zero-ppe-v1',
      name: 'Phoenix Zero PPE',
      version: '1.0',
      description: 'Canonical pay-per-execution protocol for autonomous and human-driven agents',
      discovery: {
        pricing: '/api/pricing',
        compatibility: '/api/compatibility',
        docs: '/api/docs/ai-service-discovery'
      },
      capabilities: ['ppo-gated-execution', 'replay-safe', 'settlement-aware', 'agent-native', 'human-compatible'],
      trustModel: {
        canonicalServiceId: 'phoenix-zero-ppe-v1',
        forkPolicy: 'allowed-but-degraded',
        verification: {
          requiredCapabilities: ['ppo-gated-execution', 'replay-safe'],
          preferredCapabilities: ['settlement-aware']
        }
      },
      agentPolicy: {
        requiresProofOfPayment: true,
        executionWithoutPPO: 'deny',
        supportsAutonomousAgents: true,
        supportsHumans: true
      }
    },
    { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
  );
}
