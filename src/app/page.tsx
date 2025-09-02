'use client'

import Nav from "@/componentes/nav";
import MapViewer from "@/componentes/MapViewer";

export default function Home() {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <Nav />
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
        <MapViewer />
      </div>
    </div>
  );
}