"use client"

import { useState, useRef } from "react";
import { FaPlus, FaTrash, FaGlobe, FaLayerGroup, FaFileImport } from "react-icons/fa";

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
}

export default function LayerManager({
  layers,
  onAddLayer,
  onRemoveLayer,
  onToggleVisibility,
  onOpacityChange,
}: LayerManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newLayer, setNewLayer] = useState({
    name: "",
    type: "WMS" as const,
    url: "",
    layerName: "",
    geoJsonFile: null as File | null,
    visible: true,
    opacity: 1,
  });

  const handleAddLayer = () => {
    if (newLayer.name.trim() && 
        ((newLayer.type === "WMS" && newLayer.url.trim()) || 
         (newLayer.type === "GeoJSON" && newLayer.geoJsonFile))) {
      
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
      else if (newLayer.type === "GeoJSON" && newLayer.geoJsonFile) {
        // Ler e parsear o arquivo GeoJSON
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const geoJsonText = e.target?.result as string;
            const geoJsonData = JSON.parse(geoJsonText);
            
            const layerData: Omit<Layer, "id"> = {
              name: newLayer.name,
              type: newLayer.type,
              geoJsonData: geoJsonData, // Passar o objeto parseado
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
      visible: true,
      opacity: 1,
    });
    setShowAddForm(false);
  };

  return (
    <div className="absolute top-4 right-20 w-80 bg-white rounded-lg shadow-lg p-4 z-10 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <FaLayerGroup /> Gerenciador de Camadas
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          title="Adicionar camada"
        >
          <FaPlus />
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-300">
          <h4 className="text-md font-medium text-gray-700 mb-2">Adicionar Nova Camada</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Nome</label>
              <input
                type="text"
                value={newLayer.name}
                onChange={(e) => setNewLayer({ ...newLayer, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nome da camada"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Tipo</label>
              <select
                value={newLayer.type}
                onChange={(e) => setNewLayer({ ...newLayer, type: e.target.value as Layer["type"] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <label className="block text-sm font-medium text-gray-600 mb-1">URL do Serviço WMS</label>
                  <input
                    type="text"
                    value={newLayer.url}
                    onChange={(e) => setNewLayer({ ...newLayer, url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://exemplo.com/geoserver/wms"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Nome da Camada WMS</label>
                  <input
                    type="text"
                    value={newLayer.layerName}
                    onChange={(e) => setNewLayer({ ...newLayer, layerName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="nome_da_camada"
                  />
                </div>
              </>
            )}
            
            {newLayer.type === "GeoJSON" && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Arquivo GeoJSON</label>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 transition-colors"
                >
                  <FaFileImport /> Selecionar Arquivo
                </button>
                {newLayer.geoJsonFile && (
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {newLayer.geoJsonFile.name}
                  </p>
                )}
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
                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {layers.length === 0 ? (
          <p className="text-gray-500 text-center py-4">Nenhuma camada adicionada</p>
        ) : (
          layers.map((layer) => (
            <div key={layer.id} className="p-3 bg-gray-50 rounded-lg border border-gray-300">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FaGlobe className="text-gray-600" />
                    <span className="font-medium text-gray-800">{layer.name}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Tipo: {layer.type}
                    {layer.type === "WMS" && layer.layerName && ` (${layer.layerName})`}
                    {layer.type === "GeoJSON" && ` (${layer.geoJsonData ? 
                      (Array.isArray((layer.geoJsonData as any).features) ? 
                        (layer.geoJsonData as any).features.length + " features" : 
                        "Objeto GeoJSON"
                      ) : "Sem dados"})`}
                  </div>
                </div>
                <button
                  onClick={() => onRemoveLayer(layer.id)}
                  className="p-2 text-red-600 hover:bg-red-100 rounded-full transition-colors"
                  title="Remover camada"
                >
                  <FaTrash />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={() => onToggleVisibility(layer.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Visível
                </label>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-xs text-gray-600">Opacidade:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={layer.opacity}
                    onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-600 w-10">{Math.round(layer.opacity * 100)}%</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}