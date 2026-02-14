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

type DemoMode = 'auto' | 'batch' | 'transaction';

type BatchSummary = {
  rowCount?: number;
  entryCount?: number;
  sumNotionalUsd?: number;
  distinctAssets?: string[];
  highRiskCount?: number;
  failedCount?: number;
  batchId?: string;
  settlementWindow?: string;
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
  const trimmed = text.trim();
  if (!trimmed) return { rows: 0 };

  const firstNewline = trimmed.indexOf('\n');
  const headerLineRaw = firstNewline >= 0 ? trimmed.slice(0, firstNewline) : trimmed;
  const headerLine = headerLineRaw.replace(/\r$/, '');
  const header = headerLine.split(',').map((h) => h.trim().toLowerCase());

  const amountFieldPriority = [
    'amount_usd',
    'notional_usd',
    'cost_usd',
    'prize_amount_usd',
    'net_payout_usd',
    'amount',
    'value',
    'usd',
    'cents'
  ];
  const currencyFieldPriority = ['currency', 'asset', 'token_type', 'settlement_currency', 'currency_pair'];

  const amountIdx = amountFieldPriority.map((f) => header.indexOf(f)).find((idx) => idx !== undefined && idx >= 0) ?? -1;
  const currencyIdx = currencyFieldPriority.map((f) => header.indexOf(f)).find((idx) => idx !== undefined && idx >= 0) ?? -1;

  let rows = 0;
  let sum = 0;
  let sawNumber = false;
  let currency: string | undefined;

  // Aggregate numeric amounts only on the first N rows to keep CPU bounded for huge files.
  const maxAggRows = 5000;

  if (firstNewline < 0) {
    return { rows: 0 };
  }

  let pos = firstNewline + 1;
  while (pos < trimmed.length) {
    let next = trimmed.indexOf('\n', pos);
    if (next < 0) next = trimmed.length;

    const rawLine = trimmed.slice(pos, next).replace(/\r$/, '').trim();
    pos = next + 1;

    if (!rawLine) continue;
    rows++;

    if (rows <= maxAggRows) {
      const cols = rawLine.split(',').map((c) => c.trim());
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
  }

  return { rows, totalAmount: sawNumber ? sum : undefined, currency };
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

function parseCsvBatchSummary(text: string): BatchSummary {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const firstNewline = trimmed.indexOf('\n');
  const headerLineRaw = firstNewline >= 0 ? trimmed.slice(0, firstNewline) : trimmed;
  const headerLine = headerLineRaw.replace(/\r$/, '');
  const header = headerLine.split(',').map((h) => h.trim().toLowerCase());

  const idx = (name: string) => header.indexOf(name);

  const batchIdIdx = idx('settlement_batch_id');
  const windowIdx = idx('settlement_window');
  const riskIdx = idx('risk_rating');
  const statusIdx = idx('settlement_status');
  const assetIdx = header.indexOf('asset') >= 0 ? header.indexOf('asset') : header.indexOf('token_type');

  const amountUsdIdx = idx('amount_usd');
  const notionalUsdIdx = idx('notional_usd');
  const netUsdIdx = idx('net_payout_usd');
  const costUsdIdx = idx('cost_usd');
  const prizeUsdIdx = idx('prize_amount_usd');
  const amountIdx = idx('amount');
  const fxIdx = idx('fx_rate_usd');

  const assets = new Set<string>();
  let highRiskCount = 0;
  let failedCount = 0;
  let sumNotionalUsd = 0;
  let sawUsd = false;
  let batchId: string | undefined;
  let settlementWindow: string | undefined;
  let rowCount = 0;

  const maxRows = 5000;

  if (firstNewline < 0) return {};
  let pos = firstNewline + 1;
  while (pos < trimmed.length) {
    let next = trimmed.indexOf('\n', pos);
    if (next < 0) next = trimmed.length;
    const rawLine = trimmed.slice(pos, next).replace(/\r$/, '').trim();
    pos = next + 1;
    if (!rawLine) continue;

    rowCount++;
    if (rowCount > maxRows) break;

    const cols = rawLine.split(',').map((c) => c.trim());

    if (!batchId && batchIdIdx >= 0 && batchIdIdx < cols.length) {
      const v = String(cols[batchIdIdx] || '').trim();
      if (v) batchId = v;
    }

    if (!settlementWindow && windowIdx >= 0 && windowIdx < cols.length) {
      const v = String(cols[windowIdx] || '').trim();
      if (v) settlementWindow = v;
    }

    if (assetIdx >= 0 && assetIdx < cols.length) {
      const v = String(cols[assetIdx] || '').trim();
      if (v) assets.add(v);
    }

    if (riskIdx >= 0 && riskIdx < cols.length) {
      const v = String(cols[riskIdx] || '').trim().toUpperCase();
      if (v === 'HIGH') highRiskCount++;
    }

    if (statusIdx >= 0 && statusIdx < cols.length) {
      const v = String(cols[statusIdx] || '').trim().toLowerCase();
      if (v && v !== 'settled' && v !== 'completed' && v !== 'reconciled') failedCount++;
    }

    const pickIdx = (candidates: number[]) => candidates.find((i) => i >= 0 && i < cols.length) ?? -1;
    const usdIdx = pickIdx([amountUsdIdx, notionalUsdIdx, netUsdIdx, costUsdIdx, prizeUsdIdx]);
    if (usdIdx >= 0) {
      const n = Number(String(cols[usdIdx] || '').replace(/[^0-9.+-]/g, ''));
      if (Number.isFinite(n)) {
        sumNotionalUsd += n;
        sawUsd = true;
      }
      continue;
    }

    if (amountIdx >= 0 && amountIdx < cols.length && fxIdx >= 0 && fxIdx < cols.length) {
      const amount = Number(String(cols[amountIdx] || '').replace(/[^0-9.+-]/g, ''));
      const fx = Number(String(cols[fxIdx] || '').replace(/[^0-9.+-]/g, ''));
      if (Number.isFinite(amount) && Number.isFinite(fx)) {
        sumNotionalUsd += amount * fx;
        sawUsd = true;
      }
    }
  }

  return {
    rowCount,
    sumNotionalUsd: sawUsd ? sumNotionalUsd : undefined,
    distinctAssets: assets.size ? Array.from(assets).slice(0, 20) : undefined,
    highRiskCount: highRiskCount || undefined,
    failedCount: failedCount || undefined,
    batchId,
    settlementWindow
  };
}

function parseTransactionRowsFromCsv(text: string, maxRows: number): Array<{ rowIndex: number; rawLine: string }> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline < 0) return [];
  let pos = firstNewline + 1;
  let rowIndex = 0;
  const rows: Array<{ rowIndex: number; rawLine: string }> = [];

  while (pos < trimmed.length && rows.length < maxRows) {
    let next = trimmed.indexOf('\n', pos);
    if (next < 0) next = trimmed.length;
    const rawLine = trimmed.slice(pos, next).replace(/\r$/, '').trim();
    pos = next + 1;
    if (!rawLine) continue;
    rowIndex++;
    rows.push({ rowIndex, rawLine });
  }

  return rows;
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

    const file = form.get('file') ?? form.get('dataFile');
    const rawText = form.get('rawText');

    const modeRaw = String(form.get('mode') || 'auto').trim().toLowerCase();
    const mode: DemoMode = modeRaw === 'batch' || modeRaw === 'transaction' || modeRaw === 'auto' ? (modeRaw as DemoMode) : 'auto';

    const dataSummary = await buildDataSummary({
      file: file && typeof file === 'object' && 'arrayBuffer' in file ? (file as File) : null,
      rawText: typeof rawText === 'string' ? rawText : null
    });

    const uploadedText = await (async () => {
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const buf = await (file as File).arrayBuffer();
        return new TextDecoder().decode(new Uint8Array(buf));
      }
      if (typeof rawText === 'string') return rawText;
      return '';
    })();

    const batchSummary = dataSummary.kind === 'csv' ? parseCsvBatchSummary(uploadedText) : {};

    const autoMode: DemoMode = (() => {
      if (mode !== 'auto') return mode;
      const size = dataSummary.rows ?? dataSummary.entries ?? 0;
      return size > 25 ? 'batch' : 'transaction';
    })();

    // Generate unique identifiers
    const timestamp = Date.now();
    const agentId = `${config.agentPrefix}_${Math.floor(Math.random() * 10000)}`;
    const taskId = `demo_task_${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
    const pricingProfileId = `sovereign_demo_${demoType}_${timestamp}`;

    // Build deterministic hashes from real data
    const taskInputHash = `sha256:${dataSummary.sha256Hex}`;
    const outputCanonical = phoenixZeroStableStringify({ v: 1, demoType, taskId, dataSummary, mode: autoMode });
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

    if (autoMode === 'transaction') {
      const maxTx = 25;
      const txRows = dataSummary.kind === 'csv' ? parseTransactionRowsFromCsv(uploadedText, maxTx) : [];
      const txResults: Array<{
        rowIndex: number;
        paymentId: string;
        proofId: string;
        taskId: string;
        verifyUrl: string;
        publicProofUrl: string;
      }> = [];

      for (const row of txRows) {
        const txTaskId = `${taskId}_row_${row.rowIndex}`;
        const txInputCanonical = phoenixZeroStableStringify({ v: 1, demoType, rowIndex: row.rowIndex, rawLine: row.rawLine });
        const txTaskInputHash = `sha256:${await sha256HexFromBytes(new TextEncoder().encode(txInputCanonical))}`;
        const txOutputCanonical = phoenixZeroStableStringify({ v: 1, demoType, taskId: txTaskId, dataSummary });
        const txTaskOutputHash = `sha256:${await sha256HexFromBytes(new TextEncoder().encode(txOutputCanonical))}`;

        const checkoutBody = {
          currency: 'USD',
          providerHint: 'crypto',
          lineItems: [{ operation: config.operation, units: 1 }],
          proofMeta: {
            agentId,
            taskId: txTaskId,
            taskType: config.taskType,
            taskInputHash: txTaskInputHash,
            taskOutputHash: txTaskOutputHash,
            demoType,
            realData: dataSummary,
            mode: 'transaction'
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
          throw new Error(`Checkout creation failed (row ${row.rowIndex}): ${checkoutResponse.status} ${txt}`);
        }

        const checkout = await checkoutResponse.json();
        const paymentId = checkout.paymentId;

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
          throw new Error(`Payment simulation failed (row ${row.rowIndex}): ${fallbackResponse.status} ${txt}`);
        }

        const executeBody = {
          taskId: txTaskId,
          taskType: config.taskType,
          taskInputHash: txTaskInputHash,
          taskOutputHash: txTaskOutputHash
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
          throw new Error(`Task execution failed (row ${row.rowIndex}): ${executeResponse.status} ${txt}`);
        }

        const execution = await executeResponse.json();
        const proofId = execution.proofId;

        txResults.push({
          rowIndex: row.rowIndex,
          paymentId,
          proofId,
          taskId: txTaskId,
          verifyUrl: `${baseUrl}/verify/${proofId}`,
          publicProofUrl: `${baseUrl}/api/guarantee-proofs/${proofId}`
        });
      }

      return Response.json(
        {
          success: true,
          kind: 'real_business_data_demo',
          demoType,
          title: config.title,
          mode: autoMode,
          agentId,
          taskId,
          timestamp: new Date().toISOString(),
          dataSummary,
          batchSummary,
          transactionResults: txResults,
          enterprise: {
            pricing: config.enterprisePrice,
            roi: config.roiMetric,
            demoMode: 'Simulated crypto payment for evaluation'
          }
        },
        { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

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
        realData: dataSummary,
        mode: 'batch'
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
        mode: autoMode,
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
        batchSummary,
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
