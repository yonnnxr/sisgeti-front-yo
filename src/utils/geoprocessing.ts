import * as turf from '@turf/turf';
import type { Feature, FeatureCollection } from 'geojson';
// Worker opcional
let geoWorker: Worker | null = null;
export function getGeoWorker(): Worker | null {
  if (typeof window === 'undefined') return null;
  if (!geoWorker) {
    try {
      geoWorker = new Worker(new URL('../workers/geoprocessing.worker.ts', import.meta.url), { type: 'module' });
    } catch (_) {
      geoWorker = null;
    }
  }
  return geoWorker;
}
import OLGeoJSON from 'ol/format/GeoJSON';

// Nota: As features no OL estão em EPSG:3857. Para operar com o Turf (WGS84),
// convertemos para GeoJSON com dataProjection: 'EPSG:4326' e de/para featureProjection: 'EPSG:3857'.

export type GeoOpType =
  | 'buffer'
  | 'intersection'
  | 'difference'
  | 'union'
  | 'dissolve'
  | 'simplify'
  | 'centroid'
  | 'convexHull';

export interface BufferParams {
  distance: number; // em metros
}

export interface SimplifyParams {
  tolerance: number; // em metros aproximados (na prática, tolerância angular em graus pós reprojeção)
  highQuality?: boolean;
}

export type GeoOpParams =
  | { type: 'buffer'; params: BufferParams }
  | { type: 'intersection' }
  | { type: 'difference' }
  | { type: 'union' }
  | { type: 'dissolve'; property?: string }
  | { type: 'simplify'; params: SimplifyParams }
  | { type: 'centroid' }
  | { type: 'convexHull' };

const olGeoJson = new OLGeoJSON();

export function featuresToTurfCollection(features: any[]): FeatureCollection {
  try {
    const geo = olGeoJson.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    }) as any as FeatureCollection;
    // Garantir FeatureCollection
    if ((geo as any).type === 'FeatureCollection') return geo as FeatureCollection;
    // Fallback: embrulhar
    return turf.featureCollection(Array.isArray(geo) ? (geo as any) : [(geo as any)]) as FeatureCollection;
  } catch (_) {
    // Fallback robusto: serializar feature a feature, ignorando geometrias inválidas
    const out: any[] = [];
    for (const f of features || []) {
      try {
        const one = (olGeoJson as any).writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        });
        if (one && one.type === 'Feature' && one.geometry && one.geometry.type !== 'FeatureCollection') {
          out.push(one);
        }
      } catch {}
    }
    return turf.featureCollection(out) as any as FeatureCollection;
  }
}

export function turfCollectionToOlFeatures(collection: FeatureCollection) {
  // Limpar e converter cada feature individualmente, ignorando inválidas
  const output: any[] = [];
  const fc = ((turf as any).cleanCoords(collection, { mutate: false }) as FeatureCollection) || collection;
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  for (const feat of feats) {
    try {
      if (!feat || !feat.geometry) continue;
      const gType = (feat.geometry as any).type;
      if (!gType || gType === 'FeatureCollection') continue;
      const of = (olGeoJson as any).readFeature(feat as any, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      });
      if (of) output.push(of);
    } catch {}
  }
  return output;
}

export function runUnaryOperation(
  input: any[],
  op: Exclude<GeoOpType, 'intersection' | 'difference' | 'union'>,
  params?: BufferParams | SimplifyParams | { property?: string }
) {
  const fc = featuresToTurfCollection(input);
  let result: FeatureCollection | Feature | null = null;

  switch (op) {
    case 'buffer': {
      const p = (params as BufferParams) || { distance: 0 };
      // Turf buffer usa unidades: meters
      result = ((turf as any).buffer(fc as any, p.distance, { units: 'meters' }) as any) as FeatureCollection;
      break;
    }
    case 'dissolve': {
      const property = (params as { property?: string })?.property;
      if (property) {
        // Dissolve por propriedade
        result = (turf as any).dissolve(fc as any, { propertyName: property }) as any as FeatureCollection;
      } else {
        // Dissolve geral via union sequencial
        result = unionAll(fc);
      }
      break;
    }
    case 'simplify': {
      const p = (params as SimplifyParams) || { tolerance: 1, highQuality: false };
      // Simplify espera tolerância em graus; aproximamos convertendo de metros para graus (~111_320 m/deg)
      const toleranceDegrees = Math.max(0, p.tolerance) / 111320;
      result = ((turf as any).simplify(fc as any, { tolerance: toleranceDegrees, highQuality: !!p.highQuality, mutate: false }) as any) as FeatureCollection;
      break;
    }
    case 'centroid': {
      const centroids = fc.features.map((f: Feature) => turf.centroid(f));
      result = turf.featureCollection(centroids) as any as FeatureCollection;
      break;
    }
    case 'convexHull': {
      const hull = (turf as any).convex(fc as any) as Feature | undefined;
      result = (hull ? (turf.featureCollection([hull]) as any as FeatureCollection) : (turf.featureCollection([]) as any as FeatureCollection));
      break;
    }
    default:
      result = turf.featureCollection([]);
  }

  return turfCollectionToOlFeatures(asCollection(result));
}

export function runBinaryOperation(
  inputA: any[],
  inputB: any[],
  op: 'intersection' | 'difference' | 'union'
) {
  const fcA = featuresToTurfCollection(inputA);
  const fcB = featuresToTurfCollection(inputB);

  let result: FeatureCollection | Feature | null = null;

  switch (op) {
    case 'intersection': {
      const out: Feature[] = [];
      for (const fa of fcA.features) {
        for (const fb of fcB.features) {
          try {
            const inter = turf.intersect(fa as any, fb as any);
            if (inter) out.push(inter as any as Feature);
          } catch (_) {
            // geometrias inválidas podem falhar; ignore
          }
        }
      }
      result = turf.featureCollection(out) as any as FeatureCollection;
      break;
    }
    case 'difference': {
      let diffParts: Feature[] = [];
      for (const fa of fcA.features) {
        let current: Feature | null = fa as Feature;
        for (const fb of fcB.features) {
          if (!current) break;
          try {
            const d: any = (turf as any).difference(current as any, fb as any);
            current = (d as Feature) || null;
          } catch (_) {
            // ignore
          }
        }
        if (current) diffParts.push(current);
      }
      result = turf.featureCollection(diffParts) as any as FeatureCollection;
      break;
    }
    case 'union': {
      result = unionTwoCollections(fcA, fcB);
      break;
    }
  }

  return turfCollectionToOlFeatures(asCollection(result));
}

export async function runUnaryOperationInWorker(
  input: any[],
  op: Exclude<GeoOpType, 'intersection' | 'difference' | 'union'>,
  params?: BufferParams | SimplifyParams | { property?: string }
) {
  const fc = featuresToTurfCollection(input);
  const worker = getGeoWorker();
  if (!worker) {
    return runUnaryOperation(input, op, params);
  }
  const id = Date.now();
  const payload = { id, mode: 'unary', op, params, fcA: fc } as any;
  const result = await new Promise<FeatureCollection>((resolve, reject) => {
    const listener = (ev: MessageEvent) => {
      const data = ev.data;
      if (data?.id !== id) return;
      worker.removeEventListener('message', listener as any);
      if (data.ok) resolve(data.result);
      else reject(new Error(data.error || 'Erro no worker'));
    };
    worker.addEventListener('message', listener as any);
    worker.postMessage(payload);
  });
  return turfCollectionToOlFeatures(result);
}

export async function runBinaryOperationInWorker(
  inputA: any[],
  inputB: any[],
  op: 'intersection' | 'difference' | 'union'
) {
  const fcA = featuresToTurfCollection(inputA);
  const fcB = featuresToTurfCollection(inputB);
  const worker = getGeoWorker();
  if (!worker) {
    return runBinaryOperation(inputA, inputB, op);
  }
  const id = Date.now();
  const payload = { id, mode: 'binary', op, fcA, fcB } as any;
  const result = await new Promise<FeatureCollection>((resolve, reject) => {
    const listener = (ev: MessageEvent) => {
      const data = ev.data;
      if (data?.id !== id) return;
      worker.removeEventListener('message', listener as any);
      if (data.ok) resolve(data.result);
      else reject(new Error(data.error || 'Erro no worker'));
    };
    worker.addEventListener('message', listener as any);
    worker.postMessage(payload);
  });
  return turfCollectionToOlFeatures(result);
}

function unionTwoCollections(a: FeatureCollection, b: FeatureCollection): FeatureCollection {
  let current: FeatureCollection | null = a;
  for (const fb of b.features) {
    current = unionAll(turf.featureCollection([...(current?.features || []), fb]) as any as FeatureCollection);
  }
  return current || (turf.featureCollection([]) as any as FeatureCollection);
}

function unionAll(fc: FeatureCollection): FeatureCollection {
  if (fc.features.length === 0) return turf.featureCollection([]) as any as FeatureCollection;
  let acc: Feature | null = fc.features[0] as Feature;
  for (let i = 1; i < fc.features.length; i++) {
    try {
      const u: any = (turf as any).union(acc as any, fc.features[i] as any);
      acc = (u as Feature) || acc;
    } catch (_) {
      // geometrias podem não unir; mantém acc
    }
  }
  return (turf.featureCollection(acc ? [acc] : []) as any) as FeatureCollection;
}

function asCollection(g: FeatureCollection | Feature | null): FeatureCollection {
  if (!g) return turf.featureCollection([]) as any as FeatureCollection;
  return (g as any).type === 'FeatureCollection' ? (g as FeatureCollection) : (turf.featureCollection([g as Feature]) as any as FeatureCollection);
}


