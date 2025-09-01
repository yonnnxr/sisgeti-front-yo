"use client"

import { useState, useEffect } from "react";
import { FaRuler, FaRulerCombined, FaTimes, FaUndo } from "react-icons/fa";

interface Point {
  x: number;
  y: number;
}

interface MeasurementToolProps {
  type: 'line' | 'area';
  isActive: boolean;
  onClose: () => void;
}

export default function MeasurementTool({ type, isActive, onClose }: MeasurementToolProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [measurement, setMeasurement] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setPoints([]);
      setMeasurement("");
      setIsDrawing(false);
    }
  }, [isActive]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive || !isDrawing) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newPoint: Point = { x, y };
    const newPoints = [...points, newPoint];
    setPoints(newPoints);

    if (type === 'line' && newPoints.length === 2) {
      calculateLineMeasurement(newPoints);
      setIsDrawing(false);
    } else if (type === 'area' && newPoints.length >= 3) {
      calculateAreaMeasurement(newPoints);
      setIsDrawing(false);
    }
  };

  const calculateLineMeasurement = (points: Point[]) => {
    if (points.length !== 2) return;
    
    const [p1, p2] = points;
    const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    const distanceInMeters = distance * 0.1; // Simulação: 1px = 0.1m
    
    setMeasurement(`${distanceInMeters.toFixed(2)} metros`);
  };

  const calculateAreaMeasurement = (points: Point[]) => {
    if (points.length < 3) return;
    
    // Fórmula do polígono para calcular área
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;
    
    const areaInSquareMeters = area * 0.01; // Simulação: 1px² = 0.01m²
    setMeasurement(`${areaInSquareMeters.toFixed(2)} m²`);
  };

  const startMeasurement = () => {
    setPoints([]);
    setMeasurement("");
    setIsDrawing(true);
  };

  const resetMeasurement = () => {
    setPoints([]);
    setMeasurement("");
    setIsDrawing(false);
  };

  const undoLastPoint = () => {
    if (points.length > 0) {
      setPoints(points.slice(0, -1));
      setMeasurement("");
    }
  };

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {type === 'line' ? (
              <FaRuler className="text-blue-600 text-xl" />
            ) : (
              <FaRulerCombined className="text-green-600 text-xl" />
            )}
            <h3 className="text-lg font-semibold text-gray-800">
              {type === 'line' ? 'Medição de Distância' : 'Medição de Área'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        {/* Instruções */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            {type === 'line' 
              ? 'Clique em dois pontos para medir a distância entre eles.'
              : 'Clique em pelo menos 3 pontos para formar um polígono e calcular a área.'
            }
          </p>
        </div>

        {/* Controles */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={startMeasurement}
            disabled={isDrawing}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isDrawing ? 'Medindo...' : 'Iniciar Medição'}
          </button>
          <button
            onClick={resetMeasurement}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Resetar
          </button>
          <button
            onClick={undoLastPoint}
            disabled={points.length === 0}
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <FaUndo className="w-4 h-4" />
          </button>
        </div>

        {/* Área de desenho */}
        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 relative cursor-crosshair"
          style={{ height: '300px' }}
          onClick={handleCanvasClick}
        >
          {/* Pontos e linhas */}
          {points.map((point, index) => (
            <div
              key={index}
              className="absolute w-3 h-3 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"
              style={{ left: point.x, top: point.y }}
            />
          ))}
          
          {/* Linhas entre pontos */}
          {points.length > 1 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <polyline
                points={points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="red"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            </svg>
          )}

          {/* Texto de instrução */}
          {points.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-500 text-center">
                Clique para adicionar pontos
              </p>
            </div>
          )}
        </div>

        {/* Resultado da medição */}
        {measurement && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-lg font-semibold text-green-800 text-center">
              Resultado: {measurement}
            </p>
          </div>
        )}

        {/* Informações dos pontos */}
        {points.length > 0 && (
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              Pontos adicionados: {points.length}
            </p>
            <div className="text-xs text-gray-500 space-y-1">
              {points.map((point, index) => (
                <div key={index}>
                  Ponto {index + 1}: ({point.x.toFixed(0)}, {point.y.toFixed(0)})
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
