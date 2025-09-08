"use client"

import { useEffect, useState } from "react";
import { FaPrint, FaTimes, FaDownload, FaEye, FaCog } from "react-icons/fa";

interface PrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrintDialog({ isOpen, onClose }: PrintDialogProps) {
  const [printSettings, setPrintSettings] = useState({
    orientation: 'landscape',
    paperSize: 'A4',
    scale: 'fit',
    includeLegend: true,
    includeScale: true,
    includeNorthArrow: true,
    quality: 'high',
    title: 'Mapa - SISGETI',
    subtitle: '',
    notes: ''
  });

  const [previewMode, setPreviewMode] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const onTheme = (e: Event) => {
      const bg = (e as CustomEvent).detail as string;
      setIsDark(bg === '#0f172a');
    };
    window.addEventListener('themeChange', onTheme as EventListener);
    return () => window.removeEventListener('themeChange', onTheme as EventListener);
  }, []);

  const inputCls = isDark
    ? 'w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-700 border border-slate-600 text-slate-100 placeholder-slate-400'
    : 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = isDark ? 'block text-sm font-medium text-slate-300 mb-2' : 'block text-sm font-medium text-gray-700 mb-2';
  const cardCls = isDark ? 'bg-slate-800 text-slate-100' : 'bg-white';
  const sectionCls = isDark ? 'bg-slate-700 border border-slate-600' : 'bg-gray-50 border border-gray-300';

  if (!isOpen) return null;

  const handleSettingChange = (setting: string, value: string | boolean) => {
    setPrintSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handlePrint = () => {
    window.dispatchEvent(new CustomEvent('openPrintComposer', { detail: { ...printSettings, action: 'print' } }));
    onClose();
  };

  const handleExport = () => {
    window.dispatchEvent(new CustomEvent('openPrintComposer', { detail: { ...printSettings, action: 'export' } }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className={`${cardCls} rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FaPrint className="text-blue-600 text-xl" />
            <h3 className={`text-xl font-semibold ${isDark ? 'text-slate-100' : 'text-gray-800'}`}>Configurações de Impressão</h3>
          </div>
          <button
            onClick={onClose}
            className={`${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}
          >
            <FaTimes className="w-6 h-6" />
          </button>
        </div>

        {/* Configurações */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Título */}
          <div className="col-span-2">
            <label className={labelCls}>Título</label>
            <input
              type="text"
              value={printSettings.title}
              onChange={(e) => handleSettingChange('title', e.target.value)}
              className={inputCls}
              placeholder="Título do mapa"
            />
          </div>
          {/* Subtítulo */}
          <div className="col-span-2">
            <label className={labelCls}>Subtítulo</label>
            <input
              type="text"
              value={printSettings.subtitle}
              onChange={(e) => handleSettingChange('subtitle', e.target.value)}
              className={inputCls}
              placeholder="Descrição ou contexto"
            />
          </div>
          {/* Orientação */}
          <div>
            <label className={labelCls}>Orientação</label>
            <select
              value={printSettings.orientation}
              onChange={(e) => handleSettingChange('orientation', e.target.value)}
              className={inputCls}
            >
              <option value="landscape">Paisagem</option>
              <option value="portrait">Retrato</option>
            </select>
          </div>

          {/* Tamanho do Papel */}
          <div>
            <label className={labelCls}>Tamanho do Papel</label>
            <select
              value={printSettings.paperSize}
              onChange={(e) => handleSettingChange('paperSize', e.target.value)}
              className={inputCls}
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
              <option value="A2">A2</option>
              <option value="A1">A1</option>
              <option value="A0">A0</option>
            </select>
          </div>

          {/* Escala */}
          <div>
            <label className={labelCls}>Escala</label>
            <select
              value={printSettings.scale}
              onChange={(e) => handleSettingChange('scale', e.target.value)}
              className={inputCls}
            >
              <option value="fit">Ajustar à página</option>
              <option value="1:1000">1:1000</option>
              <option value="1:5000">1:5000</option>
              <option value="1:10000">1:10000</option>
              <option value="1:25000">1:25000</option>
            </select>
          </div>

          {/* Qualidade */}
          <div>
            <label className={labelCls}>Qualidade</label>
            <select
              value={printSettings.quality}
              onChange={(e) => handleSettingChange('quality', e.target.value)}
              className={inputCls}
            >
              <option value="draft">Rascunho</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="maximum">Máxima</option>
            </select>
          </div>
          {/* Notas */}
          <div className="col-span-2">
            <label className={labelCls}>Notas</label>
            <textarea
              value={printSettings.notes}
              onChange={(e) => handleSettingChange('notes', e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Notas, fonte dos dados, data, responsáveis..."
            />
          </div>
        </div>

        {/* Opções Adicionais */}
        <div className={`mb-6 p-3 rounded ${sectionCls}`}>
          <h4 className={`text-sm font-medium mb-3 ${isDark ? 'text-slate-100' : 'text-gray-700'}`}>Elementos Adicionais</h4>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={printSettings.includeLegend}
                onChange={(e) => handleSettingChange('includeLegend', e.target.checked)}
                className={`mr-3 rounded text-blue-600 focus:ring-blue-500 ${isDark ? 'border-slate-500' : 'border-gray-300'}`}
              />
              <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>Incluir legenda</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={printSettings.includeScale}
                onChange={(e) => handleSettingChange('includeScale', e.target.checked)}
                className={`mr-3 rounded text-blue-600 focus:ring-blue-500 ${isDark ? 'border-slate-500' : 'border-gray-300'}`}
              />
              <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>Incluir escala</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={printSettings.includeNorthArrow}
                onChange={(e) => handleSettingChange('includeNorthArrow', e.target.checked)}
                className={`mr-3 rounded text-blue-600 focus:ring-blue-500 ${isDark ? 'border-slate-500' : 'border-gray-300'}`}
              />
              <span className={`text-sm ${isDark ? 'text-slate-200' : 'text-gray-700'}`}>Incluir rosa dos ventos</span>
            </label>
          </div>
        </div>

        {/* Prévia */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-700">Prévia</h4>
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
            >
              <FaEye className="w-4 h-4" />
              {previewMode ? 'Ocultar' : 'Mostrar'} prévia
            </button>
          </div>
          
          {previewMode && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
              <div className="text-center text-gray-500">
                <FaCog className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Prévia do mapa com as configurações selecionadas</p>
                <p className="text-xs mt-1">
                  {printSettings.paperSize} • {printSettings.orientation} • {printSettings.scale}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 transition-colors flex items-center gap-2"
          >
            <FaDownload className="w-4 h-4" />
            Exportar PDF
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <FaPrint className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
