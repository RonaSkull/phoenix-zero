import { NextResponse } from 'next/server';

import { requireTenantOrPublic } from '../../../lib/tenant-auth';

export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    ...extra
  };
}

export async function GET(req: Request) {
  try {
    const auth = await requireTenantOrPublic(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, reason: auth.reason },
        { status: auth.status, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
      );
    }

    return NextResponse.json(
      {
        model: 'pay_per_execution',
        currency: ['USDC', 'USDT', 'BTC', 'ETH', 'DAI', 'SOL', 'BNB'],
        currencyAnchor: 'USD',
        settlement: 'crypto-only',
        settlementNote: 'Listed assets are accepted at go-live via NowPayments; prices are anchored in USD and converted at payment time. PIX (Asaas) is sandbox until compliance sign-off and is not part of the public crypto settlement set.',
        canonicalCommercialModel: '/api/packaging',
        modelReconciliation: {
          note: 'The per-operation values in "operations" are reference unit costs (metering granularity) expressed in USD per execution_unit component. The public go-live COMMERCIAL model is Activation Fee + Platform Access (tiers) defined in /api/packaging, which is the source of truth for contracts. Overage is contractual only (not public).',
          meteringUnit: 'execution_unit',
          operationsAre: 'reference_unit_costs_usd'
        },
        operations: {
          execution_validation: 0.12,
          proof_generation: 0.05,
          batch_settlement: 0.2,
          audit_trail: 0.15
        }
      },
      { status: 200, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, reason: 'PRICING_FAILED', error: msg },
      { status: 500, headers: jsonUtf8Headers({ 'Cache-Control': 'no-store' }) }
    );
  }
}
