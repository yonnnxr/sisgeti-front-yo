"use client"

import { useState, useEffect } from "react";
import { FaSearchPlus, FaSearchMinus, FaHome, FaCompass } from "react-icons/fa";

interface MapViewerProps {
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
}

export default function MapViewer({ zoomLevel, onZoomChange }: MapViewerProps) {
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => {
    onZoomChange(Math.min(zoomLevel + 25, 200));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(zoomLevel - 25, 25));
  };

  const handleResetView = () => {
    setCenter({ x: 0, y: 0 });
    onZoomChange(100);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - center.x, y: e.clientY - center.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setCenter({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    const handleZoomChange = (event: CustomEvent) => {
      onZoomChange(event.detail);
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('zoomChange', handleZoomChange as EventListener);
    
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('zoomChange', handleZoomChange as EventListener);
    };
  }, [onZoomChange]);

  return (
    <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
      {/* Controles de Zoom */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={handleZoomIn}
          className="w-10 h-10 bg-white border border-gray-300 rounded-lg shadow-lg flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors"
          title="Aumentar zoom"
        >
          <FaSearchPlus className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-10 h-10 bg-white border border-gray-300 rounded-lg shadow-lg flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors"
          title="Diminuir zoom"
        >
          <FaSearchMinus className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="w-10 h-10 bg-white border border-gray-300 rounded-lg shadow-lg flex items-center justify-center text-gray-700 hover:bg-gray-50 transition-colors"
          title="Resetar visualização"
        >
          <FaHome className="w-4 h-4" />
        </button>
      </div>

      {/* Indicador de Zoom */}
      <div className="absolute top-4 left-4 bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2 z-10">
        <div className="flex items-center gap-2">
          <FaCompass className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">
            {zoomLevel}%
          </span>
        </div>
      </div>

      {/* Área do Mapa */}
      <div
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          transform: `scale(${zoomLevel / 100}) translate(${center.x}px, ${center.y}px)`,
          transformOrigin: 'center center',
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
      >
        {/* Mapa Simulado */}
        <div className="w-full h-full bg-gradient-to-br from-blue-100 to-green-100 relative">
          {/* Grade de coordenadas */}
          <div className="absolute inset-0 opacity-20">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="absolute w-full h-px bg-gray-400" style={{ top: `${i * 5}%` }} />
            ))}
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="absolute h-full w-px bg-gray-400" style={{ left: `${i * 5}%` }} />
            ))}
          </div>

          {/* Elementos do mapa */}
          <div className="absolute top-1/4 left-1/4 w-16 h-16 bg-red-500 rounded-full opacity-80 flex items-center justify-center text-white text-xs font-bold">
            P1
          </div>
          <div className="absolute top-1/3 right-1/3 w-12 h-12 bg-blue-500 rounded opacity-80 flex items-center justify-center text-white text-xs font-bold">
            P2
          </div>
          <div className="absolute bottom-1/4 left-1/3 w-20 h-16 bg-green-500 rounded-lg opacity-80 flex items-center justify-center text-white text-xs font-bold">
            Área
          </div>
          <div className="absolute bottom-1/3 right-1/4 w-14 h-14 bg-purple-500 rounded-full opacity-80 flex items-center justify-center text-white text-xs font-bold">
            P3
          </div>

          {/* Linhas de conexão */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <line
              x1="25%"
              y1="25%"
              x2="33%"
              y2="33%"
              stroke="red"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
            <line
              x1="33%"
              y1="33%"
              x2="75%"
              y2="67%"
              stroke="blue"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          </svg>

          {/* Texto de coordenadas */}
          <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 rounded-lg px-3 py-2 text-xs text-gray-600">
            <div>X: {center.x.toFixed(0)}</div>
            <div>Y: {center.y.toFixed(0)}</div>
          </div>
        </div>
      </div>

      {/* Instruções */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded-lg px-3 py-2 text-xs text-gray-600 max-w-48">
        <p>Arraste para mover • Scroll para zoom • Clique nos pontos para informações</p>
      </div>
    </div>
  );
}
