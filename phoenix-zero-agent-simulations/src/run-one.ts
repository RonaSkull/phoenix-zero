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

function envBool(name: string, def: boolean): boolean {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return def;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y' || raw === 'on';
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

function normalizePersonaId(raw: string): string {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'automation_engineer' || v === 'automation-engineer') return 'automation_engineer';
  if (v === 'agent_founder' || v === 'agent-founder') return 'agent_founder';
  if (v === 'compliance_buyer' || v === 'compliance-buyer') return 'compliance_buyer';
  if (v === 'naive_agent' || v === 'naive-agent') return 'naive_agent';
  if (v === 'hostile_agent' || v === 'hostile-agent') return 'hostile_agent';
  return v;
}

async function runPersona(params: { personaId: string; baseUrl: string; asaasWebhookSecret?: string }): Promise<ScenarioResult> {
  if (params.personaId === 'automation_engineer') {
    const simulateRefund = envBool('PHOENIX_ZERO_SIMULATE_REFUND', true);
    return (await runAutomationEngineer({ baseUrl: params.baseUrl, asaasWebhookSecret: params.asaasWebhookSecret, simulateRefund })) as any;
  }
  if (params.personaId === 'agent_founder') {
    return (await runAgentFounder({ baseUrl: params.baseUrl, asaasWebhookSecret: params.asaasWebhookSecret })) as any;
  }
  if (params.personaId === 'compliance_buyer') {
    return (await runComplianceBuyer({ baseUrl: params.baseUrl, asaasWebhookSecret: params.asaasWebhookSecret })) as any;
  }
  if (params.personaId === 'naive_agent') {
    return (await runNaiveAgent({ baseUrl: params.baseUrl })) as any;
  }
  if (params.personaId === 'hostile_agent') {
    return (await runHostileAgent({ baseUrl: params.baseUrl })) as any;
  }

  return {
    ok: false,
    personaId: params.personaId,
    runId: `run_${Date.now()}`,
    events: [],
    blockers: [`[CONFIG] unknown personaId: ${params.personaId}`]
  };
}

async function main() {
  loadEnv();
  const baseUrl = baseUrlFromEnv();
  const asaasWebhookSecret = env('ASAAS_WEBHOOK_SECRET') || undefined;

  const personaId = normalizePersonaId(env('PHOENIX_ZERO_PERSONA') || process.argv[2] || '');
  if (!personaId) {
    console.error('Missing persona. Set PHOENIX_ZERO_PERSONA or pass as argv.');
    process.exit(1);
  }

  const suiteRunId = `suite_${nowId()}_one_${personaId}`;
  const outDir = join(process.cwd(), 'out', suiteRunId);
  await mkdir(outDir, { recursive: true });

  const res = await runPersona({ personaId, baseUrl, asaasWebhookSecret });
  await writeJson(join(outDir, `${res.personaId}.json`), res);

  const totals = { ok: res.ok ? 1 : 0, fail: res.ok ? 0 : 1, total: 1 };
  const summary = {
    suiteRunId,
    baseUrl,
    totals,
    results: [{ personaId: res.personaId, ok: res.ok, blockers: res.blockers, next: res.next || null }]
  };

  await writeJson(join(outDir, 'summary.json'), summary);

  const gapMs = envInt('PHOENIX_ZERO_SCENARIO_GAP_MS', 0);
  if (gapMs > 0) {
    await sleepMs(gapMs);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  process.exit(1);
});
