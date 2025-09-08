// Web Worker para operações de geoprocessamento com Turf
// Recebe FeatureCollections em EPSG:4326

// @ts-ignore - web worker contexto
const ctx: DedicatedWorkerGlobalScope = self as any;

// Carregamos Turf via import padrão de módulos
import * as turf from '@turf/turf';
import type { Feature, FeatureCollection } from 'geojson';

type GeoOpType =
  | 'buffer'
  | 'intersection'
  | 'difference'
  | 'union'
  | 'dissolve'
  | 'simplify'
  | 'centroid'
  | 'convexHull';

interface WorkerMessage {
  id: number;
  mode: 'unary' | 'binary';
  op: GeoOpType;
  params?: any;
  fcA: FeatureCollection | null;
  fcB?: FeatureCollection | null;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  result?: FeatureCollection;
  error?: string;
}

function asCollection(g: FeatureCollection | Feature | null): FeatureCollection {
  if (!g) return turf.featureCollection([]) as any as FeatureCollection;
  return (g as any).type === 'FeatureCollection' ? (g as FeatureCollection) : (turf.featureCollection([g as Feature]) as any as FeatureCollection);
}

function unionAll(fc: FeatureCollection): FeatureCollection {
  if (fc.features.length === 0) return turf.featureCollection([]) as any as FeatureCollection;
  let acc: Feature | null = fc.features[0] as Feature;
  for (let i = 1; i < fc.features.length; i++) {
    try {
      const u: any = (turf as any).union(acc as any, fc.features[i] as any);
      acc = (u as any as Feature) || acc;
    } catch (_) {}
  }
  return turf.featureCollection(acc ? [acc] : []) as any as FeatureCollection;
}

function runUnary(fc: FeatureCollection, op: GeoOpType, params?: any): FeatureCollection {
  let result: FeatureCollection | Feature | null = null;
  switch (op) {
    case 'buffer': {
      const distance = Math.max(0, params?.distance || 0);
      result = turf.buffer(fc as any, distance, { units: 'meters' }) as any as FeatureCollection;
      break;
    }
    case 'dissolve': {
      const property = params?.property as string | undefined;
      if (property) {
        result = turf.dissolve(fc as any, { propertyName: property }) as any as FeatureCollection;
      } else {
        result = unionAll(fc);
      }
      break;
    }
    case 'simplify': {
      const tolMeters = Math.max(0, params?.tolerance || 0);
      const toleranceDegrees = tolMeters / 111320;
      result = (turf as any).simplify(fc as any, { tolerance: toleranceDegrees, highQuality: !!params?.highQuality, mutate: false }) as any as FeatureCollection;
      break;
    }
    case 'centroid': {
      result = turf.featureCollection(fc.features.map((f: Feature) => turf.centroid(f))) as any as FeatureCollection;
      break;
    }
    case 'convexHull': {
      const hull = turf.convex(fc as any);
      result = (hull ? turf.featureCollection([hull]) : turf.featureCollection([])) as any as FeatureCollection;
      break;
    }
    default:
      result = turf.featureCollection([]) as any as FeatureCollection;
  }
  return asCollection(result);
}

function runBinary(fcA: FeatureCollection, fcB: FeatureCollection, op: GeoOpType): FeatureCollection {
  let result: FeatureCollection | null = null;
  switch (op) {
    case 'intersection': {
      const out: Feature[] = [];
      for (const fa of fcA.features) {
        for (const fb of fcB.features) {
          try {
            const inter = turf.intersect(fa as any, fb as any);
            if (inter) out.push(inter as any as Feature);
          } catch (_) {}
        }
      }
      result = turf.featureCollection(out) as any as FeatureCollection;
      break;
    }
    case 'difference': {
      const out: Feature[] = [];
      for (const fa of fcA.features) {
        let current: Feature | null = fa as Feature;
        for (const fb of fcB.features) {
          if (!current) break;
          try {
            const d: any = (turf as any).difference(current as any, fb as any);
            current = (d as Feature) || null;
          } catch (_) {}
        }
        if (current) out.push(current);
      }
      result = turf.featureCollection(out) as any as FeatureCollection;
      break;
    }
    case 'union': {
      let acc: FeatureCollection = fcA;
      for (const fb of fcB.features) {
        acc = unionAll(turf.featureCollection([...(acc.features || []), fb]) as any as FeatureCollection);
      }
      result = acc;
      break;
    }
    default:
      result = turf.featureCollection([]) as any as FeatureCollection;
  }
  return asCollection(result);
}

ctx.onmessage = (ev: MessageEvent<WorkerMessage>) => {
  const { id, mode, op, params, fcA, fcB } = ev.data || {} as WorkerMessage;
  const resp: WorkerResponse = { id, ok: true };
  try {
    if (!fcA) throw new Error('fcA ausente');
    const a = fcA as FeatureCollection;
    if (mode === 'unary') {
      resp.result = runUnary(a, op, params);
    } else {
      if (!fcB) throw new Error('fcB ausente');
      const b = fcB as FeatureCollection;
      resp.result = runBinary(a, b, op);
    }
  } catch (e: any) {
    resp.ok = false;
    resp.error = e?.message || String(e);
  }
  ctx.postMessage(resp);
};


