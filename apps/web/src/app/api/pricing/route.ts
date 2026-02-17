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
        currency: ['USDC', 'USDT'],
        settlement: 'crypto-only',
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
