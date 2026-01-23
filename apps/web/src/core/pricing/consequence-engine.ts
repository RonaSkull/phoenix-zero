import type { RiskResult } from '../risk/risk-engine';

export type RecommendedPlan = 'starter' | 'pro' | 'enterprise';

export type ConsequenceResult = {
  monthlyCostCents: number;
  recommendedPlan: RecommendedPlan;
  recommendedProtection: 'social' | 'commercial' | 'legal' | 'forensic';
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function consequenceFromRisk(risk: RiskResult): ConsequenceResult {
  const score = clampInt(risk.riskScore, 0, 100);

  const recommendedPlan: RecommendedPlan = score >= 80 ? 'enterprise' : score >= 50 ? 'pro' : 'starter';

  const recommendedProtection: ConsequenceResult['recommendedProtection'] =
    score >= 80 ? 'forensic' : score >= 60 ? 'legal' : score >= 35 ? 'commercial' : 'social';

  const monthlyCostCents = clampInt(score * score * 100, 0, 50_000_000);

  return { monthlyCostCents, recommendedPlan, recommendedProtection };
}
