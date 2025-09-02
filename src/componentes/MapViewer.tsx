"use client"

import { useState, useEffect, useRef, useCallback } from "react";
import { FaSearchPlus, FaSearchMinus, FaHome, FaCompass, FaInfoCircle, FaMapMarkerAlt, FaDrawPolygon, FaVectorSquare, FaFileExport, FaFileImport, FaTimes, FaRuler, FaRulerCombined, FaSave } from "react-icons/fa";
// OpenLayers imports
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';
import { defaults as defaultControls } from 'ol/control';
import { click } from 'ol/events/condition';
import { unByKey } from 'ol/Observable';
// Camadas vetoriais e interações
import TileWMS from 'ol/source/TileWMS';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Layer } from 'ol/layer';
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style';
import { Draw, Select } from 'ol/interaction';
import { LineString, Polygon } from 'ol/geom';
import { getLength, getArea } from 'ol/sphere';
import GeoJSON from 'ol/format/GeoJSON';
import { Feature } from 'ol';
import { EventsKey } from 'ol/events';

// Componentes
import LayerManager from "./LayerManager";

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
}

type GeometryType = 'Point' | 'LineString' | 'Polygon';
type MeasureType = 'line' | 'area' | null;

// Chave para localStorage
const EDIT_LAYER_STORAGE_KEY = 'sisgeti_edit_layer_features';

// Funções auxiliares de formatação (movidas para o escopo do módulo)
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
  
  // Estado para o nível de zoom (gerenciado internamente)
  const [zoomLevel, setZoomLevel] = useState(100);
  
  // Estado para as camadas
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
  
  // Referências para camada de edição
  const editVectorSourceRef = useRef<VectorSource | null>(null);
  const editVectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const drawInteractionRef = useRef<Draw | null>(null);
  const selectInteractionRef = useRef<Select | null>(null);
  
  // Referências para medição
  const measureVectorSourceRef = useRef<VectorSource | null>(null);
  const measureVectorLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const measureDrawRef = useRef<Draw | null>(null);
  const measureListenerRef = useRef<EventsKey | null>(null);
  
  // Listeners para mudanças na camada de edição (para auto-save)
  // Agora são dois listeners separados
  const editSourceAddListenerRef = useRef<EventsKey | null>(null);
  const editSourceRemoveListenerRef = useRef<EventsKey | null>(null);
  const editSourceChangeListenerRef = useRef<EventsKey | null>(null);
  
  // Cache para mapear ID da camada do app com a camada do OL
  const layerCacheRef = useRef<Record<string, Layer>>({});
  
  // Coordenadas padrão
  const defaultCenter = [-54.62, -20.44]; // Campo Grande, MS

  // Função para adicionar uma camada ao mapa OpenLayers
  const addLayerToMap = useCallback((layerData: AppLayer) => {
    if (!mapInstance.current) return null;
    
    const map = mapInstance.current;
    let newOlLayer: Layer | null = null;
    
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
      const features = geoJsonFormat.readFeatures(layerData.geoJsonData, {
        featureProjection: 'EPSG:3857'
      });
      
      const vectorSource = new VectorSource({
        features: features
      });
      
      newOlLayer = new VectorLayer({
        source: vectorSource,
        style: new Style({
          fill: new Fill({
            color: 'rgba(255, 0, 0, 0.2)', // Vermelho com transparência
          }),
          stroke: new Stroke({
            color: '#ff0000', // Vermelho
            width: 2,
          }),
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({
              color: '#ff0000', // Vermelho
            }),
          }),
        }),
        visible: layerData.visible,
        opacity: layerData.opacity,
        zIndex: 50
      });
      newOlLayer.set('name', layerData.name);
    }
    
    if (newOlLayer) {
      map.addLayer(newOlLayer);
      layerCacheRef.current[layerData.id] = newOlLayer;
    }
    
    return newOlLayer;
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
        new TileLayer({
          source: new OSM(),
          zIndex: 0
        }),
        measureLayer, // Camada de medição
        editLayer // Camada de edição
      ],
      view: view,
      controls: defaultControls({
        attributionOptions: { collapsed: false },
        zoom: false,
        rotate: false,
      }),
    });
    mapInstance.current = map;

    // Listener para atualizar o zoomLevel do React
    const onResolutionChange = () => {
      const currentZoom = view.getZoom() || 0;
      const appZoom = Math.round((currentZoom / 12) * 100);
      setZoomLevel(Math.max(25, Math.min(200, appZoom)));
    };
    view.on('change:resolution', onResolutionChange);

    // Listener para ferramenta de edição
    const handleEditTool = (event: Event) => {
      const geometryType = (event as CustomEvent).detail as GeometryType | null;
      setEditGeometryType(geometryType);
      if (geometryType) {
        setEditActive(true);
        // Desativar seleção e medição quando a edição é ativada
        if (selectInteractionRef.current) {
          map.removeInteraction(selectInteractionRef.current);
          selectInteractionRef.current = null;
          setSelectedFeature(null);
          setSelectedFeatureAttributes(null);
        }
        setMeasureActive(false);
        setMeasureType(null);
        setMeasureResult(null);
        if (measureVectorSourceRef.current) {
          measureVectorSourceRef.current.clear();
        }
      } else {
        setEditActive(false);
      }
    };
    window.addEventListener('editTool', handleEditTool);
    
    // Listener para ferramenta de medição
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
        if (selectInteractionRef.current) {
          map.removeInteraction(selectInteractionRef.current);
          selectInteractionRef.current = null;
          setSelectedFeature(null);
          setSelectedFeatureAttributes(null);
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
    
    // Listener para importação
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

  // useEffect para CRIAR e DESTRUIR camadas
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
    layersToAdd.forEach(layerData => {
      addLayerToMap(layerData);
    });
    
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
        const selected = e.selected[0];
        if (selected) {
          setSelectedFeature(selected);
          const properties = selected.getProperties();
          const filteredProperties: Record<string, any> = {};
          Object.keys(properties).forEach(key => {
            if (key !== 'geometry') {
              filteredProperties[key] = properties[key];
            }
          });
          setSelectedFeatureAttributes(filteredProperties);
        } else {
          setSelectedFeature(null);
          setSelectedFeatureAttributes(null);
        }
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
    }

    // Cleanup do efeito
    return () => {
      if (drawInteractionRef.current) {
        map.removeInteraction(drawInteractionRef.current);
        drawInteractionRef.current = null;
      }
    };
  }, [editActive, editGeometryType]);

  // Efeito para CARREGAR dados salvos do localStorage na inicialização
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
    if (editSourceAddListenerRef.current) {
      unByKey(editSourceAddListenerRef.current);
      editSourceAddListenerRef.current = null;
    }
    if (editSourceRemoveListenerRef.current) {
      unByKey(editSourceRemoveListenerRef.current);
      editSourceRemoveListenerRef.current = null;
    }
    if (editSourceChangeListenerRef.current) {
      unByKey(editSourceChangeListenerRef.current);
      editSourceChangeListenerRef.current = null;
    }
    
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
    };
    
    // Registrar listeners individuais para cada tipo de evento
    editSourceAddListenerRef.current = source.on('addfeature', scheduleSave);
    editSourceRemoveListenerRef.current = source.on('removefeature', scheduleSave);
    editSourceChangeListenerRef.current = source.on('changefeature', scheduleSave);
    
    // Cleanup do efeito
    return () => {
      if (editSourceAddListenerRef.current) {
        unByKey(editSourceAddListenerRef.current);
      }
      if (editSourceRemoveListenerRef.current) {
        unByKey(editSourceRemoveListenerRef.current);
      }
      if (editSourceChangeListenerRef.current) {
        unByKey(editSourceChangeListenerRef.current);
      }
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

  const handleZoomOut = () => {
    if (!mapInstance.current) return;
    const view = mapInstance.current.getView();
    const currentZoom = view.getZoom() || 0;
    view.setZoom(Math.max(currentZoom - 1, 2));
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
    const id = `layer-${Date.now()}`;
    setLayers(prev => [
      ...prev,
      {
        ...newLayer,
        id,
      }
    ]);
  };

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(layer => layer.id !== id));
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
            // Caso improvável, mas possível, de o source se tornar nulo
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

      {/* Gerenciador de Camadas */}
      <LayerManager
        layers={layers}
        onAddLayer={addLayer}
        onRemoveLayer={removeLayer}
        onToggleVisibility={toggleLayerVisibility}
        onOpacityChange={changeLayerOpacity}
      />

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

      {/* Instruções para seleção */}
      {!editActive && !measureActive && selectedFeature && (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          Clique em um elemento do mapa para visualizar seus atributos.
        </div>
      )}

      {/* Popup de atributos da feature selecionada */}
      {selectedFeatureAttributes && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-xl z-50 border border-gray-200 max-w-md w-full">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <FaInfoCircle className="text-blue-600" />
                Atributos da Feature
              </h3>
              <button
                onClick={closeAttributePopup}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Fechar"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {Object.entries(selectedFeatureAttributes).map(([key, value]) => (
                <div key={key} className="flex items-start text-sm">
                  <span className="font-medium text-gray-700 w-32 truncate">{key}:</span>
                  <span className="text-gray-600 flex-1 break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Instruções gerais */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded-lg px-3 py-2 text-xs text-gray-600 max-w-48 z-10">
        <p>Arraste para mover • Scroll para zoom</p>
      </div>
    </div>
  );
}