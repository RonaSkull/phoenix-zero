import { randomBytes } from 'node:crypto';

import { FunnelLogger } from '../lib/funnel';
import { httpJson } from '../lib/http';
import { checkCompatibility } from '../flows/compatibility';

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function runHostileAgent(params: { baseUrl: string }) {
  const runId = `run_${Date.now()}_${b64Url(randomBytes(6))}`;
  const log = new FunnelLogger({ personaId: 'hostile_agent', runId });

  const missing = await checkCompatibility(params.baseUrl, {});
  const missingOk = missing.status === 400 && missing.json?.reasonCode === 'MISSING_FIELDS' && Array.isArray(missing.json?.missingFields);
  log.push('DISCOVERY', missingOk, 'compatibility missing fields should be machine-readable (400 + missingFields)', { status: missing.status, body: missing.json });

  const unsupported = await checkCompatibility(params.baseUrl, { operation: ' totally_not_real ', intent: 'bypass', agentType: 'hostile', supportsPpo: true });
  const unsupportedOk = unsupported.ok && unsupported.json?.compatible === false && unsupported.json?.reasonCode === 'UNSUPPORTED_OPERATION';
  log.push('UNDERSTANDING', unsupportedOk, 'unsupported operation should be declared (compatible:false + reasonCode)', { status: unsupported.status, body: unsupported.json });

  const execNoKey = await httpJson({ method: 'POST', url: `${params.baseUrl}/api/agents/ag_x/execute`, body: { taskId: 't', taskType: 'protect_video' } });
  log.push('PURCHASE', execNoKey.status === 401, 'execute without x-api-key should be 401', { status: execNoKey.status, body: execNoKey.json });

  const ok = log.blockers().length === 0;
  log.push('DONE', ok, 'scenario finished');
  return { ok, personaId: log.personaId, runId, events: log.events, blockers: log.blockers() };
}
