"use client"

import { useState } from "react";
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
    quality: 'high'
  });

  const [previewMode, setPreviewMode] = useState(false);

  if (!isOpen) return null;

  const handleSettingChange = (setting: string, value: string | boolean) => {
    setPrintSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handlePrint = () => {
    // Simular impressão
    alert('Iniciando impressão com as configurações selecionadas...');
    onClose();
  };

  const handleExport = () => {
    // Simular exportação
    alert('Exportando mapa como PDF...');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FaPrint className="text-blue-600 text-xl" />
            <h3 className="text-xl font-semibold text-gray-800">Configurações de Impressão</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <FaTimes className="w-6 h-6" />
          </button>
        </div>

        {/* Configurações */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Orientação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Orientação
            </label>
            <select
              value={printSettings.orientation}
              onChange={(e) => handleSettingChange('orientation', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="landscape">Paisagem</option>
              <option value="portrait">Retrato</option>
            </select>
          </div>

          {/* Tamanho do Papel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tamanho do Papel
            </label>
            <select
              value={printSettings.paperSize}
              onChange={(e) => handleSettingChange('paperSize', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Escala
            </label>
            <select
              value={printSettings.scale}
              onChange={(e) => handleSettingChange('scale', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Qualidade
            </label>
            <select
              value={printSettings.quality}
              onChange={(e) => handleSettingChange('quality', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="draft">Rascunho</option>
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="maximum">Máxima</option>
            </select>
          </div>
        </div>

        {/* Opções Adicionais */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Elementos Adicionais</h4>
          <div className="space-y-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={printSettings.includeLegend}
                onChange={(e) => handleSettingChange('includeLegend', e.target.checked)}
                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Incluir legenda</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={printSettings.includeScale}
                onChange={(e) => handleSettingChange('includeScale', e.target.checked)}
                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Incluir escala</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={printSettings.includeNorthArrow}
                onChange={(e) => handleSettingChange('includeNorthArrow', e.target.checked)}
                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Incluir rosa dos ventos</span>
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
