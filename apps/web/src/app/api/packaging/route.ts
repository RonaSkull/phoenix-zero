export const runtime = 'nodejs';

function jsonUtf8Headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra
  };
}

export async function GET(_req: Request) {
  return Response.json(
    {
      ok: true,
      version: '1.0',
      goLiveModel: 'option_1_activation_plus_access',
      currencyAnchor: 'USD',
      pricesExcludeTaxes: true,
      unitModel: {
        canonicalUnit: 'execution_unit',
        description: 'One verified execution consuming reserved system capacity'
      },
      agentPolicy: {
        autonomousPaymentDefault: false,
        mode: 'agent_assisted',
        featureFlagRequiredForAutonomy: true
      },
      commercialPolicy: {
        negotiatedContractSupported: true,
        discounts: 'contractual_only',
        taxPolicy: 'prices_exclude_taxes',
        channelCommissions: {
          referral: 0.1,
          reseller: 0.15,
          delivery_partner: 0.2
        },
        overagePublic: false,
        notes: 'Go-live public model is Activation Fee + Platform Access. Overage is available only by contract (enterprise/growth).' 
      },
      tiers: [
        {
          name: 'foundation',
          activationFeeUsd: 12000,
          platformAccessMonthlyUsd: 15000,
          capacity: {
            includedUnitsPerMonth: 8000,
            overageUnitPriceUsd: null,
            overageNotes: 'Not public at go-live; enabled by contract only'
          },
          rateLimits: {
            maxUnitsPerMinute: 120,
            burst: 200,
            maxConcurrency: 10
          },
          slaTarget: '99.5',
          support: 'async',
          approvalRequired: true,
          priorityQueue: false
        },
        {
          name: 'operational',
          activationFeeUsd: 25000,
          platformAccessMonthlyUsd: 32000,
          capacity: {
            includedUnitsPerMonth: 20000,
            overageUnitPriceUsd: null,
            overageNotes: 'Not public at go-live; enabled by contract only'
          },
          rateLimits: {
            maxUnitsPerMinute: 300,
            burst: 500,
            maxConcurrency: 25
          },
          slaTarget: '99.9',
          support: 'priority',
          approvalRequired: true,
          priorityQueue: true
        },
        {
          name: 'enterprise',
          activationFeeUsd: 45000,
          platformAccessMonthlyUsd: 58000,
          capacity: {
            includedUnitsPerMonth: 50000,
            overageUnitPriceUsd: null,
            overageNotes: 'Not public at go-live; enabled by contract only'
          },
          rateLimits: {
            maxUnitsPerMinute: 800,
            burst: 1200,
            maxConcurrency: 60
          },
          slaTarget: '99.95',
          support: '24x7',
          approvalRequired: true,
          priorityQueue: true,
          auditRetention: true
        },
        {
          name: 'sovereign',
          activationFeeUsd: null,
          platformAccessMonthlyUsd: null,
          capacity: {
            includedUnitsPerMonth: null,
            overageUnitPriceUsd: null,
            overageNotes: 'Custom'
          },
          slaTarget: 'custom',
          support: 'tam_plus_engineering',
          approvalRequired: true,
          priorityQueue: true,
          notes: 'Custom contract; not a public tier'
        }
      ],
      offerings: [
        {
          offeringId: 'exchange',
          displayUnit: 'proof_batch',
          conversion: '1 batch = 1 execution_unit',
          allowedOperations: ['reconcile_psp', 'audit_bc_compliance'],
          templateUrl: '/templates/exchange_settlement_template.csv'
        },
        {
          offeringId: 'banking',
          displayUnit: 'compliance_proof',
          conversion: '1 proof = 1 execution_unit',
          allowedOperations: ['reconcile_psp', 'audit_bc_compliance'],
          templateUrl: '/templates/banking_reconciliation_template.csv'
        },
        {
          offeringId: 'ai-marketplace',
          displayUnit: 'verified_execution',
          conversion: '1 execution = 1 execution_unit',
          allowedOperations: ['agent_compute'],
          templateUrl: '/templates/ai_marketplace_template.csv'
        },
        {
          offeringId: 'gaming',
          displayUnit: 'validated_payout',
          conversion: '1 payout = 1 execution_unit',
          allowedOperations: ['payout_mass'],
          templateUrl: '/templates/gaming_tournament_template.csv'
        }
      ]
    },
    { status: 200, headers: jsonUtf8Headers() }
  );
}
