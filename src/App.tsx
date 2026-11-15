import { lazy, Suspense, useEffect, useState } from 'react';
import Home from './components/Home';
import MapPage from './components/MapPage';
import { loadRo, type Filters, type Layer, type RoData } from './lib/ro';

const Profile = lazy(() => import('./components/Profile'));
const ComoFunciona = lazy(() => import('./components/ComoFunciona'));
const Fontes = lazy(() => import('./components/Pages').then((m) => ({ default: m.Fontes })));
const Danca = lazy(() => import('./components/Danca'));

type View = 'inicio' | 'mapa' | 'danca' | 'perfil' | 'como-funciona' | 'fontes';
// ícone de cada aba (aparece na barra de baixo do celular)
const VIEWS: { id: View; label: string; curto: string; d: string }[] = [
  { id: 'inicio', label: 'Início', curto: 'Início', d: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z' },
  { id: 'mapa', label: 'Mapa', curto: 'Mapa', d: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14' },
  { id: 'danca', label: 'A dança', curto: 'Dança', d: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 12a9 9 0 0 1 9-9m9 9a9 9 0 0 1-9 9' },
  { id: 'perfil', label: 'Meu painel', curto: 'Painel', d: 'M4 13h6V4H4zm10 7h6V4h-6zM4 20h6v-3H4z' },
  { id: 'como-funciona', label: 'Como funciona', curto: 'Como', d: 'M5 5h4v4H5zm10 0h4v4h-4zM10 15h4v4h-4zM9 7h6m-3 2v6' },
  { id: 'fontes', label: 'Fontes', curto: 'Fontes', d: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7' },
];
const viewFromHash = (): View => VIEWS.find((v) => `#${v.id}` === location.hash)?.id ?? 'inicio';
const ALL: Record<Layer, boolean> = { fogo: true, floresta: true };

export default function App() {
  const [data, setData] = useState<RoData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [view, setView] = useState<View>(viewFromHash);
  const [mapSeen, setMapSeen] = useState(view === 'mapa');
  const [filters, setFilters] = useState<Filters>({ range: [0, 0], hours: [0, 24], municipio: null, layers: ALL, fracos: false, soProtegidas: false, duvidas: true });
  const [jump, setJump] = useState<{ id: string | null; n: number; ev?: boolean }>({ id: null, n: 0 });
  const [reduce, setReduce] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  useEffect(() => {
    loadRo().then((d) => { setData(d); setFilters((f) => ({ ...f, range: [0, d.periods.length * 12 - 1] })); }).catch((e) => setFatal(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (view === 'mapa') setMapSeen(true);
    if (view !== 'mapa') window.scrollTo({ top: 0 });
  }, [view]);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', reduce); }, [reduce]);
  const go = (v: View) => { if (location.hash !== `#${v}`) location.hash = v; setView(v); };
  const openMap = (only?: Layer) => {
    if (only) setFilters((f) => ({ ...f, layers: { fogo: only === 'fogo', floresta: only === 'floresta' } }));
    else setFilters((f) => ({ ...f, layers: ALL }));
    go('mapa');
  };

  return (
    <div className={`app v-${view}`}>
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <nav className="nav glass" aria-label="Principal">
        <button type="button" className="brand" onClick={() => go('inicio')} aria-label="SARtellite, início">
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><circle cx="16" cy="16" r="5" fill="#7fe3ff" /><path d="M4 16a12 12 0 0 1 12-12M28 16a12 12 0 0 1-12 12" stroke="#7fe3ff" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".6" /><path d="M9 16a7 7 0 0 1 7-7M23 16a7 7 0 0 1-7 7" stroke="#7fe3ff" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          <span>SARtellite</span>
        </button>
        <div className="tabs">
          {VIEWS.map((v) => <button key={v.id} type="button" className={view === v.id ? 'on' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}><svg className="tab-ic" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={v.d} /></svg><span className="tab-l">{v.label}</span><span className="tab-s" aria-hidden="true">{v.curto}</span></button>)}
        </div>
        <button type="button" className="round motion" aria-pressed={reduce} onClick={() => setReduce((r) => !r)} title={reduce ? 'Movimento reduzido' : 'Reduzir movimento'} aria-label="Reduzir movimento">{reduce ? '◼' : '◉'}</button>
      </nav>

      <main id="conteudo">
        {fatal && <div className="page"><p className="banner glass" role="alert">Não deu para carregar os dados ({fatal}). Recarregue a página.</p></div>}
        {!data && !fatal && <div className="loading" role="status"><span className="pulse" />Carregando dados do radar…</div>}
        {data && (
          <>
            {view === 'inicio' && <Home data={data} onOpen={openMap} go={go} />}
            {mapSeen && (
              <div className={`map-shell${view === 'mapa' ? '' : ' hidden'}`} aria-hidden={view !== 'mapa'}>
                <MapPage data={data} filters={filters} setFilters={setFilters} reduce={reduce} jump={jump} />
              </div>
            )}
            <Suspense fallback={<div className="loading"><span className="pulse" /></div>}>
              {view === 'perfil' && <Profile data={data} onOpenMun={(id) => { setFilters((f) => ({ ...f, layers: ALL })); setJump((j) => ({ id, n: j.n + 1 })); go('mapa'); }} onOpenEvent={(id) => { setFilters((f) => ({ ...f, layers: ALL, fracos: true, duvidas: true })); setJump((j) => ({ id, n: j.n + 1, ev: true })); go('mapa'); }} />}
              {view === 'como-funciona' && <ComoFunciona data={data} onMap={(id) => { setFilters((f) => ({ ...f, layers: ALL, fracos: true, duvidas: true })); setJump((j) => ({ id, n: j.n + 1, ev: true })); go('mapa'); }} />}
              {view === 'fontes' && <Fontes data={data} />}
              {view === 'danca' && <Danca data={data} onMap={() => openMap('floresta')} />}
            </Suspense>
          </>
        )}
      </main>
    </div>
  );
}
