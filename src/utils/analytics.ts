import * as turf from '@turf/turf';
import type { Feature, FeatureCollection, BBox } from 'geojson';
import { featuresToTurfCollection } from './geoprocessing';

export interface BasicGeoStats {
  featureCount: number;
  geometryTypeCounts: Record<string, number>;
  totalLengthMeters: number;
  totalAreaSqMeters: number;
  pointCount: number;
  bbox4326: BBox | null;
}

export interface CategoricalStats {
  type: 'categorical';
  attribute: string;
  total: number;
  missing: number;
  categories: Array<{ value: string; count: number; pct: number }>;
}

export interface NumericStatsBin { min: number; max: number; count: number }
export interface NumericStats {
  type: 'numeric';
  attribute: string;
  total: number;
  missing: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stddev: number;
  p25: number;
  p75: number;
  bins: NumericStatsBin[];
}

export type AttributeStats = CategoricalStats | NumericStats;

export function getBasicGeoStats(features: any[]): BasicGeoStats {
  const fc = featuresToTurfCollection(features);

  const geometryTypeCounts: Record<string, number> = {};
  let totalLengthMeters = 0;
  let totalAreaSqMeters = 0;
  let pointCount = 0;

  for (const f of fc.features) {
    const gtype = f.geometry?.type || 'Unknown';
    geometryTypeCounts[gtype] = (geometryTypeCounts[gtype] || 0) + 1;
    try {
      if (gtype === 'LineString' || gtype === 'MultiLineString') {
        const km = turf.length(f as any, { units: 'kilometers' });
        totalLengthMeters += km * 1000;
      } else if (gtype === 'Polygon' || gtype === 'MultiPolygon') {
        totalAreaSqMeters += turf.area(f as any);
      } else if (gtype === 'Point' || gtype === 'MultiPoint') {
        pointCount += Array.isArray((f.geometry as any)?.coordinates?.[0]) ? ((f.geometry as any).coordinates.length || 1) : 1;
      }
    } catch {}
  }

  let bbox4326: BBox | null = null;
  try {
    const b = turf.bbox(fc as any) as BBox;
    bbox4326 = b;
  } catch {
    bbox4326 = null;
  }

  return {
    featureCount: fc.features.length,
    geometryTypeCounts,
    totalLengthMeters,
    totalAreaSqMeters,
    pointCount,
    bbox4326,
  };
}

export function filterByMask(features: any[], maskFeatures: any[], mode: 'intersects' | 'within' = 'intersects'): any[] {
  if (!maskFeatures || maskFeatures.length === 0) return features;
  const fc = featuresToTurfCollection(features);
  const mf = featuresToTurfCollection(maskFeatures);
  const mask = mf.features;
  const out: any[] = [];
  for (let i = 0; i < fc.features.length; i++) {
    const f = fc.features[i];
    let keep = false;
    for (const m of mask) {
      try {
        if (mode === 'within') keep = (turf.booleanWithin as any)(f as any, m as any) || keep;
        else keep = (turf.booleanIntersects as any)(f as any, m as any) || keep;
      } catch {}
      if (keep) break;
    }
    if (keep) out.push(features[i]);
  }
  return out;
}

export function computeCategoryAggregations(features: any[], attribute: string) {
  const fc = featuresToTurfCollection(features);
  const map = new Map<string, { value: string; count: number; area: number; length: number }>();
  for (let i = 0; i < fc.features.length; i++) {
    const f = fc.features[i] as Feature;
    const vRaw = f.properties?.[attribute];
    const value = (vRaw === null || vRaw === undefined || vRaw === '') ? '(vazio)' : String(vRaw);
    if (!map.has(value)) map.set(value, { value, count: 0, area: 0, length: 0 });
    const rec = map.get(value)!;
    rec.count += 1;
    try {
      const gtype = f.geometry?.type;
      if (gtype === 'Polygon' || gtype === 'MultiPolygon') {
        rec.area += turf.area(f as any);
      } else if (gtype === 'LineString' || gtype === 'MultiLineString') {
        rec.length += (turf.length as any)(f as any, { units: 'kilometers' }) * 1000;
      }
    } catch {}
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

export function listAttributes(features: any[], sampleLimit: number = 100): string[] {
  const fc = featuresToTurfCollection(features);
  const names = new Set<string>();
  for (let i = 0; i < Math.min(sampleLimit, fc.features.length); i++) {
    const props = (fc.features[i] as Feature).properties || {};
    for (const k of Object.keys(props || {})) {
      if (k === 'geometry') continue;
      names.add(k);
    }
  }
  return Array.from(names.values()).sort();
}

export function detectAttributeType(features: any[], attribute: string): 'numeric' | 'categorical' {
  const fc = featuresToTurfCollection(features);
  let numericSeen = 0;
  let categoricalSeen = 0;
  for (const f of fc.features) {
    const v = (f as Feature).properties?.[attribute];
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (!isNaN(n)) numericSeen++;
    else categoricalSeen++;
    if (numericSeen > 5 || categoricalSeen > 5) break;
  }
  return numericSeen >= categoricalSeen ? 'numeric' : 'categorical';
}

export function computeCategoricalStats(features: any[], attribute: string, topN: number = 10): CategoricalStats {
  const fc = featuresToTurfCollection(features);
  const freq = new Map<string, number>();
  let total = 0;
  let missing = 0;
  for (const f of fc.features) {
    const v = (f as Feature).properties?.[attribute];
    if (v === null || v === undefined || v === '') { missing++; continue; }
    const key = String(v);
    freq.set(key, (freq.get(key) || 0) + 1);
    total++;
  }
  const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  const categories = sorted.slice(0, topN).map(([value, count]) => ({ value, count, pct: total ? (count / total) * 100 : 0 }));
  return { type: 'categorical', attribute, total, missing, categories };
}

export function computeNumericStats(features: any[], attribute: string, binsCount: number = 10): NumericStats {
  const fc = featuresToTurfCollection(features);
  const values: number[] = [];
  let missing = 0;
  for (const f of fc.features) {
    const v = (f as Feature).properties?.[attribute];
    const n = Number(v);
    if (v === null || v === undefined || v === '' || isNaN(n)) { missing++; continue; }
    values.push(n);
  }
  values.sort((a, b) => a - b);
  const total = values.length;
  const min = total ? values[0] : 0;
  const max = total ? values[total - 1] : 0;
  const mean = total ? values.reduce((s, v) => s + v, 0) / total : 0;
  const median = total ? (total % 2 === 1 ? values[(total - 1) / 2] : (values[total / 2 - 1] + values[total / 2]) / 2) : 0;
  const p25 = total ? percentile(values, 0.25) : 0;
  const p75 = total ? percentile(values, 0.75) : 0;
  const variance = total ? values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / total : 0;
  const stddev = Math.sqrt(variance);

  const bins: NumericStatsBin[] = [];
  if (total && max > min) {
    const step = (max - min) / binsCount;
    for (let i = 0; i < binsCount; i++) {
      const bmin = min + i * step;
      const bmax = i === binsCount - 1 ? max : (bmin + step);
      bins.push({ min: bmin, max: bmax, count: 0 });
    }
    for (const v of values) {
      let idx = Math.floor(((v - min) / (max - min)) * binsCount);
      if (idx === binsCount) idx = binsCount - 1;
      bins[idx].count++;
    }
  }

  return { type: 'numeric', attribute, total, missing, min, max, mean, median, stddev, p25, p75, bins };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const h = idx - lo;
  return sorted[lo] * (1 - h) + sorted[hi] * h;
}

export function toCsv(rows: Array<Record<string, any>>): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => escape(r[h])).join(','));
  }
  return lines.join('\n');
}


