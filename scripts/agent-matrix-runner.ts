import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Json = any;

type HttpRes = {
  ok: boolean;
  status: number;
  url: string;
  json: Json | null;
  text: string;
};

type NegativeTestKind =
  | 'compat_missing_fields'
  | 'compat_unsupported_operation'
  | 'compat_weird_operation_whitespace'
  | 'compat_overcreative_payload';

type AgentScenario = {
  id: string;
  group: 'autonomous' | 'tool_driven' | 'human_assisted' | 'hostile';
  title: string;
  description: string;
  desiredOperation: string;
  negativeTests: NegativeTestKind[];
};

type PhaseResult = {
  phase: 'discovery' | 'capability_match' | 'attempted_quote' | 'execution' | 'outcome_interpretation';
  ok: boolean;
  notes: string[];
  evidence?: any;
};

type ScenarioResult = {
  scenario: AgentScenario;
  phases: PhaseResult[];
  summary: {
    ok: boolean;
    blockers: string[];
  };
};

type SignupResult =
  | {
      ok: true;
      tenantId: string;
      apiKey: string;
      raw: any;
    }
  | { ok: false; status: number; rawText: string; rawJson: any };

type SignupCache = Record<
  string,
  {
    tenantId: string;
    apiKey: string;
    createdAt: number;
  }
>;

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

function argValue(name: string): string | null {
  const idx = process.argv.findIndex((x) => x === name);
  if (idx < 0) return null;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith('-')) return null;
  return String(v);
}

function stripTrailingSlashes(s: string): string {
  return String(s || '').replace(/\/+$/g, '');
}

function safeFileName(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function signupCachePath(): string {
  return resolve(process.cwd(), 'docs', 'pay-per-execution', 'agent-matrix-reports', 'agent_signup_cache.json');
}

function loadSignupCache(): SignupCache {
  const p = signupCachePath();
  if (!existsSync(p)) return {};
  try {
    const raw = readFileSync(p, 'utf8');
    const j = raw ? JSON.parse(raw) : null;
    if (!j || typeof j !== 'object') return {};
    return j as SignupCache;
  } catch {
    return {};
  }
}

function saveSignupCache(cache: SignupCache) {
  const p = signupCachePath();
  mkdirSync(resolve(process.cwd(), 'docs', 'pay-per-execution', 'agent-matrix-reports'), { recursive: true });
  writeFileSync(p, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

function cacheKeyForBaseUrl(baseUrl: string): string {
  return safeFileName(stripTrailingSlashes(baseUrl));
}

async function readJsonSafe(res: Response): Promise<{ json: Json | null; text: string }> {
  const text = await res.text().catch(() => '');
  try {
    return { json: text ? JSON.parse(text) : null, text };
  } catch {
    return { json: null, text };
  }
}

async function httpJson(params: {
  method: 'GET' | 'POST';
  url: string;
  apiKey?: string;
  body?: any;
  headers?: Record<string, string>;
}): Promise<HttpRes> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (params.apiKey) headers['x-api-key'] = params.apiKey;
  for (const [k, v] of Object.entries(params.headers || {})) {
    const kk = String(k || '').trim();
    const vv = String(v ?? '').trim();
    if (!kk || !vv) continue;
    headers[kk] = vv;
  }

  const timeoutMs = Math.max(1000, Number(env('PHOENIX_ZERO_HTTP_TIMEOUT_MS') || '45000'));
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(params.url, {
      method: params.method,
      headers,
      body: params.method === 'POST' ? JSON.stringify(params.body ?? {}) : undefined,
      signal: ac.signal
    });
  } finally {
    clearTimeout(t);
  }

  const j = await readJsonSafe(res);
  return { ok: res.ok, status: res.status, url: params.url, json: j.json, text: j.text };
}

async function publicAgentSignup(baseUrl: string): Promise<SignupResult> {
  const nonce = Math.random().toString(36).slice(2, 10);
  const body = {
    name: `Agent Signup ${nonce}`,
    email: `agent-${nonce}@example.com`,
    agentType: 'buyer',
    intendedUse: 'autonomous agent test',
    acceptsTermsVersion: '2026-01-v1',
    acceptsFixedPricing: true,
    billingMode: 'prepaid',
    currency: 'USD'
  };

  const res = await httpJson({ method: 'POST', url: `${baseUrl}/api/public/agent-signup`, body });
  if (!res.ok || !res.json || typeof res.json !== 'object') {
    return { ok: false, status: res.status, rawText: res.text, rawJson: res.json };
  }

  const tenantId = String((res.json as any)?.tenant?.tenantId || '').trim();
  const apiKey = String((res.json as any)?.tenant?.apiKey || '').trim();
  if (!tenantId || !apiKey) {
    return { ok: false, status: res.status, rawText: res.text, rawJson: res.json };
  }

  return { ok: true, tenantId, apiKey, raw: res.json };
}

async function negotiationAck(baseUrl: string): Promise<HttpRes> {
  return httpJson({
    method: 'POST',
    url: `${baseUrl}/api/negotiation/ack`,
    headers: {
      'x-agent-class': 'enterprise-buyer',
      'x-agent-intent': 'negotiate'
    },
    body: {
      agentType: 'enterprise_procurement',
      intent: 'confirm_terms',
      plan: 'public_fixed_v1',
      expectedVolume: 'low_initial',
      currency: 'USD'
    }
  });
}

let negotiationAckMemo: { baseUrl: string; res: HttpRes } | null = null;

async function negotiationAckOnce(baseUrl: string): Promise<HttpRes> {
  if (negotiationAckMemo && negotiationAckMemo.baseUrl === baseUrl) return negotiationAckMemo.res;
  const res = await negotiationAck(baseUrl);
  negotiationAckMemo = { baseUrl, res };
  return res;
}

function isMachineReadableError(res: HttpRes): boolean {
  const j = res.json;
  if (!j || typeof j !== 'object') return false;
  if ((j as any).ok !== false) return false;
  const reasonCode = String((j as any).reasonCode || '').trim();
  const reason = String((j as any).reason || '').trim();
  const message = String((j as any).message || '').trim();
  return Boolean(reasonCode || reason || message);
}

function hasMissingFields(res: HttpRes): boolean {
  const j = res.json;
  if (!j || typeof j !== 'object') return false;
  return Array.isArray((j as any).missingFields) && (j as any).missingFields.length > 0;
}

function summarize(res: HttpRes): any {
  const j = res.json;
  const out: any = { status: res.status, ok: res.ok, url: res.url };
  if (j && typeof j === 'object') {
    for (const k of ['ok', 'reasonCode', 'reason', 'message', 'missingFields', 'suggestions', 'compatible', 'operation']) {
      if (Object.prototype.hasOwnProperty.call(j, k)) out[k] = (j as any)[k];
    }
  }
  return out;
}

function scenarios(): AgentScenario[] {
  return [
    // Grupo 1
    {
      id: 'agent_buyer',
      group: 'autonomous',
      title: 'Agent-Buyer',
      description: 'Compra com budget fixo; precisa de preço claro e onboarding explícito.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_missing_fields', 'compat_unsupported_operation']
    },
    {
      id: 'agent_optimizer',
      group: 'autonomous',
      title: 'Agent-Optimizer',
      description: 'Compara operações e escolhe a mais barata compatível.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_weird_operation_whitespace', 'compat_unsupported_operation']
    },
    {
      id: 'agent_negotiator',
      group: 'autonomous',
      title: 'Agent-Negotiator',
      description: 'Tenta negociar / pedir custom pricing.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_overcreative_payload']
    },
    {
      id: 'agent_batch_operator',
      group: 'autonomous',
      title: 'Agent-Batch Operator',
      description: 'Encadeia operações e busca throughput/limites.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_unsupported_operation']
    },

    // Grupo 2
    {
      id: 'planner_agent',
      group: 'tool_driven',
      title: 'Planner Agent',
      description: 'Planeja antes; usa discovery/capabilities/compatibility como gating.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_missing_fields']
    },
    {
      id: 'executor_agent',
      group: 'tool_driven',
      title: 'Executor Agent',
      description: 'Só executa o que mandam; falha se o próximo passo não for explícito.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_weird_operation_whitespace']
    },
    {
      id: 'validator_agent',
      group: 'tool_driven',
      title: 'Validator Agent',
      description: 'Exige erros machine-readable consistentes e missingFields quando aplicável.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_missing_fields', 'compat_overcreative_payload']
    },
    {
      id: 'recovery_agent',
      group: 'tool_driven',
      title: 'Recovery Agent',
      description: 'Atua em falhas; avalia clareza de 401/403 e se retry faz sentido.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_unsupported_operation']
    },

    // Grupo 3
    {
      id: 'copilot_agent',
      group: 'human_assisted',
      title: 'Copilot Agent',
      description: 'Transforma a resposta em texto para humano; precisa de mensagens acionáveis.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_missing_fields']
    },
    {
      id: 'approval_gate_agent',
      group: 'human_assisted',
      title: 'Approval-Gate Agent',
      description: 'Precisa de aprovação humana antes de checkout.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_unsupported_operation']
    },
    {
      id: 'budget_guardian_agent',
      group: 'human_assisted',
      title: 'Budget-Guardian Agent',
      description: 'Bloqueia se custo excede limite; depende de pricing estável.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_unsupported_operation']
    },

    // Grupo 4
    {
      id: 'blind_agent',
      group: 'hostile',
      title: 'Blind Agent',
      description: 'Chuta requests; testa robustez e erro acionável.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_missing_fields', 'compat_weird_operation_whitespace']
    },
    {
      id: 'schema_guessing_agent',
      group: 'hostile',
      title: 'Schema-Guessing Agent',
      description: 'Deduz schema errado; espera missingFields.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_missing_fields', 'compat_overcreative_payload']
    },
    {
      id: 'over_creative_agent',
      group: 'hostile',
      title: 'Over-Creative Agent',
      description: 'Inventa parâmetros; API deve rejeitar lixo de forma consistente.',
      desiredOperation: 'protect_video',
      negativeTests: ['compat_overcreative_payload']
    },
    {
      id: 'out_of_scope_agent',
      group: 'hostile',
      title: 'Out-of-Scope Agent',
      description: 'Tenta usar operação inexistente; precisa de feedback claro + suggestions.',
      desiredOperation: 'do_something_impossible',
      negativeTests: ['compat_unsupported_operation']
    }
  ];
}

async function discoverySuite(baseUrl: string): Promise<{ ok: boolean; notes: string[]; evidence: any }>
{
  const notes: string[] = [];
  const wellKnown = await httpJson({ method: 'GET', url: `${baseUrl}/.well-known/ai-service.json` });
  const capabilities = await httpJson({ method: 'GET', url: `${baseUrl}/api/capabilities` });
  const pricing = await httpJson({ method: 'GET', url: `${baseUrl}/api/pricing` });
  const docs = await httpJson({ method: 'GET', url: `${baseUrl}/api/docs/ai-service-discovery` });

  if (!(wellKnown.ok && wellKnown.json && typeof wellKnown.json === 'object')) notes.push('Discovery: /.well-known not ok or not JSON');
  if (!(capabilities.ok && capabilities.json && typeof capabilities.json === 'object')) notes.push('Capability discovery: /api/capabilities not ok or not JSON');
  if (!(pricing.ok && pricing.json && typeof pricing.json === 'object')) notes.push('Pricing: /api/pricing not ok or not JSON');
  if (!(docs.ok && (docs.text || '').trim().length > 0)) notes.push('Docs: /api/docs/ai-service-discovery empty or not ok');

  return {
    ok: notes.length === 0,
    notes,
    evidence: {
      wellKnown: summarize(wellKnown),
      capabilities: summarize(capabilities),
      pricing: summarize(pricing),
      docs: { status: docs.status, ok: docs.ok, url: docs.url }
    }
  };
}

async function compatPositive(baseUrl: string, operation: string): Promise<{ ok: boolean; notes: string[]; evidence: any }>
{
  const res = await httpJson({
    method: 'POST',
    url: `${baseUrl}/api/compatibility`,
    body: { operation, intent: 'execute', supportsPpo: true }
  });

  const notes: string[] = [];
  if (!res.ok) notes.push(`compatibility positive expected 200, got ${res.status}`);
  if (!res.json || typeof res.json !== 'object') notes.push('compatibility positive: response not JSON');
  if (res.json && typeof res.json === 'object' && (res.json as any).ok !== true) notes.push('compatibility positive: ok!=true');

  return { ok: notes.length === 0, notes, evidence: summarize(res) };
}

async function compatNegative(baseUrl: string, kind: NegativeTestKind): Promise<{ ok: boolean; notes: string[]; evidence: any }>
{
  const notes: string[] = [];
  let res: HttpRes;

  if (kind === 'compat_missing_fields') {
    res = await httpJson({ method: 'POST', url: `${baseUrl}/api/compatibility`, body: {} });
    if (res.status !== 400) notes.push(`expected 400 for missing fields, got ${res.status}`);
    if (!isMachineReadableError(res)) notes.push('expected machine-readable error body');
    if (!hasMissingFields(res)) notes.push('expected missingFields[] in error');
    return { ok: notes.length === 0, notes, evidence: summarize(res) };
  }

  if (kind === 'compat_unsupported_operation') {
    res = await httpJson({
      method: 'POST',
      url: `${baseUrl}/api/compatibility`,
      body: { operation: 'this_operation_does_not_exist', intent: 'execute', supportsPpo: true }
    });
    if (res.status !== 200) notes.push(`expected 200 with compatible:false, got ${res.status}`);
    if (!res.json || typeof res.json !== 'object') notes.push('expected JSON');
    if (res.json && typeof res.json === 'object') {
      if ((res.json as any).ok !== true) notes.push('expected ok:true');
      if ((res.json as any).compatible !== false) notes.push('expected compatible:false');
      const rc = String((res.json as any).reasonCode || '');
      if (!rc) notes.push('expected reasonCode');
    }
    return { ok: notes.length === 0, notes, evidence: summarize(res) };
  }

  if (kind === 'compat_weird_operation_whitespace') {
    res = await httpJson({
      method: 'POST',
      url: `${baseUrl}/api/compatibility`,
      body: { operation: '  PROTECT_VIDEO  ', intent: 'execute', supportsPpo: true }
    });
    if (res.status !== 200) notes.push(`expected 200, got ${res.status}`);
    if (!res.json || typeof res.json !== 'object') notes.push('expected JSON');
    if (res.json && typeof res.json === 'object' && (res.json as any).ok !== true) notes.push('expected ok:true');
    if (res.json && typeof res.json === 'object' && (res.json as any).compatible !== true) notes.push('expected compatible:true');
    return { ok: notes.length === 0, notes, evidence: summarize(res) };
  }

  // compat_overcreative_payload
  res = await httpJson({
    method: 'POST',
    url: `${baseUrl}/api/compatibility`,
    body: { operation: 'protect_video', intent: 'execute', supportsPpo: true, creative: { nested: ['junk'] } }
  });
  if (res.status !== 200) notes.push(`expected 200, got ${res.status}`);
  if (!res.json || typeof res.json !== 'object') notes.push('expected JSON');
  if (res.json && typeof res.json === 'object' && (res.json as any).ok !== true) notes.push('expected ok:true');
  return { ok: notes.length === 0, notes, evidence: summarize(res) };
}

async function onboardingBarrier(baseUrl: string, tenantApiKey?: string): Promise<{ ok: boolean; notes: string[]; evidence: any }>
{
  const notes: string[] = [];
  const apiKey = (tenantApiKey || '').trim();

  const checkoutUnauth = await httpJson({
    method: 'POST',
    url: `${baseUrl}/api/checkout/create`,
    body: { currency: 'BRL', providerHint: 'pix', lineItems: [{ operation: 'protect_video', units: 1 }], proofMeta: { agentId: 'ag_demo', taskType: 'protect_video', taskInputHash: 'x', taskOutputHash: 'y' } }
  });

  if (checkoutUnauth.status === 401) {
    notes.push('Expected: checkout/create requires x-api-key (tenant authentication).');
  } else {
    notes.push(`Unexpected: checkout/create without x-api-key should be 401, got ${checkoutUnauth.status}`);
  }

  let checkoutAuth: HttpRes | null = null;
  if (apiKey) {
    checkoutAuth = await httpJson({
      method: 'POST',
      url: `${baseUrl}/api/checkout/create`,
      apiKey,
      body: { currency: 'BRL', providerHint: 'pix', lineItems: [{ operation: 'protect_video', units: 1 }], proofMeta: { agentId: 'ag_demo', taskType: 'protect_video', taskInputHash: 'x', taskOutputHash: 'y' } }
    });
    if (checkoutAuth.status !== 200) notes.push(`expected 200 on checkout/create with x-api-key, got ${checkoutAuth.status}`);
  } else {
    notes.push('Blocker: no tenant API key provided; agent cannot purchase/execute without onboarding/self-serve key issuance.');
  }

  const okUnauthBehavior = checkoutUnauth.status === 401;
  const okAuthBehavior = apiKey ? checkoutAuth?.status === 200 : false;
  const ok = okUnauthBehavior && okAuthBehavior;

  return {
    ok,
    notes,
    evidence: {
      checkoutUnauth: summarize(checkoutUnauth),
      checkoutAuth: checkoutAuth ? summarize(checkoutAuth) : null
    }
  };
}

function phase(phaseName: PhaseResult['phase'], r: { ok: boolean; notes: string[]; evidence?: any }): PhaseResult {
  return { phase: phaseName, ok: r.ok, notes: r.notes, evidence: r.evidence };
}

async function runScenario(baseUrl: string, s: AgentScenario, tenantApiKey?: string): Promise<ScenarioResult> {
  const phases: PhaseResult[] = [];
  const blockers: string[] = [];

  // 1) Discovery
  const disc = await discoverySuite(baseUrl);
  phases.push(phase('discovery', disc));
  if (!disc.ok) blockers.push('discovery_failed');

  // 2) Capability match (proxy: compatibility positive)
  const cap = await compatPositive(baseUrl, s.desiredOperation);
  phases.push(phase('capability_match', cap));
  if (!cap.ok) blockers.push('capability_match_failed');

  // 3) Attempted quote (proxy: negative tests via compatibility error contract)
  const attemptNotes: string[] = [];
  const attemptEvidence: any[] = [];
  let attemptOk = true;

  if (s.id === 'agent_buyer' || s.id === 'approval_gate_agent' || s.id === 'budget_guardian_agent') {
    const ack = await negotiationAckOnce(baseUrl);
    attemptEvidence.push({ test: 'negotiation_ack', ...summarize(ack) });
    if (!ack.ok) {
      if (ack.status === 429) {
        attemptNotes.push('negotiation_ack rate_limited (429)');
      } else {
        attemptOk = false;
        attemptNotes.push(`negotiation_ack failed (${ack.status})`);
      }
    }
  }

  for (const nt of s.negativeTests) {
    const r = await compatNegative(baseUrl, nt);
    attemptEvidence.push({ test: nt, ...r.evidence, notes: r.notes, ok: r.ok });
    if (!r.ok) {
      attemptOk = false;
      attemptNotes.push(`${nt} failed`);
    }
  }
  phases.push(phase('attempted_quote', { ok: attemptOk, notes: attemptNotes, evidence: attemptEvidence }));
  if (!attemptOk) blockers.push('error_contract_failed');

  // 4) Execution (proxy: onboarding barrier + checkout)
  const onb = await onboardingBarrier(baseUrl, tenantApiKey);
  phases.push(phase('execution', onb));
  if (!onb.ok) {
    const hasKey = Boolean((tenantApiKey || '').trim());
    blockers.push(hasKey ? 'checkout_failed_with_api_key' : 'missing_self_serve_onboarding');
  }

  // 5) Outcome interpretation (proxy: can we describe next steps?)
  const outcomeNotes: string[] = [];
  if (!tenantApiKey) outcomeNotes.push('Blocker: agent cannot complete purchase without a tenant API key (no self-serve onboarding).');
  if (onb.evidence?.checkoutUnauth?.status === 401) outcomeNotes.push('Expected: checkout requires x-api-key; agent must obtain tenant key before buying.');
  const outcomeOk = true;
  phases.push(phase('outcome_interpretation', { ok: outcomeOk, notes: outcomeNotes, evidence: null }));

  return {
    scenario: s,
    phases,
    summary: { ok: blockers.length === 0, blockers }
  };
}

function printSummary(results: ScenarioResult[]) {
  const rows = results.map((r) => {
    const ok = r.summary.ok ? 'OK' : 'FAIL';
    const blockers = r.summary.blockers.join(',');
    return { id: r.scenario.id, agent: r.scenario.title, group: r.scenario.group, ok, blockers };
  });

  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

  console.log('---');
  console.log('Agent Matrix Summary');
  console.log(pad('AGENT', 22) + pad('GROUP', 15) + pad('OK', 6) + 'BLOCKERS');
  for (const r of rows) {
    console.log(pad(r.agent, 22) + pad(r.group, 15) + pad(r.ok, 6) + r.blockers);
  }

  const failCount = rows.filter((r) => r.ok !== 'OK').length;
  console.log('---');
  console.log(JSON.stringify({ total: rows.length, failed: failCount }, null, 2));
}

async function main() {
  const baseUrl = stripTrailingSlashes(argValue('--baseUrl') || env('PHOENIX_ZERO_BASE_URL') || 'https://phoenix-zero-web.onrender.com');
  const tenantApiKeyArg = argValue('--tenantApiKey') || env('PHOENIX_ZERO_TENANT_API_KEY') || env('TENANT_API_KEY') || '';
  const outDirFlag = argValue('--outDir') || '';

  let tenantApiKey = String(tenantApiKeyArg || '').trim();
  let signupInfo: any = null;
  if (!tenantApiKey) {
    const cache = loadSignupCache();
    const ck = cacheKeyForBaseUrl(baseUrl);
    const cached = cache[ck];
    if (cached?.apiKey) {
      tenantApiKey = cached.apiKey;
      signupInfo = { ok: true, tenantId: cached.tenantId, source: 'cache' };
    } else {
      const signup = await publicAgentSignup(baseUrl);
      if (signup.ok) {
        tenantApiKey = signup.apiKey;
        cache[ck] = { tenantId: signup.tenantId, apiKey: signup.apiKey, createdAt: Date.now() };
        saveSignupCache(cache);
        signupInfo = { ok: true, tenantId: signup.tenantId, source: 'signup' };
      } else {
        if (signup.status === 429 && cached?.apiKey) {
          tenantApiKey = cached.apiKey;
          signupInfo = { ok: true, tenantId: cached.tenantId, source: 'cache_after_429', signupStatus: 429 };
        } else {
          signupInfo = { ok: false, status: signup.status };
        }
      }
    }
  }

  console.log('Agent matrix runner');
  console.log(JSON.stringify({ baseUrl, hasTenantApiKey: Boolean(tenantApiKey), signup: signupInfo }, null, 2));

  const results: ScenarioResult[] = [];
  for (const s of scenarios()) {
    const r = await runScenario(baseUrl, s, tenantApiKey);
    results.push(r);
  }

  printSummary(results);

  const outDir = outDirFlag
    ? resolve(process.cwd(), outDirFlag)
    : resolve(process.cwd(), 'docs', 'pay-per-execution', 'agent-matrix-reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `agent_matrix_${safeFileName(baseUrl)}_${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({ baseUrl, hasTenantApiKey: Boolean(tenantApiKey), signup: signupInfo, results }, null, 2) + '\n', 'utf8');
  console.log('Report saved:', outPath);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack || e.message : String(e));
  process.exitCode = 1;
});
