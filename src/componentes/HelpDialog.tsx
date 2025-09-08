"use client"

import { useEffect, useState } from "react";
import { FaTimes, FaExternalLinkAlt, FaKeyboard } from "react-icons/fa";

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const [isDark, setIsDark] = useState(false);

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
  const subCls = isDark ? 'text-slate-300' : 'text-gray-600';

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className={`${cardCls} rounded-lg shadow-2xl p-6 max-w-xl w-full mx-4`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><FaKeyboard /> Ajuda & Atalhos</h3>
          <button onClick={onClose} className={`${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`} aria-label="Fechar">
            <FaTimes className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Atalhos do Teclado</h4>
            <ul className={`text-sm ${subCls} list-disc ml-5 space-y-1`}>
              <li>Z: Aumentar zoom</li>
              <li>X: Diminuir zoom</li>
              <li>M: Abrir o menu Mapa & Ferramentas</li>
              <li>ESC: Fechar diálogos/menus</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">Dicas</h4>
            <ul className={`text-sm ${subCls} list-disc ml-5 space-y-1`}>
              <li>Use Identify para consultar atributos em camadas WMS visíveis.</li>
              <li>Gerencie camadas (WMS/GeoJSON) no Gerenciador de Camadas.</li>
              <li>Ative Edição para desenhar pontos, linhas e polígonos.</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-2">Documentação</h4>
            <a href="https://docs.qgis.org/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm">
              Abrir documentação <FaExternalLinkAlt className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}



