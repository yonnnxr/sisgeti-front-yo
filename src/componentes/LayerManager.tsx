"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FaPlus, FaTrash, FaGlobe, FaLayerGroup, FaFileImport, FaArrowUp, FaArrowDown, FaSearch, FaChevronDown, FaChevronRight, FaFilter } from "react-icons/fa";
import FilterBuilder from './FilterBuilder';
import ConnectionProfiles from './ConnectionProfiles';
import FloatingPanel from "./FloatingPanel";
import useOptimizedFilter from "../utils/useOptimizedFilter";
import { ingestToGeoJSON, SupportedFormat } from '@/utils/ingest';

// Definindo a interface Layer aqui também para consistência
interface Layer {
  id: string;
  name: string;
  type: "WMS" | "GeoJSON" | "OSM";
  url?: string;
  layerName?: string;
  geoJsonData?: object; // Este é o objeto GeoJSON já parseado
  visible: boolean;
  opacity: number;
  style?: LayerStyle;
}

interface LayerManagerProps {
  layers: Layer[];
  onAddLayer: (layer: Omit<Layer, "id">) => void;
  onRemoveLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onMoveLayerUp: (id: string) => void;
  onMoveLayerDown: (id: string) => void;
  onZoomToLayer: (id: string) => void;
  onUpdateStyle?: (id: string, style: LayerStyle) => void;
  onClusterDistanceChange?: (id: string, distance: number) => void;
  onToggleHeatmap?: (id: string) => void;
  onApplyGeoAttributeFilter?: (id: string, query: string) => void;
  isDark?: boolean;
  highlight?: boolean;
}

type LayerStyle = {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  fillOpacity?: number;
  pointRadius?: number;
};

export default function LayerManager({
  layers,
  onAddLayer,
  onRemoveLayer,
  onToggleVisibility,
  onOpacityChange,
  onMoveLayerUp,
  onMoveLayerDown,
  onZoomToLayer,
  onUpdateStyle,
  onClusterDistanceChange,
  onToggleHeatmap,
  onApplyGeoAttributeFilter,
  isDark = false,
  highlight = false,
}: LayerManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterText, setFilterText] = useState("");
  const [collapseWms, setCollapseWms] = useState(false);
  const [collapseGeo, setCollapseGeo] = useState(false);
  const [filterWms, setFilterWms] = useState(true);
  const [filterGeo, setFilterGeo] = useState(true);
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [minOpacity, setMinOpacity] = useState(0);
  const [sortKey, setSortKey] = useState<'name' | 'type' | 'opacity'>('name');
  const [geoFilterById, setGeoFilterById] = useState<Record<string, string>>({});
  const [filterBuilderFor, setFilterBuilderFor] = useState<string | null>(null);
  const [pgCatalog, setPgCatalog] = useState<Array<{ schema: string; table: string; geom: string; srid: number; type: string }>>([]);
  const [pgLoading, setPgLoading] = useState(false);
  const getLayerFields = useCallback((l: Layer) => [l.name, l.type, l.layerName, l.url], []);
  const { filtered: filteredLayers } = useOptimizedFilter(layers, filterText, getLayerFields);
  const filteredAndSorted = useMemo(() => {
    const byType = filteredLayers.filter(l => (l.type === 'WMS' ? filterWms : l.type === 'GeoJSON' ? filterGeo : true));
    const byVis = byType.filter(l => visibilityFilter === 'all' ? true : visibilityFilter === 'visible' ? l.visible : !l.visible);
    const byOpacity = byVis.filter(l => l.opacity >= minOpacity);
    const arr = byOpacity.slice();
    arr.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'type') return a.type.localeCompare(b.type);
      if (sortKey === 'opacity') return (b.opacity - a.opacity);
      return 0;
    });
    return arr;
  }, [filteredLayers, filterWms, filterGeo, visibilityFilter, minOpacity, sortKey]);
  // Eventos externos para abrir/realçar
  useEffect(() => {
    const openAdd = () => setShowAddForm(true);
    const focus = () => {
      try { (document.getElementById('layer-manager-panel-anchor') as any)?.scrollIntoView?.({ behavior: 'smooth' }); } catch {}
    };
    window.addEventListener('openLayerAddForm', openAdd);
    window.addEventListener('openLayerManager', focus);
    return () => {
      window.removeEventListener('openLayerAddForm', openAdd);
      window.removeEventListener('openLayerManager', focus);
    };
  }, []);
  type NewLayerForm = {
    name: string;
    format: 'WMS' | 'GeoJSON' | 'KML' | 'GPX' | 'SHP' | 'CSV' | 'WFS' | 'PostGIS' | 'MSSQL' | 'MySQL';
    url: string;
    layerName: string;
    geoJsonFile: File | null;
    geoJsonUrl: string;
    wfsTypeName?: string;
    wfsSrsName?: string;
    pgSchema?: string;
    pgTable?: string;
    pgGeomColumn?: string;
    pgProperties?: string;
    pgBbox?: string;
    connHost?: string;
    connPort?: string;
    connDatabase?: string;
    connUser?: string;
    connPassword?: string;
    connSSL?: boolean;
    connEncrypt?: boolean;
    connTrustServerCertificate?: boolean;
    profileName?: string;
    selectedProfile?: string;
    visible: boolean;
    opacity: number;
  };

  const [newLayer, setNewLayer] = useState<NewLayerForm>({
    name: "",
    format: "WMS",
    url: "",
    layerName: "",
    geoJsonFile: null,
    geoJsonUrl: "",
    wfsTypeName: "",
    wfsSrsName: "EPSG:4326",
    pgSchema: "public",
    pgTable: "",
    pgGeomColumn: "geom",
    pgProperties: "",
    pgBbox: "",
    connHost: "",
    connPort: "",
    connDatabase: "",
    connUser: "",
    connPassword: "",
    connSSL: false,
    connEncrypt: true,
    connTrustServerCertificate: true,
    profileName: "",
    selectedProfile: "",
    visible: true,
    opacity: 1,
  });
  const [dbProfiles, setDbProfiles] = useState<Array<{ kind: 'postgres'|'mssql'|'mysql', name: string, connection: any }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem('SISGETI_DB_PROFILES'); setDbProfiles(raw ? JSON.parse(raw) : []); } catch {}
  }, [showAddForm, newLayer.format]);

  const handleAddLayer = async () => {
    const name = newLayer.name.trim();
    if (!name) return;
    let stage = 'init';
    try {
      setIsSubmitting(true);
      if (newLayer.format === 'WMS') {
        stage = 'wms-validate';
        if (!newLayer.url.trim() || !newLayer.layerName.trim()) return;
        const layerData: Omit<Layer, 'id'> = {
          name,
          type: 'WMS',
          url: newLayer.url.trim(),
          layerName: newLayer.layerName.trim(),
          visible: newLayer.visible,
          opacity: newLayer.opacity,
        };
        stage = 'wms-onAddLayer';
        onAddLayer(layerData);
        resetForm();
        return;
      }
      if (newLayer.format === 'WFS') {
        stage = 'wfs-fetch';
        if (!newLayer.url.trim() || !newLayer.wfsTypeName?.trim()) return;
        const { geojson } = await ingestToGeoJSON({ kind: 'url', url: newLayer.url.trim(), formatHint: 'WFS', wfs: { typeName: newLayer.wfsTypeName!.trim(), srsName: newLayer.wfsSrsName || 'EPSG:4326' } });
        const layerData: Omit<Layer, 'id'> = { name, type: 'GeoJSON', geoJsonData: geojson, visible: newLayer.visible, opacity: newLayer.opacity };
        stage = 'wfs-onAddLayer';
        onAddLayer(layerData);
        resetForm();
        return;
      }
      if (newLayer.format === 'PostGIS' || newLayer.format === 'MSSQL' || newLayer.format === 'MySQL') {
        stage = 'db-validate';
        if (!newLayer.pgTable?.trim()) { alert('Informe a tabela.'); return; }
        const body: any = { schema: (newLayer.pgSchema || 'public').trim(), table: newLayer.pgTable.trim(), geomColumn: (newLayer.pgGeomColumn || 'geom').trim() };
        if (newLayer.pgProperties?.trim()) body.properties = newLayer.pgProperties.split(',').map(s => s.trim()).filter(Boolean);
        if (newLayer.pgBbox?.trim()) { const p = newLayer.pgBbox.split(',').map(s => Number(s.trim())); if (p.length === 4 && p.every(v => isFinite(v))) body.bbox = p as [number, number, number, number]; }
        const kind = newLayer.format === 'PostGIS' ? 'postgres' : (newLayer.format === 'MSSQL' ? 'mssql' : 'mysql');
        const connection = {
          host: newLayer.connHost || undefined,
          port: newLayer.connPort ? parseInt(newLayer.connPort) : undefined,
          database: newLayer.connDatabase || undefined,
          user: newLayer.connUser || undefined,
          password: newLayer.connPassword || undefined,
          ssl: newLayer.format === 'PostGIS' ? !!newLayer.connSSL : undefined,
          encrypt: newLayer.format === 'MSSQL' ? !!newLayer.connEncrypt : undefined,
          trustServerCertificate: newLayer.format === 'MSSQL' ? !!newLayer.connTrustServerCertificate : undefined,
        };
        stage = 'db-fetch';
        const r = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ kind, connection, ...body, where: (newLayer as any).pgWhere }) });
        if (!r.ok) {
          const txt = await r.text().catch(() => '');
          throw new Error(`DB_HTTP_${r.status}${txt ? `: ${txt}` : ''}`);
        }
        const geo = await r.json();
        const layerData: Omit<Layer, 'id'> = { name, type: 'GeoJSON', geoJsonData: geo, visible: newLayer.visible, opacity: newLayer.opacity };
        stage = 'db-onAddLayer';
        onAddLayer(layerData);
        resetForm();
        return;
      }
      const hint = newLayer.format as SupportedFormat;
      if (newLayer.geoJsonFile) {
        stage = 'file-ingest';
        const { geojson } = await ingestToGeoJSON({ kind: 'file', file: newLayer.geoJsonFile, formatHint: hint });
        const layerData: Omit<Layer, 'id'> = { name, type: 'GeoJSON', geoJsonData: geojson, visible: newLayer.visible, opacity: newLayer.opacity };
        stage = 'file-onAddLayer';
        onAddLayer(layerData);
        resetForm();
        return;
      }
      if (newLayer.geoJsonUrl.trim()) {
        stage = 'url-ingest';
        const { geojson } = await ingestToGeoJSON({ kind: 'url', url: newLayer.geoJsonUrl.trim(), formatHint: hint });
        const layerData: Omit<Layer, 'id'> = { name, type: 'GeoJSON', geoJsonData: geojson, visible: newLayer.visible, opacity: newLayer.opacity };
        stage = 'url-onAddLayer';
        onAddLayer(layerData);
        resetForm();
        return;
      }
    } catch (error: any) {
      let backendMsg = '';
      try { backendMsg = (await error?.response?.text?.()) || ''; } catch {}
      console.error('Falha ao adicionar camada:', { stage, format: newLayer.format, error, backendMsg });
      const msg = (error && (error.message || String(error))) || 'erro desconhecido';
      alert(`Falha ao adicionar camada (${stage}). ${msg}${backendMsg ? `\n${backendMsg}` : ''}`);
    }
    finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setNewLayer({ ...newLayer, geoJsonFile: e.target.files[0] });
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const resetForm = () => {
    setNewLayer({
      name: "",
      format: "WMS",
      url: "",
      layerName: "",
      geoJsonFile: null,
      geoJsonUrl: "",
      wfsTypeName: "",
      wfsSrsName: "EPSG:4326",
      pgSchema: "public",
      pgTable: "",
      pgGeomColumn: "geom",
      pgProperties: "",
      pgBbox: "",
      visible: true,
      opacity: 1,
    });
    setShowAddForm(false);
  };

  return (
    <FloatingPanel
      title="Gerenciador de Camadas"
      panelId="layer-manager"
      width={380}
      minWidth={300}
      minHeight={260}
      resizable
      defaultPosition="top-right"
      isDark={isDark}
      highlight={highlight}
      headerActions={(
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          title="Adicionar camada"
        >
          <FaPlus />
        </button>
      )}
    >
      <div id="layer-manager-panel-anchor" className="h-0 w-0" />
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>
          <FaLayerGroup /> Gerenciador de Camadas
        </h3>
      </div>

      {/* Busca/Filtragem */}
      <div className="mb-3">
        <div className={`flex items-center gap-2 rounded-md px-2 py-1 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}`}>
          <FaSearch className={`${isDark ? 'text-slate-300' : 'text-gray-500'}`} />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filtrar por nome, camada ou URL"
            className={`flex-1 py-1 focus:outline-none ${isDark ? 'bg-slate-700 text-slate-100 placeholder-slate-300' : 'bg-white text-gray-900 placeholder-gray-400'}`}
          />
        </div>
        {/* Controles adicionais */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className={`flex items-center gap-2 rounded-md px-2 py-1 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}`}>
            <label className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
              <input type="checkbox" checked={filterWms} onChange={(e) => setFilterWms(e.target.checked)} /> WMS
            </label>
            <label className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
              <input type="checkbox" checked={filterGeo} onChange={(e) => setFilterGeo(e.target.checked)} /> GeoJSON
            </label>
          </div>
          <div className={`flex items-center gap-2 rounded-md px-2 py-1 border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}`}>
            <select value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value as any)} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-gray-900'}`}>
              <option value="all">Todas</option>
              <option value="visible">Visíveis</option>
              <option value="hidden">Ocultas</option>
            </select>
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
              <span>Opacidade ≥</span>
              <input type="range" min="0" max="1" step="0.1" value={minOpacity} onChange={(e) => setMinOpacity(parseFloat(e.target.value))} />
              <span>{Math.round(minOpacity * 100)}%</span>
            </div>
          </div>
          <div className={`flex items-center gap-2 rounded-md px-2 py-1 border col-span-2 ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}`}>
            <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>Ordenar:</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as any)} className={`${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-gray-900'}`}>
              <option value="name">Nome</option>
              <option value="type">Tipo</option>
              <option value="opacity">Opacidade</option>
            </select>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className={`mb-4 p-3 rounded-lg border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-300'}`}>
          <h4 className={`text-md font-medium mb-2 ${isDark ? 'text-slate-100' : 'text-gray-700'}`}>Adicionar Nova Camada</h4>
          <div className="space-y-3">
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Nome</label>
              <input
                type="text"
                value={newLayer.name}
                onChange={(e) => setNewLayer({ ...newLayer, name: e.target.value })}
                className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100 placeholder-slate-300' : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400'}`}
                placeholder="Nome da camada"
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Formato/Origem</label>
              <select
                value={newLayer.format}
                onChange={(e) => setNewLayer({ ...newLayer, format: e.target.value as NewLayerForm['format'] })}
                className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300 text-gray-900'}`}
              >
                <option value="WMS">WMS</option>
                <option value="GeoJSON">GeoJSON</option>
                <option value="KML">KML</option>
                <option value="GPX">GPX</option>
                <option value="CSV">CSV (lon/lat ou WKT)</option>
                <option value="SHP">Shapefile (ZIP)</option>
                <option value="WFS">WFS</option>
                <option value="PostGIS">PostGIS</option>
                <option value="MSSQL">MSSQL (geometry/geography)</option>
                <option value="MySQL">MySQL (geometry)</option>
              </select>
            </div>

            {newLayer.format === "WMS" && (
              <>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>URL do Serviço WMS</label>
                  <input
                    type="text"
                    value={newLayer.url}
                    onChange={(e) => setNewLayer({ ...newLayer, url: e.target.value })}
                    className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100 placeholder-slate-300' : 'bg-white border border-gray-300 text-gray-900'}`}
                    placeholder="https://exemplo.com/geoserver/wms"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Nome da Camada WMS</label>
                  <input
                    type="text"
                    value={newLayer.layerName}
                    onChange={(e) => setNewLayer({ ...newLayer, layerName: e.target.value })}
                    className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100 placeholder-slate-300' : 'bg-white border border-gray-300 text-gray-900'}`}
                    placeholder="nome_da_camada"
                  />
                </div>
              </>
            )}

            {(newLayer.format === "GeoJSON" || newLayer.format === 'KML' || newLayer.format === 'GPX' || newLayer.format === 'CSV' || newLayer.format === 'SHP') && (
              <div className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Arquivo</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".geojson,.json,.kml,.gpx,.csv,.zip"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={triggerFileInput}
                    className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center gap-2 transition-colors ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100 hover:bg-slate-500' : 'bg-white border border-gray-300 hover:bg-gray-50'}`}
                  >
                    <FaFileImport /> Selecionar Arquivo
                  </button>
                  {newLayer.geoJsonFile && (
                    <p className={`text-xs mt-1 truncate ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                      {newLayer.geoJsonFile.name}
                    </p>
                  )}
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>URL (GeoJSON/KML/GPX/CSV)</label>
                  <input
                    type="text"
                    value={newLayer.geoJsonUrl}
                    onChange={(e) => setNewLayer({ ...newLayer, geoJsonUrl: e.target.value })}
                    className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100 placeholder-slate-300' : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400'}`}
                    placeholder="https://exemplo.com/dados.geojson"
                  />
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>CORS obrigatório. Para SHP utilize arquivo .zip.</p>
                </div>
              </div>
            )}

            {newLayer.format === 'WFS' && (
              <div className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>URL base do WFS</label>
                  <input
                    type="text"
                    value={newLayer.url}
                    onChange={(e) => setNewLayer({ ...newLayer, url: e.target.value })}
                    className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`}
                    placeholder="https://exemplo.com/geoserver/wfs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>typeName</label>
                    <input type="text" value={newLayer.wfsTypeName} onChange={(e) => setNewLayer({ ...newLayer, wfsTypeName: e.target.value })} className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="workspace:layer" />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>SRS</label>
                    <input type="text" value={newLayer.wfsSrsName} onChange={(e) => setNewLayer({ ...newLayer, wfsSrsName: e.target.value })} className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="EPSG:4326" />
                  </div>
                </div>
              </div>
            )}

            {(newLayer.format === 'PostGIS' || newLayer.format === 'MSSQL' || newLayer.format === 'MySQL') && (
              <div className="space-y-3">
                <div className={`p-2 rounded border ${isDark ? 'border-slate-600' : 'border-gray-300'}`}>
                  <div className="mb-2">
                    <ConnectionProfiles
                      kind={newLayer.format === 'PostGIS' ? 'postgres' : (newLayer.format === 'MSSQL' ? 'mssql' : 'mysql')}
                      value={{
                        host: newLayer.connHost || undefined,
                        port: newLayer.connPort ? parseInt(newLayer.connPort) : undefined,
                        database: newLayer.connDatabase || undefined,
                        user: newLayer.connUser || undefined,
                        password: newLayer.connPassword || undefined,
                        ssl: newLayer.format === 'PostGIS' ? !!newLayer.connSSL : undefined,
                        encrypt: newLayer.format === 'MSSQL' ? !!newLayer.connEncrypt : undefined,
                        trustServerCertificate: newLayer.format === 'MSSQL' ? !!newLayer.connTrustServerCertificate : undefined,
                      }}
                      onChange={(c) => setNewLayer({
                        ...newLayer,
                        connHost: (c.host ?? newLayer.connHost) as any,
                        connPort: (c.port != null ? String(c.port) : newLayer.connPort) as any,
                        connDatabase: (c.database ?? newLayer.connDatabase) as any,
                        connUser: (c.user ?? newLayer.connUser) as any,
                        connPassword: (c.password ?? newLayer.connPassword) as any,
                        connSSL: (c.ssl ?? newLayer.connSSL) as any,
                        connEncrypt: (c.encrypt ?? newLayer.connEncrypt) as any,
                        connTrustServerCertificate: (c.trustServerCertificate ?? newLayer.connTrustServerCertificate) as any,
                      })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={`block text-xs mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Host</label>
                      <input type="text" value={newLayer.connHost || ''} onChange={(e) => setNewLayer({ ...newLayer, connHost: e.target.value })} className={`w-full px-2 py-1 rounded ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="localhost" />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Porta</label>
                      <input type="text" value={newLayer.connPort || ''} onChange={(e) => setNewLayer({ ...newLayer, connPort: e.target.value })} className={`w-full px-2 py-1 rounded ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder={newLayer.format==='PostGIS' ? '5432' : newLayer.format==='MSSQL' ? '1433' : '3306'} />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Banco</label>
                      <input type="text" value={newLayer.connDatabase || ''} onChange={(e) => setNewLayer({ ...newLayer, connDatabase: e.target.value })} className={`w-full px-2 py-1 rounded ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="meu_banco" />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Usuário</label>
                      <input type="text" value={newLayer.connUser || ''} onChange={(e) => setNewLayer({ ...newLayer, connUser: e.target.value })} className={`w-full px-2 py-1 rounded ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="user" />
                    </div>
                    <div className="col-span-2">
                      <label className={`block text-xs mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Senha</label>
                      <input type="password" value={newLayer.connPassword || ''} onChange={(e) => setNewLayer({ ...newLayer, connPassword: e.target.value })} className={`w-full px-2 py-1 rounded ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="••••••" />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 items-center">
                    {newLayer.format === 'PostGIS' && (
                      <label className={`text-xs flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                        <input type="checkbox" checked={!!newLayer.connSSL} onChange={(e) => setNewLayer({ ...newLayer, connSSL: e.target.checked })} /> SSL
                      </label>
                    )}
                    {newLayer.format === 'MSSQL' && (
                      <>
                        <label className={`text-xs flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                          <input type="checkbox" checked={!!newLayer.connEncrypt} onChange={(e) => setNewLayer({ ...newLayer, connEncrypt: e.target.checked })} /> Encrypt
                        </label>
                        <label className={`text-xs flex items-center gap-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                          <input type="checkbox" checked={!!newLayer.connTrustServerCertificate} onChange={(e) => setNewLayer({ ...newLayer, connTrustServerCertificate: e.target.checked })} /> Trust Server Cert
                        </label>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Schema</label>
                    <input type="text" value={newLayer.pgSchema || ''} onChange={(e) => setNewLayer({ ...newLayer, pgSchema: e.target.value })} className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="public" />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Tabela</label>
                    <div className="flex gap-2">
                      <input type="text" value={newLayer.pgTable || ''} onChange={(e) => setNewLayer({ ...newLayer, pgTable: e.target.value })} className={`flex-1 px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="minha_tabela" />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setPgLoading(true);
                            const kind = newLayer.format === 'PostGIS' ? 'postgres' : (newLayer.format === 'MSSQL' ? 'mssql' : 'mysql');
                            const connection = {
                              host: newLayer.connHost || undefined,
                              port: newLayer.connPort ? parseInt(newLayer.connPort) : undefined,
                              database: newLayer.connDatabase || undefined,
                              user: newLayer.connUser || undefined,
                              password: newLayer.connPassword || undefined,
                              ssl: newLayer.format === 'PostGIS' ? !!newLayer.connSSL : undefined,
                              encrypt: newLayer.format === 'MSSQL' ? !!newLayer.connEncrypt : undefined,
                              trustServerCertificate: newLayer.format === 'MSSQL' ? !!newLayer.connTrustServerCertificate : undefined,
                            };
                            const r = await fetch('/api/db', { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ action:'catalog', kind, connection }) });
                            if (!r.ok) throw new Error('cat');
                            const j = await r.json();
                            setPgCatalog(Array.isArray(j.tables) ? j.tables : []);
                          } catch {
                            alert('Falha ao carregar catálogo do banco.');
                          } finally {
                            setPgLoading(false);
                          }
                        }}
                        className={`px-3 py-2 rounded ${isDark ? 'bg-slate-600 hover:bg-slate-500 text-slate-100' : 'bg-gray-200 hover:bg-gray-300'}`}
                        title="Carregar catálogo"
                      >{pgLoading ? '...' : 'Catálogo'}</button>
                    </div>
                    {pgCatalog.length > 0 && (
                      <select
                        className={`mt-2 w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`}
                        onChange={(e) => {
                          const sel = pgCatalog.find(t => `${t.schema}.${t.table}` === e.target.value);
                          if (sel) {
                            setNewLayer({
                              ...newLayer,
                              pgSchema: sel.schema,
                              pgTable: sel.table,
                              pgGeomColumn: sel.geom || newLayer.pgGeomColumn,
                              name: (newLayer.name && newLayer.name.trim()) ? newLayer.name : `${sel.schema}.${sel.table}`,
                            });
                          }
                        }}
                        value={newLayer.pgSchema && newLayer.pgTable ? `${newLayer.pgSchema}.${newLayer.pgTable}` : ''}
                      >
                        <option value="">— selecione da lista —</option>
                        {pgCatalog.map(t => (
                          <option key={`${t.schema}.${t.table}.${t.geom}`} value={`${t.schema}.${t.table}`}>{t.schema}.{t.table} ({t.geom})</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Coluna geom</label>
                    <input type="text" value={newLayer.pgGeomColumn || ''} onChange={(e) => setNewLayer({ ...newLayer, pgGeomColumn: e.target.value })} className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="geom" />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Propriedades</label>
                    <input type="text" value={newLayer.pgProperties || ''} onChange={(e) => setNewLayer({ ...newLayer, pgProperties: e.target.value })} className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="col1,col2" />
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Filtro (WHERE opcional)</label>
                  <input type="text" value={(newLayer as any).pgWhere || ''} onChange={(e) => setNewLayer({ ...newLayer, ...( { pgWhere: e.target.value } as any ) })} className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="ex: uf='MS' AND tipo='escola'" />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>BBOX (opcional)</label>
                  <input type="text" value={newLayer.pgBbox || ''} onChange={(e) => setNewLayer({ ...newLayer, pgBbox: e.target.value })} className={`w-full px-3 py-2 rounded-md ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300'}`} placeholder="minLon,minLat,maxLon,maxLat" />
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>A conexão é configurada via variáveis de ambiente no servidor.</p>
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddLayer}
                disabled={
                  isSubmitting ||
                  !newLayer.name.trim() ||
                  (newLayer.format === 'WMS' && (!newLayer.url.trim() || !newLayer.layerName.trim())) ||
                  ((newLayer.format === 'GeoJSON' || newLayer.format === 'KML' || newLayer.format === 'GPX' || newLayer.format === 'CSV' || newLayer.format === 'SHP') && !newLayer.geoJsonFile && !newLayer.geoJsonUrl.trim()) ||
                  (newLayer.format === 'WFS' && (!newLayer.url.trim() || !newLayer.wfsTypeName?.trim())) ||
                  ((newLayer.format === 'PostGIS' || newLayer.format === 'MSSQL' || newLayer.format === 'MySQL') && (!newLayer.pgTable?.trim()))
                }
                className={`px-4 py-2 text-white rounded-md transition-colors ${
                  (isSubmitting || !newLayer.name.trim() ||
                  (newLayer.format === 'WMS' && (!newLayer.url.trim() || !newLayer.layerName.trim())) ||
                  ((newLayer.format === 'GeoJSON' || newLayer.format === 'KML' || newLayer.format === 'GPX' || newLayer.format === 'CSV' || newLayer.format === 'SHP') && !newLayer.geoJsonFile && !newLayer.geoJsonUrl.trim()) ||
                  (newLayer.format === 'WFS' && (!newLayer.url.trim() || !newLayer.wfsTypeName?.trim())) ||
                  (newLayer.format === 'PostGIS' && (!newLayer.pgTable?.trim())))
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? 'Carregando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de camadas com agrupamento e colapso */}
      <div className="space-y-4">
        {layers.length === 0 ? (
          <p className={`${isDark ? 'text-slate-300' : 'text-gray-500'} text-center py-4`}>Nenhuma camada adicionada</p>
        ) : (
          (() => {
            const wms = filteredAndSorted.filter(l => l.type === 'WMS');
            const geo = filteredAndSorted.filter(l => l.type === 'GeoJSON');

            const Section = ({ title, count, collapsed, onToggle, children }: any) => (
              <div>
                <div className={`flex items-center justify-between px-2 py-1 rounded ${isDark ? 'bg-slate-800' : 'bg-gray-100'} border ${isDark ? 'border-slate-700' : 'border-gray-300'}`}>
                  <button onClick={onToggle} className={`flex items-center gap-2 ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>
                    {collapsed ? <FaChevronRight /> : <FaChevronDown />}
                    <span className="font-medium">{title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-white text-gray-700 border border-gray-300'}`}>{count}</span>
                  </button>
                </div>
                {!collapsed && (
                  <div className="mt-2 space-y-3">
                    {children}
                  </div>
                )}
              </div>
            );

            const Card = (layer: Layer) => (
              <div key={layer.id} className={`p-3 rounded-lg border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} shadow-sm w-full`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FaGlobe className={`${isDark ? 'text-slate-200' : 'text-gray-600'}`} />
                      <span className={`font-medium break-words ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>{layer.name}</span>
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-600 text-slate-200' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}>{layer.type}</span>
                    </div>
                    <div className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>
                      {layer.type === 'WMS' && layer.layerName && (
                        <span>Tema: <span className="font-medium">{layer.layerName}</span></span>
                      )}
                      {layer.type === 'GeoJSON' && (
                        <span>Features: {(layer as any).featureCount ?? (Array.isArray((layer.geoJsonData as any)?.features) ? (layer.geoJsonData as any).features.length : 0)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-start">
                    {layer.type === 'GeoJSON' && (
                      <button
                        onClick={() => onZoomToLayer(layer.id)}
                        className={`p-2 rounded-full transition-colors ${isDark ? 'text-blue-300 hover:bg-slate-600' : 'text-blue-600 hover:bg-blue-100'}`}
                        title="Zoom para camada"
                      >
                        <FaSearch />
                      </button>
                    )}
                    <button
                      onClick={() => onMoveLayerUp(layer.id)}
                      className={`p-2 rounded-full transition-colors ${isDark ? 'text-slate-200 hover:bg-slate-600' : 'text-gray-700 hover:bg-gray-200'}`}
                      title="Mover para cima"
                    >
                      <FaArrowUp />
                    </button>
                    <button
                      onClick={() => onMoveLayerDown(layer.id)}
                      className={`p-2 rounded-full transition-colors ${isDark ? 'text-slate-200 hover:bg-slate-600' : 'text-gray-700 hover:bg-gray-200'}`}
                      title="Mover para baixo"
                    >
                      <FaArrowDown />
                    </button>
                    <button
                      onClick={() => onRemoveLayer(layer.id)}
                      className={`p-2 rounded-full transition-colors ${isDark ? 'text-red-400 hover:bg-slate-600' : 'text-red-600 hover:bg-red-100'}`}
                      title="Remover camada"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>
                    <input
                      type="checkbox"
                      checked={layer.visible}
                      onChange={() => onToggleVisibility(layer.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Visível
                  </label>
                  <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                    <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Opacidade:</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={layer.opacity}
                      onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value))}
                      className="flex-1 align-middle"
                    />
                    <span className={`text-xs w-10 text-right ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>{Math.round(layer.opacity * 100)}%</span>
                  </div>
                  {layer.type === 'GeoJSON' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Cluster:</span>
                      <input
                        type="range"
                        min="0"
                        max="120"
                        step="5"
                        defaultValue={40}
                        onChange={(e) => onClusterDistanceChange?.(layer.id, parseInt(e.target.value))}
                      />
                      <button
                        onClick={() => onToggleHeatmap?.(layer.id)}
                        className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-slate-600 text-slate-100 hover:bg-slate-500' : 'bg-gray-200 hover:bg-gray-300'}`}
                        title="Alternar Heatmap"
                      >
                        Heatmap
                      </button>
                      {/* Estilo rápido */}
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Cor:</span>
                        <input type="color" defaultValue={layer.style?.strokeColor || '#ff0000'} onChange={(e) => onUpdateStyle?.(layer.id, { strokeColor: e.target.value, fillColor: e.target.value })} />
                        <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Esp.:</span>
                        <input type="number" min={1} max={10} defaultValue={layer.style?.strokeWidth || 2} className={`w-14 px-1 py-0.5 border rounded ${isDark ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`} onChange={(e) => onUpdateStyle?.(layer.id, { strokeWidth: parseInt(e.target.value || '2') })} />
                      </div>
                      {/* Filtro por atributos para GeoJSON */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={geoFilterById[layer.id] || ''}
                          onChange={(e) => setGeoFilterById(prev => ({ ...prev, [layer.id]: e.target.value }))}
                          placeholder="Predicado: campo == 10 AND status == 'OK'"
                          className={`px-2 py-1 text-xs rounded border ${isDark ? 'bg-slate-600 border-slate-500 text-slate-100' : 'bg-white border-gray-300'}`}
                        />
                        <button
                          onClick={() => onApplyGeoAttributeFilter?.(layer.id, geoFilterById[layer.id] || '')}
                          className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-slate-600 text-slate-100 hover:bg-slate-500' : 'bg-gray-200 hover:bg-gray-300'}`}
                        >
                          Aplicar filtro
                        </button>
                        <button
                          onClick={() => { setGeoFilterById(prev => ({ ...prev, [layer.id]: '' })); onApplyGeoAttributeFilter?.(layer.id, ''); }}
                          className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-slate-600 text-slate-100 hover:bg-slate-500' : 'bg-gray-200 hover:bg-gray-300'}`}
                        >
                          Limpar
                        </button>
                      </div>
                      {/* Heatmap/Viewport removidos conforme solicitação */}
                    </div>
                  )}
                  {/* CQL WMS removido conforme solicitação */}
                </div>
              </div>
            );

            return (
              <>
                <Section title="GeoJSON" count={geo.length} collapsed={collapseGeo} onToggle={() => setCollapseGeo(v => !v)}>
                  {geo.length === 0 ? (
                    <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-sm`}>Sem camadas GeoJSON</p>
                  ) : (
                    geo.map((l) => Card(l))
                  )}
                </Section>
                <Section title="WMS" count={wms.length} collapsed={collapseWms} onToggle={() => setCollapseWms(v => !v)}>
                  {wms.length === 0 ? (
                    <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} text-sm`}>Sem camadas WMS</p>
                  ) : (
                    wms.map((l) => Card(l))
                  )}
                </Section>
              </>
            );
          })()
        )}
      </div>
      {filterBuilderFor && (
        <FilterBuilder
          layerId={filterBuilderFor}
          isDark={isDark}
          fetchFeatures={() => {
            try {
              const ev = new CustomEvent('requestLayerFeatures', { detail: { id: filterBuilderFor } });
              (window as any).__lastRequestedLayerFeatures = [];
              window.dispatchEvent(ev);
              return (window as any).__lastRequestedLayerFeatures || [];
            } catch { return []; }
          }}
          onApply={(predicate) => {
            setGeoFilterById(prev => ({ ...prev, [filterBuilderFor!]: predicate }));
            onApplyGeoAttributeFilter?.(filterBuilderFor!, predicate);
            setFilterBuilderFor(null);
          }}
          onClose={() => setFilterBuilderFor(null)}
        />
      )}
    </FloatingPanel>
  );
}