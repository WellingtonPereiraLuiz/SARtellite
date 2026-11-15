import { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type ImageSource, type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import glyphData from '../assets/OpenSansSemibold-0-255.pbf?inline';
import { dataUrl } from '../lib/data';
import { areaFromBox, boundsOf } from '../lib/geo';
import { fmtDate, toMs } from '../lib/time';
import type { Aoi, CompareMode, Corners, CustomArea, FiresFile, LayerState, LngLat, Manifest, Scene } from '../lib/types';

/** Pedido de enquadramento. Trocar o objeto (n novo) dispara o voo assim que o mapa estiver pronto. */
export interface Focus { corners: LngLat[]; fast: boolean; n: number }

export interface Overlay { url: string | null; corners: Corners }

interface Props {
  manifest: Manifest;
  fires: FiresFile | null;
  entered: boolean;
  focus: Focus | null;
  reducedMotion: boolean;
  aoi: Aoi | null;
  customCorners: Corners | null;
  before: Scene | null;
  after: Scene | null;
  mode: CompareMode;
  showBefore: boolean;
  layers: LayerState;
  overlayOpacity: number;
  imageOpacity: number;
  change: Overlay;
  corroborated: Overlay;
  forest: Overlay;
  water: Overlay;
  waterHist: Overlay;
  fireWindow: [number, number];
  drawing: boolean;
  onDrawn: (a: CustomArea) => void;
  onPickAoi: (id: string) => void;
  onPickPoint: (lat: number, lon: number) => void;
}

const FONT = 'OpenSansSemibold';

// Os glifos dos rótulos vão embutidos no bundle e são entregues por um protocolo próprio:
// assim o mapa não depende de um servidor que saiba servir arquivos .pbf.
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
const ORDER = ['img-nisar', 'img-aoi', 'ov-forest', 'ov-waterhist', 'ov-water', 'ov-change', 'ov-corr', 'frame-line', 'aoi-fill', 'aoi-line', 'fires-glow', 'fires-core', 'aoi-label', 'city-label'];

function baseStyle(m: Manifest): StyleSpecification {
  const tiles = [`${dataUrl('tiles/bm')}/{z}/{x}/{y}.jpg`];
  const paint = { 'raster-saturation': -0.25, 'raster-brightness-max': ['interpolate', ['linear'], ['zoom'], 1, 0.95, 4, 0.8, 7, 0.5] as unknown as number, 'raster-contrast': 0.15, 'raster-fade-duration': 150 };
  const ts = m.basemap.tile_sources;
  const src = (k: string) => ({ type: 'raster' as const, tiles, tileSize: 256, minzoom: ts[k].minzoom, maxzoom: ts[k].maxzoom, ...(ts[k].bounds ? { bounds: ts[k].bounds as [number, number, number, number] } : {}) });
  return {
    version: 8,
    projection: { type: 'globe' },
    glyphs: 'sarfont://{fontstack}/{range}',
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    sources: {
      'bm-world': { ...src('world'), attribution: 'NASA Blue Marble (GIBS) · Natural Earth' },
      'bm-sa': src('south_america'),
      'bm-region': src('region'),
      base: { type: 'geojson', data: dataUrl('basemap.json') },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#071018' } },
      { id: 'bm-world', type: 'raster', source: 'bm-world', paint },
      { id: 'bm-sa', type: 'raster', source: 'bm-sa', paint },
      { id: 'bm-region', type: 'raster', source: 'bm-region', paint },
      { id: 'countries', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'country'], paint: { 'line-color': '#7fb7c4', 'line-opacity': 0.35, 'line-width': 0.7 } },
      { id: 'states', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'state'], minzoom: 3, paint: { 'line-color': '#a9d3da', 'line-opacity': 0.4, 'line-width': 0.8, 'line-dasharray': [3, 2] } },
      { id: 'rivers', type: 'line', source: 'base', filter: ['==', ['get', 'k'], 'river'], minzoom: 4, paint: { 'line-color': '#39C6C3', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.8] } },
      {
        id: 'city-label', type: 'symbol', source: 'base', filter: ['==', ['get', 'k'], 'city'], minzoom: 5,
        layout: { 'text-field': ['get', 'name'], 'text-font': [FONT], 'text-size': 11.5, 'text-offset': [0, 0.9], 'text-anchor': 'top', 'text-letter-spacing': 0.04 },
        paint: { 'text-color': '#DDE9E8', 'text-halo-color': '#080F16', 'text-halo-width': 1.4, 'text-opacity': 0.9 },
      },
    ],
  };
}

function rect(corners: LngLat[], props: Record<string, unknown>) {
  return { type: 'Feature' as const, properties: props, geometry: { type: 'Polygon' as const, coordinates: [[...corners, corners[0]]] } };
}

/** Insere a camada na posição certa da pilha, não importa a ordem em que foi criada. */
function beforeId(map: MlMap, id: string): string | undefined {
  for (let i = ORDER.indexOf(id) + 1; i < ORDER.length; i++) if (map.getLayer(ORDER[i])) return ORDER[i];
  return undefined;
}

function setImage(map: MlMap, id: string, ov: Overlay | null, opacity: number, visible: boolean) {
  const has = !!map.getSource(id);
  if (!ov || !ov.url || !visible) {
    if (has && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    return;
  }
  if (!has) {
    map.addSource(id, { type: 'image', url: ov.url, coordinates: ov.corners });
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0, 'raster-resampling': id.startsWith('img') ? 'linear' : 'nearest', ...(id === 'img-nisar' ? { 'raster-brightness-max': 0.88 } : {}) } }, beforeId(map, id));
    (map.getSource(id) as ImageSource & { _url?: string })._url = ov.url;
    return;
  }
  const s = map.getSource(id) as ImageSource & { _url?: string; _c?: string };
  const key = JSON.stringify(ov.corners);
  if (s._url !== ov.url || s._c !== key) {
    s.updateImage({ url: ov.url, coordinates: ov.corners });
    s._url = ov.url;
    s._c = key;
  }
  map.setLayoutProperty(id, 'visibility', 'visible');
  map.setPaintProperty(id, 'raster-opacity', opacity);
}

function addDynamic(map: MlMap, m: Manifest) {
  const fp = Object.values(m.nisar_frame.footprints);
  map.addSource('frame', { type: 'geojson', data: { type: 'FeatureCollection', features: fp.map((f) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: f } })) } });
  map.addLayer({ id: 'frame-line', type: 'line', source: 'frame', paint: { 'line-color': '#DDE9E8', 'line-width': 1.1, 'line-opacity': 0.55, 'line-dasharray': [2, 2] } }, beforeId(map, 'frame-line'));
  map.addSource('aois', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aois', paint: { 'fill-color': ['case', ['==', ['get', 'kind'], 'draw'], '#F6A24F', '#39C6C3'], 'fill-opacity': ['case', ['get', 'active'], 0, 0.1] } }, beforeId(map, 'aoi-fill'));
  map.addLayer({ id: 'aoi-line', type: 'line', source: 'aois', paint: { 'line-color': ['case', ['==', ['get', 'kind'], 'custom'], '#F6A24F', ['==', ['get', 'kind'], 'draw'], '#F6A24F', '#DDE9E8'], 'line-width': ['case', ['get', 'active'], 2.2, 1.2], 'line-opacity': 0.95 } }, beforeId(map, 'aoi-line'));
  map.addLayer({
    id: 'aoi-label', type: 'symbol', source: 'aois', filter: ['has', 'label'], minzoom: 6.2, maxzoom: 9.5,
    layout: { 'text-field': ['get', 'label'], 'text-font': [FONT], 'text-size': 11, 'text-anchor': 'bottom', 'text-offset': [0, -0.6], 'text-max-width': 12, 'text-allow-overlap': true },
    paint: { 'text-color': '#DDE9E8', 'text-halo-color': '#080F16', 'text-halo-width': 1.6 },
  }, beforeId(map, 'aoi-label'));
  map.addSource('fires', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'fires-glow', type: 'circle', source: 'fires', layout: { visibility: 'none' }, paint: { 'circle-color': '#D34F48', 'circle-opacity': 0.22, 'circle-blur': 0.6, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 3, 11, 12] } }, beforeId(map, 'fires-glow'));
  map.addLayer({ id: 'fires-core', type: 'circle', source: 'fires', layout: { visibility: 'none' }, paint: { 'circle-color': '#FF7A5C', 'circle-stroke-color': '#2a0d0b', 'circle-stroke-width': 0.6, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 11, 4] } }, beforeId(map, 'fires-core'));
}

function heroPadding(el: HTMLElement) {
  return el.clientWidth > 900 ? { left: Math.min(el.clientWidth * 0.5, 760), bottom: 0, top: 0, right: 0 } : { left: 0, bottom: el.clientHeight * 0.45, top: 0, right: 0 };
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function MapStage(p: Props) {
  const afterEl = useRef<HTMLDivElement>(null);
  const beforeEl = useRef<HTMLDivElement>(null);
  const wrapEl = useRef<HTMLDivElement>(null);
  const maps = useRef<{ after: MlMap; before: MlMap } | null>(null);
  const [ready, setReady] = useState(false);
  const [split, setSplit] = useState(50);
  const [failed, setFailed] = useState<string | null>(null);
  const latest = useRef(p);
  latest.current = p;

  // ---------- criação dos dois mapas sincronizados ----------
  useEffect(() => {
    if (!afterEl.current || !beforeEl.current) return;
    let after: MlMap;
    let before: MlMap;
    try {
      const opts = { style: baseStyle(p.manifest), center: [-58, -14] as [number, number], zoom: 1.75, minZoom: 0.8, maxZoom: 13.5, attributionControl: false as const, dragRotate: false, pitchWithRotate: false, maxPitch: 0 };
      after = new maplibregl.Map({ container: afterEl.current, ...opts });
      before = new maplibregl.Map({ container: beforeEl.current, ...opts, interactive: true });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'WebGL indisponível');
      return;
    }
    after.touchZoomRotate.disableRotation();
    before.touchZoomRotate.disableRotation();
    if (!p.entered) { after.setPadding(heroPadding(wrapEl.current!)); before.setPadding(heroPadding(wrapEl.current!)); }
    after.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    after.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-right');
    after.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'NISAR: NASA/ISRO via ASF · Copernicus Sentinel · INPE Queimadas' }), 'bottom-right');
    let lock = false;
    const link = (a: MlMap, b: MlMap) => a.on('move', () => {
      if (lock) return;
      lock = true;
      b.jumpTo({ center: a.getCenter(), zoom: a.getZoom(), bearing: a.getBearing() });
      lock = false;
    });
    link(after, before);
    link(before, after);
    let n = 0;
    const done = () => { if (++n === 2) { maps.current = { after, before }; setReady(true); } };
    after.on('load', () => {
      addDynamic(after, p.manifest);
      const att = afterEl.current?.querySelector('.maplibregl-ctrl-attrib');
      att?.classList.remove('maplibregl-compact-show');
      att?.removeAttribute('open');
      done();
    });
    before.on('load', () => { addDynamic(before, p.manifest); done(); });
    after.on('error', (e) => { if (String(e?.error?.message ?? '').includes('WebGL')) setFailed('WebGL indisponível'); });

    // rotação lenta do globo enquanto a abertura está na tela
    let raf = 0;
    let last = performance.now();
    const spin = (t: number) => {
      const cur = latest.current;
      if (!cur.entered && !cur.reducedMotion && !after.isMoving()) {
        const c = after.getCenter();
        after.jumpTo({ center: [c.lng + ((t - last) / 1000) * 2.2, c.lat] });
      }
      last = t;
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);

    // clique: área de demonstração ou ficha do ponto
    after.on('click', (e) => {
      const cur = latest.current;
      if (cur.drawing || !cur.entered) return;
      const hit = after.queryRenderedFeatures(e.point, { layers: ['aoi-fill'] }).find((f) => f.properties?.kind === 'preset' && !f.properties?.active);
      if (hit) cur.onPickAoi(String(hit.properties!.id));
      else cur.onPickPoint(e.lngLat.lat, e.lngLat.lng);
    });
    const ro = new ResizeObserver(() => { after.resize(); before.resize(); });
    if (wrapEl.current) ro.observe(wrapEl.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); after.remove(); before.remove(); maps.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- abertura: globo deslocado para a direita e marcador pulsando sobre o quadro ----------
  useEffect(() => {
    const mm = maps.current;
    if (!ready || !mm) return;
    const el = wrapEl.current!;
    const pad = p.entered ? { left: 0, bottom: 0, top: 0, right: 0 } : heroPadding(el);
    mm.after.setPadding(pad);
    mm.before.setPadding(pad);
    if (p.entered) return;
    const dot = document.createElement('div');
    dot.className = 'frame-pulse';
    const fp = Object.values(p.manifest.nisar_frame.footprints)[0];
    const c: [number, number] = [fp.reduce((a, q) => a + q[0], 0) / fp.length, fp.reduce((a, q) => a + q[1], 0) / fp.length];
    const marker = new maplibregl.Marker({ element: dot }).setLngLat(c).addTo(mm.after);
    return () => { marker.remove(); };
  }, [ready, p.entered, p.manifest]);

  const fly = useCallback((corners: LngLat[], fast = false) => {
    const mm = maps.current;
    if (!mm) return;
    const b = boundsOf(corners);
    const still = fast || latest.current.reducedMotion;
    mm.after.fitBounds(b, { padding: 36, duration: still ? 0 : 4200, curve: 1.5, essential: true, maxZoom: 12.2 });
  }, []);
  useEffect(() => {
    if (!ready || !p.entered || !p.focus) return;
    const f = p.focus;
    // espera o layout assentar: um resize no meio do voo interromperia a animação
    const t = setTimeout(() => fly(f.corners, f.fast), 160);
    return () => clearTimeout(t);
  }, [ready, p.entered, p.focus, fly]);

  // ---------- imagens e sobreposições ----------
  useEffect(() => {
    const mm = maps.current;
    if (!ready || !mm) return;
    const swipe = p.mode === 'swipe';
    const sideA = p.before;
    const sideB = p.mode === 'toggle' && p.showBefore ? p.before : p.after;
    const apply = (map: MlMap, sc: Scene | null, withChange: boolean) => {
      const img = sc ? { url: sc.image, corners: sc.corners } : null;
      const isNisar = sc?.key === 'nisar';
      // a prévia NISAR do quadro fica sempre por baixo: dá contexto fora da área processada
      const nisarUnder = sc && !isNisar ? { url: dataUrl(p.manifest.nisar_frame.images[Object.keys(p.manifest.nisar_frame.images)[0]]), corners: p.manifest.nisar_frame.image_corners } : img;
      setImage(map, 'img-nisar', nisarUnder, isNisar ? p.imageOpacity : 0.35, !!sc);
      setImage(map, 'img-aoi', isNisar ? null : img, p.imageOpacity, !!sc && !isNisar);
      setImage(map, 'ov-forest', p.forest, 0.75 * p.overlayOpacity, p.layers.forest);
      setImage(map, 'ov-waterhist', p.waterHist, p.overlayOpacity, p.layers.waterHist);
      setImage(map, 'ov-water', p.water, p.overlayOpacity, p.layers.water);
      setImage(map, 'ov-change', p.change, p.overlayOpacity, withChange && p.layers.change);
      setImage(map, 'ov-corr', p.corroborated, p.overlayOpacity, withChange && p.layers.corroborated);
      for (const id of ['fires-glow', 'fires-core']) {
        map.setLayoutProperty(id, 'visibility', p.layers.fires ? 'visible' : 'none');
        map.setFilter(id, ['all', ['>=', ['get', 't'], p.fireWindow[0]], ['<=', ['get', 't'], p.fireWindow[1]]]);
      }
    };
    apply(mm.after, p.entered ? sideB : null, true);
    apply(mm.before, p.entered && swipe ? sideA : null, false);
  }, [ready, p.before, p.after, p.mode, p.showBefore, p.layers, p.overlayOpacity, p.imageOpacity, p.change, p.corroborated, p.forest, p.water, p.waterHist, p.fireWindow, p.entered, p.manifest]);

  // ---------- focos de calor ----------
  useEffect(() => {
    const mm = maps.current;
    if (!ready || !mm || !p.fires) return;
    const data = {
      type: 'FeatureCollection' as const,
      features: p.fires.rows.map((r) => ({ type: 'Feature' as const, properties: { t: toMs(r[2]), sat: r[3] }, geometry: { type: 'Point' as const, coordinates: [r[0], r[1]] } })),
    };
    (mm.after.getSource('fires') as GeoJSONSource).setData(data);
    (mm.before.getSource('fires') as GeoJSONSource).setData(data);
  }, [ready, p.fires]);

  // ---------- retângulos das áreas ----------
  const [drawBox, setDrawBox] = useState<[LngLat, LngLat] | null>(null);
  useEffect(() => {
    const mm = maps.current;
    if (!ready || !mm) return;
    const feats = p.manifest.aois.map((a) => rect(a.corners, { kind: 'preset', id: a.id, label: a.label, active: p.aoi?.id === a.id && !p.customCorners }));
    if (p.customCorners) feats.push(rect(p.customCorners, { kind: 'custom', active: true }));
    if (drawBox) {
      const [a, b] = drawBox;
      feats.push(rect([[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]], { kind: 'draw', active: false }));
    }
    const fc = { type: 'FeatureCollection' as const, features: feats };
    (mm.after.getSource('aois') as GeoJSONSource).setData(fc);
    (mm.before.getSource('aois') as GeoJSONSource).setData(fc);
  }, [ready, p.manifest, p.aoi, p.customCorners, drawBox]);

  // ---------- desenhar retângulo (mouse e toque) ----------
  useEffect(() => {
    const mm = maps.current;
    if (!ready || !mm || !p.drawing) return;
    const map = mm.after;
    map.dragPan.disable();
    map.touchZoomRotate.disable();
    map.getCanvas().style.cursor = 'crosshair';
    let start: LngLat | null = null;
    let end: LngLat | null = null;
    const down = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => { e.preventDefault(); start = [e.lngLat.lng, e.lngLat.lat]; end = start; setDrawBox([start, start]); };
    const move = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => { if (!start) return; end = [e.lngLat.lng, e.lngLat.lat]; setDrawBox([start, end]); };
    const up = () => {
      if (start && end && (Math.abs(start[0] - end[0]) > 1e-4 || Math.abs(start[1] - end[1]) > 1e-4)) latest.current.onDrawn(areaFromBox(start, end));
      start = null;
      setDrawBox(null);
    };
    map.on('mousedown', down); map.on('mousemove', move); map.on('mouseup', up);
    map.on('touchstart', down); map.on('touchmove', move); map.on('touchend', up);
    return () => {
      map.off('mousedown', down); map.off('mousemove', move); map.off('mouseup', up);
      map.off('touchstart', down); map.off('touchmove', move); map.off('touchend', up);
      map.dragPan.enable();
      map.touchZoomRotate.enable();
      map.touchZoomRotate.disableRotation();
      map.getCanvas().style.cursor = '';
      setDrawBox(null);
    };
  }, [ready, p.drawing]);

  // ---------- divisor antes/depois: mouse, toque e teclado ----------
  const dragging = useRef(false);
  const onPointer = (e: React.PointerEvent) => {
    if (!dragging.current || !wrapEl.current) return;
    const r = wrapEl.current.getBoundingClientRect();
    setSplit(Math.min(98, Math.max(2, ((e.clientX - r.left) / r.width) * 100)));
  };
  const swipeOn = p.entered && p.mode === 'swipe' && !p.drawing && !!p.before;
  const tag = (s: Scene | null) => (s ? `${s.title} · ${fmtDate(s.date)}` : 'sem cena');

  return (
    <div className="stage" ref={wrapEl} onPointerMove={onPointer} onPointerUp={() => (dragging.current = false)} onPointerLeave={() => (dragging.current = false)}>
      <div className="stage-map" ref={afterEl} aria-label="Mapa: cena posterior" />
      <div className="stage-map stage-before" ref={beforeEl} aria-hidden={!swipeOn} style={{ clipPath: `inset(0 ${swipeOn ? 100 - split : 100}% 0 0)`, visibility: swipeOn ? 'visible' : 'hidden' }} />
      {failed && <div className="stage-msg" role="alert">O mapa 3D não pôde ser iniciado ({failed}). Recarregue a página ou use a comparação simples abaixo.</div>}
      {swipeOn && (
        <>
          <div className="split-line" style={{ left: `${split}%` }} />
          <button
            type="button" className="split-handle" style={{ left: `${split}%` }} role="slider" aria-label="Divisor antes e depois" aria-orientation="horizontal"
            aria-valuemin={2} aria-valuemax={98} aria-valuenow={Math.round(split)}
            onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
            onPointerUp={() => (dragging.current = false)}
            onKeyDown={(e) => { if (e.key === 'ArrowLeft') setSplit((s) => Math.max(2, s - 4)); if (e.key === 'ArrowRight') setSplit((s) => Math.min(98, s + 4)); }}
          >
            <span aria-hidden="true">◂ ▸</span>
          </button>
          <div className="side-tag side-a"><b>ANTES</b> {tag(p.before)}</div>
        </>
      )}
      {p.entered && (
        <div className="side-tag side-b">
          <b>{p.mode === 'toggle' && p.showBefore ? 'ANTES' : p.mode === 'delta' ? 'DIFERENÇA SOBRE' : 'DEPOIS'}</b> {tag(p.mode === 'toggle' && p.showBefore ? p.before : p.after)}
        </div>
      )}
      {p.drawing && <div className="draw-hint" role="status">Arraste no mapa para desenhar o retângulo da área.</div>}
    </div>
  );
}
