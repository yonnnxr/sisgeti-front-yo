// Cria utilitário para importar múltiplos formatos (KML, GPX, SHP, CSV, WFS) e converter para GeoJSON
export type SupportedFormat = 'GeoJSON' | 'KML' | 'GPX' | 'SHP' | 'CSV' | 'WFS';

export type IngestSource =
  | { kind: 'file'; file: File; formatHint?: SupportedFormat }
  | { kind: 'url'; url: string; formatHint?: SupportedFormat; wfs?: { typeName: string; version?: '1.0.0' | '1.1.0' | '2.0.0'; srsName?: string; extraParams?: Record<string, string> } }
  | { kind: 'raw'; data: any; formatHint?: SupportedFormat };

export interface IngestResult {
  geojson: any;
  featureCount: number;
}

// Importadores específicos são carregados lazy para reduzir bundle inicial
async function parseKmlOrGpx(text: string): Promise<any> {
  // @tmcw/togeojson opera em DOMParser
  const { kml, gpx } = await import('@tmcw/togeojson');
  const dom = new DOMParser().parseFromString(text, 'application/xml');
  const root = dom.documentElement?.nodeName?.toLowerCase();
  if (root.includes('kml')) return kml(dom);
  if (root.includes('gpx')) return gpx(dom);
  // fallback: tentar ambos (kml padrão)
  return kml(dom);
}

async function parseShapefile(input: ArrayBuffer | File | Blob): Promise<any> {
  const shp = await import('shpjs');
  if (input instanceof File || input instanceof Blob) {
    return shp.default(input);
  }
  // Zip em ArrayBuffer
  return shp.default(input);
}

async function parseCsv(text: string): Promise<any> {
  const Papa = (await import('papaparse')).default;
  const wk = (await import('wellknown')).default as (wkt: string) => any;
  const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
  const rows: any[] = parsed.data as any[];
  const features: any[] = [];
  for (const row of rows) {
    if (!row) continue;
    // Heurística: colunas lon/lat ou WKT
    const keys = Object.keys(row).map(k => k.toLowerCase());
    const lonKey = ['lon', 'lng', 'longitude', 'x'].find(k => keys.includes(k));
    const latKey = ['lat', 'latitude', 'y'].find(k => keys.includes(k));
    const wktKey = ['wkt', 'geom', 'geometry'].find(k => keys.includes(k));
    let geometry: any = null;
    if (wktKey) {
      const wktVal = row[wktKey];
      try { geometry = wk(String(wktVal)); } catch {}
    } else if (lonKey && latKey) {
      const lon = Number(row[lonKey]);
      const lat = Number(row[latKey]);
      if (isFinite(lon) && isFinite(lat)) geometry = { type: 'Point', coordinates: [lon, lat] };
    }
    if (!geometry) continue;
    const props: Record<string, any> = { ...row };
    delete props[lonKey as any];
    delete props[latKey as any];
    delete props[wktKey as any];
    features.push({ type: 'Feature', geometry, properties: props });
  }
  return { type: 'FeatureCollection', features };
}

async function fetchWfs(url: string, opts: NonNullable<IngestSource & { kind: 'url' }>['wfs']): Promise<any> {
  const { typeName, version = '2.0.0', srsName = 'EPSG:4326', extraParams = {} } = opts || ({} as any);
  const params = new URLSearchParams({
    service: 'WFS', request: 'GetFeature', version, typeNames: typeName,
    srsName, outputFormat: 'application/json', ...extraParams,
  });
  const sep = url.includes('?') ? '&' : '?';
  const full = `${url}${sep}${params.toString()}`;
  const r = await fetch(full, { headers: { Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.8' } });
  if (!r.ok) throw new Error(`WFS HTTP ${r.status}`);
  const ct = r.headers.get('Content-Type') || '';
  if (/json/i.test(ct)) return r.json();
  const text = await r.text();
  try { return JSON.parse(text); } catch { throw new Error('WFS retornou formato não JSON'); }
}

function normalizeGeoJSON(obj: any): any {
  if (!obj) return { type: 'FeatureCollection', features: [] };
  if (obj.type === 'FeatureCollection') return obj;
  if (obj.type === 'Feature') return { type: 'FeatureCollection', features: [obj] };
  if (obj.type) return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: obj, properties: {} }] };
  // formato desconhecido
  return { type: 'FeatureCollection', features: [] };
}

export async function ingestToGeoJSON(source: IngestSource): Promise<IngestResult> {
  let geo: any = null;
  if (source.kind === 'raw') {
    const data = source.data;
    if (source.formatHint === 'GeoJSON' || (data && (data.type === 'FeatureCollection' || data.type === 'Feature'))) {
      geo = data;
    } else if (typeof data === 'string') {
      // tentar KML/GPX/CSV
      if (/^\s*</.test(data)) {
        geo = await parseKmlOrGpx(data);
      } else if (data.includes(',') || data.includes('\n')) {
        geo = await parseCsv(data);
      }
    }
  } else if (source.kind === 'file') {
    const file = source.file;
    const name = (file.name || '').toLowerCase();
    const buf = await file.arrayBuffer();
    if (source.formatHint === 'SHP' || name.endsWith('.zip') || name.endsWith('.shp')) {
      geo = await parseShapefile(buf);
    } else if (source.formatHint === 'KML' || name.endsWith('.kml') || source.formatHint === 'GPX' || name.endsWith('.gpx')) {
      const text = await file.text();
      geo = await parseKmlOrGpx(text);
    } else if (source.formatHint === 'CSV' || name.endsWith('.csv')) {
      const text = await file.text();
      geo = await parseCsv(text);
    } else if (source.formatHint === 'GeoJSON' || name.endsWith('.geojson') || name.endsWith('.json')) {
      try { geo = JSON.parse(new TextDecoder().decode(buf)); } catch { geo = {}; }
    }
  } else if (source.kind === 'url') {
    if (source.wfs?.typeName) {
      geo = await fetchWfs(source.url, source.wfs);
    } else {
      const r = await fetch(source.url, { headers: { Accept: 'application/geo+json, application/json;q=0.9, */*;q=0.8' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get('Content-Type') || '';
      if (/json|geo\+json/i.test(ct) || source.formatHint === 'GeoJSON') {
        geo = await r.json();
      } else if (/xml|kml|gpx/i.test(ct) || source.formatHint === 'KML' || source.formatHint === 'GPX') {
        const text = await r.text();
        geo = await parseKmlOrGpx(text);
      } else if (/csv/i.test(ct) || source.formatHint === 'CSV') {
        const text = await r.text();
        geo = await parseCsv(text);
      } else {
        // tentativa bruto JSON
        const text = await r.text();
        try { geo = JSON.parse(text); } catch { throw new Error('Formato não suportado pela URL'); }
      }
    }
  }

  const normalized = normalizeGeoJSON(geo);
  const featureCount = Array.isArray(normalized?.features) ? normalized.features.length : 0;
  return { geojson: normalized, featureCount };
}
