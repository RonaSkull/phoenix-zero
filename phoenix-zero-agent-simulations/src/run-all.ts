import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolve } from 'node:path';

import { baseUrlFromEnv } from './lib/http';
import { runAutomationEngineer } from './personas/automation-engineer';
import { runAgentFounder } from './personas/agent-founder';
import { runComplianceBuyer } from './personas/compliance-buyer';
import { runHostileAgent } from './personas/hostile';
import { runNaiveAgent } from './personas/naive';

type ScenarioResult = {
  ok: boolean;
  personaId: string;
  runId: string;
  events: any[];
  blockers: string[];
  next?: any;
};

function mdEscape(s: string): string {
  return String(s ?? '').replace(/\|/g, '\\|');
}

function topBlockers(results: ScenarioResult[], max: number): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of results) {
    for (const b of r.blockers || []) {
      const k = String(b || '').trim();
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
  }

  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(1, max));
}

function stageCounts(results: ScenarioResult[]): Record<string, { pass: number; fail: number }> {
  const out: Record<string, { pass: number; fail: number }> = {};
  for (const r of results) {
    for (const e of r.events || []) {
      const stage = String(e?.stage || '').trim();
      if (!stage) continue;
      out[stage] ||= { pass: 0, fail: 0 };
      if (e?.ok) out[stage]!.pass++;
      else out[stage]!.fail++;
    }
  }
  return out;
}

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function stripQuotes(v: string): string {
  const s = String(v || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function loadEnvFromFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = String(lineRaw || '').trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    if (!k) continue;
    if (process.env[k] != null && String(process.env[k]).trim() !== '') continue;
    const v = stripQuotes(line.slice(idx + 1));
    process.env[k] = v;
  }
}

function loadEnv(): void {
  const cwd = process.cwd();
  loadEnvFromFile(resolve(cwd, '..', '.env.local'));
  loadEnvFromFile(resolve(cwd, '..', '.env'));
  loadEnvFromFile(resolve(cwd, '.env.local'));
  loadEnvFromFile(resolve(cwd, '.env'));
}

function envInt(name: string, def: number): number {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(0, Math.trunc(n));
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

function nowId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function writeJson(path: string, data: any) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  loadEnv();
  const baseUrl = baseUrlFromEnv();
  const asaasWebhookSecret = env('ASAAS_WEBHOOK_SECRET') || undefined;
  const nowPaymentsIpnSecret = env('NOWPAYMENTS_IPN_SECRET') || undefined;
  void nowPaymentsIpnSecret;

  const suiteRunId = `suite_${nowId()}`;
  const outDir = join(process.cwd(), 'out', suiteRunId);
  await mkdir(outDir, { recursive: true });

  const results: ScenarioResult[] = [];

  const scenarios: Array<() => Promise<ScenarioResult>> = [
    async () => runAutomationEngineer({ baseUrl, asaasWebhookSecret, simulateRefund: true }) as any,
    async () => runAgentFounder({ baseUrl, asaasWebhookSecret }) as any,
    async () => runComplianceBuyer({ baseUrl, asaasWebhookSecret }) as any,
    async () => runNaiveAgent({ baseUrl }) as any,
    async () => runHostileAgent({ baseUrl }) as any
  ];

  for (const run of scenarios) {
    const res = await run();
    results.push(res);
    const file = join(outDir, `${res.personaId}.json`);
    await writeJson(file, res);

    const gapMs = envInt('PHOENIX_ZERO_SCENARIO_GAP_MS', 12000);
    if (gapMs > 0) {
      await sleepMs(gapMs);
    }
  }

  const totals = {
    ok: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
    total: results.length
  };

  const summary = {
    suiteRunId,
    baseUrl,
    totals,
    results: results.map((r) => ({
      personaId: r.personaId,
      ok: r.ok,
      blockers: r.blockers,
      next: r.next || null
    }))
  };

  await writeJson(join(outDir, 'summary.json'), summary);

  const md = [
    `# Agent Simulation Summary`,
    ``,
    `- **Base URL**: \`${baseUrl}\``,
    `- **Suite Run ID**: \`${suiteRunId}\``,
    `- **Pass**: ${totals.ok}/${totals.total}`,
    ``,
    `## Results`,
    ...summary.results.map((r) => {
      const status = r.ok ? 'PASS' : 'FAIL';
      const lines: string[] = [];
      lines.push(`### ${r.personaId} — ${status}`);
      if (!r.ok && r.blockers?.length) {
        lines.push('');
        lines.push('Blockers:');
        for (const b of r.blockers) lines.push(`- ${b}`);
      }
      if (r.next) {
        lines.push('');
        lines.push('Next (manual step):');
        lines.push('```json');
        lines.push(JSON.stringify(r.next, null, 2));
        lines.push('```');
      }
      lines.push('');
      return lines.join('\n');
    })
  ].join('\n');

  await writeFile(join(outDir, 'summary.md'), md, 'utf8');

  const blockerTop = topBlockers(results, 8);
  const stages = stageCounts(results);

  const report = [
    `# Phoenix Zero — Agent Readiness Report (Simulation)`,
    ``,
    `## Executive summary`,
    `Phoenix Zero PPE was evaluated from the perspective of autonomous agents simulating 3 buyer personas plus transversal “naive/hostile” behaviors.`,
    ``,
    `- **Target**: \`${baseUrl}\``,
    `- **Suite Run ID**: \`${suiteRunId}\``,
    `- **Overall pass rate**: ${totals.ok}/${totals.total}`,
    ``,
    `## What was tested`,
    `- Discovery: \`/.well-known/ai-service.json\` and \`/api/capabilities\``,
    `- Pricing: \`/api/pricing\` (public)`,
    `- Compatibility: \`/api/compatibility\``,
    `- Onboarding: \`POST /api/public/agent-signup\` (tenant API key issuance)`,
    `- PPE enforcement: pre-payment execution must be blocked (PPO gate)`,
    `- Proof verification: \`/api/guarantee-proofs/{proofId}\` and \`/verify/{proofId}\``,
    ``,
    `## Results by persona`,
    `| Persona | Pass | Notes |`,
    `|---|---:|---|`,
    ...summary.results.map((r) => {
      const pass = r.ok ? 'YES' : 'NO';
      const notes = r.ok ? '' : (r.blockers?.[0] ? mdEscape(r.blockers[0]) : 'failed');
      return `| ${mdEscape(r.personaId)} | ${pass} | ${notes} |`;
    }),
    ``,
    `## Funnel health (observed)`,
    `This is a mechanical aggregation of stage events emitted by the personas.`,
    ``,
    `| Stage | Pass | Fail |`,
    `|---|---:|---:|`,
    ...Object.entries(stages)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([stage, c]) => `| ${mdEscape(stage)} | ${c.pass} | ${c.fail} |`),
    ``,
    `## Top blockers / friction points`,
    ...(blockerTop.length
      ? blockerTop.map((b) => `- ${b.count}x ${b.key}`)
      : ['- none observed']),
    ``,
    `## Interpretation (commercial)`,
    `- If “payment confirmation” failures dominate: the API is ready, but the simulation harness needs provider secrets (webhook signature) to fully automate paid flows.`,
    `- If “pre-payment execution not blocked” appears: PPO enforcement is at risk and must be fixed before go-live.`,
    `- If “proof verification” fails: trust/auditability contract is not being delivered and must be fixed before selling to Compliance/Risk buyers.`,
    ``,
    `## Evidence`,
    `All raw scenario artifacts are in this folder (JSON per persona + summary).`,
    ``,
    `## Next recommended actions`,
    `- Ensure webhook secrets are set locally (\`ASAAS_WEBHOOK_SECRET\`, \`NOWPAYMENTS_IPN_SECRET\`) to remove manual confirmation steps.`,
    `- Re-run the suite and check for 100% pass rate on the paid flow scenarios.`,
    ``
  ].join('\n');

  await writeFile(join(outDir, 'agent-readiness-report.md'), report, 'utf8');

  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
