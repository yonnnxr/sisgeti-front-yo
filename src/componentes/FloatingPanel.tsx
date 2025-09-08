"use client";

import { useEffect, useRef, useState } from "react";
import { FaMinus, FaTimes, FaWindowRestore } from "react-icons/fa";

type DefaultCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface FloatingPanelProps {
  title: string;
  panelId: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  defaultPosition?: DefaultCorner;
  initialPosition?: { x?: number; y?: number };
  isDark?: boolean;
  highlight?: boolean;
  persistPosition?: boolean;
  resizable?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  onClose?: () => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

const STORAGE_PREFIX = "sisgeti_panel_pos_";

export default function FloatingPanel({
  title,
  panelId,
  width = 320,
  height,
  minWidth = 240,
  minHeight = 80,
  defaultPosition = "top-left",
  initialPosition,
  isDark = false,
  highlight = false,
  persistPosition = true,
  resizable = false,
  maxWidth,
  maxHeight,
  onClose,
  headerActions,
  children,
}: FloatingPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: width, h: Math.max(minHeight, height || minHeight) });
  const [resizing, setResizing] = useState(false);
  const fixedLayout = !!(resizable || height != null);

  // Load persisted position / minimized state or compute defaults
  useEffect(() => {
    try {
      const savedRaw = persistPosition ? localStorage.getItem(STORAGE_PREFIX + panelId) : null;
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (typeof saved?.x === 'number' && typeof saved?.y === 'number') {
          setPosition({ x: saved.x, y: saved.y });
        }
        if (typeof saved?.minimized === 'boolean') {
          setMinimized(!!saved.minimized);
        }
        if (fixedLayout) {
          if (typeof saved?.w === 'number' && typeof saved?.h === 'number') {
            setSize({ w: saved.w, h: Math.max(minHeight, saved.h) });
          } else {
            setSize({ w: width, h: Math.max(minHeight, height || minHeight) });
          }
        } else {
          setSize(s => ({ w: width, h: Math.max(minHeight, s.h) }));
        }
        return;
      }
    } catch {}

    // If no persisted state, compute from defaults relative to parent
    requestAnimationFrame(() => {
      const parent = containerRef.current?.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const panelW = Math.max(minWidth, Math.min((parentRect?.width || width), width));
      const panelH = Math.max(minHeight, Math.min((parentRect?.height || (height || minHeight)), (height || minHeight)));
      if (fixedLayout) setSize({ w: panelW, h: panelH }); else setSize(s => ({ w: panelW, h: s.h }));
      const px = Math.max(16, Math.min((initialPosition?.x ?? 16), (parentRect ? parentRect.width - panelW - 16 : 10000)));
      const py = Math.max(16, Math.min((initialPosition?.y ?? 16), (parentRect ? parentRect.height - panelH - 16 : 10000)));
      if (initialPosition?.x != null || initialPosition?.y != null) {
        setPosition({ x: px, y: py });
        return;
      }
      if (parentRect) {
        const x = defaultPosition.includes('right') ? Math.max(16, parentRect.width - panelW - 20) : 16;
        const y = defaultPosition.includes('bottom') ? Math.max(16, parentRect.height - panelH - 20) : 16;
        setPosition({ x, y });
      }
    });
  }, [panelId, width, height, minWidth, minHeight, defaultPosition, initialPosition, persistPosition]);

  // Persist on change
  useEffect(() => {
    if (!persistPosition) return;
    try {
      const payload: any = { ...position, minimized };
      if (fixedLayout) { payload.w = size.w; payload.h = size.h; }
      localStorage.setItem(STORAGE_PREFIX + panelId, JSON.stringify(payload));
    } catch {}
  }, [panelId, position, minimized, size.w, size.h, persistPosition, fixedLayout]);

  // Ensure panel stays inside parent on window resize
  useEffect(() => {
    const handleResize = () => {
      const parent = containerRef.current?.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      if (!parentRect) return;
      const panelWidth = size.w;
      const panelHeight = size.h;
      const maxX = Math.max(0, parentRect.width - panelWidth - 8);
      const maxY = Math.max(0, parentRect.height - Math.max(minHeight, panelHeight) - 8);
      setPosition(p => ({ x: Math.min(Math.max(8, p.x), maxX), y: Math.min(Math.max(8, p.y), maxY) }));
      if (fixedLayout) {
        setSize(s => ({
          w: Math.min(Math.max(minWidth, s.w), maxWidth || parentRect.width - 32),
          h: Math.min(Math.max(minHeight, s.h), maxHeight || parentRect.height - 32)
        }));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [minWidth, minHeight, maxWidth, maxHeight, size.w, size.h, fixedLayout]);

  // Pointer-based dragging limited to header
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // left button only
      const target = e.target as HTMLElement;
      if (target.closest('button')) return; // skip drags when clicking buttons
      startX = e.clientX;
      startY = e.clientY;
      originX = position.x;
      originY = position.y;
      setDragging(true);
      try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch {}
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const parent = containerRef.current?.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      if (!parentRect) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const panelWidth = containerRef.current?.offsetWidth || width;
      const panelHeight = containerRef.current?.offsetHeight || minHeight;
      const nextX = originX + dx;
      const nextY = originY + dy;
      const maxX = Math.max(0, parentRect.width - panelWidth - 8);
      const maxY = Math.max(0, parentRect.height - Math.max(minHeight, panelHeight) - 8);
      setPosition({ x: Math.min(Math.max(8, nextX), maxX), y: Math.min(Math.max(8, nextY), maxY) });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      setDragging(false);
      try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch {}
    };

    header.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      header.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragging, position.x, position.y, width, minHeight]);

  const toggleMinimize = () => setMinimized(v => !v);

  // Resize handle logic
  useEffect(() => {
    if (!resizable) return;
    const onMove = (e: PointerEvent) => {
      if (!resizing) return;
      const parent = containerRef.current?.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      if (!parentRect) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const newW = Math.min(Math.max(minWidth, e.clientX - rect.left), maxWidth || parentRect.width - rect.left - 8);
      const newH = Math.min(Math.max(minHeight, e.clientY - rect.top), maxHeight || parentRect.height - rect.top - 8);
      setSize({ w: newW, h: newH });
    };
    const onUp = () => setResizing(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [resizable, resizing, minWidth, minHeight, maxWidth, maxHeight]);

  return (
    <div
      ref={containerRef}
      className={`absolute z-50 rounded-lg shadow-lg border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-gray-200 text-gray-900'} ${highlight ? 'ring-2 ring-blue-500' : ''} flex flex-col`}
      style={{ left: position.x, top: position.y, width: size.w, height: minimized ? undefined : (fixedLayout ? size.h : undefined), minWidth, minHeight }}
    >
      <div
        ref={headerRef}
        className={`flex items-center justify-between px-3 py-2 cursor-grab select-none ${dragging ? 'cursor-grabbing' : ''} ${isDark ? 'border-b border-slate-700' : 'border-b border-gray-200'}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            onClick={(e) => { e.stopPropagation(); toggleMinimize(); }}
            title={minimized ? 'Restaurar' : 'Minimizar'}
            className={`p-1 rounded ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
          >
            {minimized ? <FaWindowRestore /> : <FaMinus />}
          </button>
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              title="Fechar"
              className={`p-1 rounded ${isDark ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
            >
              <FaTimes />
            </button>
          )}
        </div>
      </div>
      {!minimized && (
        <div className={fixedLayout ? "p-3 overflow-auto flex-1" : "p-3"}>
          {children}
        </div>
      )}
      {resizable && !minimized && (
        <div
          title="Redimensionar"
          onPointerDown={(e) => { e.preventDefault(); setResizing(true); }}
          className={`absolute right-1 bottom-1 w-3 h-3 cursor-se-resize ${isDark ? 'bg-slate-600' : 'bg-gray-300'} rounded-sm`}
        />
      )}
    </div>
  );
}


