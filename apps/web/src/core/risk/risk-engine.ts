export type RiskContext = {
  exposure?: string;
  authenticityLevel?: string;
  persistence?: string;
  units?: number;
};

export type RiskBreakdownItem = {
  key: string;
  label: string;
  delta: number;
};

export type RiskResult = {
  riskScore: number;
  breakdown: RiskBreakdownItem[];
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function norm(x: unknown): string {
  return String(x || '').trim().toLowerCase();
}

export function calculateRisk(ctx: RiskContext): RiskResult {
  const exposure = norm(ctx.exposure || 'unknown');
  const persistence = norm(ctx.persistence || 'unknown');
  const auth = norm(ctx.authenticityLevel || 'unknown');
  const units = Number.isFinite(Number(ctx.units ?? NaN)) ? Math.max(1, Math.trunc(Number(ctx.units))) : 1;

  const breakdown: RiskBreakdownItem[] = [];

  let score = 0;

  if (exposure === 'mass' || exposure === 'viral') {
    score += 35;
    breakdown.push({ key: 'exposure', label: 'Exposicao massiva', delta: 35 });
  } else if (exposure === 'public') {
    score += 30;
    breakdown.push({ key: 'exposure', label: 'Exposicao publica', delta: 30 });
  } else if (exposure === 'paid') {
    score += 22;
    breakdown.push({ key: 'exposure', label: 'Midia paga', delta: 22 });
  } else {
    score += 8;
    breakdown.push({ key: 'exposure', label: 'Uso privado/interno', delta: 8 });
  }

  if (persistence === 'permanent') {
    score += 20;
    breakdown.push({ key: 'persistence', label: 'Persistencia permanente', delta: 20 });
  } else if (persistence === 'long') {
    score += 15;
    breakdown.push({ key: 'persistence', label: 'Persistencia longa', delta: 15 });
  } else if (persistence === 'medium') {
    score += 8;
    breakdown.push({ key: 'persistence', label: 'Persistencia media', delta: 8 });
  } else {
    score += 4;
    breakdown.push({ key: 'persistence', label: 'Persistencia curta', delta: 4 });
  }

  if (auth === 'forensic' || auth === 'judicial' || auth === 'pericial') {
    score += 40;
    breakdown.push({ key: 'authenticity', label: 'Autenticidade forense', delta: 40 });
  } else if (auth === 'legal') {
    score += 25;
    breakdown.push({ key: 'authenticity', label: 'Autenticidade legal', delta: 25 });
  } else if (auth === 'commercial' || auth === 'comercial') {
    score += 15;
    breakdown.push({ key: 'authenticity', label: 'Autenticidade comercial', delta: 15 });
  } else {
    score += 5;
    breakdown.push({ key: 'authenticity', label: 'Autenticidade social', delta: 5 });
  }

  if (units > 1) {
    const delta = 10;
    score += delta;
    breakdown.push({ key: 'volume', label: 'Volume (mais de 1 conteudo)', delta });
  }

  return { riskScore: clampInt(score, 0, 100), breakdown };
}
