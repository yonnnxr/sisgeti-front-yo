export type WeightSpec =
  | { type: 'constant'; value: number }
  | { type: 'field'; field: string; normalize?: { min?: number; max?: number } }
  | { type: 'expression'; expr: (props: Record<string, any>) => number; normalize?: { min?: number; max?: number } };

export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function normalizeValue(v: number, min?: number, max?: number) {
  if (min == null || max == null || !isFinite(min) || !isFinite(max) || min === max) return clamp01(v);
  return clamp01((v - min) / (max - min));
}

export function makeWeighter(spec: WeightSpec): (props: Record<string, any>) => number {
  if (spec.type === 'constant') {
    const val = clamp01(spec.value);
    return () => val;
  }
  if (spec.type === 'field') {
    const { field, normalize } = spec;
    return (props) => {
      const raw = Number(props?.[field]);
      const v = Number.isFinite(raw) ? raw : 0;
      return normalize ? normalizeValue(v, normalize.min, normalize.max) : clamp01(v);
    };
  }
  if (spec.type === 'expression') {
    const { expr, normalize } = spec;
    return (props) => {
      try {
        const raw = Number(expr(props || {}));
        const v = Number.isFinite(raw) ? raw : 0;
        return normalize ? normalizeValue(v, normalize.min, normalize.max) : clamp01(v);
      } catch { return 0; }
    };
  }
  return () => 1;
}


