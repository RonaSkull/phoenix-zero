import { createHash } from 'node:crypto';

import { phoenixZeroStableStringify } from '@phoenix-zero/core';

export const runtime = 'nodejs';

const DEMO_CONFIGS = {
  exchange: {
    title: 'Regulatory Proof in 60 Seconds',
    taskType: 'reconcile_psp',
    operation: 'reconcile_psp',
    amount: 500,
    agentPrefix: 'demo_exchange',
    enterprisePrice: 'Starting at $15,000-$25,000/month',
    roiMetric: 'Single cryptographic compliance proof per settlement'
  },
  'ai-marketplace': {
    title: 'Autonomous Agent Economies',
    taskType: 'agent_compute',
    operation: 'agent_compute',
    amount: 10,
    agentPrefix: 'demo_ai_marketplace',
    enterprisePrice: 'Starting at $10,000-$15,000/month',
    roiMetric: 'Crypto-native autonomous agent settlement with verifiable proof'
  },
  gaming: {
    title: 'Fraud-Proof Tournament Payouts',
    taskType: 'payout_mass',
    operation: 'payout_mass',
    amount: 100,
    agentPrefix: 'demo_gaming',
    enterprisePrice: 'Starting at $15,000-$20,000/month',
    roiMetric: 'Publicly verifiable crypto payout proofs'
  },
  banking: {
    title: 'Global Regulatory Reconciliation',
    taskType: 'reconcile_psp',
    operation: 'reconcile_psp',
    amount: 50,
    agentPrefix: 'demo_banking',
    enterprisePrice: 'Starting at $20,000-$25,000/month',
    roiMetric: 'Crypto settlement reconciliation with cryptographic audit trail'
  }
} as const;

type DemoType = keyof typeof DEMO_CONFIGS;

type ParsedDataSummary = {
  kind: 'csv' | 'json' | 'unknown';
  bytes: number;
  sha256Hex: string;
  rows?: number;
  entries?: number;
  totalAmount?: number;
  currency?: string;
};

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

async function sha256HexFromBytes(bytes: Uint8Array): Promise<string> {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseCsvSummary(text: string): { rows: number; totalAmount?: number; currency?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return { rows: Math.max(0, lines.length - 1) };

  const headerLine = lines[0] || '';
  const header = headerLine.split(',').map((h) => h.trim().toLowerCase());
  const amountIdx = header.findIndex((h) => h === 'amount' || h === 'value' || h === 'usd' || h === 'cents');
  const currencyIdx = header.findIndex((h) => h === 'currency');

  let sum = 0;
  let sawNumber = false;
  let currency: string | undefined;

  for (let i = 1; i < lines.length; i++) {
    const cols = (lines[i] || '').split(',').map((c) => c.trim());
    const currencyVal = currencyIdx >= 0 && currencyIdx < cols.length ? cols[currencyIdx] : undefined;
    if (currencyVal && !currency) currency = String(currencyVal).trim();

    const amountVal = amountIdx >= 0 && amountIdx < cols.length ? cols[amountIdx] : undefined;
    if (amountVal) {
      const n = Number(String(amountVal).replace(/[^0-9.+-]/g, ''));
      if (Number.isFinite(n)) {
        sum += n;
        sawNumber = true;
      }
    }
  }

  return { rows: Math.max(0, lines.length - 1), totalAmount: sawNumber ? sum : undefined, currency };
}

function parseJsonSummary(obj: any): { entries?: number; totalAmount?: number; currency?: string } {
  const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.transactions) ? obj.transactions : Array.isArray(obj?.entries) ? obj.entries : null;
  const entries = arr ? arr.length : undefined;

  let sum = 0;
  let sawNumber = false;
  let currency: string | undefined;

  if (arr) {
    for (const it of arr) {
      const cur = typeof it?.currency === 'string' ? it.currency : undefined;
      if (cur && !currency) currency = cur;
      const valRaw = it?.amount ?? it?.value ?? it?.units ?? undefined;
      const n = Number(valRaw);
      if (Number.isFinite(n)) {
        sum += n;
        sawNumber = true;
      }
    }
  }

  return { entries, totalAmount: sawNumber ? sum : undefined, currency };
}

async function buildDataSummary(params: { file?: File | null; rawText?: string | null }): Promise<ParsedDataSummary> {
  const { file, rawText } = params;

  let bytes: Uint8Array;
  let filename = '';

  if (file) {
    filename = String(file.name || '').toLowerCase();
    const buf = await file.arrayBuffer();
    bytes = new Uint8Array(buf);
  } else if (typeof rawText === 'string') {
    bytes = new TextEncoder().encode(rawText);
  } else {
    bytes = new Uint8Array();
  }

  const sha = await sha256HexFromBytes(bytes);
  const text = bytes.length > 0 ? new TextDecoder().decode(bytes) : '';

  const isJson = filename.endsWith('.json') || (text.trim().startsWith('{') || text.trim().startsWith('['));
  const isCsv = filename.endsWith('.csv') || (text.includes(',') && text.includes('\n'));

  if (isJson) {
    const parsed = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();
    const meta = parsed ? parseJsonSummary(parsed) : {};
    return {
      kind: 'json',
      bytes: bytes.length,
      sha256Hex: sha,
      entries: meta.entries,
      totalAmount: meta.totalAmount,
      currency: meta.currency
    };
  }

  if (isCsv) {
    const meta = parseCsvSummary(text);
    return {
      kind: 'csv',
      bytes: bytes.length,
      sha256Hex: sha,
      rows: meta.rows,
      totalAmount: meta.totalAmount,
      currency: meta.currency
    };
  }

  return { kind: 'unknown', bytes: bytes.length, sha256Hex: sha };
}

export async function POST(req: Request) {
  try {
    const baseUrl = process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || 'https://phoenix-zero-web.onrender.com';
    const adminToken = String(process.env.PHOENIX_ZERO_ADMIN_TOKEN || '').trim();
    const demoRunToken = String(process.env.PHOENIX_ZERO_DEMO_RUN_TOKEN || '').trim();

    if (!adminToken) {
      return Response.json({ success: false, error: 'Admin token not configured' }, { status: 500, headers: jsonUtf8Headers() });
    }

    if (!demoRunToken) {
      return Response.json(
        { success: false, error: 'Demo run token not configured (set PHOENIX_ZERO_DEMO_RUN_TOKEN)' },
        { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const gotDemoToken = String(req.headers.get('x-demo-run-token') || '').trim();
    if (!gotDemoToken || gotDemoToken !== demoRunToken) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return Response.json({ success: false, error: 'Expected multipart/form-data' }, { status: 400, headers: jsonUtf8Headers() });
    }

    const demoTypeRaw = String(form.get('demoType') || '').trim();
    const demoType = demoTypeRaw as DemoType;
    if (!demoTypeRaw || !(demoTypeRaw in DEMO_CONFIGS)) {
      return Response.json({ success: false, error: `Invalid demo type: ${demoTypeRaw}` }, { status: 400, headers: jsonUtf8Headers() });
    }

    const config = DEMO_CONFIGS[demoType];

    const file = form.get('file');
    const rawText = form.get('rawText');

    const dataSummary = await buildDataSummary({
      file: file && typeof file === 'object' && 'arrayBuffer' in file ? (file as File) : null,
      rawText: typeof rawText === 'string' ? rawText : null
    });

    // Generate unique identifiers
    const timestamp = Date.now();
    const agentId = `${config.agentPrefix}_${Math.floor(Math.random() * 10000)}`;
    const taskId = `demo_task_${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
    const pricingProfileId = `sovereign_demo_${demoType}_${timestamp}`;

    // Build deterministic hashes from real data
    const taskInputHash = `sha256:${dataSummary.sha256Hex}`;
    const outputCanonical = phoenixZeroStableStringify({ v: 1, demoType, taskId, dataSummary });
    const taskOutputHash = `sha256:${await sha256HexFromBytes(new TextEncoder().encode(outputCanonical))}`;

    // Step 1: Create sovereign pricing profile
    const pricingBody = {
      id: pricingProfileId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currency: 'USD',
      basePriceCentsByOp: {
        [config.operation]: 100
      },
      multiplierByClientType: { sovereign: 1, unknown: 1 },
      multiplierBySector: { fintech: 1, unknown: 1 },
      multiplierByCountry: { us: 1, unknown: 1 }
    };

    const pricingResponse = await fetch(`${baseUrl}/api/admin/pricing-profiles`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pricingBody)
    });

    if (!pricingResponse.ok) {
      const txt = await pricingResponse.text().catch(() => '');
      throw new Error(`Pricing profile creation failed: ${pricingResponse.status} ${txt}`);
    }

    // Step 2: Provision sovereign tenant
    const tenantBody = {
      name: `sovereign_demo_${demoType}_${new Date().toISOString()}`,
      clientType: 'sovereign',
      sector: 'fintech',
      country: 'US',
      currency: 'USD',
      pricingProfile: pricingProfileId,
      commissionProfile: 'default',
      taxProfile: 'default',
      sessionTtlSeconds: 3600,
      next: '/pricing-admin'
    };

    const tenantResponse = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tenantBody)
    });

    if (!tenantResponse.ok) {
      const txt = await tenantResponse.text().catch(() => '');
      throw new Error(`Tenant provisioning failed: ${tenantResponse.status} ${txt}`);
    }

    const tenant = await tenantResponse.json();
    const apiKey = tenant.apiKey;
    const tenantId = tenant.tenant.tenantId;

    // Step 3: Create sovereign contract
    const contractId = `sc_${tenantId}_${agentId}_${Math.floor(Date.now() / 1000)}`;
    const nowIso = new Date().toISOString();

    const contractBody = {
      contract: {
        contractId,
        tenantId,
        agentId,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
        effectiveAt: nowIso,
        defaultExecutionClassId: 'standard',
        executionClasses: [
          {
            classId: 'standard',
            currency: 'USD',
            pricePerExecutionCents: 100,
            allowedTaskTypes: [config.taskType],
            maxDailyExecutions: 100000,
            maxMonthlyExecutions: 1000000
          }
        ],
        meta: {
          demoType,
          demoTaskType: config.taskType,
          realData: {
            kind: dataSummary.kind,
            bytes: dataSummary.bytes,
            sha256Hex: dataSummary.sha256Hex
          }
        }
      }
    };

    const contractResponse = await fetch(`${baseUrl}/api/admin/sovereign-contracts`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contractBody)
    });

    if (!contractResponse.ok) {
      const txt = await contractResponse.text().catch(() => '');
      throw new Error(`Sovereign contract creation failed: ${contractResponse.status} ${txt}`);
    }

    // Step 4: Create checkout
    const checkoutBody = {
      currency: 'USD',
      providerHint: 'crypto',
      lineItems: [{ operation: config.operation, units: config.amount }],
      proofMeta: {
        agentId,
        taskId,
        taskType: config.taskType,
        taskInputHash,
        taskOutputHash,
        demoType,
        realData: dataSummary
      }
    };

    const checkoutResponse = await fetch(`${baseUrl}/api/checkout/create`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(checkoutBody)
    });

    if (!checkoutResponse.ok) {
      const txt = await checkoutResponse.text().catch(() => '');
      throw new Error(`Checkout creation failed: ${checkoutResponse.status} ${txt}`);
    }

    const checkout = await checkoutResponse.json();
    const paymentId = checkout.paymentId;

    // Step 5: Simulate payment via fallback-paid (demo mode)
    const fallbackResponse = await fetch(`${baseUrl}/api/admin/fallback-paid`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentId, tenantId })
    });

    if (!fallbackResponse.ok) {
      const txt = await fallbackResponse.text().catch(() => '');
      throw new Error(`Payment simulation failed: ${fallbackResponse.status} ${txt}`);
    }

    // Step 6: Execute task
    const executeBody = {
      taskId,
      taskType: config.taskType,
      taskInputHash,
      taskOutputHash
    };

    const executeResponse = await fetch(`${baseUrl}/api/agents/${agentId}/execute`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(executeBody)
    });

    if (!executeResponse.ok) {
      const txt = await executeResponse.text().catch(() => '');
      throw new Error(`Task execution failed: ${executeResponse.status} ${txt}`);
    }

    const execution = await executeResponse.json();
    const proofId = execution.proofId;

    return Response.json(
      {
        success: true,
        kind: 'real_business_data_demo',
        demoType,
        title: config.title,
        paymentId,
        proofId,
        agentId,
        taskId,
        verifyUrl: `${baseUrl}/verify/${proofId}`,
        publicProofUrl: `${baseUrl}/api/guarantee-proofs/${proofId}`,
        timestamp: new Date().toISOString(),
        proofMeta: {
          taskType: config.taskType,
          taskInputHash,
          taskOutputHash
        },
        dataSummary,
        enterprise: {
          pricing: config.enterprisePrice,
          roi: config.roiMetric,
          demoMode: 'Simulated crypto payment for evaluation'
        }
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (error) {
    console.error('Demo run-with-data error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
