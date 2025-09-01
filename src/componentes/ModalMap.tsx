"use client"

import { useState } from "react";
import { FaSearch, FaThList, FaLayerGroup, FaToolbox, FaPrint, FaQuestionCircle, FaExternalLinkAlt, FaTimes, FaMap, FaCog, FaDownload } from "react-icons/fa";

interface ModalMapProps {
  onClose?: () => void;
}

export default function ModalMap({ onClose }: ModalMapProps) {
  const [filterValue, setFilterValue] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [background, setBackground] = useState('#ffffff');

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterValue(e.target.value);
  };

  // Determina se está no tema escuro
  const isDarkTheme = background === '#0f172a';

  const setbackground = (color: string) => {
    const newBg = isDarkTheme ? '#ffffff' : '#0f172a';
    setBackground(newBg);
    document.body.style.backgroundColor = newBg;
    
    // Dispara evento para sincronizar com outros componentes
    window.dispatchEvent(new CustomEvent('themeChange', { detail: newBg }));
  };

  const clearFilter = () => {
    setFilterValue("");
  };

  const handleCategoryClick = (category: string) => {
    if (activeCategory === category) {
      setActiveCategory(null);
    } else {
      setActiveCategory(category);
    }
  };

  const handleAction = (action: string) => {
    switch (action) {
      case 'theme':
        setbackground('#0f172a');
        break;
      case 'layers':
        alert('Gerenciador de camadas aberto');
        break;
      case 'tools':
        alert('Painel de ferramentas aberto');
        break;
      case 'print':
        window.print();
        break;
      case 'help':
        alert('Documentação de ajuda aberta');
        break;
      case 'external':
        window.open('https://docs.qgis.org/', '_blank');
        break;
      case 'map':
        alert('Configurações do mapa abertas');
        break;
      case 'settings':
        alert('Configurações gerais abertas');
        break;
      case 'download':
        alert('Download de dados iniciado');
        break;
      default:
        break;
    }
  };

  const menuOptions = [
    { id: 'theme', icon: <FaThList />, label: 'Tema ' + (isDarkTheme ? 'Claro' : 'Escuro'), category: 'visualization' },
    { id: 'map', icon: <FaMap />, label: 'Configurações do Mapa', category: 'visualization' },
    { id: 'tools', icon: <FaToolbox />, label: 'Ferramentas', category: 'tools' },
    { id: 'print', icon: <FaPrint />, label: 'Imprimir', category: 'tools' },
    { id: 'download', icon: <FaDownload />, label: 'Download', category: 'tools' },
    { id: 'settings', icon: <FaCog />, label: 'Configurações', category: 'system' },
    { id: 'help', icon: <FaQuestionCircle />, label: 'Ajuda', category: 'system' },
    { id: 'external', icon: <FaExternalLinkAlt />, label: 'Documentação', category: 'system' },
  ];

  const filteredOptions = menuOptions.filter(option =>
    option.label.toLowerCase().includes(filterValue.toLowerCase())
  );

  const groupedOptions = filteredOptions.reduce((acc, option) => {
    if (!acc[option.category]) {
      acc[option.category] = [];
    }
    acc[option.category].push(option);
    return acc;
  }, {} as Record<string, typeof menuOptions>);

  const categoryLabels = {
    visualization: 'Visualização',
    tools: 'Ferramentas',
    system: 'Sistema'
  };

  return (
    <div
      className="p-5 rounded-xl shadow-2xl flex flex-col gap-4 border"
      style={{
        width: "420px",
        maxHeight: "70vh",
        fontFamily: "inherit",
        backgroundColor: background,
        color: isDarkTheme ? '#f8fafc' : '#111',
        borderColor: isDarkTheme ? '#1e293b' : '#e5e7eb',
      }}
    >
      {/* Cabeçalho */}
      <div 
        className="flex items-center justify-between border-b pb-3"
        style={{ borderColor: isDarkTheme ? '#1e293b' : '#e5e7eb' }}
      >
        <h3 
          className="text-lg font-semibold"
          style={{ color: isDarkTheme ? '#f8fafc' : '#111' }}
        >
          Mapa & Ferramentas
        </h3>
                 {onClose && (
           <button
             onClick={onClose}
             className="transition-colors"
             style={{
               color: isDarkTheme ? '#64748b' : '#9ca3af'
             }}
             onMouseEnter={(e) => {
               e.currentTarget.style.color = isDarkTheme ? '#94a3b8' : '#6b7280';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.color = isDarkTheme ? '#64748b' : '#9ca3af';
             }}
             aria-label="Fechar modal"
           >
             <FaTimes className="w-5 h-5" />
           </button>
         )}
      </div>

      {/* Barra de filtro */}
      <div 
        className="flex items-center gap-3 border-b pb-3"
        style={{ borderColor: isDarkTheme ? '#1e293b' : '#e5e7eb' }}
      >
        <span 
          className="text-lg"
          style={{ color: isDarkTheme ? '#64748b' : '#6b7280' }}
        >
          <FaSearch />
        </span>
        <input
          type="text"
          value={filterValue}
          onChange={handleFilterChange}
          placeholder="Filtrar menu..."
          className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          style={{
            backgroundColor: isDarkTheme ? '#0f172a' : '#f9fafb',
            borderColor: isDarkTheme ? '#334155' : '#e5e7eb',
            color: isDarkTheme ? '#f8fafc' : '#000000'
          }}
        />
                 {filterValue && (
           <button
             onClick={clearFilter}
             className="transition-colors"
             style={{
               color: isDarkTheme ? '#64748b' : '#9ca3af'
             }}
             onMouseEnter={(e) => {
               e.currentTarget.style.color = isDarkTheme ? '#94a3b8' : '#6b7280';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.color = isDarkTheme ? '#64748b' : '#9ca3af';
             }}
             aria-label="Limpar filtro"
           >
             <FaTimes className="w-4 h-4" />
           </button>
         )}
      </div>

      {/* Menu de opções organizado por categoria */}
      <div className="flex-1 overflow-y-auto max-h-80">
        {Object.entries(groupedOptions).map(([category, options]) => (
          <div key={category} className="mb-4">
            <h4 
              className="text-sm font-medium mb-3 uppercase tracking-wide"
              style={{ color: isDarkTheme ? '#64748b' : '#6b7280' }}
            >
              {categoryLabels[category as keyof typeof categoryLabels]}
            </h4>
            <div className="grid grid-cols-1 gap-2">
            {options.map((option) => (
                              <button
                  key={option.id}
                  onClick={() => handleAction(option.id)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset text-left"
                  style={{
                    backgroundColor: 'transparent',
                    color: isDarkTheme ? '#f8fafc' : '#111',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                <span 
                  className="text-lg flex-shrink-0"
                  style={{ color: isDarkTheme ? '#94a3b8' : '#374151' }}
                >
                  {option.icon}
                </span>
                <span className="text-base font-medium flex-1">
                  {option.label}
                </span>
              </button>
            ))}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé */}
      <div 
        className="border-t pt-3"
        style={{ borderColor: isDarkTheme ? '#1e293b' : '#e5e7eb' }}
      >
        <div 
          className="text-xs text-center"
          style={{ color: isDarkTheme ? '#64748b' : '#6b7280' }}
        >
          QWC Demo v1.0 • Sistema de Mapeamento Interativo
        </div>
      </div>
    </div>
  );
}