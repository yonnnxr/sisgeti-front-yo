"use client"

import { useEffect, useMemo, useState } from "react";
import { FaPlay } from "react-icons/fa";
import FloatingPanel from "./FloatingPanel";
import { runBinaryOperation, runUnaryOperation, GeoOpType, runUnaryOperationInWorker, runBinaryOperationInWorker } from "../utils/geoprocessing";

export interface LayerDescriptor {
  id: string;
  name: string;
  type: "WMS" | "GeoJSON" | "OSM";
}

interface GeoProcessingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Camadas do aplicativo para seleção de inputs (apenas GeoJSON são válidas, além da Edit Layer implícita)
  layers: LayerDescriptor[];
  // Fornece as features OL atuais das fontes: edição, layer A, layer B
  getEditFeatures: () => any[]; // OL features
  getLayerFeaturesById: (id: string) => any[]; // OL features
  // Aplicar resultado ao mapa (como nova camada GeoJSON gerenciada)
  onApplyResult: (name: string, features: any[]) => void;
}

type ParamState = {
  distance?: number;
  tolerance?: number;
  highQuality?: boolean;
  dissolveProp?: string;
}

const STORAGE_KEY = "sisgeti_geoprocess_params";

export default function GeoProcessingPanel({ isOpen, onClose, layers, getEditFeatures, getLayerFeaturesById, onApplyResult }: GeoProcessingPanelProps) {
  const [operation, setOperation] = useState<GeoOpType | 'bi'>('buffer');
  const [inputA, setInputA] = useState<string>('edit');
  const [inputB, setInputB] = useState<string>('');
  const [params, setParams] = useState<ParamState>({ distance: 100, tolerance: 5, highQuality: false, dissolveProp: '' });
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          setOperation(parsed.operation ?? 'buffer');
          setInputA(parsed.inputA ?? 'edit');
          setInputB(parsed.inputB ?? '');
          setParams(parsed.params ?? {});
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ operation, inputA, inputB, params }));
    } catch (_) {}
  }, [operation, inputA, inputB, params]);

  const isBinary = useMemo(() => ['intersection', 'difference', 'union', 'bi'].includes(operation), [operation]);

  if (!isOpen) return null;

  const run = async () => {
    setIsRunning(true);
    try {
      const featsA = inputA === 'edit' ? getEditFeatures() : getLayerFeaturesById(inputA);
      if (!featsA || featsA.length === 0) {
        alert('Entrada A não possui features.');
        return;
      }

      let out: any[] = [];
      // Operação composta: BI (Buffer + Interseção)
      if (operation === 'bi') {
        if (!inputB) {
          alert('Selecione a Entrada B.');
          return;
        }
        const featsB = getLayerFeaturesById(inputB);
        if (!featsB || featsB.length === 0) {
          alert('Entrada B não possui features.');
          return;
        }
        const distance = Math.max(0, params.distance || 0);
        let bufferedA: any[] = [];
        try {
          bufferedA = await runUnaryOperationInWorker(featsA, 'buffer', { distance });
        } catch (_) {
          bufferedA = runUnaryOperation(featsA, 'buffer', { distance });
        }
        try {
          out = await runBinaryOperationInWorker(bufferedA, featsB, 'intersection');
        } catch (_) {
          out = runBinaryOperation(bufferedA, featsB, 'intersection');
        }
      } else if (isBinary) {
        if (!inputB) {
          alert('Selecione a Entrada B.');
          return;
        }
        const featsB = getLayerFeaturesById(inputB);
        if (!featsB || featsB.length === 0) {
          alert('Entrada B não possui features.');
          return;
        }
        const op = operation as 'intersection' | 'difference' | 'union';
        try {
          out = await runBinaryOperationInWorker(featsA, featsB, op);
        } catch (_) {
          out = runBinaryOperation(featsA, featsB, op);
        }
      } else {
        switch (operation) {
          case 'buffer':
            try {
              out = await runUnaryOperationInWorker(featsA, 'buffer', { distance: Math.max(0, params.distance || 0) });
            } catch (_) {
              out = runUnaryOperation(featsA, 'buffer', { distance: Math.max(0, params.distance || 0) });
            }
            break;
          case 'dissolve':
            try {
              out = await runUnaryOperationInWorker(featsA, 'dissolve', { property: params.dissolveProp || undefined });
            } catch (_) {
              out = runUnaryOperation(featsA, 'dissolve', { property: params.dissolveProp || undefined });
            }
            break;
          case 'simplify':
            try {
              out = await runUnaryOperationInWorker(featsA, 'simplify', { tolerance: Math.max(0, params.tolerance || 0), highQuality: !!params.highQuality });
            } catch (_) {
              out = runUnaryOperation(featsA, 'simplify', { tolerance: Math.max(0, params.tolerance || 0), highQuality: !!params.highQuality });
            }
            break;
          case 'centroid':
            try {
              out = await runUnaryOperationInWorker(featsA, 'centroid');
            } catch (_) {
              out = runUnaryOperation(featsA, 'centroid');
            }
            break;
          case 'convexHull':
            try {
              out = await runUnaryOperationInWorker(featsA, 'convexHull');
            } catch (_) {
              out = runUnaryOperation(featsA, 'convexHull');
            }
            break;
          default:
            out = [];
        }
      }

      if (!out || out.length === 0) {
        alert('Operação não produziu resultados.');
        return;
      }

      const name = operation === 'bi' ? `GP BI (Buffer+Interseção) - ${new Date().toLocaleTimeString()}` : `GP ${operation} - ${new Date().toLocaleTimeString()}`;
      onApplyResult(name, out);
      alert(`Geoprocessamento concluído com ${out.length} feature(s).`);
    } catch (e) {
      console.error('Erro no geoprocessamento:', e);
      alert('Erro ao executar o geoprocessamento. Verifique as geometrias.');
    } finally {
      setIsRunning(false);
    }
  };

  const geojsonLayers = layers.filter(l => l.type === 'GeoJSON');

  return (
    <FloatingPanel
      title="Geoprocessamento"
      panelId="geoprocessing-panel"
      width={440}
      defaultPosition="top-right"
      highlight={false}
      headerActions={null}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Operação</label>
          <select value={operation} onChange={e => setOperation(e.target.value as (GeoOpType | 'bi'))} className="w-full border rounded px-3 py-2">
            <option value="buffer">Buffer</option>
            <option value="intersection">Interseção</option>
            <option value="difference">Diferença</option>
            <option value="union">União</option>
            <option value="dissolve">Dissolver</option>
            <option value="simplify">Simplificar</option>
            <option value="centroid">Centróide</option>
            <option value="convexHull">Casco convexo</option>
            <option value="bi">BI (Buffer + Interseção)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entrada A</label>
            <select value={inputA} onChange={e => setInputA(e.target.value)} className="w-full border rounded px-3 py-2">
              <option value="edit">Camada de Edição</option>
              {geojsonLayers.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          {isBinary && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entrada B</label>
              <select value={inputB} onChange={e => setInputB(e.target.value)} className="w-full border rounded px-3 py-2">
                <option value="">Selecione...</option>
                {geojsonLayers.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Parâmetros dinâmicos */}
        {(operation === 'buffer' || operation === 'bi') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Distância (m)</label>
            <input type="number" value={params.distance ?? 0} min={0} onChange={e => setParams({ ...params, distance: Number(e.target.value) })} className="w-full border rounded px-3 py-2" />
          </div>
        )}
        {operation === 'simplify' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tolerância (m)</label>
              <input type="number" value={params.tolerance ?? 0} min={0} onChange={e => setParams({ ...params, tolerance: Number(e.target.value) })} className="w-full border rounded px-3 py-2" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!params.highQuality} onChange={e => setParams({ ...params, highQuality: e.target.checked })} />
              Alta qualidade
            </label>
          </div>
        )}
        {operation === 'dissolve' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Propriedade (opcional)</label>
            <input type="text" value={params.dissolveProp ?? ''} onChange={e => setParams({ ...params, dissolveProp: e.target.value })} className="w-full border rounded px-3 py-2" placeholder="Ex: categoria" />
          </div>
        )}

        <button onClick={run} disabled={isRunning} className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded text-white ${isRunning ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <FaPlay /> {isRunning ? 'Executando...' : 'Executar'}
        </button>
      </div>
    </FloatingPanel>
  );
}


