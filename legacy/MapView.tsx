import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import glyphData from '../assets/OpenSansSemibold-0-255.pbf?inline';
import { dataUrl, type FarmRow, type ForestEvent, type RoData } from '../lib/ro';

export type Pick =
  | { kind: 'floresta'; id: string }
  | { kind: 'lavoura'; row: FarmRow }
  | { kind: 'municipio'; id: string }
  | null;

interface Props {
  data: RoData;
  events: ForestEvent[];
  farm: FarmRow[];
  selectedId: string | null;
  municipio: string | null;
  showProtegidas: boolean;
  showBase: boolean;
  showNoCoverage: boolean;
  focus: { bounds: [[number, number], [number, number]]; n: number } | null;
  onPick: (p: Pick) => void;
}

const FONT = 'OpenSansSemibold';
let glyphBytes: ArrayBuffer | null = null;
maplibregl.addProtocol('sarfont', async (req) => {
  if (!req.url.endsWith('/0-255')) return { data: new ArrayBuffer(0) };
  if (!glyphBytes) {
    const bin = atob(glyphData.slice(glyphData.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    glyphBytes = bytes.buffer;
  }
  return { data: glyphBytes.slice(0) };
});

export const COLORS = { floresta: '#FF6B3D', colheita: '#F2B33D', plantio: '#9BE15D', misto: '#D9D08A' };
export const RO_BOUNDS: [[number, number], [number, number]] = [[-66.85, -13.75], [-59.75, -7.95]];

const fc = (features: unknown[]) => ({ type: 'FeatureCollection' as const, features });
const feat = (geometry: unknown, properties: Record<string, unknown>) => ({ type: 'Feature' as const, geometry, properties });
const geom = (gtype: string, coordinates: unknown) => ({ type: gtype, coordinates });

function farmSquares(rows: FarmRow[]) {
  const dLat = 0.54 / 111.32;
  return fc(rows.map((r, i) => {
    const dLon = dLat / Math.cos((r[1] * Math.PI) / 180);
    const ring = [[r[0] - dLon, r[1] - dLat], [r[0] + dLon, r[1] - dLat], [r[0] + dLon, r[1] + dLat], [r[0] - dLon, r[1] + dLat], [r[0] - dLon, r[1] - dLat]];
    return feat({ type: 'Polygon', coordinates: [ring] }, { i, s: r[5] });
  }));
}

function style(data: RoData): StyleSpecification {
  return {
    version: 8,
    glyphs: 'sarfont://{fontstack}/{range}',
    sources: {
      base: { type: 'geojson', data: dataUrl('basemap.json'), attribution: 'Natural Earth · SEDAM-RO · Impact Observatory/Esri · NISAR: NASA/ISRO via ASF · INPE' },
      lc: { type: 'image', url: dataUrl(data.landcover.image), coordinates: data.landcover.corners as [[number, number], [number, number], [number, number], [number, number]] },
      nocov: { type: 'image', url: dataUrl(data.landcover.nocoverage), coordinates: data.landcover.corners as [[number, number], [number, number], [number, number], [number, number]] },
      mun: { type: 'geojson', data: fc(data.municipios.map((m) => feat(geom(m.gtype, m.geometry), { id: m.id, nome: m.nome }))) },
      munpt: { type: 'geojson', data: fc(data.municipios.map((m) => feat({ type: 'Point', coordinates: [m.lon, m.lat] }, { id: m.id, nome: m.nome }))) },
      prot: { type: 'geojson', data: fc(data.protegidas.map((p) => feat(geom(p.gtype, p.geometry), { nome: p.nome, tipo: p.tipo }))) },
      farm: { type: 'geojson', data: fc([]) },
      forest: { type: 'geojson', data: fc([]) },
      forestpt: { type: 'geojson', data: fc([]) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b141b' } },
      { id: 'countries', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'country'], paint: { 'line-color': '#5d7a84', 'line-width': 0.8 } },
      { id: 'states', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'state'], paint: { 'line-color': '#5d7a84', 'line-width': 0.8, 'line-dasharray': [3, 2] } },
      { id: 'lc', type: 'raster', source: 'lc', paint: { 'raster-opacity': 0.92, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } },
      { id: 'nocov', type: 'raster', source: 'nocov', paint: { 'raster-opacity': 0.9, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } },
      { id: 'rivers', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'river'], paint: { 'line-color': '#5fb2e6', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 2.2] } },
      { id: 'prot-fill', type: 'fill', source: 'prot', layout: { visibility: 'none' }, paint: { 'fill-color': ['case', ['==', ['get', 'tipo'], 'ti'], '#c79bff', '#7fd4ff'], 'fill-opacity': 0.12 } },
      { id: 'prot-line', type: 'line', source: 'prot', layout: { visibility: 'none' }, paint: { 'line-color': ['case', ['==', ['get', 'tipo'], 'ti'], '#d9b8ff', '#9fe0ff'], 'line-width': 1.4, 'line-dasharray': [2, 1.5] } },
      { id: 'mun-hit', type: 'fill', source: 'mun', paint: { 'fill-color': '#000', 'fill-opacity': 0 } },
      { id: 'mun-line', type: 'line', source: 'mun', paint: { 'line-color': '#0b141b', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 1.4] } },
      { id: 'mun-sel', type: 'line', source: 'mun', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#ffffff', 'line-width': 2.5 } },
      { id: 'farm', type: 'fill', source: 'farm', paint: { 'fill-color': ['match', ['get', 's'], 'colheita', COLORS.colheita, 'plantio', COLORS.plantio, COLORS.misto], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.75, 10, 0.55] } },
      { id: 'forest-fill', type: 'fill', source: 'forest', paint: { 'fill-color': COLORS.floresta, 'fill-opacity': 0.9 } },
      { id: 'forest-line', type: 'line', source: 'forest', paint: { 'line-color': '#fff3ea', 'line-width': ['case', ['get', 'sel'], 3, 0.8] } },
      {
        id: 'forest-pt', type: 'circle', source: 'forestpt', maxzoom: 10.5,
        paint: {
          'circle-color': COLORS.floresta,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['+', 4, ['*', 0.9, ['sqrt', ['get', 'ha']]]], 10, ['+', 7, ['*', 1.4, ['sqrt', ['get', 'ha']]]]],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.95, 10.5, 0],
          'circle-stroke-color': ['case', ['get', 'sel'], '#ffffff', ['==', ['get', 'c'], 'confirmado'], '#ffffff', '#3a1a10'],
          'circle-stroke-width': ['case', ['get', 'sel'], 3.5, ['==', ['get', 'c'], 'confirmado'], 2, 1],
        },
      },
      {
        id: 'mun-label', type: 'symbol', source: 'munpt', minzoom: 6.2,
        layout: { 'text-field': ['get', 'nome'], 'text-font': [FONT], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10.5, 10, 14], 'text-max-width': 9, 'text-padding': 4 },
        paint: { 'text-color': '#f4f7f5', 'text-halo-color': '#0b141b', 'text-halo-width': 1.6 },
      },
      {
        id: 'prot-label', type: 'symbol', source: 'prot', minzoom: 8, layout: { visibility: 'none', 'text-field': ['get', 'nome'], 'text-font': [FONT], 'text-size': 11, 'symbol-placement': 'point', 'text-max-width': 10 },
        paint: { 'text-color': '#e8d8ff', 'text-halo-color': '#0b141b', 'text-halo-width': 1.4 },
      },
    ],
  };
}

export default function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latest = useRef(p);
  latest.current = p;

  useEffect(() => {
    if (!el.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({ container: el.current, style: style(p.data), bounds: RO_BOUNDS, fitBoundsOptions: { padding: 24 }, minZoom: 4.5, maxZoom: 13, dragRotate: false, pitchWithRotate: false, attributionControl: false, renderWorldCopies: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'WebGL indisponível');
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 100 }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => { mapRef.current = map; setReady(true); });
    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['forest-fill', 'forest-pt', 'farm', 'mun-hit'] });
      const top = f[0];
      if (!top) return latest.current.onPick(null);
      if (top.layer.id === 'forest-fill' || top.layer.id === 'forest-pt') return latest.current.onPick({ kind: 'floresta', id: String(top.properties!.id) });
      if (top.layer.id === 'farm') return latest.current.onPick({ kind: 'lavoura', row: latest.current.farm[Number(top.properties!.i)] });
      latest.current.onPick({ kind: 'municipio', id: String(top.properties!.id) });
    });
    for (const id of ['forest-fill', 'forest-pt', 'farm']) {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('forest') as GeoJSONSource).setData(fc(p.events.map((e) => feat(geom(e.gtype, e.geometry), { id: e.id, c: e.certeza, sel: e.id === p.selectedId }))));
    (map.getSource('forestpt') as GeoJSONSource).setData(fc(p.events.map((e) => feat({ type: 'Point', coordinates: [e.lon, e.lat] }, { id: e.id, c: e.certeza, ha: e.area_ha, sel: e.id === p.selectedId }))));
  }, [ready, p.events, p.selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('farm') as GeoJSONSource).setData(farmSquares(p.farm));
  }, [ready, p.farm]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter('mun-sel', ['==', ['get', 'id'], p.municipio ?? '']);
    for (const id of ['prot-fill', 'prot-line', 'prot-label']) map.setLayoutProperty(id, 'visibility', p.showProtegidas ? 'visible' : 'none');
    map.setPaintProperty('lc', 'raster-opacity', p.showBase ? 0.92 : 0.18);
    map.setLayoutProperty('nocov', 'visibility', p.showNoCoverage ? 'visible' : 'none');
  }, [ready, p.municipio, p.showProtegidas, p.showBase, p.showNoCoverage]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !p.focus) return;
    const still = document.documentElement.classList.contains('reduce-motion');
    map.fitBounds(p.focus.bounds, { padding: 60, maxZoom: 12, duration: still ? 0 : 1400 });
  }, [ready, p.focus]);

  return (
    <div className="map" ref={el} role="region" aria-label="Mapa de Rondônia com os acontecimentos vistos pelo radar NISAR">
      {err && <p className="map-msg" role="alert">O mapa não pôde ser iniciado ({err}). A lista ao lado continua funcionando.</p>}
    </div>
  );
}
