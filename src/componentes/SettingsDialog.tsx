"use client"

import { useEffect, useState } from "react";
import { FaTimes, FaGlobe, FaInfoCircle, FaSync } from "react-icons/fa";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  type?: 'map' | 'general';
}

export default function SettingsDialog({ isOpen, onClose, type = 'general' }: SettingsDialogProps) {
  const [isDark, setIsDark] = useState(false);
  const [identifyEnabled, setIdentifyEnabled] = useState(false);
  const [basemap, setBasemap] = useState<'OSM' | 'Topo'>('OSM');
  useEffect(() => {
    const onTheme = (e: Event) => {
      const bg = (e as CustomEvent).detail as string;
      setIsDark(bg === '#0f172a');
    };
    window.addEventListener('themeChange', onTheme as EventListener);
    return () => window.removeEventListener('themeChange', onTheme as EventListener);
  }, []);

  if (!isOpen) return null;

  const cardCls = isDark ? 'bg-slate-800 text-slate-100' : 'bg-white text-gray-800';
  const labelCls = isDark ? 'text-slate-200' : 'text-gray-700';

  const applyBasemap = () => {
    window.dispatchEvent(new CustomEvent('toggleBaseMap'));
  };

  const applyIdentify = () => {
    // toggla identify via evento simples: MapViewer possui botão; aqui emitimos um semântica leve
    window.dispatchEvent(new CustomEvent('toggleIdentify', { detail: !identifyEnabled }));
    setIdentifyEnabled(v => !v);
  };

  const resetView = () => {
    window.dispatchEvent(new CustomEvent('resetView'));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className={`${cardCls} rounded-lg shadow-2xl p-6 max-w-lg w-full mx-4`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            {type === 'map' ? <FaGlobe /> : <FaInfoCircle />} {type === 'map' ? 'Configurações do Mapa' : 'Configurações' }
          </h3>
          <button onClick={onClose} className={`${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`} aria-label="Fechar">
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className={`block text-sm font-medium mb-2 ${labelCls}`}>Mapa base</label>
            <div className="flex items-center gap-3">
              <select value={basemap} onChange={(e) => setBasemap(e.target.value as 'OSM'|'Topo')} className={`px-3 py-2 border rounded ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'}`}>
                <option value="OSM">OpenStreetMap</option>
                <option value="Topo">Topográfico</option>
              </select>
              <button onClick={applyBasemap} className={`px-3 py-2 rounded ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
                Aplicar
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${labelCls}`}>Identify (WMS GetFeatureInfo)</label>
            <div className="flex items-center gap-3">
              <button onClick={applyIdentify} className={`px-3 py-2 rounded ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
                {identifyEnabled ? 'Desativar' : 'Ativar'} Identify
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${labelCls}`}>Visualização</label>
            <button onClick={resetView} className={`inline-flex items-center gap-2 px-3 py-2 rounded ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
              <FaSync className="w-4 h-4" /> Resetar visão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



