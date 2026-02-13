// app/api/demo/run/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

// Demo configurations for each vertical
const DEMO_CONFIGS = {
  exchange: {
    title: 'Regulatory Proof in 60 Seconds',
    taskType: 'reconcile_psp',
    operation: 'crypto_settlement_assurance',
    amount: 500,
    agentPrefix: 'exchange_demo',
  },
  'ai-marketplace': {
    title: 'Autonomous Agent Economies',
    taskType: 'agent_executable_payment_gating',
    operation: 'agent_compute',
    amount: 10,
    agentPrefix: 'ai_agent_demo',
  },
  gaming: {
    title: 'Fraud-Proof Tournament Payouts',
    taskType: 'payout_integrity_anti_replay',
    operation: 'tournament_payout',
    amount: 100,
    agentPrefix: 'gaming_demo',
  },
  banking: {
    title: 'BC/Febraban Reconciliation',
    taskType: 'crypto_reconciliation_export',
    operation: 'pix_payment',
    amount: 50,
    agentPrefix: 'banking_demo',
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
    const agentId = `${config.agentPrefix}_${timestamp}`;
    const taskId = `demo_task_${timestamp}`;

    // Step 1: Auto-provision tenant via agent-signup
    const signupResponse = await fetch(`${baseUrl}/api/public/agent-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentType: 'autonomous',
        routingHint: demoType,
      }),
    });

    if (!signupResponse.ok) {
      throw new Error(`Agent signup failed: ${signupResponse.status}`);
    }

    const signup = await signupResponse.json();
    const apiKey = signup.apiKey;
    const tenantId = signup.tenantId;

    // Step 2: Create checkout
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

    // Step 3: Simulate payment via fallback-paid
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

    // Step 4: Execute task
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
