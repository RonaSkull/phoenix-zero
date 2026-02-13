// app/api/demo/run/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// Demo configurations for each vertical - operation matches taskType for sovereign flow
const DEMO_CONFIGS = {
  exchange: {
    title: 'Regulatory Proof in 60 Seconds',
    taskType: 'reconcile_psp',
    operation: 'reconcile_psp', // Must match taskType for sovereign
    amount: 500,
    agentPrefix: 'demo_exchange',
  },
  'ai-marketplace': {
    title: 'Autonomous Agent Economies',
    taskType: 'agent_compute',
    operation: 'agent_compute', // Must match taskType for sovereign
    amount: 10,
    agentPrefix: 'demo_ai_marketplace',
  },
  gaming: {
    title: 'Fraud-Proof Tournament Payouts',
    taskType: 'payout_mass',
    operation: 'payout_mass', // Must match taskType for sovereign
    amount: 100,
    agentPrefix: 'demo_gaming',
  },
  banking: {
    title: 'BC/Febraban Reconciliation',
    taskType: 'reconcile_psp',
    operation: 'reconcile_psp', // Must match taskType for sovereign
    amount: 50,
    agentPrefix: 'demo_banking',
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { demoType } = body;

    // Validate demo type
    if (!demoType || !DEMO_CONFIGS[demoType as keyof typeof DEMO_CONFIGS]) {
      return Response.json(
        { success: false, error: `Invalid demo type: ${demoType}` },
        { status: 400 }
      );
    }

    const config = DEMO_CONFIGS[demoType as keyof typeof DEMO_CONFIGS];
    const baseUrl = process.env.PHOENIX_ZERO_PUBLIC_BASE_URL || 'https://phoenix-zero-web.onrender.com';
    const adminToken = process.env.PHOENIX_ZERO_ADMIN_TOKEN;

    if (!adminToken) {
      return Response.json(
        { success: false, error: 'Admin token not configured' },
        { status: 500 }
      );
    }

    // Generate unique identifiers
    const timestamp = Date.now();
    const agentId = `${config.agentPrefix}_${Math.floor(Math.random() * 10000)}`;
    const taskId = `demo_task_${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
    const pricingProfileId = `sovereign_demo_${demoType}_${timestamp}`;

    // Step 1: Create sovereign pricing profile
    const pricingBody = {
      pricingProfileId,
      name: `Sovereign Demo ${demoType}`,
      description: `Auto-created pricing profile for ${demoType} demo`,
      basePriceCentsByOp: {
        [config.operation]: 5, // Cheap rate for demos
      },
    };

    const pricingResponse = await fetch(`${baseUrl}/api/admin/pricing-profiles`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pricingBody),
    });

    if (!pricingResponse.ok) {
      throw new Error(`Pricing profile creation failed: ${pricingResponse.status}`);
    }

    const pricing = await pricingResponse.json();

    // Step 2: Provision sovereign tenant
    const tenantBody = {
      name: `Sovereign Demo ${demoType}`,
      clientType: 'sovereign',
      sector: demoType === 'exchange' ? 'financial_services' : 
              demoType === 'ai-marketplace' ? 'technology' :
              demoType === 'gaming' ? 'gaming_esports' : 'financial_services',
      country: 'BR',
      currency: 'BRL',
      pricingProfile: pricingProfileId,
    };

    const tenantResponse = await fetch(`${baseUrl}/api/admin/tenants`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tenantBody),
    });

    if (!tenantResponse.ok) {
      throw new Error(`Tenant provisioning failed: ${tenantResponse.status}`);
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
            maxMonthlyExecutions: 1000000,
          },
        ],
        meta: {
          demoType,
          demoTaskType: config.taskType,
        },
      },
    };

    const contractResponse = await fetch(`${baseUrl}/api/admin/sovereign-contracts`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(contractBody),
    });

    if (!contractResponse.ok) {
      throw new Error(`Sovereign contract creation failed: ${contractResponse.status}`);
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
        taskInputHash: `sha256:demo_input_${taskId}`,
        taskOutputHash: `sha256:demo_output_${taskId}`,
        demoType,
      },
    };

    const checkoutResponse = await fetch(`${baseUrl}/api/checkout/create`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(checkoutBody),
    });

    if (!checkoutResponse.ok) {
      throw new Error(`Checkout creation failed: ${checkoutResponse.status}`);
    }

    const checkout = await checkoutResponse.json();
    const paymentId = checkout.paymentId;

    // Step 5: Simulate payment via fallback-paid
    const fallbackResponse = await fetch(`${baseUrl}/api/admin/fallback-paid`, {
      method: 'POST',
      headers: {
        'x-admin-token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentId,
        tenantId,
        agentId,
        taskType: config.taskType,
        taskId,
      }),
    });

    if (!fallbackResponse.ok) {
      throw new Error(`Payment simulation failed: ${fallbackResponse.status}`);
    }

    // Step 6: Execute task
    const executeBody = {
      taskId,
      taskType: config.taskType,
      taskInputHash: `sha256:demo_input_${taskId}`,
      taskOutputHash: `sha256:demo_output_${taskId}`,
    };

    const executeResponse = await fetch(`${baseUrl}/api/agents/${agentId}/execute`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(executeBody),
    });

    if (!executeResponse.ok) {
      throw new Error(`Task execution failed: ${executeResponse.status}`);
    }

    const execution = await executeResponse.json();
    const proofId = execution.proofId;

    // Return success response
    return Response.json({
      success: true,
      demoType,
      title: config.title,
      paymentId,
      proofId,
      agentId,
      taskId,
      verifyUrl: `${baseUrl}/verify/${proofId}`,
      publicProofUrl: `${baseUrl}/api/guarantee-proofs/${proofId}`,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Demo run error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
