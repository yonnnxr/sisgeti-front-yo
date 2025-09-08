"use client"

import { useEffect, useRef } from "react";

interface PrintComposerProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  notes?: string;
  paperSize: 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
  orientation: 'landscape' | 'portrait';
  includeLegend?: boolean;
  includeScale?: boolean;
  includeNorthArrow?: boolean;
  mapImageDataUrl?: string; // PNG do mapa composto
  onAfterPrint?: () => void;
  metersPerPixel?: number;
  layersInfo?: { id: string; name: string; type: string; url?: string; layerName?: string }[];
}

export default function PrintComposer({ visible, title, subtitle, notes, paperSize, orientation, includeLegend, includeScale, includeNorthArrow, mapImageDataUrl, onAfterPrint, metersPerPixel, layersInfo = [] }: PrintComposerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = () => onAfterPrint && onAfterPrint();
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, [visible, onAfterPrint]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-white overflow-auto p-6"
      style={{
        // A área visual é apenas uma prévia; a paginação é controlada via @page em CSS global
      }}
    >
      <div
        className="mx-auto bg-white shadow-lg border rounded"
        style={{
          width: '100%',
          maxWidth: orientation === 'landscape' ? '1400px' : '1000px',
          aspectRatio: orientation === 'landscape' ? '4 / 3' : '3 / 4',
          padding: '24px',
        }}
      >
        {/* Cabeçalho */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
          {subtitle && <div className="text-gray-600">{subtitle}</div>}
        </div>

        {/* Corpo: mapa + elementos laterais */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-9 border rounded overflow-hidden bg-gray-50 flex items-center justify-center">
            {mapImageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mapImageDataUrl} alt="Mapa" className="w-full h-full object-contain" />
            ) : (
              <div className="text-gray-400">Mapa não disponível</div>
            )}
          </div>
          <div className="col-span-3 flex flex-col gap-4">
            {includeLegend && (
              <div className="border rounded p-3">
                <h3 className="font-semibold text-gray-800 mb-2 text-sm">Legenda</h3>
                <div className="text-xs text-gray-600 space-y-1">
                  {layersInfo.length === 0 && <div>Sem camadas visíveis</div>}
                  {layersInfo.map(l => (
                    <div key={l.id} className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: '#dc2626' }}></span>
                      <span>{l.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {includeScale && (
              <div className="border rounded p-3">
                <h3 className="font-semibold text-gray-800 mb-2 text-sm">Escala</h3>
                <div className="w-full h-2 bg-gray-300 rounded relative">
                  {/* Marcadores simples: 0, 100, 200, 300, 400 m (aprox) */}
                  <div className="absolute top-0 left-0 h-2 bg-gray-800" style={{ width: '25%' }}></div>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {metersPerPixel ? `1 px ≈ ${metersPerPixel.toFixed(2)} m` : 'Escala aproximada'}
                </div>
              </div>
            )}
            {includeNorthArrow && (
              <div className="border rounded p-3">
                <h3 className="font-semibold text-gray-800 mb-2 text-sm">Norte</h3>
                <div className="w-0 h-0 border-l-8 border-r-8 border-b-[24px] border-l-transparent border-r-transparent border-b-black mx-auto"></div>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className="mt-4 text-xs text-gray-600">
          {notes && <div className="mb-2">{notes}</div>}
          <div>Formato: {paperSize} • Orientação: {orientation}</div>
        </div>
      </div>
    </div>
  );
}


