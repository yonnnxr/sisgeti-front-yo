'use client'

import Nav from "@/componentes/nav";
import { useEffect, useState } from "react";
export default function Home() {
  const [searchValue, setSearchValue] = useState("");
  const [zoomLevel, setZoomLevel] = useState(100);
  const handleSearchChange = (value: string) => {
    setSearchValue(value);
  }
  const q = searchValue && searchValue.trim().length > 0
    ? encodeURIComponent(searchValue.trim())
    : encodeURIComponent('Campo Grande, MS');

  const handleZoomChange = (zoom: number) => {
    setZoomLevel(zoom);
  }
  // Escuta eventos de zoom da navbar (sem precisar do MapViewer)
  useEffect(() => {
    const onZoomChange = (event: Event) => {
      const detail = (event as CustomEvent).detail as number;
      if (typeof detail === 'number') setZoomLevel(detail);
    };
    window.addEventListener('zoomChange', onZoomChange as EventListener);
    return () => window.removeEventListener('zoomChange', onZoomChange as EventListener);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Nav handleSearchChange={handleSearchChange} />
      <div
        style={{
          width: "100vw",
          height: "calc(100vh - 90px)",
          position: "relative",
          marginTop: 0,
          display: "block",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease-out'
          }}
        >
          <iframe
            width="100%"
            height="100%"
            style={{border:0}}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${q}`}>
          </iframe>
        </div>
      </div>
    </div>
  );
}