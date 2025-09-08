"use client"

import { useState, useRef, useEffect } from "react";
import { FaPlus, FaTrash, FaGlobe, FaLayerGroup, FaFileImport, FaArrowUp, FaArrowDown, FaSearch, FaChevronDown, FaChevronRight } from "react-icons/fa";
import FloatingPanel from "./FloatingPanel";

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
  onClusterDistanceChange?: (id: string, distance: number) => void;
  onToggleHeatmap?: (id: string) => void;
  onSimplifyLayer?: (id: string) => void;
  isDark?: boolean;
  highlight?: boolean;
}

export default function LayerManager({
  layers,
  onAddLayer,
  onRemoveLayer,
  onToggleVisibility,
  onOpacityChange,
  onMoveLayerUp,
  onMoveLayerDown,
  onZoomToLayer,
  onClusterDistanceChange,
  onToggleHeatmap,
  onSimplifyLayer,
  isDark = false,
  highlight = false,
}: LayerManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterText, setFilterText] = useState("");
  const [collapseWms, setCollapseWms] = useState(false);
  const [collapseGeo, setCollapseGeo] = useState(false);
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
    type: Layer["type"];
    url: string;
    layerName: string;
    geoJsonFile: File | null;
    geoJsonUrl: string;
    visible: boolean;
    opacity: number;
  };

  const [newLayer, setNewLayer] = useState<NewLayerForm>({
    name: "",
    type: "WMS",
    url: "",
    layerName: "",
    geoJsonFile: null,
    geoJsonUrl: "",
    visible: true,
    opacity: 1,
  });

  const handleAddLayer = async () => {
    if (newLayer.name.trim() && 
        ((newLayer.type === "WMS" && newLayer.url.trim()) || 
         (newLayer.type === "GeoJSON" && (newLayer.geoJsonFile || newLayer.geoJsonUrl.trim())))) {
      
      if (newLayer.type === "WMS") {
        const layerData: Omit<Layer, "id"> = {
          name: newLayer.name,
          type: newLayer.type,
          url: newLayer.url,
          layerName: newLayer.layerName,
          visible: newLayer.visible,
          opacity: newLayer.opacity,
        };
        onAddLayer(layerData);
        resetForm();
      } 
      else if (newLayer.type === "GeoJSON") {
        if (newLayer.geoJsonFile) {
          // Ler e parsear o arquivo GeoJSON
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const geoJsonText = e.target?.result as string;
              const geoJsonData = JSON.parse(geoJsonText);
              const layerData: Omit<Layer, "id"> = {
                name: newLayer.name,
                type: newLayer.type,
                geoJsonData: geoJsonData,
                visible: newLayer.visible,
                opacity: newLayer.opacity,
              };
              onAddLayer(layerData);
              resetForm();
            } catch (error) {
              console.error("Erro ao parsear GeoJSON:", error);
              alert("Erro ao ler o arquivo GeoJSON. Verifique se o arquivo é válido.");
            }
          };
          reader.readAsText(newLayer.geoJsonFile);
          return; // Retornar aqui para não resetar o formulário duas vezes
        }
        if (newLayer.geoJsonUrl.trim()) {
          try {
            const response = await fetch(newLayer.geoJsonUrl.trim(), {
              headers: { 'Accept': 'application/geo+json, application/json;q=0.9, */*;q=0.8' },
              method: 'GET',
            });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const contentType = response.headers.get('Content-Type') || '';
            let geoJsonData: any;
            if (/json/i.test(contentType)) {
              geoJsonData = await response.json();
            } else {
              const text = await response.text();
              geoJsonData = JSON.parse(text);
            }
            const layerData: Omit<Layer, "id"> = {
              name: newLayer.name,
              type: "GeoJSON",
              geoJsonData,
              visible: newLayer.visible,
              opacity: newLayer.opacity,
            };
            onAddLayer(layerData);
            resetForm();
          } catch (error) {
            console.error("Erro ao buscar GeoJSON da URL:", error);
            alert("Erro ao buscar ou interpretar o GeoJSON da URL. Verifique a URL e CORS.");
          }
          return;
        }
      }
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
      type: "WMS",
      url: "",
      layerName: "",
      geoJsonFile: null,
      geoJsonUrl: "",
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
      height={520}
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
              <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Tipo</label>
              <select
                value={newLayer.type}
                onChange={(e) => setNewLayer({ ...newLayer, type: e.target.value as Layer["type"] })}
                className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100' : 'bg-white border border-gray-300 text-gray-900'}`}
              >
                <option value="WMS">WMS</option>
                <option value="GeoJSON">GeoJSON</option>
                {/* Removendo OSM do formulário, pois é a camada base padrão */}
                {/* <option value="OSM">OpenStreetMap</option> */}
              </select>
            </div>
            
            {newLayer.type === "WMS" && (
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
            
            {newLayer.type === "GeoJSON" && (
              <div className="space-y-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>Arquivo GeoJSON</label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".geojson,.json"
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
                  <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>URL da API (GeoJSON)</label>
                  <input
                    type="text"
                    value={newLayer.geoJsonUrl}
                    onChange={(e) => setNewLayer({ ...newLayer, geoJsonUrl: e.target.value })}
                    className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? 'bg-slate-600 border border-slate-500 text-slate-100 placeholder-slate-300' : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-400'}`}
                    placeholder="https://exemplo.com/api/geo"
                  />
                  <p className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-gray-500'}`}>Aceita application/geo+json ou application/json. Requer CORS habilitado.</p>
                </div>
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
                  !newLayer.name.trim() ||
                  (newLayer.type === 'WMS' && (!newLayer.url.trim() || !newLayer.layerName.trim())) ||
                  (newLayer.type === 'GeoJSON' && !newLayer.geoJsonFile && !newLayer.geoJsonUrl.trim())
                }
                className={`px-4 py-2 text-white rounded-md transition-colors ${
                  (!newLayer.name.trim() ||
                  (newLayer.type === 'WMS' && (!newLayer.url.trim() || !newLayer.layerName.trim())) ||
                  (newLayer.type === 'GeoJSON' && !newLayer.geoJsonFile && !newLayer.geoJsonUrl.trim()))
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Adicionar
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
            const q = filterText.trim().toLowerCase();
            const match = (l: Layer) => {
              if (!q) return true;
              const name = l.name.toLowerCase();
              const type = l.type.toLowerCase();
              const ln = (l.layerName || '').toLowerCase();
              const url = (l.url || '').toLowerCase();
              return name.includes(q) || type.includes(q) || ln.includes(q) || url.includes(q);
            };
            const wms = layers.filter(l => l.type === 'WMS').filter(match);
            const geo = layers.filter(l => l.type === 'GeoJSON').filter(match);

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
                      <button
                        onClick={() => onSimplifyLayer?.(layer.id)}
                        className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-slate-600 text-slate-100 hover:bg-slate-500' : 'bg-gray-200 hover:bg-gray-300'}`}
                        title="Simplificar geometria (worker)"
                      >
                        Simplificar
                      </button>
                    </div>
                  )}
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
    </FloatingPanel>
  );
}