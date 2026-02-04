import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { publicAgentSignup } from './flows/signup';
import { baseUrlFromEnv } from './lib/http';
import { agentSwapAttackTest } from './tests/agent-swap-attack.test';
import { agentConfusionTest } from './tests/agent-confusion.test';
import { authBypassTest } from './tests/auth-bypass.test';
import { cacheHeadersTest } from './tests/cache-headers.test';
import { negotiationAbuseTest } from './tests/negotiation-abuse.test';
import { nowPaymentsPartiallyPaidDoesNotUnlockTest } from './tests/nowpayments-partially-paid.test';
import { nowPaymentsStatusRegressionIgnoredTest } from './tests/nowpayments-status-regression.test';
import { nowPaymentsWebhookSignatureInvalidTest } from './tests/nowpayments-webhook-signature-invalid.test';
import { nowPaymentsWebhookUnknownInvoiceTest } from './tests/nowpayments-webhook-unknown-invoice.test';
import { paramInjectionTest } from './tests/param-injection.test';
import { partialFailureTest } from './tests/partial-failure.test';
import { providerDowntimeTest } from './tests/provider-downtime.test';
import { proofReuseAttackTest } from './tests/proof-reuse-attack.test';
import { quantityAbuseTest } from './tests/quantity-abuse.test';
import { raceGateTest } from './tests/race-gate.test';
import { rateLimitTest } from './tests/rate-limit.test';
import { riskWindowTest } from './tests/risk-window.test';
import { sovereignEntitlementTest } from './tests/sovereign-entitlement.test';
import { stateConsistencyTest } from './tests/state-consistency.test';
import { webhookOutOfOrderTest } from './tests/webhook-ordering.test';

type TestResult = {
  ok: boolean;
  testId: string;
  iteration: number;
  ms: number;
  error?: string;
  data?: any;
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

function nowId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function b64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseArgValue(prefix: string): string | null {
  for (const a of process.argv.slice(2)) {
    const s = String(a || '').trim();
    if (!s) continue;
    if (s === prefix) return '';
    if (s.startsWith(prefix + '=')) return s.slice(prefix.length + 1);
  }
  return null;
}

function parseOnlySet(): Set<string> {
  const raw = parseArgValue('--only') ?? env('PHOENIX_ZERO_HARDENING_ONLY');
  const set = new Set<string>();
  for (const part of String(raw || '').split(',')) {
    const k = String(part || '').trim().toLowerCase();
    if (!k) continue;
    set.add(k);
  }
  return set;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, Math.max(0, Math.trunc(ms))));
}

async function writeJson(path: string, data: any) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

async function runOne(params: {
  testId: string;
  iteration: number;
  fn: () => Promise<any>;
}): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const data = await params.fn();
    return { ok: true, testId: params.testId, iteration: params.iteration, ms: Date.now() - t0, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, testId: params.testId, iteration: params.iteration, ms: Date.now() - t0, error: msg };
  }
}

async function main() {
  loadEnv();

  const baseUrl = baseUrlFromEnv();
  const asaasWebhookSecret = env('ASAAS_WEBHOOK_SECRET') || undefined;
  const nowPaymentsIpnSecret = env('NOWPAYMENTS_IPN_SECRET');
  const adminToken = env('PHOENIX_ZERO_ADMIN_TOKEN') || undefined;

  const operation = env('PHOENIX_ZERO_HARDENING_OPERATION') || 'protect_video';
  const taskType = env('PHOENIX_ZERO_HARDENING_TASK_TYPE') || operation;

  const iterationsArg = parseArgValue('--iterations');
  const iterations = Math.max(1, Math.min(50, Math.trunc(Number(iterationsArg ?? envInt('PHOENIX_ZERO_HARDENING_ITERATIONS', 1)))));

  const gateNArg = parseArgValue('--gateN');
  const gateN = Math.max(1, Math.min(500, Math.trunc(Number(gateNArg ?? envInt('PHOENIX_ZERO_HARDENING_GATE_N', 100)))));

  const executeNArg = parseArgValue('--executeN');
  const executeN = Math.max(0, Math.min(200, Math.trunc(Number(executeNArg ?? envInt('PHOENIX_ZERO_HARDENING_EXECUTE_N', 20)))));

  const sleepBetweenMs = Math.max(0, Math.trunc(envInt('PHOENIX_ZERO_HARDENING_SLEEP_BETWEEN_MS', 500)));

  const only = parseOnlySet();
  const onlyCrypto = only.has('crypto');

  if (onlyCrypto && !nowPaymentsIpnSecret) {
    throw new Error('Missing NOWPAYMENTS_IPN_SECRET (required for --only=crypto)');
  }

  const suiteRunId = `hardening_${nowId()}`;
  const outDir = join(process.cwd(), 'out', suiteRunId);
  await mkdir(outDir, { recursive: true });

  const signup = await publicAgentSignup(baseUrl, {
    agentType: 'platform_engineer',
    intendedUse: 'hardening suite',
    currency: onlyCrypto ? 'USD' : 'BRL'
  });

  if (!signup.ok) {
    await writeJson(join(outDir, 'signup.json'), signup);
    throw new Error(`Agent signup failed status=${signup.status}`);
  }

  const apiKey = signup.apiKey;
  const tenantId = signup.tenantId;

  const tests: Array<{
    testId: string;
    enabled: boolean;
    run: (iteration: number) => Promise<any>;
  }> = [
    {
      testId: 'auth-bypass',
      enabled: only.size === 0 || onlyCrypto || only.has('auth-bypass') || only.has('bypass') || only.has('auth'),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return authBypassTest({ baseUrl, agentId });
      }
    },
    {
      testId: 'sovereign-entitlement',
      enabled:
        !onlyCrypto &&
        (only.size === 0 ? Boolean(adminToken) : true) &&
        (only.size === 0 ||
          only.has('sovereign-entitlement') ||
          only.has('sovereign') ||
          only.has('contract') ||
          only.has('pricing-contract')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return sovereignEntitlementTest({
          baseUrl,
          apiKey,
          tenantId,
          adminToken: String(adminToken || ''),
          asaasWebhookSecret,
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'state-consistency',
      enabled: !onlyCrypto && (only.size === 0 || only.has('state-consistency') || only.has('consistency') || only.has('ftu')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return stateConsistencyTest({ baseUrl, apiKey, asaasWebhookSecret, agentId, taskType, operation });
      }
    },
    {
      testId: 'state-consistency-crypto',
      enabled: Boolean(nowPaymentsIpnSecret) && (only.size === 0 || only.has('state-consistency-crypto') || only.has('consistency-crypto') || only.has('crypto')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return stateConsistencyTest({
          baseUrl,
          apiKey,
          providerHint: 'crypto',
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'webhook-ordering',
      enabled: !onlyCrypto && (only.size === 0 || only.has('webhook-ordering') || only.has('ordering') || only.has('webhooks')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return webhookOutOfOrderTest({ baseUrl, apiKey, asaasWebhookSecret, agentId, taskType, operation });
      }
    },
    {
      testId: 'webhook-ordering-crypto',
      enabled: Boolean(nowPaymentsIpnSecret) && (only.size === 0 || only.has('webhook-ordering-crypto') || only.has('ordering-crypto') || only.has('crypto')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return webhookOutOfOrderTest({
          baseUrl,
          apiKey,
          providerHint: 'crypto',
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'nowpayments-webhook-signature-invalid',
      enabled:
        Boolean(nowPaymentsIpnSecret) &&
        (only.size === 0 || only.has('nowpayments-webhook-signature-invalid') || only.has('nowpayments') || only.has('crypto')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return nowPaymentsWebhookSignatureInvalidTest({
          baseUrl,
          apiKey,
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'nowpayments-webhook-unknown-invoice',
      enabled:
        Boolean(nowPaymentsIpnSecret) &&
        (only.size === 0 || only.has('nowpayments-webhook-unknown-invoice') || only.has('nowpayments') || only.has('crypto')),
      run: async () => {
        return nowPaymentsWebhookUnknownInvoiceTest({ baseUrl, nowPaymentsIpnSecret });
      }
    },
    {
      testId: 'nowpayments-partially-paid',
      enabled:
        Boolean(nowPaymentsIpnSecret) &&
        (only.size === 0 || only.has('nowpayments-partially-paid') || only.has('nowpayments') || only.has('crypto')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return nowPaymentsPartiallyPaidDoesNotUnlockTest({
          baseUrl,
          apiKey,
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'nowpayments-status-regression',
      enabled:
        Boolean(nowPaymentsIpnSecret) &&
        (only.size === 0 || only.has('nowpayments-status-regression') || only.has('nowpayments') || only.has('crypto')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return nowPaymentsStatusRegressionIgnoredTest({
          baseUrl,
          apiKey,
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'race-gate',
      enabled: !onlyCrypto && (only.size === 0 || only.has('race-gate') || only.has('race')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return raceGateTest({ baseUrl, apiKey, asaasWebhookSecret, agentId, taskType, operation, gateN, executeN });
      }
    },
    {
      testId: 'race-gate-crypto',
      enabled: Boolean(nowPaymentsIpnSecret) && (only.size === 0 || only.has('race-gate-crypto') || only.has('race-crypto') || only.has('crypto')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return raceGateTest({
          baseUrl,
          apiKey,
          providerHint: 'crypto',
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation,
          gateN,
          executeN
        });
      }
    },
    {
      testId: 'cache-headers',
      enabled: only.size === 0 || onlyCrypto || only.has('cache-headers') || only.has('cache'),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return cacheHeadersTest({ baseUrl, apiKey, agentId });
      }
    },
    {
      testId: 'proof-reuse-attack',
      enabled: !onlyCrypto && (only.size === 0 || only.has('proof-reuse-attack') || only.has('proof-reuse') || only.has('reuse') || only.has('adversarial')),
      run: async () => {
        const agentA = `ag_${b64Url(randomBytes(12))}`;
        const agentB = `ag_${b64Url(randomBytes(12))}`;
        return proofReuseAttackTest({ baseUrl, apiKey, asaasWebhookSecret, agentA, agentB, taskType, operation });
      }
    },
    {
      testId: 'proof-reuse-attack-crypto',
      enabled: Boolean(nowPaymentsIpnSecret) && (only.size === 0 || only.has('proof-reuse-attack-crypto') || only.has('proof-reuse-crypto') || only.has('reuse-crypto') || only.has('crypto') || only.has('adversarial')),
      run: async () => {
        const agentA = `ag_${b64Url(randomBytes(12))}`;
        const agentB = `ag_${b64Url(randomBytes(12))}`;
        return proofReuseAttackTest({
          baseUrl,
          apiKey,
          providerHint: 'crypto',
          nowPaymentsIpnSecret,
          agentA,
          agentB,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'agent-swap-attack',
      enabled: !onlyCrypto && (only.size === 0 || only.has('agent-swap-attack') || only.has('agent-swap') || only.has('swap') || only.has('adversarial')),
      run: async () => {
        const agentA = `ag_${b64Url(randomBytes(12))}`;
        const agentB = `ag_${b64Url(randomBytes(12))}`;
        return agentSwapAttackTest({ baseUrl, apiKey, asaasWebhookSecret, agentA, agentB, taskType, operation });
      }
    },
    {
      testId: 'agent-swap-attack-crypto',
      enabled: Boolean(nowPaymentsIpnSecret) && (only.size === 0 || only.has('agent-swap-attack-crypto') || only.has('agent-swap-crypto') || only.has('swap-crypto') || only.has('crypto') || only.has('adversarial')),
      run: async () => {
        const agentA = `ag_${b64Url(randomBytes(12))}`;
        const agentB = `ag_${b64Url(randomBytes(12))}`;
        return agentSwapAttackTest({
          baseUrl,
          apiKey,
          providerHint: 'crypto',
          nowPaymentsIpnSecret,
          agentA,
          agentB,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'quantity-abuse',
      enabled: !onlyCrypto && (only.size === 0 || only.has('quantity-abuse') || only.has('quantity')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return quantityAbuseTest({ baseUrl, apiKey, asaasWebhookSecret, agentId, taskType, operation });
      }
    },
    {
      testId: 'quantity-abuse-crypto',
      enabled: Boolean(nowPaymentsIpnSecret) && (only.size === 0 || only.has('quantity-abuse-crypto') || only.has('quantity-crypto') || only.has('crypto')),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return quantityAbuseTest({
          baseUrl,
          apiKey,
          providerHint: 'crypto',
          nowPaymentsIpnSecret,
          agentId,
          taskType,
          operation
        });
      }
    },
    {
      testId: 'partial-failure',
      enabled: only.has('partial-failure') || env('PHOENIX_ZERO_HARDENING_PARTIAL_FAILURE_ENABLED') === 'true',
      run: async () => {
        if (!asaasWebhookSecret) throw new Error('Missing ASAAS_WEBHOOK_SECRET (required for partial-failure test)');
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return partialFailureTest({ baseUrl, apiKey, asaasWebhookSecret, agentId, taskType, operation });
      }
    },
    {
      testId: 'risk-window',
      enabled: only.has('risk-window') || env('PHOENIX_ZERO_HARDENING_RISK_WINDOW_ENABLED') === 'true',
      run: async () => {
        const adminToken = env('PHOENIX_ZERO_ADMIN_TOKEN');
        if (!adminToken) throw new Error('Missing PHOENIX_ZERO_ADMIN_TOKEN (required for risk-window test)');
        if (!asaasWebhookSecret) throw new Error('Missing ASAAS_WEBHOOK_SECRET (required for risk-window test)');
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return riskWindowTest({ baseUrl, apiKey, asaasWebhookSecret, adminToken, agentId, taskType, operation });
      }
    },
    {
      testId: 'provider-downtime',
      enabled: only.has('provider-downtime') || env('PHOENIX_ZERO_HARDENING_PROVIDER_DOWNTIME_ENABLED') === 'true',
      run: async () => {
        if (!asaasWebhookSecret) throw new Error('Missing ASAAS_WEBHOOK_SECRET (required for provider-downtime test)');
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return providerDowntimeTest({ baseUrl, apiKey, asaasWebhookSecret, agentId, taskType, operation });
      }
    },
    {
      testId: 'agent-confusion',
      enabled: only.size === 0 || onlyCrypto || only.has('agent-confusion') || only.has('confusion'),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return agentConfusionTest({ baseUrl, apiKey, agentId, taskType, operation });
      }
    },
    {
      testId: 'negotiation-abuse',
      enabled: only.size === 0 || onlyCrypto || only.has('negotiation-abuse') || only.has('negotiation'),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return negotiationAbuseTest({ baseUrl, apiKey, agentId });
      }
    },
    {
      testId: 'param-injection',
      enabled: only.size === 0 || onlyCrypto || only.has('param-injection') || only.has('injection'),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return paramInjectionTest({ baseUrl, apiKey, agentId });
      }
    },
    {
      testId: 'rate-limit',
      enabled: only.size === 0 || onlyCrypto || only.has('rate-limit') || only.has('ratelimit'),
      run: async () => {
        const agentId = `ag_${b64Url(randomBytes(12))}`;
        return rateLimitTest({ baseUrl, apiKey, agentId });
      }
    }
  ];

  const results: TestResult[] = [];

  for (const t of tests) {
    if (!t.enabled) continue;

    for (let i = 1; i <= iterations; i += 1) {
      const r = await runOne({ testId: t.testId, iteration: i, fn: () => t.run(i) });
      results.push(r);
      await writeJson(join(outDir, `${t.testId}.${i}.json`), r);
      if (sleepBetweenMs > 0) await sleepMs(sleepBetweenMs);
    }
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;

  const summary = {
    suiteRunId,
    baseUrl,
    iterations,
    tests: tests.filter((t) => t.enabled).map((t) => t.testId),
    totals: { pass, fail, total: results.length },
    results
  };

  await writeJson(join(outDir, 'summary.json'), summary);

  const md = [
    `# Hardening Suite Summary`,
    ``,
    `- **Base URL**: \`${baseUrl}\``,
    `- **Suite Run ID**: \`${suiteRunId}\``,
    `- **Iterations**: ${iterations}`,
    `- **Pass**: ${pass}/${results.length}`,
    ``,
    `## Results`,
    `| Test | Iter | OK | ms | Error |`,
    `|---|---:|---:|---:|---|`,
    ...results.map((r) => `| ${r.testId} | ${r.iteration} | ${r.ok ? 'YES' : 'NO'} | ${r.ms} | ${(r.error || '').replace(/\|/g, '\\|')} |`)
  ].join('\n');

  await writeFile(join(outDir, 'summary.md'), md, 'utf8');

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(msg);
  process.exitCode = 1;
});
