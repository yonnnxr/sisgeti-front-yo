"use client"

import { useState, useEffect, useRef, useCallback } from "react";
import { FaSearchPlus, FaSearchMinus, FaHome, FaCompass, FaInfoCircle, FaMapMarkerAlt, FaDrawPolygon, FaVectorSquare, FaFileExport, FaFileImport, FaTimes, FaRuler, FaRulerCombined, FaSave, FaGlobe, FaImage, FaCamera } from "react-icons/fa";
import FloatingPanel from "./FloatingPanel";
// OpenLayers imports
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import Heatmap from 'ol/layer/Heatmap';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';
import ScaleLine from 'ol/control/ScaleLine';
import FullScreen from 'ol/control/FullScreen';
import MousePosition from 'ol/control/MousePosition';
import { createStringXY } from 'ol/coordinate';
import { click } from 'ol/events/condition';
import { unByKey } from 'ol/Observable';
// Camadas vetoriais e interações
import TileWMS from 'ol/source/TileWMS';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Layer } from 'ol/layer';
import { Circle as CircleStyle, Fill, Stroke, Style, Text as TextStyle } from 'ol/style';
import { Draw, Select, Modify, Snap } from 'ol/interaction';
import { LineString, Polygon } from 'ol/geom';
import { getLength, getArea } from 'ol/sphere';
import GeoJSON from 'ol/format/GeoJSON';
import proj4 from 'proj4';
import { register as registerProj4 } from 'ol/proj/proj4';
import { idbSetGeoJSON, idbGetGeoJSON, idbDeleteGeoJSON } from '@/utils/idb';
import { runUnaryOperationInWorker } from '@/utils/geoprocessing';
import { Feature } from 'ol';
import { EventsKey } from 'ol/events';
import Cluster from 'ol/source/Cluster';

// Componentes
import LayerManager from "./LayerManager";
import GeoProcessingPanel from "./GeoProcessingPanel";
import GeoAnalyticsPanel from "./GeoAnalyticsPanel";
import PrintDialog from "./PrintDialog";
import PrintComposer from "./PrintComposer";
import HelpDialog from "./HelpDialog";
import SettingsDialog from "./SettingsDialog";

// Definição de tipos
interface AppLayer {
  id: string;
  name: string;
  type: "WMS" | "GeoJSON" | "OSM";
  url?: string;
  layerName?: string;
  geoJsonData?: object;
  visible: boolean;
  opacity: number;
  featureCount?: number;
}

type GeometryType = 'Point' | 'LineString' | 'Polygon';
type MeasureType = 'line' | 'area' | null;

// Chaves para localStorage
const EDIT_LAYER_STORAGE_KEY = 'sisgeti_edit_layer_features';
const MANAGED_LAYERS_STORAGE_KEY = 'sisgeti_managed_layers';

// Registrar proj4 para suportar projeções adicionais (ex.: UTM)
registerProj4(proj4);

const ensureUtmProjection = (zone: number): string => {
  const code = `EPSG:327${String(zone).padStart(2, '0')}`;
  try {
    if (!proj4.defs(code as any)) {
      proj4.defs(code as any, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs +type=crs`);
    }
  } catch {}
  return code;
};

// Funções auxiliares de formatação
const formatLength = function(line: LineString) {
  const length = getLength(line);
  let output: string;
  if (length > 100) {
    output = `${Math.round((length / 1000) * 100) / 100} km`;
  } else {
    output = `${Math.round(length * 100) / 100} m`;
  }
  return output;
};

const formatArea = function(polygon: Polygon) {
  const area = getArea(polygon);
  let output: string;
  if (area > 10000) {
    output = `${Math.round((area / 1000000) * 100) / 100} km²`;
  } else {
    output = `${Math.round(area * 100) / 100} m²`;
  }
  return output;
};

export default function MapViewer() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const baseLayerRef = useRef<TileLayer<any> | null>(null);
  
  // Estado para o nível de zoom
  const [zoomLevel, setZoomLevel] = useState(100);
  
  // Estado para as camadas GERENCIADAS (salvas/recuperadas do localStorage)
  const [layers, setLayers] = useState<AppLayer[]>([]);
  
  // Estado para edição
  const [editActive, setEditActive] = useState(false);
  const [editGeometryType, setEditGeometryType] = useState<GeometryType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estado para medição
  const [measureActive, setMeasureActive] = useState(false);
  const [measureType, setMeasureType] = useState<MeasureType>(null);
  const [measureResult, setMeasureResult] = useState<string | null>(null);
  
  // Estado para seleção
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [selectedFeatureAttributes, setSelectedFeatureAttributes] = useState<Record<string, any> | null>(null);
  
  // Estado para salvamento
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [isGeoPanelOpen, setIsGeoPanelOpen] = useState(false);
  const [baseMap, setBaseMap] = useState<'OSM' | 'Topo'>('OSM');
  const [identifyActive, setIdentifyActive] = useState(false);
  const [identifyResults, setIdentifyResults] = useState<Array<Record<string, any>> | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [isComposerVisible, setIsComposerVisible] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [composerImage, setComposerImage] = useState<string | undefined>(undefined);
  const [composerSettings, setComposerSettings] = useState<any | null>(null);
  const [composerLayers, setComposerLayers] = useState<any[]>([]);
  const [composerMetersPerPixel, setComposerMetersPerPixel] = useState<number | null>(null);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [highlightLayerManager, setHighlightLayerManager] = useState(false);
  const [selectHint, setSelectHint] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsType, setSettingsType] = useState<'map' | 'general'>('general');
  
  // Referências para camada de edição
  const editVectorSourceRef = useRef<VectorSource | null>(null);
  const editVectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const selectInteractionRef = useRef<Select | null>(null);
  const modifyInteractionRef = useRef<Modify | null>(null);
  const snapInteractionRef = useRef<Snap | null>(null);
  
  // Referências para medição
  const measureVectorSourceRef = useRef<VectorSource | null>(null);
  const measureVectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const measureDrawRef = useRef<Draw | null>(null);
  const measureListenerRef = useRef<EventsKey | null>(null);
  
  // Listeners para auto-save (agora são arrays para lidar com o retorno de on())
  const editSourceListenersRef = useRef<Array<EventsKey | null>>([]);
  
  // Cache para mapear ID da camada do app com a camada do OL
  const layerCacheRef = useRef<Record<string, Layer>>({});
  const heatmapCacheRef = useRef<Record<string, Heatmap>>({});
  // Cache para fontes de cluster (quando aplicável)
  const clusterSourceCacheRef = useRef<Record<string, Cluster>>({});
  
  // Coordenadas padrão
  const defaultCenter = [-54.62, -20.44]; // Campo Grande, MS

  // Função para adicionar uma camada ao mapa OpenLayers E ao estado
  const addLayerToMap = useCallback((layerData: any) => {
    if (!mapInstance.current) return null;
    
    const map = mapInstance.current;
    let newOlLayer: Layer | null = null;
    let id = layerData?.id ?? `layer-${Date.now()}`; // Usa id existente ou gera
    
    if (layerData.type === "WMS" && layerData.url && layerData.layerName) {
      newOlLayer = new TileLayer({
        source: new TileWMS({
          url: layerData.url,
          params: { 'LAYERS': layerData.layerName, 'TILED': true },
          serverType: 'geoserver',
        }),
        visible: layerData.visible,
        opacity: layerData.opacity,
        zIndex: 10
      });
      newOlLayer.set('name', layerData.name);
    } 
    else if (layerData.type === "GeoJSON" && layerData.geoJsonData) {
      const geoJsonFormat = new GeoJSON();
      const gj: any = layerData.geoJsonData as any;
      const gjNorm: any = (gj && gj.type) ? gj : { type: 'FeatureCollection', features: Array.isArray(gj?.features) ? gj.features : [] };
      // Detectar projeção de entrada: 4326 (lon/lat) vs 3857 (mercator)
      const crsName: string | undefined = gj?.crs?.properties?.name || gj?.crs?.name;
      const firstCoord = (() => {
        try {
          const f0 = (gjNorm.features && gjNorm.features[0]) || null;
          if (!f0) return null;
          const g = f0.geometry;
          if (!g) return null;
          const t = g.type;
          const c = g.coordinates;
          if (t === 'Point') return c;
          if (t === 'MultiPoint' || t === 'LineString') return c[0];
          if (t === 'MultiLineString' || t === 'Polygon') return c[0][0];
          if (t === 'MultiPolygon') return c[0][0][0];
          return null;
        } catch { return null; }
      })();
      const looksLike3857 = !!(
        (crsName && /3857|900913/i.test(crsName))
      );
      const looksLikeUTM = !!(firstCoord &&
        Math.abs(firstCoord[0]) >= 1000 && Math.abs(firstCoord[0]) <= 1000000 &&
        Math.abs(firstCoord[1]) >= 1000 && Math.abs(firstCoord[1]) <= 10000000);
      let features: any[] = [];
      try {
        // Candidatos: 4326, 4326 com swap, 3857 e UTM (zonas próximas)
        const readAs = (dataProj: string, obj: any) => {
          try {
            return geoJsonFormat.readFeatures(obj, { featureProjection: 'EPSG:3857', dataProjection: dataProj });
          } catch { return []; }
        };
        const swapLonLatInGeom = (geom: any): any => {
          if (!geom) return geom;
          const type = geom.type;
          const swapCoord = (p: any) => Array.isArray(p) && p.length >= 2 ? [p[1], p[0], ...p.slice(2)] : p;
          if (type === 'Point') return { ...geom, coordinates: swapCoord(geom.coordinates) };
          if (type === 'MultiPoint' || type === 'LineString') return { ...geom, coordinates: (geom.coordinates || []).map(swapCoord) };
          if (type === 'MultiLineString' || type === 'Polygon') return { ...geom, coordinates: (geom.coordinates || []).map((arr: any[]) => arr.map(swapCoord)) };
          if (type === 'MultiPolygon') return { ...geom, coordinates: (geom.coordinates || []).map((poly: any[]) => poly.map((ring: any[]) => ring.map(swapCoord))) };
          if (type === 'GeometryCollection') return { ...geom, geometries: (geom.geometries || []).map((g: any) => swapLonLatInGeom(g)) };
          return geom;
        };
        const swapGeoJson = (obj: any): any => {
          if (!obj) return obj;
          if (obj.type === 'FeatureCollection') return { ...obj, features: (obj.features || []).map((f: any) => swapGeoJson(f)) };
          if (obj.type === 'Feature') return { ...obj, geometry: swapLonLatInGeom(obj.geometry) };
          if (obj.type) return swapLonLatInGeom(obj);
          return obj;
        };
        const candidateWgs84 = readAs('EPSG:4326', gjNorm);
        const candidateWgs84Swapped = readAs('EPSG:4326', swapGeoJson(gjNorm));
        const candidateMerc = readAs('EPSG:3857', gjNorm);

        // UTM zonas: próxima ao centro padrão e vizinhas
        const approxZoneFromLon = (lon: number) => Math.floor((lon + 180) / 6) + 1;
        const defaultLon = defaultCenter[0];
        const baseZone = approxZoneFromLon(defaultLon);
        const zoneCandidates = Array.from(new Set([baseZone, baseZone - 1, baseZone + 1].filter(z => z >= 1 && z <= 60)));
        const southern = defaultCenter[1] < 0; // MS está no hemisfério sul
        const utmCandidates: any[][] = [];
        for (const z of zoneCandidates) {
          const epsg = southern ? ensureUtmProjection(z) : `EPSG:326${String(z).padStart(2, '0')}`;
          if (!southern) { try { if (!proj4.defs(epsg as any)) { proj4.defs(epsg as any, `+proj=utm +zone=${z} +datum=WGS84 +units=m +no_defs +type=crs`); } } catch {} }
          const feats = readAs(epsg, gjNorm);
          if (feats.length > 0) utmCandidates.push(feats);
        }
        const computeCenter = (feats: any[]) => {
          let extent: number[] | null = null;
          for (const f of feats) {
            const g = f.getGeometry?.(); if (!g) continue;
            const e = g.getExtent();
            if (!extent) extent = e.slice();
            else {
              extent[0] = Math.min(extent[0], e[0]);
              extent[1] = Math.min(extent[1], e[1]);
              extent[2] = Math.max(extent[2], e[2]);
              extent[3] = Math.max(extent[3], e[3]);
            }
          }
          if (!extent) return null;
          return [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
        };
        const centerDefault = fromLonLat(defaultCenter);
        const distSq = (c: number[] | null) => !c ? Number.POSITIVE_INFINITY : ((c[0]-centerDefault[0])**2 + (c[1]-centerDefault[1])**2);

        const candidates: any[][] = [candidateWgs84, candidateWgs84Swapped, candidateMerc, ...utmCandidates];
        const centers = candidates.map(c => computeCenter(c));
        const dists = centers.map(distSq);
        // Pesos por heurística
        const weights = candidates.map((_, i) => 1);
        if (/4326|4674/i.test(crsName || '')) { weights[0] *= 0.6; weights[1] *= 0.8; }
        if (/3857|900913/i.test(crsName || '')) { weights[2] *= 0.6; }
        if (/327\d{2}|UTM/i.test(crsName || '') || looksLikeUTM) {
          for (let i = 3; i < weights.length; i++) weights[i] *= 0.5; // favorecer UTM
        }
        let bestIdx = 0; let bestVal = dists[0] * weights[0];
        for (let i = 1; i < dists.length; i++) {
          const v = dists[i] * weights[i];
          if (v < bestVal) { bestVal = v; bestIdx = i; }
        }
        const best = candidates[bestIdx] || [];
        features = best.length ? best : (candidateWgs84.length ? candidateWgs84 : (candidateWgs84Swapped.length ? candidateWgs84Swapped : (utmCandidates[0] || candidateMerc)));
      } catch {
        try {
          features = geoJsonFormat.readFeatures(gjNorm, {
            featureProjection: 'EPSG:3857',
            dataProjection: 'EPSG:4326'
          });
        } catch { features = []; }
      }
      const isPoint = features.length > 0 && features.slice(0, Math.min(5, features.length)).every(f => f.getGeometry()?.getType() === 'Point');
      const shouldCluster = isPoint && features.length > 5000;

      const vectorSource = new VectorSource({ features });

      if (shouldCluster) {
        const clusterDistanceDefault = 40;
        const clusterSource = new Cluster({ distance: clusterDistanceDefault, source: vectorSource });
        const styleCache: Record<number, Style> = {};
        const clusterStyleFn = (feature: any) => {
          const size = feature.get('features')?.length || 1;
          if (!styleCache[size]) {
            const radius = Math.max(6, Math.min(24, 6 + Math.log(size + 1) * 4));
            styleCache[size] = new Style({
              image: new CircleStyle({
                radius,
                fill: new Fill({ color: 'rgba(220, 38, 38, 0.7)' }),
                stroke: new Stroke({ color: '#ffffff', width: 2 })
              }),
              text: size > 1 ? new TextStyle({
                text: String(size),
                fill: new Fill({ color: '#ffffff' }),
                stroke: new Stroke({ color: 'rgba(0,0,0,0.6)', width: 2 })
              }) : undefined
            });
          }
          return styleCache[size];
        };
        newOlLayer = new VectorLayer({
          source: clusterSource as unknown as VectorSource,
          style: clusterStyleFn,
          visible: layerData.visible,
          opacity: layerData.opacity,
          zIndex: 50,
          declutter: true,
        });
        clusterSourceCacheRef.current[id] = clusterSource;
      } else {
        newOlLayer = new VectorLayer({
          source: vectorSource,
          style: new Style({
            fill: new Fill({ color: 'rgba(255, 0, 0, 0.2)' }),
            stroke: new Stroke({ color: '#ff0000', width: 2 }),
            image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ff0000' }) }),
          }),
          visible: layerData.visible,
          opacity: layerData.opacity,
          zIndex: 50,
          declutter: true,
        });
      }
      newOlLayer.set('name', layerData.name);
      // Enriquecer metadado com contagem
      layerData = { ...layerData, featureCount: features.length } as any;
    }
    // OSM é uma camada base, não precisa ser adicionada dinamicamente aqui
    // Ela já está no mapa por padrão
    
    if (newOlLayer) {
      map.addLayer(newOlLayer);
      layerCacheRef.current[id] = newOlLayer;
      
      // Retorna o objeto completo para ser adicionado ao estado
      return { ...layerData, id } as AppLayer;
    }
    
    return null;
  }, []);

  // Inicializa o mapa OpenLayers
  useEffect(() => {
    if (!mapRef.current) return;

    // Criar a view
    const view = new View({
      center: fromLonLat(defaultCenter),
      zoom: 12,
    });

    // Criar fonte e camada vetorial para edição (sempre existente)
    const editSource = new VectorSource();
    editVectorSourceRef.current = editSource;
    
    const editLayer = new VectorLayer({
      source: editSource,
      style: new Style({
        fill: new Fill({
          color: 'rgba(0, 0, 255, 0.3)', // Azul com transparência
        }),
        stroke: new Stroke({
          color: '#0000ff', // Azul
          width: 3,
        }),
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({
            color: '#0000ff', // Azul
          }),
          stroke: new Stroke({
            color: '#ffffff', // Branco
            width: 2,
          }),
        }),
      }),
      zIndex: 1000
    });
    editVectorLayerRef.current = editLayer;

    // Criar fonte e camada vetorial para medição (sempre existente)
    const measureSource = new VectorSource();
    measureVectorSourceRef.current = measureSource;
    
    const measureLayer = new VectorLayer({
      source: measureSource,
      style: new Style({
        fill: new Fill({
          color: 'rgba(255, 255, 255, 0.2)',
        }),
        stroke: new Stroke({
          color: '#ffcc33',
          width: 2,
          lineDash: [10, 10],
        }),
        image: new CircleStyle({
          radius: 5,
          stroke: new Stroke({
            color: 'rgba(0, 0, 0, 0.7)',
          }),
          fill: new Fill({
            color: 'rgba(255, 255, 255, 0.2)',
          }),
        }),
      }),
      zIndex: 900 // Abaixo da edição, mas acima de outras camadas
    });
    measureVectorLayerRef.current = measureLayer;

    // Criar o mapa
    const map = new Map({
      target: mapRef.current,
      layers: [
        (() => {
          const base = new TileLayer({
            source: new OSM({ crossOrigin: 'anonymous' }),
            zIndex: 0
          });
          baseLayerRef.current = base;
          return base;
        })(),
        measureLayer, // Camada de medição
        editLayer // Camada de edição
      ],
      view: view,
      controls: defaultControls({
        attributionOptions: { collapsed: false },
        zoom: false,
        rotate: false,
      }).extend([
        new ScaleLine(),
        new FullScreen(),
        new MousePosition({
          coordinateFormat: createStringXY(5),
          projection: 'EPSG:4326'
        })
      ]),
    });
    mapInstance.current = map;

    // Listener para atualizar o zoomLevel
    const onResolutionChange = () => {
      const currentZoom = view.getZoom() || 0;
      const appZoom = Math.round((currentZoom / 12) * 100);
      setZoomLevel(Math.max(25, Math.min(200, appZoom)));
    };
    view.on('change:resolution', onResolutionChange);

    // Listeners para ferramentas
    const handleEditTool = (event: Event) => {
      const geometryType = (event as CustomEvent).detail as GeometryType | null;
      setEditGeometryType(geometryType);
      if (geometryType) {
        setEditActive(true);
        // Desativar outras ferramentas
        setMeasureActive(false);
        setMeasureType(null);
        setMeasureResult(null);
        if (measureVectorSourceRef.current) {
          measureVectorSourceRef.current.clear();
        }
        setSelectedFeature(null);
        setSelectedFeatureAttributes(null);
        if (selectInteractionRef.current) {
          map.removeInteraction(selectInteractionRef.current);
          selectInteractionRef.current = null;
        }
      } else {
        setEditActive(false);
      }
    };
    window.addEventListener('editTool', handleEditTool);
    
    const handleMeasureTool = (event: Event) => {
      const tool = (event as CustomEvent).detail as MeasureType;
      setMeasureType(tool);
      if (tool) {
        setMeasureActive(true);
        // Desativar edição e seleção quando a medição é ativada
        setEditActive(false);
        setEditGeometryType(null);
        if (editVectorSourceRef.current) {
          editVectorSourceRef.current.clear();
        }
        setSelectedFeature(null);
        setSelectedFeatureAttributes(null);
        if (selectInteractionRef.current) {
          map.removeInteraction(selectInteractionRef.current);
          selectInteractionRef.current = null;
        }
      } else {
        setMeasureActive(false);
        setMeasureResult(null);
        if (measureVectorSourceRef.current) {
          measureVectorSourceRef.current.clear();
        }
      }
    };
    window.addEventListener('measureTool', handleMeasureTool);
    
    const handleImportEditLayer = () => {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    };
    window.addEventListener('importEditLayer', handleImportEditLayer);

    // Cleanup
    return () => {
      window.removeEventListener('editTool', handleEditTool);
      window.removeEventListener('measureTool', handleMeasureTool);
      window.removeEventListener('importEditLayer', handleImportEditLayer);
      if (mapInstance.current) {
        mapInstance.current.setTarget(undefined);
      }
    };
  }, []);

  // useEffect para CARREGAR dados salvos das CAMADAS GERENCIADAS na inicialização
  useEffect(() => {
    try {
      const savedLayersData = localStorage.getItem(MANAGED_LAYERS_STORAGE_KEY);
      if (savedLayersData) {
        const parsedLayers: AppLayer[] = JSON.parse(savedLayersData);
        if (Array.isArray(parsedLayers)) {
          console.log(`Carregadas ${parsedLayers.length} camadas do localStorage.`);
          setLayers(parsedLayers);
          // As camadas serão realmente adicionadas ao mapa pelo useEffect abaixo ([layers, addLayerToMap])
        }
      } else {
        console.log("Nenhum dado de camadas gerenciadas encontrado no localStorage.");
      }
    } catch (error) {
      console.error("Erro ao carregar dados de camadas gerenciadas do localStorage:", error);
      alert("Erro ao carregar configurações de camadas salvas.");
    }
  }, []); // Dependência vazia - só roda na montagem

  // useEffect para CRIAR e DESTRUIR camadas (incluindo ao carregar do localStorage)
  useEffect(() => {
    if (!mapInstance.current) return;

    const map = mapInstance.current;
    const currentLayerIds = layers.map(l => l.id);
    const cachedLayerIds = Object.keys(layerCacheRef.current);
    
    // Remover camadas que não estão mais no estado
    const layersToRemove = cachedLayerIds.filter(id => !currentLayerIds.includes(id));
    layersToRemove.forEach(id => {
      const layer = layerCacheRef.current[id];
      if (layer) {
        map.removeLayer(layer);
        delete layerCacheRef.current[id];
      }
    });
    
    // Adicionar camadas que não estão no cache
    const layersToAdd = layers.filter(l => !cachedLayerIds.includes(l.id));
    (async () => {
      for (const layerData of layersToAdd) {
        if (layerData.type === 'GeoJSON') {
          // sempre tentar recuperar do IDB; se retornar null, usar o que estiver no objeto
          let data = layerData.geoJsonData;
          try { data = data ?? (await idbGetGeoJSON(layerData.id) as any); } catch {}
          if (data) {
            // Pré-simplificação opcional para linhas/polígonos muito pesados
            try {
              const gj: any = data;
              const total = Array.isArray(gj?.features) ? gj.features.length : 0;
              const hasOnlyPoints = total > 0 && gj.features.slice(0, Math.min(50, total)).every((f: any) => f?.geometry?.type === 'Point');
              let geoDataToUse = data as any;
              if (total > 5000 && !hasOnlyPoints) {
                const crsName: string | undefined = gj?.crs?.properties?.name || gj?.crs?.name;
                const first = (() => { try { const g=gj.features[0]?.geometry; if(!g) return null; const t=g.type,c=g.coordinates; if(t==='Point') return c; if(t==='MultiPoint'||t==='LineString') return c[0]; if(t==='MultiLineString'||t==='Polygon') return c[0][0]; if(t==='MultiPolygon') return c[0][0][0]; return null;} catch{return null;} })();
                const looksLike3857 = !!((crsName && /3857|900913/i.test(crsName)) || (first && (Math.abs(first[0])>180 || Math.abs(first[1])>90)));
                const fmt = new GeoJSON();
                let feats: any[] = [];
                try {
                  feats = fmt.readFeatures(gj, { featureProjection:'EPSG:3857', dataProjection: looksLike3857 ? 'EPSG:3857' : 'EPSG:4326' });
                } catch { feats = []; }
                if (feats.length > 0) {
                  const tol = total > 20000 ? 10 : 5; // metros
                  try {
                    const simplifiedFeats = await runUnaryOperationInWorker(feats, 'simplify', { tolerance: tol, highQuality: false });
                    const outObj = fmt.writeFeaturesObject(simplifiedFeats as any, { featureProjection:'EPSG:3857', dataProjection:'EPSG:4326' });
                    geoDataToUse = outObj;
                  } catch {}
                }
              }
              const enriched = addLayerToMap({ ...layerData, geoJsonData: geoDataToUse });
              if (enriched && (enriched as any).featureCount && layerData.featureCount !== (enriched as any).featureCount) {
                setLayers(prev => prev.map(l => l.id === layerData.id ? { ...l, featureCount: (enriched as any).featureCount } : l));
              }
            } catch {
              const enriched = addLayerToMap({ ...layerData, geoJsonData: data });
              if (enriched && (enriched as any).featureCount && layerData.featureCount !== (enriched as any).featureCount) {
                setLayers(prev => prev.map(l => l.id === layerData.id ? { ...l, featureCount: (enriched as any).featureCount } : l));
              }
            }
          }
          continue;
        }
        const enriched = addLayerToMap(layerData);
        if (enriched && (enriched as any).featureCount && layerData.featureCount !== (enriched as any).featureCount) {
          setLayers(prev => prev.map(l => l.id === layerData.id ? { ...l, featureCount: (enriched as any).featureCount } : l));
        }
      }
    })();
    
    // Salvar metadados no localStorage e objetos GeoJSON pesados no IndexedDB
    (async () => {
      try {
        const lightLayers = await Promise.all(layers.map(async (l) => {
          if (l.type === 'GeoJSON' && (l as any).geoJsonData) {
            try { await idbSetGeoJSON(l.id, (l as any).geoJsonData as object); } catch (_) {}
            const { geoJsonData, ...rest } = l as any;
            return rest as AppLayer;
          }
          return l;
        }));
        localStorage.setItem(MANAGED_LAYERS_STORAGE_KEY, JSON.stringify(lightLayers));
      } catch (error) {
        console.error("Erro ao salvar camadas (IDB/localStorage):", error);
      }
    })();
    
  }, [layers, addLayerToMap]);

  // useEffect para ATUALIZAR VISIBILIDADE e OPACIDADE
  useEffect(() => {
    layers.forEach(layerData => {
      const olLayer = layerCacheRef.current[layerData.id];
      if (olLayer) {
        if (olLayer.getVisible() !== layerData.visible) {
          olLayer.setVisible(layerData.visible);
        }
        if (olLayer.getOpacity() !== layerData.opacity) {
          olLayer.setOpacity(layerData.opacity);
        }
      }
    });
  }, [layers.map(l => `${l.id}-${l.visible}-${l.opacity}`).join(',')]);

  // Efeito para ativar/desativar a ferramenta de seleção
  useEffect(() => {
    if (!mapInstance.current) return;

    const map = mapInstance.current;

    // Remover interação de seleção anterior
    if (selectInteractionRef.current) {
      map.removeInteraction(selectInteractionRef.current);
      selectInteractionRef.current = null;
    }

    // Se a edição e a medição não estiverem ativas, configurar a interação de seleção
    if (!editActive && !measureActive) {
      const select = new Select({
        condition: click,
        layers: (layer) => {
          return layer instanceof VectorLayer;
        },
        style: new Style({
          fill: new Fill({
            color: 'rgba(0, 255, 0, 0.2)', // Verde com transparência
          }),
          stroke: new Stroke({
            color: '#00ff00', // Verde
            width: 4,
          }),
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({
              color: '#00ff00', // Verde
            }),
            stroke: new Stroke({
              color: '#ffffff', // Branco
              width: 2,
            }),
          }),
        }),
      });
      selectInteractionRef.current = select;
      map.addInteraction(select);

      select.on('select', function(e) {
        setSelectHint(null);
        const selected = e.selected[0];
        if (!selected) {
          setSelectedFeature(null);
          setSelectedFeatureAttributes(null);
          return;
        }

        // Se for um cluster com múltiplas features, apenas orienta para aproximar
        const clustered = selected.get('features');
        if (Array.isArray(clustered)) {
          if (clustered.length > 1) {
            setSelectHint('Múltiplos elementos agrupados. Aproxime o mapa para selecionar um único.');
            // limpa seleção visual
            try { selectInteractionRef.current?.getFeatures().clear(); } catch {}
            setSelectedFeature(null);
            setSelectedFeatureAttributes(null);
            return;
          } else if (clustered.length === 1) {
            // usar a feature original
            const base = clustered[0];
            setSelectedFeature(base);
            const raw = base.getProperties();
            const props: Record<string, any> = {};
            Object.keys(raw).forEach(key => {
              if (key === 'geometry') return;
              const val = raw[key];
              props[key] = formatAttributeValue(val);
            });
            setSelectedFeatureAttributes(props);
            return;
          }
        }

        // Não é cluster: usar a própria feature
        setSelectedFeature(selected);
        const raw = selected.getProperties();
        const props: Record<string, any> = {};
        Object.keys(raw).forEach(key => {
          if (key === 'geometry') return;
          const val = raw[key];
          props[key] = formatAttributeValue(val);
        });
        setSelectedFeatureAttributes(props);
      });
    }
    
    return () => {
      if (selectInteractionRef.current) {
        map.removeInteraction(selectInteractionRef.current);
        selectInteractionRef.current = null;
      }
    };
  }, [editActive, measureActive]);

  // Efeito para ativar/desativar a ferramenta de medição
  useEffect(() => {
    if (!mapInstance.current || !measureVectorSourceRef.current) return;

    const map = mapInstance.current;
    const source = measureVectorSourceRef.current;

    // Remover interação de medição anterior
    if (measureDrawRef.current) {
      map.removeInteraction(measureDrawRef.current);
      measureDrawRef.current = null;
    }
    if (measureListenerRef.current) {
      unByKey(measureListenerRef.current);
      measureListenerRef.current = null;
    }

    // Se a medição estiver ativa, configurar a interação
    if (measureActive && measureType) {
      setMeasureResult(null);
      source.clear();

      const type = measureType === 'line' ? 'LineString' : 'Polygon';
      const draw = new Draw({
        source: source,
        type: type,
        style: new Style({
          fill: new Fill({
            color: 'rgba(255, 255, 255, 0.2)',
          }),
          stroke: new Stroke({
            color: 'rgba(0, 0, 0, 0.5)',
            lineDash: [10, 10],
            width: 2,
          }),
          image: new CircleStyle({
            radius: 5,
            stroke: new Stroke({
              color: 'rgba(0, 0, 0, 0.7)',
            }),
            fill: new Fill({
              color: 'rgba(255, 255, 255, 0.2)',
            }),
          }),
        }),
      });
      measureDrawRef.current = draw;
      map.addInteraction(draw);

      // Listener para atualizar a medição enquanto o usuário desenha
      measureListenerRef.current = draw.on('drawstart', function(evt) {
        setMeasureResult(null);
        
        const sketch = evt.feature;
        
        let tooltipCoord: number[] = [];
        const listener = sketch.getGeometry()!.on('change', function(evt) {
          const geom = evt.target;
          let output: string;
          if (geom instanceof Polygon) {
            output = formatArea(geom);
            tooltipCoord = geom.getInteriorPoint().getCoordinates();
          } else if (geom instanceof LineString) {
            output = formatLength(geom);
            tooltipCoord = geom.getLastCoordinate();
          } else {
            output = '';
          }
          setMeasureResult(output);
        });
        
        sketch.on('change', function() {
          unByKey(listener);
        });
      });

      // Listener para finalizar a medição
      draw.on('drawend', function() {
        // A medição final já está no state measureResult
      });
    }

    // Cleanup do efeito
    return () => {
      if (measureDrawRef.current) {
        map.removeInteraction(measureDrawRef.current);
      }
      if (measureListenerRef.current) {
        unByKey(measureListenerRef.current);
      }
    };
  }, [measureActive, measureType]);

  // Efeito para ativar/desativar a ferramenta de edição
  useEffect(() => {
    if (!mapInstance.current || !editVectorSourceRef.current) return;

    const map = mapInstance.current;

    // Remover interação de edição anterior
    if (drawInteractionRef.current) {
      map.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }

    // Se a edição estiver ativa, configurar a interação
    if (editActive && editGeometryType) {
      const draw = new Draw({
        source: editVectorSourceRef.current,
        type: editGeometryType,
        style: new Style({
          fill: new Fill({
            color: 'rgba(0, 0, 255, 0.3)', // Azul com transparência
          }),
          stroke: new Stroke({
            color: '#0000ff', // Azul
            width: 3,
          }),
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({
              color: '#0000ff', // Azul
            }),
            stroke: new Stroke({
              color: '#ffffff', // Branco
              width: 2,
            }),
          }),
        }),
      });
      drawInteractionRef.current = draw;
      map.addInteraction(draw);

      // Habilitar Modify + Snap para a camada de edição
      const modify = new Modify({ source: editVectorSourceRef.current! });
      const snap = new Snap({ source: editVectorSourceRef.current! });
      modifyInteractionRef.current = modify;
      snapInteractionRef.current = snap;
      map.addInteraction(modify);
      map.addInteraction(snap);
    }

    // Cleanup do efeito
    return () => {
      if (drawInteractionRef.current) {
        map.removeInteraction(drawInteractionRef.current);
        drawInteractionRef.current = null;
      }
      if (modifyInteractionRef.current) {
        map.removeInteraction(modifyInteractionRef.current);
        modifyInteractionRef.current = null;
      }
      if (snapInteractionRef.current) {
        map.removeInteraction(snapInteractionRef.current);
        snapInteractionRef.current = null;
      }
    };
  }, [editActive, editGeometryType]);

  // Listener para abrir painel de geoprocessamento e exportar camada de edição
  useEffect(() => {
    const handleOpenGeo = () => setIsGeoPanelOpen(true);
    const handleOpenAnalytics = () => setIsAnalyticsOpen(true);
    const handleBasemapToggle = () => toggleBaseMap();
    const handleExportEdit = () => {
      exportEditLayerToGeoJSON();
    };
    const handleOpenPrint = () => setIsPrintDialogOpen(true);
    const handleOpenComposer = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setComposerSettings(detail);
      // coletar camadas visíveis e mpp
      try {
        const visible = layers.filter(l => l.visible);
        const layerInfos = visible.map(l => ({
          id: l.id,
          name: l.name,
          type: l.type,
          url: l.url,
          layerName: l.layerName
        }));
        setComposerLayers(layerInfos);
        if (mapInstance.current) {
          const res = mapInstance.current.getView().getResolution() || null;
          setComposerMetersPerPixel(res);
        }
      } catch {}
      captureMapAsImage().then((dataUrl) => {
        setComposerImage(dataUrl);
        setIsComposerVisible(true);
        // Se ação for print, chamamos window.print após próximo tick
        setTimeout(() => {
          if (detail.action === 'print') {
            window.print();
          }
        }, 100);
      });
    };
    const handleThemeChange = (e: Event) => {
      const bg = (e as CustomEvent).detail as string;
      setIsDarkTheme(bg === '#0f172a');
    };
    const handleFocusLayerManager = () => {
      setHighlightLayerManager(true);
      setTimeout(() => setHighlightLayerManager(false), 1200);
    };
    window.addEventListener('openGeoprocessing', handleOpenGeo);
    window.addEventListener('toggleBaseMap', handleBasemapToggle);
    window.addEventListener('exportEditLayer', handleExportEdit);
    window.addEventListener('openPrintDialog', handleOpenPrint);
    window.addEventListener('openPrintComposer', handleOpenComposer as EventListener);
    window.addEventListener('themeChange', handleThemeChange as EventListener);
    window.addEventListener('focusLayerManager', handleFocusLayerManager);
    window.addEventListener('openAnalytics', handleOpenAnalytics);
    // novos eventos
    const handleOpenHelp = () => setIsHelpOpen(true);
    const handleOpenSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setSettingsType((detail.type === 'map' || detail.type === 'general') ? detail.type : 'general');
      setIsSettingsOpen(true);
    };
    const handleExportMapPng = () => { exportMapPNG(); };
    const handleResetViewEvent = () => { handleResetView(); };
    const handleToggleIdentify = (e: Event) => {
      const val = (e as CustomEvent).detail as boolean;
      setIdentifyActive(!!val);
      setIdentifyResults(null);
    };
    window.addEventListener('openHelpDialog', handleOpenHelp);
    window.addEventListener('openSettingsDialog', handleOpenSettings as EventListener);
    window.addEventListener('exportMapPNG', handleExportMapPng);
    window.addEventListener('resetView', handleResetViewEvent);
    window.addEventListener('toggleIdentify', handleToggleIdentify as EventListener);
    // limpar ferramentas (desativar edição, medição e seleção)
    const handleClearTools = () => {
      setEditActive(false);
      setEditGeometryType(null);
      setMeasureActive(false);
      setMeasureType(null);
      setMeasureResult(null);
      try { measureVectorSourceRef.current?.clear(); } catch {}
      try { editVectorSourceRef.current?.clear(); } catch {}
      setSelectedFeature(null);
      setSelectedFeatureAttributes(null);
      if (selectInteractionRef.current && mapInstance.current) {
        try { selectInteractionRef.current.getFeatures().clear(); } catch {}
        mapInstance.current.removeInteraction(selectInteractionRef.current);
        selectInteractionRef.current = null;
      }
    };
    window.addEventListener('clearTools', handleClearTools);
    return () => {
      window.removeEventListener('openGeoprocessing', handleOpenGeo);
      window.removeEventListener('toggleBaseMap', handleBasemapToggle);
      window.removeEventListener('exportEditLayer', handleExportEdit);
      window.removeEventListener('openPrintDialog', handleOpenPrint);
      window.removeEventListener('openPrintComposer', handleOpenComposer as EventListener);
      window.removeEventListener('themeChange', handleThemeChange as EventListener);
      window.removeEventListener('focusLayerManager', handleFocusLayerManager);
      window.removeEventListener('openAnalytics', handleOpenAnalytics);
      window.removeEventListener('openHelpDialog', handleOpenHelp);
      window.removeEventListener('openSettingsDialog', handleOpenSettings as EventListener);
      window.removeEventListener('exportMapPNG', handleExportMapPng);
      window.removeEventListener('resetView', handleResetViewEvent);
      window.removeEventListener('toggleIdentify', handleToggleIdentify as EventListener);
      window.removeEventListener('clearTools', handleClearTools);
    };
  }, []);

  // Geocodificação simples (Nominatim) para searchLocation
  useEffect(() => {
    const onSearch = async (e: Event) => {
      const q = (e as CustomEvent).detail as string;
      if (!q || !mapInstance.current) return;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
        const resp = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } });
        const arr = await resp.json();
        if (Array.isArray(arr) && arr.length > 0) {
          const lat = parseFloat(arr[0].lat);
          const lon = parseFloat(arr[0].lon);
          const view = mapInstance.current.getView();
          view.animate({ center: fromLonLat([lon, lat]), zoom: 15, duration: 600 });
        } else {
          alert('Local não encontrado.');
        }
      } catch {
        alert('Erro ao consultar geocodificação.');
      }
    };
    window.addEventListener('searchLocation', onSearch as EventListener);
    return () => window.removeEventListener('searchLocation', onSearch as EventListener);
  }, []);

  // Efeito para CARREGAR dados salvos do localStorage na inicialização (CAMADA DE EDIÇÃO)
  useEffect(() => {
    if (!editVectorSourceRef.current) return;
    
    const source = editVectorSourceRef.current;
    
    try {
      const savedData = localStorage.getItem(EDIT_LAYER_STORAGE_KEY);
      if (savedData) {
        const geoJsonObj = JSON.parse(savedData);
        if (geoJsonObj && geoJsonObj.features && Array.isArray(geoJsonObj.features)) {
          if (geoJsonObj.features.length > 0) {
            const geoJsonFormat = new GeoJSON();
            const features = geoJsonFormat.readFeatures(geoJsonObj, {
              featureProjection: 'EPSG:3857',
              dataProjection: 'EPSG:4326'
            });
            source.addFeatures(features);
            console.log(`Carregadas ${features.length} features do localStorage.`);
          } else {
            console.log("Nenhuma feature salva encontrada no localStorage.");
          }
        }
      } else {
        console.log("Nenhum dado salvo encontrado no localStorage.");
      }
    } catch (error) {
      console.error("Erro ao carregar dados salvos do localStorage:", error);
      alert("Erro ao carregar dados salvos. Alguns dados podem ter sido perdidos.");
    }
  }, []); // Dependência vazia - só roda na montagem

  // Efeito para SALVAR dados automaticamente quando a camada de edição muda
  useEffect(() => {
    if (!editVectorSourceRef.current) return;
    
    const source = editVectorSourceRef.current;
    
    // Remover listeners anteriores
    editSourceListenersRef.current.forEach(listener => {
      if (listener) {
        unByKey(listener);
      }
    });
    editSourceListenersRef.current = [];

    // Função de salvamento com debounce
    let saveTimer: NodeJS.Timeout | null = null;
    const scheduleSave = () => {
      setIsSaving(true);
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      saveTimer = setTimeout(() => {
        try {
          const features = source.getFeatures();
          if (features.length > 0) {
            const geoJsonFormat = new GeoJSON();
            const geoJsonObj = geoJsonFormat.writeFeaturesObject(features, {
              featureProjection: 'EPSG:3857',
              dataProjection: 'EPSG:4326'
            });
            localStorage.setItem(EDIT_LAYER_STORAGE_KEY, JSON.stringify(geoJsonObj));
            const now = new Date().toLocaleTimeString();
            setLastSaved(now);
            console.log(`[${now}] Salvas ${features.length} features no localStorage.`);
          } else {
            // Se não houver features, remover o item do localStorage
            localStorage.removeItem(EDIT_LAYER_STORAGE_KEY);
            setLastSaved(null);
            console.log("Nenhuma feature para salvar. Item removido do localStorage.");
          }
        } catch (error) {
          console.error("Erro ao salvar dados no localStorage:", error);
          alert("Erro ao salvar dados. Certifique-se de que há espaço suficiente no armazenamento local.");
        } finally {
          setIsSaving(false);
        }
      }, 1000); // Aguardar 1 segundo após a última mudança
      
      // Limpar o timer anterior se houver uma nova mudança
      return () => {
        if (saveTimer) {
          clearTimeout(saveTimer);
        }
      };
    };
    
    // Registrar listeners para todos os tipos de eventos relevantes
    // Lida com o fato de que `on()` pode retornar um array de EventsKey
    const addListener = (eventType: string) => {
      const listenerOrArray = source.on(eventType as any, scheduleSave);
      if (Array.isArray(listenerOrArray)) {
        // Se for um array, adicionamos cada item individualmente
        editSourceListenersRef.current.push(...listenerOrArray);
      } else {
        // Se for um único EventsKey
        editSourceListenersRef.current.push(listenerOrArray);
      }
    };
    
    addListener('addfeature');
    addListener('removefeature');
    addListener('changefeature');

    // Cleanup do efeito
    return () => {
      editSourceListenersRef.current.forEach(listener => {
        if (listener) {
          unByKey(listener);
        }
      });
      editSourceListenersRef.current = [];
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
    };
  }, []);

  // Funções de zoom
  const handleZoomIn = () => {
    if (!mapInstance.current) return;
    const view = mapInstance.current.getView();
    const currentZoom = view.getZoom() || 0;
    view.setZoom(Math.min(currentZoom + 1, 24));
  };

  // Formatação de atributos diversos
  const formatAttributeValue = (val: any): string => {
    if (val == null) return '';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
    if (typeof val === 'string') {
      // datas ISO
      if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
        const d = new Date(val);
        if (!isNaN(d as any)) return d.toLocaleString();
      }
      return val;
    }
    try { return JSON.stringify(val); } catch { return String(val); }
  };

  const handleZoomOut = () => {
    if (!mapInstance.current) return;
    const view = mapInstance.current.getView();
    const currentZoom = view.getZoom() || 0;
    view.setZoom(Math.max(currentZoom - 1, 2));
  };

  // Troca de mapa base
  const toggleBaseMap = () => {
    if (!baseLayerRef.current) return;
    const current = baseMap;
    const next = current === 'OSM' ? 'Topo' : 'OSM';
    setBaseMap(next);
    if (next === 'OSM') {
      baseLayerRef.current.setSource(new OSM({ crossOrigin: 'anonymous' }));
    } else {
      baseLayerRef.current.setSource(new XYZ({
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
        crossOrigin: 'anonymous'
      }));
    }
  };

  const handleResetView = () => {
    if (mapInstance.current) {
      const view = mapInstance.current.getView();
      view.setCenter(fromLonLat(defaultCenter));
      view.setZoom(12);
      setZoomLevel(100);
    }
  };

  // Funções para gerenciar camadas
  const addLayer = (newLayer: Omit<AppLayer, "id">) => {
    const layerWithId = addLayerToMap(newLayer);
    if (layerWithId) {
      // Atualiza o estado React, o que acionará o useEffect de criação/destruição
      setLayers(prev => [...prev, layerWithId]);
      // Persistir imediatamente GeoJSON pesado no IndexedDB
      if (layerWithId.type === 'GeoJSON' && (layerWithId as any).geoJsonData) {
        try { idbSetGeoJSON(layerWithId.id, (layerWithId as any).geoJsonData as object); } catch {}
      }
      // Dar zoom automático para a extensão da camada adicionada
      try { zoomToLayer(layerWithId.id); } catch {}
    }
  };

  const removeLayer = (id: string) => {
    const target = layers.find(l => l.id === id);
    if (target?.type === 'GeoJSON') {
      idbDeleteGeoJSON(id).catch(() => {});
    }
    setLayers(prev => prev.filter(layer => layer.id !== id));
    // A remoção real do mapa acontece no useEffect [layers, ...]
  };

  const toggleLayerVisibility = (id: string) => {
    setLayers(prev => 
      prev.map(layer => 
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      )
    );
  };

  const changeLayerOpacity = (id: string, opacity: number) => {
    setLayers(prev => 
      prev.map(layer => 
        layer.id === id ? { ...layer, opacity } : layer
      )
    );
  };

  const moveLayerUp = (id: string) => {
    setLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index <= 0) return prev;
      const arr = [...prev];
      const [item] = arr.splice(index, 1);
      arr.splice(index - 1, 0, item);
      // Atualizar zIndex coerente: reatribuir por ordem
      applyZIndexAccordingToOrder(arr);
      return arr;
    });
  };

  const moveLayerDown = (id: string) => {
    setLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index === -1 || index >= prev.length - 1) return prev;
      const arr = [...prev];
      const [item] = arr.splice(index, 1);
      arr.splice(index + 1, 0, item);
      applyZIndexAccordingToOrder(arr);
      return arr;
    });
  };

  const applyZIndexAccordingToOrder = (ordered: AppLayer[]) => {
    // Base em 10.. e vetores em 50.. foram default; recalibramos incrementalmente
    ordered.forEach((l, i) => {
      const olLayer = layerCacheRef.current[l.id];
      if (olLayer) {
        olLayer.setZIndex(100 + i);
      }
    });
  };

  const zoomToLayer = (id: string) => {
    if (!mapInstance.current) return;
    const olLayer = layerCacheRef.current[id];
    if (olLayer && olLayer instanceof VectorLayer) {
      const srcAny: any = (olLayer as VectorLayer<any>).getSource();
      let extent: any = undefined;
      let features: any[] = [];
      if (srcAny && typeof srcAny.getSource === 'function') {
        // Cluster source
        const inner = srcAny.getSource();
        features = inner?.getFeatures?.() || [];
      } else {
        features = srcAny?.getFeatures?.() || [];
      }
      if (features.length > 0) {
        const geom = features[0].getGeometry();
        extent = geom?.getExtent?.();
        for (let i = 1; i < features.length; i++) {
          const g = features[i].getGeometry();
          if (!g) continue;
          if (!extent) extent = g.getExtent();
          else {
            const e = g.getExtent();
            extent[0] = Math.min(extent[0], e[0]);
            extent[1] = Math.min(extent[1], e[1]);
            extent[2] = Math.max(extent[2], e[2]);
            extent[3] = Math.max(extent[3], e[3]);
          }
        }
      }
      if (extent && extent.every((v: number) => isFinite(v))) {
        mapInstance.current.getView().fit(extent, { maxZoom: 18, duration: 500, padding: [40,40,40,40] });
      }
    }
  };

  // Importar features para a camada de edição
  const importGeoJSONToEditLayer = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editVectorSourceRef.current) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geoJsonText = e.target?.result as string;
        const geoJsonObj = JSON.parse(geoJsonText);
        
        const geoJsonFormat = new GeoJSON();
        const features = geoJsonFormat.readFeatures(geoJsonObj, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326'
        });
        
        // Limpar e adicionar novas features - com verificação
        const source = editVectorSourceRef.current;
        if (source) {
            source.clear();
            source.addFeatures(features);
            alert(`Importadas ${features.length} features para a camada de edição.`);
        } else {
            console.error("Fonte da camada de edição se tornou nula durante a importação.");
            alert("Erro inesperado ao importar: A camada de edição não está mais disponível.");
        }
        
      } catch (error) {
        console.error("Erro ao importar GeoJSON:", error);
        alert("Erro ao ler o arquivo GeoJSON. Verifique se o arquivo é válido.");
      } finally {
        // Limpar o input para permitir importar o mesmo arquivo novamente
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  // Exportar features da camada de edição
  const exportEditLayerToGeoJSON = () => {
    if (!editVectorSourceRef.current) return;

    const features = editVectorSourceRef.current.getFeatures();
    if (features.length === 0) {
      alert("Não há features para exportar na camada de edição.");
      return;
    }

    const geoJsonFormat = new GeoJSON();
    const geoJsonObj = geoJsonFormat.writeFeaturesObject(features, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326'
    });

    const geoJsonStr = JSON.stringify(geoJsonObj, null, 2);
    const blob = new Blob([geoJsonStr], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `features-editadas-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const captureMapAsImage = async (): Promise<string | undefined> => {
    if (!mapInstance.current) return undefined;
    const map = mapInstance.current;
    const target = map.getTargetElement() as HTMLElement;
    if (!target) return undefined;
    const canvasList = target.querySelectorAll('canvas');
    const width = target.clientWidth;
    const height = target.clientHeight;
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) return undefined;
    canvasList.forEach((c: any) => {
      try { ctx.drawImage(c, 0, 0); } catch (_) {}
    });
    return out.toDataURL('image/png');
  };

  // Exportar mapa como PNG
  const exportMapPNG = async () => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;
    const target = map.getTargetElement() as HTMLElement;
    if (!target) return;
    try {
      // usar HTMLCanvasElement de composição das camadas
      const canvasList = target.querySelectorAll('canvas');
      if (canvasList.length === 0) {
        alert('Canvas do mapa não encontrado.');
        return;
      }
      const width = target.clientWidth;
      const height = target.clientHeight;
      const out = document.createElement('canvas');
      out.width = width; out.height = height;
      const ctx = out.getContext('2d');
      if (!ctx) return;
      canvasList.forEach((c: any) => {
        try {
          ctx.drawImage(c, 0, 0);
        } catch (_) {}
      });
      const dataUrl = out.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `map-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Falha ao exportar o mapa como PNG:', e);
      alert('Falha ao exportar o mapa.');
    }
  };

  // Identify WMS (GetFeatureInfo)
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;
    const handler = (evt: any) => {
      if (!identifyActive) return;
      // encontrar a primeira camada WMS visível no cache (de cima para baixo)
      const ids = Object.keys(layerCacheRef.current);
      const visibleWms = ids
        .map(id => layerCacheRef.current[id])
        .filter(l => l && l.getVisible() && (l as any).getSource && ((l as any).getSource() instanceof TileWMS)) as any[];
      if (visibleWms.length === 0) return;
      const wmsLayer = visibleWms[visibleWms.length - 1];
      const source = wmsLayer.getSource() as TileWMS;
      const view = map.getView();
      const url = source.getFeatureInfoUrl(
        evt.coordinate,
        view.getResolution()!,
        view.getProjection(),
        { 'INFO_FORMAT': 'application/json' }
      );
      if (!url) return;
      (async () => {
        try {
          const r = await fetch(url);
          const ct = r.headers.get('Content-Type') || '';
          if (/json/i.test(ct)) {
            const json = await r.json();
            const feats = Array.isArray(json.features) ? json.features : [];
            const attrs = feats.map((f: any) => f.properties || {});
            setIdentifyResults(attrs);
            return;
          }
          // Fallback: tentar texto/HTML
          const text = await r.text();
          // tentativa simples de extrair pares chave=valor
          const lines = text.replace(/<[^>]+>/g, '\n').split(/\n+/).map(s => s.trim()).filter(Boolean);
          const out: Record<string, any> = {};
          lines.slice(0, 50).forEach((ln) => {
            const m = ln.match(/^([^:]+):\s*(.*)$/);
            if (m) out[m[1].trim()] = m[2].trim();
          });
          setIdentifyResults(Object.keys(out).length ? [out] : [{ aviso: 'Sem atributos legíveis no retorno.' }]);
        } catch {
          setIdentifyResults([{ erro: 'Falha no GetFeatureInfo' }]);
        }
      })();
    };
    map.on('singleclick', handler);
    return () => {
      map.un('singleclick', handler);
    };
  }, [identifyActive]);

  // Salvar manualmente (não é obrigatório, pois o auto-save já está ativo)
  const saveEditLayerManually = () => {
    if (!editVectorSourceRef.current) return;
    
    const source = editVectorSourceRef.current;
    const features = source.getFeatures();
    
    try {
      if (features.length > 0) {
        const geoJsonFormat = new GeoJSON();
        const geoJsonObj = geoJsonFormat.writeFeaturesObject(features, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326'
        });
        localStorage.setItem(EDIT_LAYER_STORAGE_KEY, JSON.stringify(geoJsonObj));
        const now = new Date().toLocaleTimeString();
        setLastSaved(now);
        alert(`Dados salvos manualmente às ${now}!`);
        console.log(`[${now}] Salvas ${features.length} features no localStorage (manual).`);
      } else {
        localStorage.removeItem(EDIT_LAYER_STORAGE_KEY);
        setLastSaved(null);
        alert("Nenhuma feature para salvar.");
        console.log("Nenhuma feature para salvar (manual).");
      }
    } catch (error) {
      console.error("Erro ao salvar dados manualmente:", error);
      alert("Erro ao salvar dados manualmente.");
    }
  };

  // Fechar popup de atributos
  const closeAttributePopup = () => {
    setSelectedFeature(null);
    setSelectedFeatureAttributes(null);
    if (selectInteractionRef.current) {
      selectInteractionRef.current.getFeatures().clear();
    }
  };

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

      {/* Troca de mapa base e Identify */}
      <div className="absolute top-4 left-24 bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2 z-10 flex items-center gap-2">
        <button
          onClick={toggleBaseMap}
          className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm flex items-center gap-2"
          title="Alternar mapa base (OSM/Topo)"
        >
          <FaGlobe className="w-4 h-4" /> {baseMap}
        </button>
        <button
          onClick={() => { setIdentifyActive((v) => !v); setIdentifyResults(null); }}
          className={`px-2 py-1 rounded text-sm flex items-center gap-2 ${identifyActive ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
          title="Ativar Identify (WMS GetFeatureInfo)"
        >
          <FaImage className="w-4 h-4" /> Identify
        </button>
        <button
          onClick={exportMapPNG}
          className="px-2 py-1 rounded text-sm flex items-center gap-2 bg-gray-200 hover:bg-gray-300"
          title="Exportar mapa como PNG"
        >
          <FaCamera className="w-4 h-4" /> PNG
        </button>
      </div>

      {/* Gerenciador de Camadas */}
      <LayerManager
        layers={layers}
        onAddLayer={addLayer}
        onRemoveLayer={removeLayer}
        onToggleVisibility={toggleLayerVisibility}
        onOpacityChange={changeLayerOpacity}
        onMoveLayerUp={moveLayerUp}
        onMoveLayerDown={moveLayerDown}
        onZoomToLayer={zoomToLayer}
        onClusterDistanceChange={(id, distance) => {
          const cluster = clusterSourceCacheRef.current[id];
          if (cluster) {
            cluster.setDistance(distance);
          }
        }}
        onToggleHeatmap={(id) => {
          const baseLayer = layerCacheRef.current[id];
          if (!mapInstance.current || !(baseLayer instanceof VectorLayer)) return;
          const map = mapInstance.current;
          const existing = heatmapCacheRef.current[id];
          if (existing) {
            map.removeLayer(existing);
            delete heatmapCacheRef.current[id];
            return;
          }
          const srcAny: any = (baseLayer as VectorLayer<any>).getSource();
          const src = (srcAny && typeof srcAny.getSource === 'function') ? srcAny.getSource() : srcAny;
          if (!src) return;
          const heat = new Heatmap({ source: src, blur: 12, radius: 8, zIndex: 49 });
          heatmapCacheRef.current[id] = heat;
          map.addLayer(heat);
        }}
        isDark={isDarkTheme}
        highlight={highlightLayerManager}
        onSimplifyLayer={async (id: string) => {
          try {
            const olLayer = layerCacheRef.current[id];
            if (!mapInstance.current || !(olLayer instanceof VectorLayer)) return;
            const srcAny: any = (olLayer as VectorLayer<any>).getSource();
            const src = (srcAny && typeof srcAny.getSource === 'function') ? srcAny.getSource() : srcAny;
            const feats = src?.getFeatures?.() || [];
            if (feats.length === 0) return;
            const tol = 5; // metros
            const simplified = await runUnaryOperationInWorker(feats, 'simplify', { tolerance: tol, highQuality: false });
            // Atualiza camada OL
            src.clear();
            src.addFeatures(simplified as any);
            // Persiste no IDB
            const fmt = new GeoJSON();
            const obj = fmt.writeFeaturesObject(simplified as any, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
            await idbSetGeoJSON(id, obj as any);
          } catch (e) {
            console.error('Falha ao simplificar camada:', e);
            alert('Falha ao simplificar camada.');
          }
        }}
      />

      {/* Painel de Geoprocessamento */}
      <GeoProcessingPanel
        isOpen={isGeoPanelOpen}
        onClose={() => setIsGeoPanelOpen(false)}
        layers={layers.map(l => ({ id: l.id, name: l.name, type: l.type }))}
        getEditFeatures={() => (editVectorSourceRef.current ? editVectorSourceRef.current.getFeatures() : [])}
        getLayerFeaturesById={(id: string) => {
          const olLayer = layerCacheRef.current[id];
          if (olLayer && olLayer instanceof VectorLayer) {
            const src = (olLayer as VectorLayer<VectorSource>).getSource();
            return src ? src.getFeatures() : [];
          }
          return [];
        }}
        onApplyResult={(name: string, resultFeatures: any[]) => {
          try {
            const geoJsonFormat = new GeoJSON();
            const geoJsonObj = geoJsonFormat.writeFeaturesObject(resultFeatures, {
              featureProjection: 'EPSG:3857',
              dataProjection: 'EPSG:4326'
            });
            addLayer({
              name,
              type: 'GeoJSON',
              geoJsonData: geoJsonObj as any,
              visible: true,
              opacity: 0.8,
            });
          } catch (e) {
            console.error('Falha ao aplicar resultado do geoprocessamento:', e);
            alert('Falha ao adicionar camada resultante.');
          }
        }}
      />

      {/* Painel de Geo BI */}
      <GeoAnalyticsPanel
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        layers={layers.map(l => ({ id: l.id, name: l.name, type: l.type }))}
        getEditFeatures={() => (editVectorSourceRef.current ? editVectorSourceRef.current.getFeatures() : [])}
        getLayerFeaturesById={(id: string) => {
          const olLayer = layerCacheRef.current[id];
          if (olLayer && olLayer instanceof VectorLayer) {
            const src = (olLayer as VectorLayer<VectorSource>).getSource();
            return src ? src.getFeatures() : [];
          }
          return [];
        }}
      />

      {/* Diálogo de Impressão */}
      <PrintDialog isOpen={isPrintDialogOpen} onClose={() => setIsPrintDialogOpen(false)} />

      {/* Compositor de Impressão */}
      <PrintComposer
        visible={isComposerVisible}
        title={composerSettings?.title || 'Mapa - SISGETI'}
        subtitle={composerSettings?.subtitle}
        notes={composerSettings?.notes}
        paperSize={composerSettings?.paperSize || 'A0'}
        orientation={composerSettings?.orientation || 'landscape'}
        includeLegend={composerSettings?.includeLegend}
        includeScale={composerSettings?.includeScale}
        includeNorthArrow={composerSettings?.includeNorthArrow}
        mapImageDataUrl={composerImage}
        metersPerPixel={composerMetersPerPixel || undefined}
        layersInfo={composerLayers}
        onAfterPrint={() => setIsComposerVisible(false)}
      />

      {/* Ajuda */}
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* Configurações */}
      <SettingsDialog isOpen={isSettingsOpen} type={settingsType} onClose={() => setIsSettingsOpen(false)} />

      {/* Botões de Exportação/Importação/Salvamento (visíveis apenas quando a edição está ativa) */}
      {editActive && (
        <div className="absolute top-20 right-4 z-50 flex gap-2 flex-col">
          <div className="flex gap-2">
            <button
              onClick={exportEditLayerToGeoJSON}
              className="p-3 bg-green-600 text-white rounded-lg shadow-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              title="Exportar features editadas para GeoJSON"
            >
              <FaFileExport className="w-5 h-5" />
              <span className="text-sm font-medium">Exportar</span>
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                }
              }}
              className="p-3 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              title="Importar features de um GeoJSON para a camada de edição"
            >
              <FaFileImport className="w-5 h-5" />
              <span className="text-sm font-medium">Importar</span>
            </button>
          </div>
          <button
            onClick={saveEditLayerManually}
            disabled={isSaving}
            className={`p-3 rounded-lg shadow-lg flex items-center gap-2 transition-colors ${
              isSaving 
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
            title="Salvar manualmente as features editadas"
          >
            <FaSave className={`w-5 h-5 ${isSaving ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium">Salvar</span>
          </button>
        </div>
      )}
      
      {/* Input de arquivo oculto para importação */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={importGeoJSONToEditLayer}
        accept=".geojson,.json"
        className="hidden"
      />

      {/* Área do Mapa OpenLayers */}
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{ cursor: 'grab' }}
      >
        {/* O mapa será renderizado aqui pelo OpenLayers */}
      </div>

      {/* Indicador de Salvamento Automático */}
      {editActive && lastSaved && (
        <div className="absolute top-20 left-4 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 text-sm">
          <FaSave className="w-4 h-4" />
          <span>
            Salvo às {lastSaved}
            {isSaving && '...'}
          </span>
        </div>
      )}

      {/* Controles de Edição */}
      {editActive && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg z-50 border border-gray-200 p-3 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 mr-2">Desenhar:</span>
          <button
            onClick={() => setEditGeometryType('Point')}
            className={`p-2 rounded-md transition-colors ${editGeometryType === 'Point' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title="Ponto"
          >
            <FaMapMarkerAlt className="w-4 h-4" />
          </button>
          <button
            onClick={() => setEditGeometryType('LineString')}
            className={`p-2 rounded-md transition-colors ${editGeometryType === 'LineString' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title="Linha"
          >
            <FaDrawPolygon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setEditGeometryType('Polygon')}
            className={`p-2 rounded-md transition-colors ${editGeometryType === 'Polygon' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title="Polígono"
          >
            <FaVectorSquare className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setEditActive(false);
              setEditGeometryType(null);
              if (editVectorSourceRef.current) {
                editVectorSourceRef.current.clear();
              }
            }}
            className="ml-2 px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors text-sm"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Resultado da medição */}
      {measureResult && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-black text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center">
          <span className="text-sm font-medium">
            {measureResult}
          </span>
        </div>
      )}

      {/* Instruções para medição */}
      {measureActive && (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {measureType === 'line' 
            ? 'Clique para iniciar a linha. Clique novamente para finalizar.' 
            : 'Clique para adicionar pontos ao polígono. Clique duplo para finalizar.'}
        </div>
      )}

      {/* Instruções para seleção (padrão) */}
      {!editActive && !measureActive && selectedFeature && !selectHint && (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          Clique em um elemento do mapa para visualizar seus atributos.
        </div>
      )}
      {/* Dica de cluster sempre visível quando aplicável */}
      {selectHint && (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {selectHint}
        </div>
      )}

      {/* Popup de atributos da feature selecionada */}
      {selectedFeatureAttributes && (
        <FloatingPanel
          title="Atributos da Feature"
          panelId="attributes-popup"
          width={420}
          defaultPosition="top-left"
          onClose={closeAttributePopup}
        >
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {Object.entries(selectedFeatureAttributes).map(([key, value]) => (
              <div key={key} className="flex items-start text-sm">
                <span className="font-medium text-gray-700 w-32 truncate">{key}:</span>
                <span className="text-gray-600 flex-1 break-words">{String(value)}</span>
              </div>
            ))}
          </div>
        </FloatingPanel>
      )}

      {/* Resultados do Identify */}
      {identifyActive && identifyResults && (
        <FloatingPanel
          title="Identify (WMS)"
          panelId="identify-popup"
          width={420}
          defaultPosition="top-left"
          initialPosition={{ y: 140 }}
          onClose={() => setIdentifyResults(null)}
        >
          <div className="space-y-3 max-h-60 overflow-y-auto text-sm">
            {identifyResults.length === 0 ? (
              <div className="text-gray-500">Sem resultados na posição clicada.</div>
            ) : (
              identifyResults.map((row, idx) => (
                <div key={idx} className="border rounded p-2">
                  {Object.entries(row).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="w-32 text-gray-700 font-medium truncate">{k}:</span>
                      <span className="flex-1 text-gray-600 break-words">{String(v)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </FloatingPanel>
      )}

      {/* Instruções gerais */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded-lg px-3 py-2 text-xs text-gray-600 max-w-48 z-10">
        <p>Arraste para mover • Scroll para zoom</p>
      </div>
    </div>
  );
}