"use client"

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import ModalMap from "./ModalMap";
import MeasurementTool from "./MeasurementTool";
import PrintDialog from "./PrintDialog";
import {
  FaSearch,
  FaTimes,
  FaRuler,
  FaRulerCombined,
  FaPrint,
  FaInfoCircle,
  FaSearchPlus,
  FaSearchMinus,
} from "react-icons/fa";

// Tipagem para props futuras (ex: integração com o componente pai)
interface NavProps {
  handleSearchChange?: (value: string) => void;
}

export default function Nav(props: NavProps) {
  const [modal, setModal] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [background, setBackground] = useState('#ffffff');

  // Determina se está no tema escuro
  const isDarkTheme = background === '#0f172a';
  const buttonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Autocomplete de lugares do Google no input da barra de busca
  useEffect(() => {
    const initializeAutocomplete = () => {
      if (!inputRef.current || !(window as any).google?.maps?.places) return;
      const autocomplete = new (window as any).google.maps.places.Autocomplete(
        inputRef.current,
        { types: ["geocode"] }
      );
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const value = place?.formatted_address || place?.name || inputRef.current!.value;
        setSearchValue(value);
        props.handleSearchChange?.(value);
      });
    };

    if (!(window as any).google?.maps?.places) {
      const scriptId = "google-maps-places-js";
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = scriptId;
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`;
        script.onload = initializeAutocomplete;
        document.head.appendChild(script);
      } else {
        script.addEventListener("load", initializeAutocomplete, { once: true } as any);
      }
    } else {
      initializeAutocomplete();
    }
  }, [props.handleSearchChange]);

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

  // Limpa o campo de busca
  const clearSearch = () => setSearchValue("");

  // Atualiza o valor do campo de busca e propaga para o pai se necessário
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    props.handleSearchChange?.(value);
  };


  // Abre o modal de mapa e ferramentas
  const handleOpenMapTools = () => {
    handleModal();
  };

  // Alterna ferramentas de medição/informação
  const handleToolClick = (tool: string) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  };

  // Zoom in/out
  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + 25, 200);
    setZoomLevel(newZoom);
    window.dispatchEvent(new CustomEvent("zoomChange", { detail: newZoom }));
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - 25, 25);
    setZoomLevel(newZoom);
    window.dispatchEvent(new CustomEvent("zoomChange", { detail: newZoom }));
  };

  // Impressão
  const handlePrint = () => setShowPrintDialog(true);

  // Informação
  const handleInfo = () => {
    setActiveTool("info");
  };

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
          <div className="relative">
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
          ref={inputRef}
          placeholder="Pesquisar local ou adicionar mapa..."
          className="w-full pl-10 pr-12 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          style={{
            backgroundColor: isDarkTheme ? '#1e293b' : '#ffffff',
            borderColor: isDarkTheme ? '#334155' : '#d1d5db',
            color: isDarkTheme ? '#f8fafc' : '#000000'
          }}
        />
            {/* Sugestões fornecidas pelo Google Places Autocomplete */}
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
        <div className="flex items-center gap-4">
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

          {/* Impressão */}
          <button
            onClick={handlePrint}
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
            title="Imprimir mapa"
          >
            <FaPrint className="w-6 h-6" />
          </button>

          {/* Informação */}
          <button
            onClick={handleInfo}
            className="p-2 rounded-md transition-colors"
            style={{
              backgroundColor: activeTool === "info" ? (isDarkTheme ? '#3b82f6' : '#000000') : 'transparent',
              color: activeTool === "info" ? '#ffffff' : (isDarkTheme ? '#f8fafc' : '#000000'),
              border: activeTool === "info" ? `2px solid ${isDarkTheme ? '#3b82f6' : '#000000'}` : 'none'
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "info") {
                e.currentTarget.style.backgroundColor = isDarkTheme ? '#1e293b' : '#000000';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "info") {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDarkTheme ? '#f8fafc' : '#000000';
              }
            }}
            title="Informações do mapa"
            aria-pressed={activeTool === "info"}
          >
            <FaInfoCircle className="w-6 h-6" />
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

      {/* Ferramentas de Medição */}
      {(activeTool === "line" || activeTool === "area") && (
        <MeasurementTool
          type={activeTool as "line" | "area"}
          isActive={true}
          onClose={() => setActiveTool(null)}
        />
      )}

      {/* Indicador de Ferramenta Ativa */}
      {activeTool === "info" && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center">
          <span className="text-sm font-medium">
            Ferramenta de informação ativada
          </span>
          <button
            onClick={() => setActiveTool(null)}
            className="ml-3 text-white hover:text-gray-300"
            aria-label="Fechar informação"
          >
            <FaTimes className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Diálogo de Impressão */}
      <PrintDialog
        isOpen={showPrintDialog}
        onClose={() => setShowPrintDialog(false)}
      />
    </>
  );
}