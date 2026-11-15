import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import EvidenceCard from './components/EvidenceCard';
import Hero from './components/Hero';
import MapStage, { webglAvailable, type Focus, type Overlay } from './components/MapStage';
import { AreaPanel, LayersPanel } from './components/Panels';
import StaticStage from './components/StaticStage';
import Timeline, { type DayValue } from './components/Timeline';
import { buildScenes, dataUrl, loadFires, loadManifest, sceneById, stepScene } from './lib/data';
import { computeDelta, type DeltaResult } from './lib/delta';
import { buildEvidence } from './lib/evidence';
import { areaCorners, coverage, pointInPolygon } from './lib/geo';
import { dayMs, fmtDate, toMs } from './lib/time';
import type { CompareMode, Corners, CustomArea, FiresFile, LayerState, Manifest, S1Scene, S2Scene, SensorKey } from './lib/types';

const SciencePage = lazy(() => import('./components/SciencePage'));
const InfoPages = lazy(() => import('./components/InfoPages'));

type View = 'explorar' | 'linha-do-tempo' | 'ciencia' | 'fontes' | 'sobre';
const VIEWS: { id: View; label: string }[] = [
  { id: 'explorar', label: 'Explorar' }, { id: 'linha-do-tempo', label: 'Linha do tempo' }, { id: 'ciencia', label: 'Ciência' }, { id: 'fontes', label: 'Fontes' }, { id: 'sobre', label: 'Sobre' },
];
const viewFromHash = (): View => (VIEWS.find((v) => `#${v.id}` === location.hash)?.id ?? 'explorar');
const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* armazenamento indisponível: segue sem salvar */ } },
};

function areaFromQuery(): CustomArea | null {
  try {
    const q = new URLSearchParams(location.search);
    const lat = Number(q.get('lat'));
    const lon = Number(q.get('lon'));
    const r = Number(q.get('r') ?? 15);
    if (q.has('lat') && q.has('lon') && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && r >= 0.5 && r <= 150) return { lat, lon, radiusKm: r };
  } catch { /* sem query string neste ambiente */ }
  return null;
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [fires, setFires] = useState<FiresFile | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [view, setView] = useState<View>(viewFromHash);
  const [entered, setEntered] = useState(() => viewFromHash() !== 'explorar' || !!areaFromQuery());
  const [aoiId, setAoiId] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomArea | null>(areaFromQuery);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [mode, setMode] = useState<CompareMode>('swipe');
  const [showBefore, setShowBefore] = useState(false);
  const [target, setTarget] = useState<'before' | 'after'>('after');
  const [layers, setLayers] = useState<LayerState>({ change: true, corroborated: false, forest: false, water: false, waterHist: false, fires: true, rain: true });
  const [overlayOpacity, setOverlayOpacity] = useState(0.9);
  const [imageOpacity, setImageOpacity] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [delta, setDelta] = useState<DeltaResult | null>(null);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [liveRain, setLiveRain] = useState<{ key: string; days: DayValue[] | null; note: string } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => store.get<boolean>('sartellite.reduce') ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [panel, setPanel] = useState<'area' | 'camadas' | 'ficha'>('area');
  const webgl = useMemo(webglAvailable, []);
  const [focus, setFocus] = useState<Focus | null>(null);
  const lookAt = useCallback((corners: [number, number][], fast: boolean) => setFocus((f) => ({ corners, fast, n: (f?.n ?? 0) + 1 })), []);

  // ---------- dados ----------
  useEffect(() => {
    loadManifest().then((m) => {
      setManifest(m);
      setAoiId(m.aois[0]?.id ?? null);
      loadFires(m).then(setFires).catch(() => setFires(null));
    }).catch((e) => setFatal(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    const on = () => { const v = viewFromHash(); setView(v); if (v !== 'explorar') setEntered(true); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', reducedMotion); store.set('sartellite.reduce', reducedMotion); }, [reducedMotion]);
  const go = (v: View) => { location.hash = v; setView(v); if (v !== 'explorar') setEntered(true); };

  // ---------- área ativa e cenas ----------
  const aoi = useMemo(() => (custom ? null : manifest?.aois.find((a) => a.id === aoiId) ?? null), [manifest, aoiId, custom]);
  const footprints = useMemo(() => (manifest ? Object.values(manifest.nisar_frame.footprints) : []), [manifest]);
  const customCorners = useMemo<Corners | null>(() => (custom ? areaCorners(custom) : null), [custom]);
  const cov = useMemo(() => (customCorners ? coverage(customCorners, footprints) : 'full'), [customCorners, footprints]);
  const scenes = useMemo(() => (!manifest ? [] : custom ? (cov === 'full' ? buildScenes(manifest, null) : []) : aoi ? buildScenes(manifest, aoi) : []), [manifest, custom, cov, aoi]);
  const areaCornersNow = customCorners ?? aoi?.corners ?? null;

  useEffect(() => {
    const nisar = scenes.filter((s) => s.key === 'nisar');
    setBeforeId(nisar[0]?.id ?? scenes[0]?.id ?? null);
    setAfterId(nisar[nisar.length - 1]?.id ?? scenes[scenes.length - 1]?.id ?? null);
    setPlaying(false);
    setDelta(null);
  }, [scenes]);

  const before = sceneById(scenes, beforeId);
  const after = sceneById(scenes, afterId);

  // ---------- sobreposições ----------
  const sameS1 = !!before && !!after && before.key === 's1' && after.key === 's1' && before.id !== after.id && before.orbit === after.orbit;
  useEffect(() => {
    if (!sameS1 || !aoi || !before || !after) { setDelta(null); return; }
    const [a, b] = before.date <= after.date ? [before, after] : [after, before];
    let live = true;
    computeDelta(a.image, b.image, a.raw as S1Scene, aoi.size_km).then((d) => live && setDelta(d)).catch(() => live && setDelta(null));
    return () => { live = false; };
  }, [sameS1, aoi, before, after]);

  const none: Overlay = useMemo(() => ({ url: null, corners: [[0, 0], [0, 0], [0, 0], [0, 0]] }), []);
  const change: Overlay = useMemo(() => {
    if (!manifest || !before || !after || before.id === after.id) return none;
    if (before.key === 'nisar' && after.key === 'nisar') return { url: dataUrl(manifest.nisar_frame.diff.image), corners: manifest.nisar_frame.image_corners };
    if (sameS1 && delta && aoi) return { url: delta.url, corners: aoi.corners };
    return none;
  }, [manifest, before, after, sameS1, delta, aoi, none]);
  const aoiImg = useCallback((path: string | undefined): Overlay => (aoi && path ? { url: dataUrl(`${aoi.id}/${path}`), corners: aoi.corners } : none), [aoi, none]);
  const waterScene = useMemo(() => {
    if (!aoi || !after) return null;
    const clear = aoi.scenes.s2.filter((s) => s.cloud_fraction_aoi < 0.15);
    return clear.reduce<S2Scene | null>((best, s) => (!best || Math.abs(toMs(s.acquired_at) - toMs(after.acquiredAt)) < Math.abs(toMs(best.acquired_at) - toMs(after.acquiredAt)) ? s : best), null);
  }, [aoi, after]);

  // ---------- focos e chuva da área ----------
  const win = manifest?.window ?? ['2026-06-01', '2026-11-13'];
  const fireWindow = useMemo<[number, number]>(() => {
    if (!after) return [0, 0];
    const a = before ? Math.min(toMs(before.date), toMs(after.date)) : toMs(win[0]);
    const b = Math.max(toMs((before ?? after).date), toMs(after.date)) + dayMs;
    return [a, b];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after]);
  const firesDaily = useMemo<DayValue[] | null>(() => {
    if (!fires || !areaCornersNow) return null;
    const poly = areaCornersNow;
    const by = new Map<string, number>();
    for (const r of fires.rows) if (pointInPolygon([r[0], r[1]], poly)) by.set(r[2].slice(0, 10), (by.get(r[2].slice(0, 10)) ?? 0) + 1);
    return [...by.entries()].map(([date, v]) => ({ date, v })).sort((a, b) => a.date.localeCompare(b.date));
  }, [fires, areaCornersNow]);

  useEffect(() => {
    if (!custom) return;
    const key = `${custom.lat.toFixed(3)},${custom.lon.toFixed(3)}`;
    if (liveRain?.key === key) return;
    setLiveRain({ key, days: null, note: 'consultando NASA POWER…' });
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG&longitude=${custom.lon.toFixed(4)}&latitude=${custom.lat.toFixed(4)}&start=${win[0].replace(/-/g, '')}&end=${win[1].replace(/-/g, '')}&format=JSON`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    fetch(url, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((d) => {
      const p = d.properties.parameter.PRECTOTCORR as Record<string, number>;
      setLiveRain({ key, note: '', days: Object.keys(p).sort().map((k) => ({ date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)}`, v: p[k] >= 0 ? p[k] : null })) });
    }).catch(() => setLiveRain({ key, days: null, note: 'serviço indisponível aqui' })).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom]);
  const rainDays: DayValue[] | null = custom ? liveRain?.days ?? null : aoi ? aoi.rain.days.map((d) => ({ date: d.date, v: d.mm })) : null;

  // ---------- linha do tempo ----------
  const select = useCallback((id: string, as: 'before' | 'after') => { if (as === 'before') setBeforeId(id); else setAfterId(id); }, []);
  const step = useCallback((dir: 1 | -1) => { if (afterId && scenes.length) setAfterId(stepScene(scenes, afterId, dir, true).id); }, [afterId, scenes]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => step(1), 1700 / speed);
    return () => clearInterval(t);
  }, [playing, speed, step]);
  const pickSensor = (k: SensorKey) => {
    const pool = scenes.filter((s) => s.key === k);
    if (!pool.length) return;
    const ref = after ? toMs(after.acquiredAt) : 0;
    const near = pool.reduce((b, s) => (Math.abs(toMs(s.acquiredAt) - ref) < Math.abs(toMs(b.acquiredAt) - ref) ? s : b), pool[0]);
    setAfterId(near.id === pool[0].id && pool.length > 1 ? pool[pool.length - 1].id : near.id);
    setBeforeId(pool[0].id);
  };

  // ---------- navegação no mapa ----------
  const enter = () => { setEntered(true); if (areaCornersNow) lookAt(areaCornersNow, false); };
  const choosePreset = (id: string) => { setCustom(null); setAoiId(id); setDrawing(false); const a = manifest?.aois.find((x) => x.id === id); if (a) lookAt(a.corners, true); };
  const chooseCustom = (a: CustomArea) => { setCustom(a); setDrawing(false); setPoint(null); store.set('sartellite.area', a); lookAt(areaCorners(a), true); };
  useEffect(() => { if (entered && manifest && !focus) { const c = custom ? areaCorners(custom) : manifest.aois[0]?.corners; if (c) lookAt(c, true); } /* chegada por link direto */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, entered]);

  const stories = useMemo(() => {
    if (!aoi) return [];
    const has = (id: string) => scenes.some((s) => s.id === id);
    const out: { label: string; run: () => void }[] = [];
    const n = aoi.scenes.nisar;
    const cloudy = aoi.scenes.s2.find((s) => s.cloud_fraction_aoi > 0.5 && n.some((x) => x.acquired_at.slice(0, 10) === s.acquired_at.slice(0, 10)));
    if (cloudy) out.push({ label: `Nuvem × radar em ${fmtDate(cloudy.acquired_at, false)}`, run: () => { setMode('swipe'); setBeforeId(cloudy.id); setAfterId(`nisar-${cloudy.acquired_at.slice(0, 10)}`); } });
    if (n.length > 1) out.push({ label: 'NISAR: junho × outubro', run: () => { setMode('swipe'); setBeforeId(n[0].id); setAfterId(n[n.length - 1].id); setLayers((l) => ({ ...l, change: true })); } });
    const pair = aoi.analysis.s1_pair;
    if (has(pair.before) && has(pair.after)) out.push({ label: 'Sentinel-1: o que mudou na seca', run: () => { setMode('delta'); setBeforeId(pair.before); setAfterId(pair.after); setLayers((l) => ({ ...l, change: true, corroborated: !!aoi.analysis.corroboration })); } });
    return out;
  }, [aoi, scenes]);

  const evidence = useMemo(() => (manifest ? buildEvidence(manifest, aoi, before, after, delta) : null), [manifest, aoi, before, after, delta]);
  const pointInfo = useMemo(() => {
    if (!point) return null;
    const inFrame = footprints.every((f) => pointInPolygon([point.lon, point.lat], f));
    let n: number | null = null;
    if (fires) {
      const dLat = 2 / 111.32;
      const dLon = dLat / Math.cos((point.lat * Math.PI) / 180);
      n = fires.rows.filter((r) => Math.abs(r[1] - point.lat) < dLat && Math.abs(r[0] - point.lon) < dLon && toMs(r[2]) >= fireWindow[0] && toMs(r[2]) <= fireWindow[1]).length;
    }
    return { ...point, inFrame, fires: n };
  }, [point, footprints, fires, fireWindow]);

  if (fatal) {
    return <div className="fatal" role="alert"><h1>SARtellite</h1><p>Não foi possível carregar os dados locais ({fatal}).</p><p>Confira se a pasta <code>data/</code> foi publicada junto com o site e recarregue a página.</p></div>;
  }

  const hasScenes = { nisar: scenes.some((s) => s.key === 'nisar'), s1: scenes.some((s) => s.key === 's1'), s2: scenes.some((s) => s.key === 's2') };
  const deltaBlocked = !before || !after || before.id === after.id || before.key !== after.key || before.key === 's2' || (before.key === 's1' && before.orbit !== after.orbit);
  const changeNote = !before || !after ? 'Selecione duas cenas.' : deltaBlocked ? 'Exige duas datas do mesmo radar (NISAR com NISAR, Sentinel-1 com Sentinel-1).' : after.key === 'nisar' ? 'Diferença de brilho entre as prévias NISAR. Laranja: eco mais fraco. Azul-esverdeado: mais forte.' : 'Diferença de VH em dB entre as duas datas, calculada no navegador.';
  const waterNote = !aoi ? 'Só nas áreas já processadas.' : waterScene ? `Classe água do Sentinel-2 em ${fmtDate(waterScene.acquired_at)}: ${waterScene.water_area_ha.toLocaleString('pt-BR')} ha.` : 'Sem cena óptica limpa próxima.';
  const rainNote = custom ? (liveRain?.days ? 'NASA POWER no centro da área (consulta ao vivo). Resolução de cerca de 50 km.' : `NASA POWER: ${liveRain?.note ?? 'não disponível'}. Nas áreas processadas a série já vem embutida.`) : 'NASA POWER no centro da área, mm/dia. Resolução de cerca de 50 km: contexto regional.';
  const exploring = view === 'explorar' || view === 'linha-do-tempo';

  return (
    <div className={`app${entered ? '' : ' pre'}`}>
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <header className="top">
        <button type="button" className="brand" onClick={() => go('explorar')} aria-label="SARtellite, início">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><circle cx="16" cy="16" r="4" fill="#39C6C3" /><path d="M5 16a11 11 0 0 1 11-11M27 16a11 11 0 0 1-11 11" stroke="#F6A24F" strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>
          <span>SAR<em>tellite</em></span>
        </button>
        <nav aria-label="Seções">
          {VIEWS.map((v) => <a key={v.id} href={`#${v.id}`} className={view === v.id ? 'on' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(v.id); }}>{v.label}</a>)}
        </nav>
        <div className="top-right">
          <span className={`pill ${manifest?.is_demo ? 'demo' : 'real'}`}>{manifest?.is_demo ? 'Demonstração' : 'Dados reais'}</span>
          <label className="motion" htmlFor="rm"><input id="rm" type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} /> Reduzir movimento</label>
        </div>
      </header>
      {manifest?.is_demo && <div className="demo-banner" role="status">DEMONSTRAÇÃO ILUSTRATIVA. Não são medições por satélite.</div>}

      <main id="conteudo">
        <div className={`explorer${view === 'linha-do-tempo' ? ' tl-focus' : ''}`} hidden={!exploring}>
          <aside className="side left" aria-label="Área e camadas">
            <div className="m-tabs" role="tablist" aria-label="Painéis">
              {(['area', 'camadas', 'ficha'] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={panel === t} className={panel === t ? 'on' : ''} onClick={() => setPanel(t)}>{t === 'area' ? 'Área' : t === 'camadas' ? 'Camadas' : 'Ficha'}</button>)}
            </div>
            {manifest && (
              <>
                <div className={panel === 'area' ? '' : 'm-hide'}>
                  <AreaPanel manifest={manifest} aoi={aoi} custom={custom} coverage={cov} drawing={drawing} point={pointInfo} onPreset={choosePreset} onCustom={chooseCustom} onDraw={() => setDrawing((d) => !d)} onFrame={() => lookAt(footprints.flat(), false)} onClearPoint={() => setPoint(null)} />
                </div>
                <div className={panel === 'camadas' ? '' : 'm-hide'}>
                  <LayersPanel aoi={aoi} hasScenes={hasScenes} activeSensor={after?.key ?? null} layers={layers} changeNote={changeNote} waterNote={waterNote} rainNote={rainNote} overlayOpacity={overlayOpacity} imageOpacity={imageOpacity} onSensor={pickSensor} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} onOverlayOpacity={setOverlayOpacity} onImageOpacity={setImageOpacity} />
                </div>
              </>
            )}
          </aside>

          <div className="center">
            {entered && (
              <div className="tools">
                <div className="seg" role="group" aria-label="Modo de comparação">
                  <button type="button" className={mode === 'swipe' ? 'on' : ''} aria-pressed={mode === 'swipe'} onClick={() => setMode('swipe')}>Divisor</button>
                  <button type="button" className={mode === 'toggle' ? 'on' : ''} aria-pressed={mode === 'toggle'} onClick={() => setMode('toggle')}>Alternar</button>
                  <button type="button" className={mode === 'delta' ? 'on' : ''} aria-pressed={mode === 'delta'} onClick={() => { setMode('delta'); setLayers((l) => ({ ...l, change: true })); }}>Diferença</button>
                </div>
                {mode === 'toggle' && <button type="button" className="btn" aria-pressed={showBefore} onClick={() => setShowBefore((v) => !v)}>Mostrando: {showBefore ? 'antes' : 'depois'}</button>}
                {mode === 'delta' && deltaBlocked && <span className="note">Diferença exige duas datas do mesmo radar.</span>}
                {stories.length > 0 && (
                  <div className="stories" role="group" aria-label="Roteiros prontos">
                    <span>Roteiros</span>
                    {stories.map((s) => <button key={s.label} type="button" className="chip" onClick={s.run}>{s.label}</button>)}
                  </div>
                )}
              </div>
            )}
            <div className="stage-wrap">
              {manifest && webgl && (
                <MapStage
                  manifest={manifest} fires={fires} entered={entered} focus={focus} reducedMotion={reducedMotion} aoi={aoi} customCorners={customCorners}
                  before={before} after={after} mode={mode} showBefore={showBefore} layers={layers} overlayOpacity={overlayOpacity} imageOpacity={imageOpacity}
                  change={change} corroborated={aoiImg(aoi?.analysis.corroboration?.image)} forest={aoiImg(aoi?.reference.lulc.image_forest)}
                  water={waterScene ? aoiImg(waterScene.water_mask) : none} waterHist={aoiImg(aoi?.reference.jrc.image)} fireWindow={fireWindow}
                  drawing={drawing} onDrawn={chooseCustom} onPickAoi={choosePreset} onPickPoint={(lat, lon) => { setPoint({ lat, lon }); setPanel('area'); }}
                />
              )}
              {manifest && !webgl && <StaticStage aoi={aoi ?? manifest.aois[0]} before={before} after={after} mode={mode} showBefore={showBefore} />}
              {!manifest && <div className="stage-msg">Carregando dados locais…</div>}
              {entered && (
                <ul className="legend" aria-label="Legenda">
                  {layers.change && change.url && <><li><i className="sw sw-change" />eco mais fraco</li><li><i className="sw sw-rise" />eco mais forte</li></>}
                  {layers.corroborated && aoi?.analysis.corroboration && <li><i className="sw sw-corr" />radar + óptico</li>}
                  {layers.forest && aoi && <li><i className="sw sw-forest" />árvores (referência)</li>}
                  {layers.water && aoi && <li><i className="sw sw-water" />água (Sentinel-2)</li>}
                  {layers.waterHist && aoi && <li><i className="sw sw-waterh" />água histórica</li>}
                  {layers.fires && <li><i className="sw sw-fire" />foco de calor</li>}
                  <li><i className="sw sw-frame" />quadro NISAR</li>
                </ul>
              )}
              {!entered && <Hero ready={!!manifest} onEnter={enter} onScience={() => go('ciencia')} />}
            </div>
          </div>

          <aside className={`side right${panel === 'ficha' ? '' : ' m-hide'}`} aria-label="Ficha da evidência">
            <EvidenceCard info={evidence} />
          </aside>

          {manifest && (
            <Timeline
              window={manifest.window} scenes={scenes} beforeId={beforeId} afterId={afterId} target={target} onTarget={setTarget} onSelect={select} onStep={step}
              playing={playing} onPlay={() => setPlaying((v) => !v)} speed={speed} onSpeed={setSpeed}
              fires={firesDaily} rain={rainDays} rainNote={custom ? liveRain?.note ?? 'não disponível' : 'não disponível'} showFires={layers.fires} showRain={layers.rain}
              emptyMessage={custom && cov !== 'full' ? 'Sem cenas processadas para estas coordenadas. Nenhuma data é inventada.' : null}
            />
          )}
        </div>

        <Suspense fallback={<div className="page"><p>Carregando…</p></div>}>
          {view === 'ciencia' && <SciencePage reducedMotion={reducedMotion} onExplore={() => go('explorar')} />}
          {(view === 'fontes' || view === 'sobre') && manifest && <InfoPages view={view} manifest={manifest} />}
        </Suspense>
      </main>
    </div>
  );
}
