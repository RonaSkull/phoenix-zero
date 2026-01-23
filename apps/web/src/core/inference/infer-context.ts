export type InferenceInput = {
  product?: string;
  exposure?: string;
  persistence?: string;
  authenticityLevel?: string;
  units?: number;
};

export type Assumption = {
  key: string;
  value: string;
  confidence: number;
  source: 'inference' | 'default' | 'user';
};

export type InferredContext = {
  product: string;
  exposure: string;
  persistence: string;
  authenticityLevel: string;
  units: number;
};

function norm(x: unknown): string {
  return String(x || '').trim().toLowerCase();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function inferContext(input: InferenceInput): { context: InferredContext; assumptions: Assumption[] } {
  const units = Number.isFinite(Number(input.units ?? NaN)) ? clampInt(Number(input.units), 1, 1_000_000) : 1;

  const product = norm(input.product) || 'video_protection';

  const exposure = norm(input.exposure) || 'public';

  const persistence = norm(input.persistence) || 'long';

  let authenticityLevel = norm(input.authenticityLevel);
  if (!authenticityLevel) {
    if ((exposure === 'public' || exposure === 'mass' || exposure === 'viral') && (persistence === 'long' || persistence === 'permanent')) {
      authenticityLevel = 'forensic';
    } else if (exposure === 'paid') {
      authenticityLevel = 'legal';
    } else if (exposure === 'public') {
      authenticityLevel = 'commercial';
    } else {
      authenticityLevel = 'social';
    }
  }

  const assumptions: Assumption[] = [
    { key: 'product', value: product, confidence: norm(input.product) ? 1 : 0.75, source: norm(input.product) ? 'user' : 'inference' },
    { key: 'exposure', value: exposure, confidence: norm(input.exposure) ? 1 : 0.7, source: norm(input.exposure) ? 'user' : 'inference' },
    {
      key: 'persistence',
      value: persistence,
      confidence: norm(input.persistence) ? 1 : 0.65,
      source: norm(input.persistence) ? 'user' : 'inference'
    },
    {
      key: 'authenticityLevel',
      value: authenticityLevel,
      confidence: norm(input.authenticityLevel) ? 1 : 0.7,
      source: norm(input.authenticityLevel) ? 'user' : 'inference'
    },
    { key: 'units', value: String(units), confidence: Number.isFinite(Number(input.units ?? NaN)) ? 1 : 0.6, source: Number.isFinite(Number(input.units ?? NaN)) ? 'user' : 'default' }
  ];

  return {
    context: { product, exposure, persistence, authenticityLevel, units },
    assumptions
  };
}
