"use client"

import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";
import ModalMap from "@/componentes/ModalMap";
import {
  FaSearch,
  FaTimes,
  FaRuler,
  FaRulerCombined,
  FaPrint,
  FaInfoCircle,
  FaSearchPlus,
  FaSearchMinus,
  FaMousePointer,
  FaEdit,
  FaHome,
} from "react-icons/fa";

// Tipagem para props futuras (ex: integração com o componente pai)
interface NavProps {
  // handleSearchChange?: (value: string) => void;
}

export default function Nav(props: NavProps) {
  // const { handleSearchChange } = props;
  const [modal, setModal] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [background, setBackground] = useState('#ffffff');

  // Determina se está no tema escuro
  const isDarkTheme = background === '#0f172a';
  const buttonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const [suggestions, setSuggestions] = useState<Array<any>>([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [highlightTools, setHighlightTools] = useState(false);

  // Sugestões de locais via Nominatim (OSM) com debounce
  useEffect(() => {
    const q = searchValue.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setIsSuggestionsOpen(false);
      setHighlightIndex(-1);
      return;
    }

    // Abortar chamadas anteriores
    suggestionsAbortRef.current?.abort();
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;

    const timeoutId: number = window.setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
        const resp = await fetch(url, {
          headers: { 'Accept-Language': 'pt-BR' },
          signal: controller.signal,
        });
        const data = await resp.json();
        const items = Array.isArray(data) ? data : [];
        setSuggestions(items);
        setIsSuggestionsOpen(items.length > 0);
        setHighlightIndex(-1);
      } catch (err) {
        // Ignorar abortos; fechar dropdown em demais erros
        if ((err as any)?.name !== 'AbortError') {
          setSuggestions([]);
          setIsSuggestionsOpen(false);
          setHighlightIndex(-1);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchValue]);

  // Fechar sugestões ao clicar fora do container de busca
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSuggestionsOpen(false);
        setHighlightIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fecha o modal ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        modal &&
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setModal(false);
      }
    }
    if (modal) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [modal]);

  // Fecha o modal ao pressionar ESC
  useEffect(() => {
    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setModal(false);
    }
    if (modal) {
      document.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
    };
  }, [modal]);

  // Alterna o modal
  const handleModal = () => setModal((prev) => !prev);

  // Zoom in/out (memorizados para usar em efeitos)
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(zoomLevel + 25, 200);
    setZoomLevel(newZoom);
    window.dispatchEvent(new CustomEvent("zoomChange", { detail: newZoom }));
  }, [zoomLevel]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(zoomLevel - 25, 25);
    setZoomLevel(newZoom);
    window.dispatchEvent(new CustomEvent("zoomChange", { detail: newZoom }));
  }, [zoomLevel]);

  // Atalhos de teclado: Z = zoom in, X = zoom out, M = abrir modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'z') {
        handleZoomIn();
      } else if (e.key.toLowerCase() === 'x') {
        handleZoomOut();
      } else if (e.key.toLowerCase() === 'm') {
        setModal(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleZoomIn, handleZoomOut]);

  // Limpa o campo de busca
  const clearSearch = () => setSearchValue("");

  // Atualiza o valor do campo de busca e propaga para o pai se necessário
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    // props.handleSearchChange?.(value);
  };

  const selectSuggestion = (s: any) => {
    const label = s?.display_name || '';
    if (!label) return;
    setSearchValue(label);
    window.dispatchEvent(new CustomEvent('searchLocation', { detail: label }));
    setIsSuggestionsOpen(false);
    setHighlightIndex(-1);
  };

  // Ao apertar Enter/Setas no input, dispara busca ou navega nas sugestões
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && isSuggestionsOpen && suggestions.length > 0) {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp' && isSuggestionsOpen && suggestions.length > 0) {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      if (isSuggestionsOpen && highlightIndex >= 0 && highlightIndex < suggestions.length) {
        selectSuggestion(suggestions[highlightIndex]);
        return;
      }
      const q = searchValue && searchValue.trim().length > 0 ? searchValue.trim() : 'Campo Grande, MS';
      window.dispatchEvent(new CustomEvent('searchLocation', { detail: q }));
      setIsSuggestionsOpen(false);
      setHighlightIndex(-1);
      return;
    }
    if (e.key === 'Escape') {
      setIsSuggestionsOpen(false);
      setHighlightIndex(-1);
    }
  }


  // Abre o modal de mapa e ferramentas
  const handleOpenMapTools = () => {
    handleModal();
  };

  // Alterna ferramentas
  const handleToolClick = (tool: string) => {
    // Se a mesma ferramenta for clicada novamente, desativa
    const newTool = activeTool === tool ? null : tool;
    setActiveTool(newTool);
    
    // Despachar eventos globais para o MapViewer
    if (tool === "line" || tool === "area") {
      // Ferramentas de medição
      const measureType = newTool === "line" ? "line" : (newTool === "area" ? "area" : null);
      window.dispatchEvent(new CustomEvent('measureTool', { detail: measureType }));
      // Desativar outras ferramentas
      if (newTool) {
        window.dispatchEvent(new CustomEvent('editTool', { detail: null }));
        window.dispatchEvent(new CustomEvent('selectTool', { detail: false }));
      }
    } else if (tool === "select") {
       // Ferramenta de seleção
      window.dispatchEvent(new CustomEvent('selectTool', { detail: !!newTool }));
      // Desativar outras ferramentas
      if (newTool) {
        window.dispatchEvent(new CustomEvent('measureTool', { detail: null }));
        window.dispatchEvent(new CustomEvent('editTool', { detail: null }));
      }
    } else if (tool === "edit") {
      // Ferramenta de edição
      const editType = newTool ? "Point" : null; // Inicia com Point
      window.dispatchEvent(new CustomEvent('editTool', { detail: editType }));
      // Desativar outras ferramentas
      if (newTool) {
        window.dispatchEvent(new CustomEvent('measureTool', { detail: null }));
        window.dispatchEvent(new CustomEvent('selectTool', { detail: false }));
      }
    } else if (tool === "home") {
      // Resetar visualização
      window.dispatchEvent(new CustomEvent('resetView'));
    }
  };

  // Destaque visual quando o item "Ferramentas" for acionado no ModalMap
  const toolsContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleFocusTools = () => {
      // fechar o modal (caso esteja aberto) e destacar a área de ferramentas
      setModal(false);
      setHighlightTools(true);
      try {
        toolsContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch {}
      setTimeout(() => setHighlightTools(false), 1200);
    };
    window.addEventListener('focusTools', handleFocusTools);
    const handleClearTools = () => {
      // sincroniza com ação de limpar ferramentas
      setActiveTool(null);
    };
    window.addEventListener('clearTools', handleClearTools);
    return () => {
      window.removeEventListener('focusTools', handleFocusTools);
      window.removeEventListener('clearTools', handleClearTools);
    };
  }, []);

  // Listener para mudanças de tema do ModalMap
  useEffect(() => {
    const handleThemeChange = (event: CustomEvent) => {
      const newTheme = event.detail;
      setBackground(newTheme);
    };

    // Escuta eventos de mudança de tema
    window.addEventListener('themeChange', handleThemeChange as EventListener);

    return () => {
      window.removeEventListener('themeChange', handleThemeChange as EventListener);
    };
  }, []);

  return (
    <>
      <nav 
        className="w-full flex items-center justify-between px-6 py-3 shadow-sm relative"
        style={{
          backgroundColor: isDarkTheme ? '#0f172a' : '#ffffff',
          color: isDarkTheme ? '#f8fafc' : '#000000',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Logo sisgeti"
            width={80}
            height={80}
            className="rounded-full"
            priority
            style={{
              filter: isDarkTheme ? 'invert(1)' : 'none'
            }}
          />
        </div>

        {/* Barra de Pesquisa */}
        <div className="flex-1 max-w-2xl mx-8">
          <div className="relative" ref={searchContainerRef}>
                    <div 
          className="absolute left-3 top-1/2 transform -translate-y-1/2"
          style={{ color: isDarkTheme ? '#64748b' : '#6b7280' }}
        >
          <FaSearch className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={searchValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          ref={inputRef}
          placeholder="Pesquisar local ou adicionar mapa..."
          className="w-full pl-10 pr-12 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          style={{
            backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff',
            borderColor: isDarkTheme ? '#334155' : '#d1d5db',
            color: isDarkTheme ? '#f8fafc' : '#000000'
          }}
        />
            {/* Sugestões (Nominatim) */}
            {isSuggestionsOpen && suggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute z-50 mt-1 w-full max-h-60 overflow-auto border rounded-md shadow-sm"
                style={{
                  backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff',
                  borderColor: isDarkTheme ? '#334155' : '#d1d5db',
                  color: isDarkTheme ? '#f8fafc' : '#000000'
                }}
              >
                {suggestions.map((s, idx) => (
                  <li
                    key={`${s.place_id || s.osm_id || idx}`}
                    role="option"
                    aria-selected={highlightIndex === idx}
                    className="px-3 py-2 cursor-pointer"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    style={{
                      backgroundColor: highlightIndex === idx ? (isDarkTheme ? '#0f172a' : '#f3f4f6') : 'transparent'
                    }}
                  >
                    {s.display_name}
                  </li>
                ))}
              </ul>
            )}
            {searchValue && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors"
                style={{ 
                  color: isDarkTheme ? '#64748b' : '#6b7280',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isDarkTheme ? '#64748b' : '#6b7280';
                }}
                aria-label="Limpar busca"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Ícones de Ferramentas */}
        <div
          ref={toolsContainerRef}
          className="flex items-center gap-4"
          style={{
            outline: highlightTools ? (isDarkTheme ? '#3b82f6 solid 2px' : '#000000 solid 2px') : 'none',
            outlineOffset: highlightTools ? 4 : 0,
            borderRadius: 8,
            transition: 'outline-color 0.2s ease, outline-offset 0.2s ease'
          }}
        >
          {/* Selecionar */}
          <button
            onClick={() => handleToolClick("select")}
            className="p-2 rounded-md transition-colors"
            style={{
              backgroundColor: activeTool === "select" ? (isDarkTheme ? '#3b82f6' : '#000000') : 'transparent',
              color: activeTool === "select" ? '#ffffff' : (isDarkTheme ? '#f8fafc' : '#000000'),
              border: activeTool === "select" ? `2px solid ${isDarkTheme ? '#3b82f6' : '#000000'}` : 'none'
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "select") {
                e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#000000';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "select") {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
              }
            }}
            title="Selecionar elemento"
            aria-pressed={activeTool === "select"}
          >
            <FaMousePointer className="w-6 h-6" />
          </button>
          
          {/* Editar */}
          <button
            onClick={() => handleToolClick("edit")}
            className="p-2 rounded-md transition-colors"
            style={{
              backgroundColor: activeTool === "edit" ? (isDarkTheme ? '#3b82f6' : '#000000') : 'transparent',
              color: activeTool === "edit" ? '#ffffff' : (isDarkTheme ? '#f8fafc' : '#000000'),
              border: activeTool === "edit" ? `2px solid ${isDarkTheme ? '#3b82f6' : '#000000'}` : 'none'
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "edit") {
                e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#000000';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "edit") {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
              }
            }}
            title="Editar/Desenhar"
            aria-pressed={activeTool === "edit"}
          >
            <FaEdit className="w-6 h-6" />
          </button>
          
          {/* Medir distância */}
          <button
            onClick={() => handleToolClick("line")}
            className="p-2 rounded-md transition-colors"
            style={{
              backgroundColor: activeTool === "line" ? (isDarkTheme ? '#3b82f6' : '#000000') : 'transparent',
              color: activeTool === "line" ? '#ffffff' : (isDarkTheme ? '#f8fafc' : '#000000'),
              border: activeTool === "line" ? `2px solid ${isDarkTheme ? '#3b82f6' : '#000000'}` : 'none'
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "line") {
                e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#000000';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "line") {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
              }
            }}
            title="Medir distância"
            aria-pressed={activeTool === "line"}
          >
            <div className="flex flex-col items-center">
              <FaRuler className="w-6 h-6" />
              <div className="w-4 h-0.5 bg-current mt-1"></div>
            </div>
          </button>

          {/* Medir área */}
          <button
            onClick={() => handleToolClick("area")}
            className="p-2 rounded-md transition-colors"
            style={{
              backgroundColor: activeTool === "area" ? (isDarkTheme ? '#3b82f6' : '#000000') : 'transparent',
              color: activeTool === "area" ? '#ffffff' : (isDarkTheme ? '#f8fafc' : '#000000'),
              border: activeTool === "area" ? `2px solid ${isDarkTheme ? '#3b82f6' : '#000000'}` : 'none'
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "area") {
                e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#000000';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "area") {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
              }
            }}
            title="Medir área"
            aria-pressed={activeTool === "area"}
          >
            <div className="flex flex-col items-center">
              <FaRulerCombined className="w-6 h-6" />
              <div className="w-4 h-0.5 bg-current mt-1"></div>
            </div>
          </button>

          {/* Resetar visualização */}
          <button
            onClick={() => handleToolClick("home")}
            className="p-2 rounded-md transition-colors"
            style={{
              color: isDarkTheme ? '#f8fafc' : '#000000'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#000000';
              e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
            }}
            title="Resetar visualização"
          >
            <FaHome className="w-6 h-6" />
          </button>

          {/* Zoom */}
          <div 
            className="flex items-center gap-1 rounded-md p-1"
            style={{
              backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff',
              border: `1px solid ${isDarkTheme ? '#334155' : '#d1d5db'}`
            }}
          >
            <button
              onClick={handleZoomOut}
              className="p-1 rounded transition-colors"
              style={{
                color: isDarkTheme ? '#f8fafc' : '#000000'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDarkTheme ? '#3b82f6' : '#000000';
                e.currentTarget.style.color = isDarkTheme ? '#ffffff' : '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
              }}
              title="Diminuir zoom"
            >
              <FaSearchMinus className="w-4 h-4" />
            </button>
            <span 
              className="px-2 text-sm font-medium min-w-[3rem] text-center"
              style={{
                color: isDarkTheme ? '#f8fafc' : '#000000'
              }}
            >
              {zoomLevel}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded transition-colors"
              style={{
                color: isDarkTheme ? '#f8fafc' : '#000000'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDarkTheme ? '#3b82f6' : '#000000';
                e.currentTarget.style.color = isDarkTheme ? '#ffffff' : '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
              }}
              title="Aumentar zoom"
            >
              <FaSearchPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Botão Map & Tools */}
        <div className="flex items-center gap-2 ml-4 relative">
          <span 
            className="text-sm font-medium"
            style={{
              color: isDarkTheme ? '#f8fafc' : '#000000'
            }}
          >
            Mapa & Ferramentas
          </span>
          <button
            ref={buttonRef}
            className="p-2 rounded-md transition-colors"
            style={{
              color: isDarkTheme ? '#f8fafc' : '#000000'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#000000';
              e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
            }}
            onClick={handleOpenMapTools}
            aria-label="Abrir modal de mapa e ferramentas"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          {modal && (
            <div
              ref={modalRef}
              className="absolute right-0 top-full mt-2 z-50"
              style={{
                minWidth: 420,
                maxHeight: "calc(100vh - 120px)",
              }}
            >
              <div className="relative">
                <ModalMap onClose={() => setModal(false)} />
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}