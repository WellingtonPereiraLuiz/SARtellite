import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import glyphData from '../assets/OpenSansSemibold-0-255.pbf?inline';
import { dataUrl, type FireRow, type ForestEvent, type RoData } from '../lib/ro';

export type Pick =
  | { kind: 'floresta'; id: string }
  | { kind: 'fogo'; lon: number; lat: number; day: number; hour?: number; forest: boolean }
  | { kind: 'municipio'; id: string }
  | null;

export const COLORS = { fogo: '#FF4D3D', floresta: '#FF5FB0', chuva: '#5FB8FF', s1: '#C9A6FF' };
export const RO_BOUNDS: [[number, number], [number, number]] = [[-66.85, -13.75], [-59.75, -7.95]];

interface Props {
  data: RoData;
  events: ForestEvent[];
  fires: FireRow[];
  selectedId: string | null;
  municipio: string | null;
  showProtegidas: boolean;
  showTerreno: boolean;
  showNoCoverage: boolean;
  reduce: boolean;
  focus: { bounds: [[number, number], [number, number]]; n: number; max?: number } | null;
  onPick: (p: Pick) => void;
  onMoveOut: (outside: boolean) => void;
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

const pad = () => (window.innerWidth < 760 ? { top: 250, bottom: 250, left: 20, right: 20 } : { top: 90, bottom: 200, left: 400, right: 60 });
const fc = (features: unknown[]) => ({ type: 'FeatureCollection' as const, features });
const feat = (geometry: unknown, properties: Record<string, unknown>) => ({ type: 'Feature' as const, geometry, properties });
const pt = (lon: number, lat: number) => ({ type: 'Point', coordinates: [lon, lat] });

type Quad = [[number, number], [number, number], [number, number], [number, number]];
function style(data: RoData): StyleSpecification {
  const parts = data.s2 ? (data.s2.tiles ?? (data.s2.image ? [{ image: data.s2.image, corners: data.s2.corners! }] : [])) : [];
  const s2src: Record<string, unknown> = Object.fromEntries(parts.map((t, i) => [`s2_${i}`, { type: 'image', url: dataUrl(t.image), coordinates: t.corners as Quad }]));
  const s2layers = parts.map((_, i) => ({ id: `s2_${i}`, type: 'raster', source: `s2_${i}`, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4.2, 0, 5.4, 1], 'raster-resampling': 'linear', 'raster-contrast': 0.12, 'raster-saturation': 0.1, 'raster-fade-duration': 0 } }));

  const tiles = [`${dataUrl('tiles/bm')}/{z}/{x}/{y}.jpg`];
  const bm = { 'raster-saturation': -0.15, 'raster-brightness-max': 0.72, 'raster-contrast': 0.1, 'raster-fade-duration': 300 };
  const lc = data.landcover.corners as [[number, number], [number, number], [number, number], [number, number]];
  return {
    version: 8,
    glyphs: 'sarfont://{fontstack}/{range}',
    sources: {
      w: { type: 'raster', tiles, tileSize: 256, minzoom: 0, maxzoom: 3, attribution: 'NASA Blue Marble · Natural Earth · SEDAM-RO · NISAR (NASA/ISRO, ASF) · NASA FIRMS · Sentinel-1/2 (ESA) · Meteomatics · INPE DETER' },
      sa: { type: 'raster', tiles, tileSize: 256, minzoom: 4, maxzoom: 6, bounds: [-82, -35, -34, 13] },
      ro: { type: 'raster', tiles, tileSize: 256, minzoom: 7, maxzoom: 8, bounds: [-67.5, -14.5, -59, -7] },
      base: { type: 'geojson', data: dataUrl('basemap.json') },
      lc: { type: 'image', url: dataUrl(data.landcover.image), coordinates: lc },
      nocov: { type: 'image', url: dataUrl(data.landcover.nocoverage), coordinates: lc },
      mun: { type: 'geojson', data: fc(data.municipios.map((m) => feat({ type: m.gtype, coordinates: m.geometry }, { id: m.id, nome: m.nome }))) },
      munpt: { type: 'geojson', data: fc(data.municipios.map((m) => feat(pt(m.lon, m.lat), { id: m.id, nome: m.nome }))) },
      prot: { type: 'geojson', data: fc(data.protegidas.map((p) => feat({ type: p.gtype, coordinates: p.geometry }, { nome: p.nome, tipo: p.tipo }))) },
      ...s2src,
      fires: { type: 'geojson', data: fc([]) },
      forest: { type: 'geojson', data: fc([]) },
      forestpt: { type: 'geojson', data: fc([]) },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#050b10' } },
      { id: 'w', type: 'raster', source: 'w', paint: bm },
      { id: 'sa', type: 'raster', source: 'sa', paint: bm },
      { id: 'ro', type: 'raster', source: 'ro', paint: bm },
      ...(s2layers as StyleSpecification['layers']),
      { id: 'countries', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'country'], paint: { 'line-color': '#9ab7c0', 'line-opacity': 0.35, 'line-width': 0.7 } },
      { id: 'states', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'state'], minzoom: 3, paint: { 'line-color': '#9ab7c0', 'line-opacity': 0.3, 'line-width': 0.7 } },
      { id: 'lc', type: 'raster', source: 'lc', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 4.5, 0, 6, 0.5, 9.5, 0.45, 11.5, 0.15], 'raster-resampling': 'linear', 'raster-fade-duration': 0, 'raster-opacity-transition': { duration: 500 } } },
      { id: 'nocov', type: 'raster', source: 'nocov', paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.25, 10, 0.4], 'raster-resampling': 'linear', 'raster-opacity-transition': { duration: 500 } } },
      { id: 'rivers', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'river'], paint: { 'line-color': '#6ec3f0', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 10, 2.4] } },
      { id: 'ro-glow', type: 'line', source: 'base', filter: ['all', ['==', ['get', 'k'], 'state'], ['==', ['get', 'name'], 'Rondônia']], paint: { 'line-color': '#7fe3ff', 'line-width': 6, 'line-blur': 6, 'line-opacity': 0.35 } },
      { id: 'ro-line', type: 'line', source: 'base', filter: ['all', ['==', ['get', 'k'], 'state'], ['==', ['get', 'name'], 'Rondônia']], paint: { 'line-color': '#c9f3ff', 'line-width': 1.2, 'line-opacity': 0.8 } },
      { id: 'prot-fill', type: 'fill', source: 'prot', layout: { visibility: 'none' }, paint: { 'fill-color': ['case', ['==', ['get', 'tipo'], 'ti'], '#b48cff', '#5fd0ff'], 'fill-opacity': 0.12 } },
      { id: 'prot-line', type: 'line', source: 'prot', layout: { visibility: 'none' }, paint: { 'line-color': ['case', ['==', ['get', 'tipo'], 'ti'], '#d4bbff', '#9fe3ff'], 'line-width': 1.2, 'line-dasharray': [2, 1.5] } },
      { id: 'mun-hit', type: 'fill', source: 'mun', paint: { 'fill-color': '#000', 'fill-opacity': 0 } },
      { id: 'mun-line', type: 'line', source: 'mun', minzoom: 5.5, paint: { 'line-color': '#e6f2f2', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 7, 0.22], 'line-width': 0.7 } },
      { id: 'mun-sel', type: 'line', source: 'mun', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#ffffff', 'line-width': 2.2, 'line-blur': 0.5 } },
      // queimadas: calor de longe, focos de perto
      {
        id: 'fire-heat', type: 'heatmap', source: 'fires', maxzoom: 11,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.06, 6, 0.12, 8, 0.35, 10, 0.9],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 2, 6, 5, 8, 9, 10, 16],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.85, 11, 0],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.1, 'rgba(255,60,50,0.18)', 0.35, 'rgba(255,77,61,0.5)', 0.7, 'rgba(255,130,60,0.8)', 1, 'rgba(255,214,150,0.95)'],
        },
      },
      {
        id: 'fire-dot', type: 'circle', source: 'fires', minzoom: 8.5,
        paint: { 'circle-color': COLORS.fogo, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8.5, 2, 13, 7], 'circle-stroke-color': 'rgba(255,224,200,0.7)', 'circle-stroke-width': 0.5, 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8.5, 0, 9.5, 0.95] },
      },
      // floresta derrubada: halo + núcleo, contorno de perto
      { id: 'forest-halo', type: 'circle', source: 'forestpt', maxzoom: 11.5, paint: { 'circle-color': COLORS.floresta, 'circle-blur': 1, 'circle-opacity': 0.45, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['+', 8, ['sqrt', ['get', 'ha']]], 10, ['+', 18, ['*', 2, ['sqrt', ['get', 'ha']]]]] } },
      {
        id: 'forest-s1', type: 'circle', source: 'forestpt', maxzoom: 11.5, filter: ['==', ['get', 'a'], 1],
        paint: {
          'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['+', 7, ['*', 0.5, ['sqrt', ['get', 'ha']]]], 10, ['+', 11, ['sqrt', ['get', 'ha']]]],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0.9, 11.5, 0],
        },
      },
      {
        id: 'forest-pt', type: 'circle', source: 'forestpt', maxzoom: 11.5,
        paint: {
          'circle-color': ['case', ['==', ['get', 'v'], 'duvida'], 'rgba(20,10,16,0.55)', COLORS.floresta],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['+', 3, ['*', 0.5, ['sqrt', ['get', 'ha']]]], 10, ['+', 6, ['sqrt', ['get', 'ha']]]],
          'circle-stroke-color': ['case', ['==', ['get', 'v'], 'duvida'], COLORS.floresta, '#ffffff'], 'circle-stroke-width': ['case', ['get', 'sel'], 3, ['==', ['get', 'v'], 'duvida'], 2.2, 1.2],
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 1, 11.5, 0],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 1, 11.5, 0],
        },
      },
      // de perto: só o contorno, para a foto real aparecer por baixo. Tracejado = pode ser chuva
      { id: 'forest-fill', type: 'fill', source: 'forest', minzoom: 9.5, paint: { 'fill-color': COLORS.floresta, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 10.5, ['case', ['==', ['get', 'v'], 'duvida'], 0.05, 0.16]] } },
      { id: 'forest-case', type: 'line', source: 'forest', minzoom: 9.5, paint: { 'line-color': 'rgba(10,6,10,0.75)', 'line-width': ['case', ['get', 'sel'], 6, 4.5], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 10.5, 1] } },
      { id: 'forest-line', type: 'line', source: 'forest', minzoom: 9.5, filter: ['!=', ['get', 'v'], 'duvida'], paint: { 'line-color': COLORS.floresta, 'line-width': ['case', ['get', 'sel'], 3.6, 2.4], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 10.5, 1] } },
      { id: 'forest-line-d', type: 'line', source: 'forest', minzoom: 9.5, filter: ['==', ['get', 'v'], 'duvida'], paint: { 'line-color': COLORS.floresta, 'line-width': ['case', ['get', 'sel'], 3.6, 2.4], 'line-dasharray': [2, 1.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0, 10.5, 1] } },
      {
        id: 'mun-label', type: 'symbol', source: 'munpt', minzoom: 6.3,
        layout: { 'text-field': ['get', 'nome'], 'text-font': [FONT], 'text-size': ['interpolate', ['linear'], ['zoom'], 6.3, 10, 10, 14], 'text-max-width': 9, 'text-padding': 6 },
        paint: { 'text-color': '#f2f7f6', 'text-halo-color': 'rgba(5,11,16,0.85)', 'text-halo-width': 1.5, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 6.3, 0, 7, 0.95] },
      },
      { id: 'prot-label', type: 'symbol', source: 'prot', minzoom: 8, layout: { visibility: 'none', 'text-field': ['get', 'nome'], 'text-font': [FONT], 'text-size': 11, 'text-max-width': 10 }, paint: { 'text-color': '#e6dbff', 'text-halo-color': '#050b10', 'text-halo-width': 1.3 } },
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
  const usedFocus = useRef(-1);

  useEffect(() => {
    if (!el.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: el.current, style: style(p.data), center: [-60, -15], zoom: 2.4, minZoom: 1.2, maxZoom: 15.5,
        dragRotate: false, pitchWithRotate: false, attributionControl: false, fadeDuration: 250,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'WebGL indisponível');
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 90 }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', () => {
      mapRef.current = map;
      setReady(true);
      // abertura: do continente até Rondônia
      const f = latest.current.focus;
      usedFocus.current = f?.n ?? -1;
      map.fitBounds(f?.bounds ?? RO_BOUNDS, { padding: pad(), maxZoom: f?.max ?? 11.5, duration: latest.current.reduce ? 0 : 3200, essential: true, curve: 1.6 });
    });
    const added = new Set<string>();
    const sharp = () => {
      if (map.getZoom() < 9.2) return;
      const b = map.getBounds();
      for (const [id, pch] of Object.entries(latest.current.data.patches)) {
        if (added.has(id)) continue;
        const [[w, n], , [e, s]] = pch.corners;
        if (e < b.getWest() || w > b.getEast() || n < b.getSouth() || s > b.getNorth()) continue;
        added.add(id);
        map.addSource(`p_${id}`, { type: 'image', url: dataUrl(pch.img), coordinates: pch.corners as Quad });
        map.addLayer({ id: `p_${id}`, type: 'raster', source: `p_${id}`, minzoom: 9, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 9.4, 0, 10.6, 1], 'raster-resampling': 'linear', 'raster-fade-duration': 200 } }, 'lc');
      }
    };
    map.on('moveend', sharp);
    map.on('moveend', () => {
      const c = map.getCenter();
      const [[x0, y0], [x1, y1]] = RO_BOUNDS;
      latest.current.onMoveOut(map.getZoom() > 3.5 && (c.lng < x0 - 1.5 || c.lng > x1 + 1.5 || c.lat < y0 - 1.5 || c.lat > y1 + 1.5));
    });
    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['forest-fill', 'forest-pt', 'fire-dot', 'mun-hit'] });
      const top = f[0];
      if (!top) return latest.current.onPick(null);
      const pr = top.properties!;
      if (top.layer.id === 'forest-fill' || top.layer.id === 'forest-pt') return latest.current.onPick({ kind: 'floresta', id: String(pr.id) });
      if (top.layer.id === 'fire-dot') { const g = top.geometry as unknown as { coordinates: [number, number] }; return latest.current.onPick({ kind: 'fogo', lon: g.coordinates[0], lat: g.coordinates[1], day: Number(pr.d), hour: Number(pr.h) >= 0 ? Number(pr.h) : undefined, forest: Number(pr.f) === 1 }); }
      latest.current.onPick({ kind: 'municipio', id: String(pr.id) });
    });
    for (const id of ['forest-fill', 'forest-pt', 'fire-dot']) {
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
    (map.getSource('forest') as GeoJSONSource).setData(fc(p.events.map((e) => feat({ type: e.gtype, coordinates: e.geometry }, { id: e.id, c: e.certeza, v: e.chuva?.veredito ?? '', sel: e.id === p.selectedId }))));
    (map.getSource('forestpt') as GeoJSONSource).setData(fc(p.events.map((e) => feat(pt(e.lon, e.lat), { id: e.id, c: e.certeza, v: e.chuva?.veredito ?? '', a: e.s1?.alerta ? 1 : 0, ha: e.area_ha, sel: e.id === p.selectedId }))));
  }, [ready, p.events, p.selectedId]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('fires') as GeoJSONSource).setData(fc(p.fires.map((r) => feat(pt(r[0], r[1]), { d: r[2], f: r[4], h: r[5] ?? -1 }))));
  }, [ready, p.fires]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter('mun-sel', ['==', ['get', 'id'], p.municipio ?? '']);
    for (const id of ['prot-fill', 'prot-line', 'prot-label']) map.setLayoutProperty(id, 'visibility', p.showProtegidas ? 'visible' : 'none');
    map.setLayoutProperty('lc', 'visibility', p.showTerreno ? 'visible' : 'none');
    map.setLayoutProperty('nocov', 'visibility', p.showNoCoverage ? 'visible' : 'none');
  }, [ready, p.municipio, p.showProtegidas, p.showTerreno, p.showNoCoverage]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !p.focus || p.focus.n === usedFocus.current) return;
    usedFocus.current = p.focus.n;
    map.fitBounds(p.focus.bounds, { padding: pad(), maxZoom: p.focus.max ?? 11.5, duration: p.reduce ? 0 : 2200, curve: 1.5, essential: true });
  }, [ready, p.focus, p.reduce]);

  return (
    <div className="map" ref={el} role="region" aria-label="Mapa com queimadas e floresta derrubada em Rondônia">
      {err && <p className="map-msg" role="alert">O mapa não pôde ser iniciado ({err}). A lista e os números continuam funcionando.</p>}
    </div>
  );
}
