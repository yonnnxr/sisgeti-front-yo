"use client"

import { useEffect, useMemo, useState } from "react";
import { FaChartBar, FaTimes, FaDownload } from "react-icons/fa";
import { getBasicGeoStats, listAttributes, detectAttributeType, computeCategoricalStats, computeNumericStats, toCsv, filterByMask, computeCategoryAggregations } from "@/utils/analytics";

export interface LayerDescriptor {
  id: string;
  name: string;
  type: "WMS" | "GeoJSON" | "OSM";
}

interface GeoAnalyticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerDescriptor[];
  getEditFeatures: () => any[];
  getLayerFeaturesById: (id: string) => any[];
}

export default function GeoAnalyticsPanel({ isOpen, onClose, layers, getEditFeatures, getLayerFeaturesById }: GeoAnalyticsPanelProps) {
  const [input, setInput] = useState<string>('edit');
  const [attributes, setAttributes] = useState<string[]>([]);
  const [selectedAttr, setSelectedAttr] = useState<string>('');
  const [attrType, setAttrType] = useState<'numeric' | 'categorical' | null>(null);
  const [basic, setBasic] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [useMask, setUseMask] = useState<boolean>(false);
  const [maskMode, setMaskMode] = useState<'intersects' | 'within'>('intersects');
  const [categoryAgg, setCategoryAgg] = useState<Array<{ value: string; count: number; area: number; length: number }> | null>(null);

  const geojsonLayers = useMemo(() => layers.filter(l => l.type === 'GeoJSON'), [layers]);

  useEffect(() => {
    if (!isOpen) return;
    setIsBusy(true);
    try {
      let feats = input === 'edit' ? getEditFeatures() : getLayerFeaturesById(input);
      if (useMask) {
        const mask = getEditFeatures();
        feats = filterByMask(feats, mask, maskMode);
      }
      setBasic(getBasicGeoStats(feats));
      const attrs = listAttributes(feats);
      setAttributes(attrs);
      if (!selectedAttr && attrs.length > 0) setSelectedAttr(attrs[0]);
    } catch (e) {
      console.error('Falha ao calcular estatísticas básicas:', e);
    } finally {
      setIsBusy(false);
    }
  }, [isOpen, input]);

  useEffect(() => {
    if (!isOpen || !selectedAttr) { setDetail(null); setAttrType(null); setCategoryAgg(null); return; }
    setIsBusy(true);
    try {
      let feats = input === 'edit' ? getEditFeatures() : getLayerFeaturesById(input);
      if (useMask) {
        const mask = getEditFeatures();
        feats = filterByMask(feats, mask, maskMode);
      }
      const t = detectAttributeType(feats, selectedAttr);
      setAttrType(t);
      if (t === 'categorical') {
        setDetail(computeCategoricalStats(feats, selectedAttr));
        setCategoryAgg(computeCategoryAggregations(feats, selectedAttr));
      } else {
        setDetail(computeNumericStats(feats, selectedAttr));
        setCategoryAgg(null);
      }
    } catch (e) {
      console.error('Falha ao calcular estatísticas do atributo:', e);
      setDetail(null);
      setCategoryAgg(null);
    } finally {
      setIsBusy(false);
    }
  }, [isOpen, input, selectedAttr, useMask, maskMode]);

  if (!isOpen) return null;

  const exportSummaryCsv = () => {
    try {
      const feats = input === 'edit' ? getEditFeatures() : getLayerFeaturesById(input);
      const attrs = listAttributes(feats);
      const rows: Record<string, any>[] = [];
      for (const f of feats) {
        const row: Record<string, any> = {};
        for (const a of attrs) row[a] = f.get?.('' + a) ?? f.properties?.[a];
        rows.push(row);
      }
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'camada.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Falha ao exportar CSV:', e);
      alert('Falha ao exportar CSV.');
    }
  };

  return (
    <div className="absolute top-24 right-20 w-[460px] bg-white rounded-lg shadow-xl border border-gray-200 z-50">
      <div className="p-4 border-b flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><FaChartBar /> Geo BI</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><FaTimes /></button>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entrada</label>
          <select value={input} onChange={e => setInput(e.target.value)} className="w-full border rounded px-3 py-2">
            <option value="edit">Camada de Edição</option>
            {geojsonLayers.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Filtro por máscara (camada de edição) */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={useMask} onChange={e => setUseMask(e.target.checked)} />
            Filtrar pela Camada de Edição
          </label>
          {useMask && (
            <select value={maskMode} onChange={e => setMaskMode(e.target.value as any)} className="border rounded px-2 py-1 text-sm">
              <option value="intersects">Intersecciona</option>
              <option value="within">Contido em</option>
            </select>
          )}
        </div>

        {/* Estatísticas básicas */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Features" value={basic?.featureCount ?? '-'} />
          <Stat label="Pontos" value={basic?.pointCount ?? '-'} />
          <Stat label="Comprimento total" value={formatMeters(basic?.totalLengthMeters)} />
          <Stat label="Área total" value={formatSqMeters(basic?.totalAreaSqMeters)} />
        </div>
        {basic?.bbox4326 && (
          <div className="text-xs text-gray-600">BBox (EPSG:4326): [{basic.bbox4326.map((v: number) => v.toFixed(5)).join(', ')}]</div>
        )}
        {!!basic?.geometryTypeCounts && (
          <div className="text-xs text-gray-700">
            {Object.entries(basic.geometryTypeCounts).map(([k, v]) => (
              <span key={k} className="inline-block mr-2 mb-1 px-2 py-1 rounded bg-gray-100">{k}: {v as any}</span>
            ))}
          </div>
        )}

        {/* Atributo para análise */}
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Atributo</label>
            <select value={selectedAttr} onChange={e => setSelectedAttr(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="">Selecione...</option>
              {attributes.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="text-sm text-gray-600">{attrType ? `Tipo: ${attrType}` : '—'}</div>
        </div>

        {/* Resultado detalhado */}
        <div className="border rounded p-3">
          {isBusy && <div className="text-sm text-gray-600">Calculando...</div>}
          {!isBusy && detail && detail.type === 'categorical' && (
            <div className="space-y-2">
              <div className="text-sm text-gray-700">Top categorias</div>
              <div className="space-y-1">
                {detail.categories.map((c: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="w-24 text-xs text-gray-700 truncate" title={c.value}>{c.value}</div>
                    <div className="flex-1 bg-gray-100 rounded h-3">
                      <div className="bg-blue-600 h-3 rounded" style={{ width: `${Math.min(100, c.pct).toFixed(1)}%` }} />
                    </div>
                    <div className="w-16 text-right text-xs text-gray-600">{c.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isBusy && detail && detail.type === 'numeric' && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-700">
                <div>Min: {detail.min}</div>
                <div>Mediana: {detail.median}</div>
                <div>Max: {detail.max}</div>
                <div>Média: {detail.mean.toFixed(2)}</div>
                <div>P25: {detail.p25}</div>
                <div>P75: {detail.p75}</div>
                <div>StdDev: {detail.stddev.toFixed(2)}</div>
              </div>
              <div className="space-y-1">
                {detail.bins.map((b: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="w-28 text-xs text-gray-700 truncate" title={`${b.min}–${b.max}`}>{b.min.toFixed(1)}–{b.max.toFixed(1)}</div>
                    <div className="flex-1 bg-gray-100 rounded h-3">
                      <div className="bg-green-600 h-3 rounded" style={{ width: `${Math.min(100, (detail.total ? (b.count / detail.total) * 100 : 0)).toFixed(1)}%` }} />
                    </div>
                    <div className="w-10 text-right text-xs text-gray-600">{b.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!isBusy && !detail && <div className="text-sm text-gray-600">Selecione um atributo para ver detalhes.</div>}
        </div>

        {/* Tabela de agregação por categoria (contagem/área/comprimento) */}
        {!!categoryAgg && categoryAgg.length > 0 && (
          <div className="border rounded">
            <div className="px-3 py-2 border-b text-sm font-medium text-gray-700">Resumo por categoria</div>
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Categoria</th>
                    <th className="text-right p-2">Qtde</th>
                    <th className="text-right p-2">Área</th>
                    <th className="text-right p-2">Comprimento</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryAgg.map((r, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2 truncate" title={r.value}>{r.value}</td>
                      <td className="p-2 text-right">{r.count}</td>
                      <td className="p-2 text-right">{formatSqMeters(r.area)}</td>
                      <td className="p-2 text-right">{formatMeters(r.length)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button onClick={exportSummaryCsv} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-white bg-gray-700 hover:bg-gray-800">
          <FaDownload /> Exportar CSV (atributos da camada)
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 border rounded p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-800">{value}</div>
    </div>
  );
}

function formatMeters(m: number | undefined): string {
  if (!m && m !== 0) return '-';
  if (m > 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${m.toFixed(0)} m`;
}

function formatSqMeters(a: number | undefined): string {
  if (!a && a !== 0) return '-';
  if (a > 1_000_000) return `${(a / 1_000_000).toFixed(2)} km²`;
  return `${a.toFixed(0)} m²`;
}

