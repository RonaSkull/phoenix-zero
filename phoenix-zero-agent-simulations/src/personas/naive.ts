import { randomBytes } from 'node:crypto';

import { FunnelLogger } from '../lib/funnel';
import { fetchPricingCatalog } from '../flows/pricing';
import { checkCompatibility } from '../flows/compatibility';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function runNaiveAgent(params: { baseUrl: string }) {
  const runId = `run_${Date.now()}_${b64Url(randomBytes(6))}`;
  const log = new FunnelLogger({ personaId: 'naive_agent', runId });

  const pricing = await fetchPricingCatalog(params.baseUrl);
  log.push('DISCOVERY', pricing.ok, 'GET /api/pricing (public)', { status: pricing.status });

  const guess = await checkCompatibility(params.baseUrl, {
    operation: 'protect-video',
    intent: 'protect a video and get proof',
    agentType: 'naive',
    supportsPpo: true
  });

  const okGuess = guess.ok && typeof guess.json?.compatible === 'boolean';
  log.push('UNDERSTANDING', okGuess, 'POST /api/compatibility should be tolerant and give guidance', { status: guess.status, body: guess.json });

  const ok = log.blockers().length === 0;
  log.push('DONE', ok, 'scenario finished');

  return { ok, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
}
