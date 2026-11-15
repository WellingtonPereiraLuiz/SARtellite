import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FarmDetail, ForestDetail, MunDetail } from './components/Detail';
import MapView, { COLORS, RO_BOUNDS, type Pick } from './components/MapView';
import TimeBar, { type PeriodStat } from './components/TimeBar';
import { CERTEZA, filterEvents, filterFarm, frase, loadRo, totals, type Filters, type RoData } from './lib/ro';
import { fmtDate, fmtNum } from './lib/time';

const haTxt = (ha: number) => (ha >= 1000 ? `${fmtNum(ha / 1000)} mil ha` : `${fmtNum(ha)} ha`);
const Pages = lazy(() => import('./components/Pages'));

type View = 'mapa' | 'como-funciona' | 'fontes' | 'sobre';
const VIEWS: { id: View; label: string }[] = [{ id: 'mapa', label: 'Mapa' }, { id: 'como-funciona', label: 'Como funciona' }, { id: 'fontes', label: 'Fontes' }, { id: 'sobre', label: 'Sobre' }];
const viewFromHash = (): View => VIEWS.find((v) => `#${v.id}` === location.hash)?.id ?? 'mapa';
const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: segue sem lembrar */ } },
};

function boundsOfGeometry(g: unknown): [[number, number], [number, number]] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') { const [x, y] = c as number[]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } else if (Array.isArray(c)) c.forEach(walk);
  };
  walk(g);
  return [[x0, y0], [x1, y1]];
}

export default function App() {
  const [data, setData] = useState<RoData | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [view, setView] = useState<View>(viewFromHash);
  const [filters, setFilters] = useState<Filters>({ range: [0, 0], municipio: null, floresta: true, lavoura: true, fracos: false, soProtegidas: false });
  const [pick, setPick] = useState<Pick>(null);
  const [focus, setFocus] = useState<{ bounds: [[number, number], [number, number]]; n: number } | null>(null);
  const [showProt, setShowProt] = useState(false);
  const [showBase, setShowBase] = useState(true);
  const [intro, setIntro] = useState(() => !store.get<boolean>('sartellite.intro-visto'));
  const [reduce, setReduce] = useState(() => store.get<boolean>('sartellite.reduce') ?? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  useEffect(() => {
    loadRo().then((d) => { setData(d); setFilters((f) => ({ ...f, range: [0, d.periods.length - 1] })); }).catch((e) => setFatal(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', reduce); store.set('sartellite.reduce', reduce); }, [reduce]);
  const go = (v: View) => { location.hash = v; setView(v); };
  const flyTo = useCallback((bounds: [[number, number], [number, number]]) => setFocus((f) => ({ bounds, n: (f?.n ?? 0) + 1 })), []);

  const events = useMemo(() => (data ? filterEvents(data.events, filters) : []), [data, filters]);
  const farm = useMemo(() => (data ? filterFarm(data.farm, filters) : []), [data, filters]);
  const t = useMemo(() => totals(events, farm), [events, farm]);
  const stats = useMemo<PeriodStat[]>(() => {
    if (!data) return [];
    const f = { ...filters, range: [0, data.periods.length - 1] as [number, number] };
    const ev = filterEvents(data.events, f);
    const fa = filterFarm(data.farm, f);
    return data.periods.map((p) => ({
      floresta: ev.filter((e) => e.period === p.i).reduce((a, e) => a + e.area_ha, 0),
      colheita: fa.filter((r) => r[2] === p.i && r[5] === 'colheita').reduce((a, r) => a + r[4], 0),
      plantio: fa.filter((r) => r[2] === p.i && r[5] === 'plantio').reduce((a, r) => a + r[4], 0),
      misto: fa.filter((r) => r[2] === p.i && r[5] === 'misto').reduce((a, r) => a + r[4], 0),
    }));
  }, [data, filters]);

  const selected = pick?.kind === 'floresta' ? data?.events.find((e) => e.id === pick.id) ?? null : null;
  const munSel = data?.municipios.find((m) => m.id === filters.municipio);
  const setMun = (id: string | null) => {
    setFilters((f) => ({ ...f, municipio: id }));
    const m = data?.municipios.find((x) => x.id === id);
    flyTo(m ? boundsOfGeometry(m.geometry) : RO_BOUNDS);
  };
  const openEvent = (id: string) => {
    const e = data?.events.find((x) => x.id === id);
    if (!e) return;
    setPick({ kind: 'floresta', id });
    const d = 0.09;
    flyTo([[e.lon - d, e.lat - d], [e.lon + d, e.lat + d]]);
  };

  if (fatal) return <div className="fatal" role="alert"><h1>SARtellite</h1><p>Não foi possível carregar os dados ({fatal}). Confira se a pasta <code>data/</code> foi publicada junto com o site.</p></div>;

  const rank = { confirmado: 0, provavel: 1, possivel: 2 } as const;
  const list = [...events].sort((a, b) => rank[a.certeza] - rank[b.certeza] || b.area_ha - a.area_ha);
  const periodTxt = data ? (filters.range[0] === 0 && filters.range[1] === data.periods.length - 1 ? `desde ${fmtDate(data.periods[0].start)}` : `de ${fmtDate(data.periods[filters.range[0]].start)} a ${fmtDate(data.periods[filters.range[1]].end)}`) : '';
  const lugar = munSel ? `em ${munSel.nome}` : 'em Rondônia';

  return (
    <div className="app">
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <header className="top">
        <button type="button" className="brand" onClick={() => go('mapa')} aria-label="SARtellite, mapa">
          <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><circle cx="16" cy="16" r="4" fill="#39C6C3" /><path d="M5 16a11 11 0 0 1 11-11M27 16a11 11 0 0 1-11 11" stroke="#FF6B3D" strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>
          <span>SAR<em>tellite</em></span>
        </button>
        <nav aria-label="Seções">
          {VIEWS.map((v) => <a key={v.id} href={`#${v.id}`} className={view === v.id ? 'on' : ''} aria-current={view === v.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(v.id); }}>{v.label}</a>)}
        </nav>
        <p className="tagline">O que o radar NISAR viu mudar em Rondônia</p>
        <label className="motion" htmlFor="rm"><input id="rm" type="checkbox" checked={reduce} onChange={(e) => setReduce(e.target.checked)} /> Reduzir movimento</label>
      </header>

      <main id="conteudo">
        {view === 'mapa' && (
          <div className="layout">
            <aside className="side" aria-label="Resumo e filtros">
              <section className="hello">
                <h1>O que mudou {lugar} {periodTxt}?</h1>
                <p>Um satélite de radar, o <b>NISAR</b> (NASA e Índia), passa por Rondônia a cada 12 dias. Ele enxerga mesmo com nuvem e fumaça. O SARtellite transforma essas imagens em duas respostas simples:</p>
              </section>

              <div className="insights">
                <button type="button" className={`insight${filters.floresta ? ' on' : ''}`} aria-pressed={filters.floresta} onClick={() => setFilters((f) => ({ ...f, floresta: !f.floresta }))}>
                  <span className="dot" style={{ background: COLORS.floresta }} />
                  <span className="i-title">Floresta derrubada</span>
                  <span className="i-num">{fmtNum(t.florestaHa)} <small>ha</small></span>
                  <span className="i-sub">{t.florestaN} {t.florestaN === 1 ? 'lugar' : 'lugares'} · {t.confirmados} o INPE também viu · {t.comFogo} tiveram fogo</span>
                </button>
                <button type="button" className={`insight${filters.lavoura ? ' on' : ''}`} aria-pressed={filters.lavoura} onClick={() => setFilters((f) => ({ ...f, lavoura: !f.lavoura }))}>
                  <span className="dot dual"><i style={{ background: COLORS.colheita }} /><i style={{ background: COLORS.plantio }} /></span>
                  <span className="i-title">Lavoura: colheita e plantio</span>
                  <span className="i-num">{t.lavouraHa >= 1000 ? <>{fmtNum(t.lavouraHa / 1000)} <small>mil ha mudaram</small></> : <>{fmtNum(t.lavouraHa)} <small>ha mudaram</small></>}</span>
                  <span className="i-sub">{haTxt(t.colheita)} colhidos · {haTxt(t.plantio)} plantados ou preparados</span>
                </button>
              </div>

              <section className="filters" aria-label="Filtros">
                <label htmlFor="f-mun" className="sel">Município
                  <select id="f-mun" value={filters.municipio ?? ''} onChange={(e) => setMun(e.target.value || null)}>
                    <option value="">Rondônia inteira</option>
                    {data?.municipios.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </label>
                <div className="checks">
                  <label htmlFor="f-prot"><input id="f-prot" type="checkbox" checked={showProt} onChange={(e) => setShowProt(e.target.checked)} /> Mostrar Terras Indígenas e Unidades de Conservação</label>
                  <label htmlFor="f-soprot"><input id="f-soprot" type="checkbox" checked={filters.soProtegidas} onChange={(e) => { setFilters((f) => ({ ...f, soProtegidas: e.target.checked })); if (e.target.checked) setShowProt(true); }} /> Só o que aconteceu dentro delas</label>
                  <label htmlFor="f-fracos"><input id="f-fracos" type="checkbox" checked={filters.fracos} onChange={(e) => setFilters((f) => ({ ...f, fracos: e.target.checked }))} /> Mostrar também sinais fracos de floresta</label>
                  <label htmlFor="f-base"><input id="f-base" type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} /> Cores do terreno (floresta, lavoura, pasto)</label>
                </div>
              </section>

              <section className="list" aria-label="Lugares com floresta derrubada">
                <h2>Onde a floresta mudou</h2>
                {!filters.floresta && <p className="muted">Ative "Floresta derrubada" para ver a lista.</p>}
                {filters.floresta && list.length === 0 && <p className="muted">Nenhum sinal forte de floresta derrubada {lugar} neste período. Tente outro período ou município.</p>}
                <ol>
                  {list.slice(0, 40).map((e) => (
                    <li key={e.id}>
                      <button type="button" className={`card${selected?.id === e.id ? ' on' : ''}`} onClick={() => openEvent(e.id)}>
                        <span className={`tag t-${e.certeza}`}>{CERTEZA[e.certeza].label}</span>
                        <span className="c-txt">{frase(e)}</span>
                        <span className="c-meta">{fmtDate(e.date)}{e.protegida.length > 0 && ` · ${e.protegida[0].nome}`}{e.fogo_dias.length > 0 && ' · teve fogo'}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                {list.length > 40 && <p className="muted">Mostrando os 40 maiores de {list.length}.</p>}
              </section>
            </aside>

            <div className="center">
              {data && (
                <MapView
                  data={data} events={events} farm={farm} selectedId={selected?.id ?? null} municipio={filters.municipio}
                  showProtegidas={showProt} showBase={showBase} showNoCoverage={filters.floresta} focus={focus}
                  onPick={(p) => { if (p?.kind === 'floresta') openEvent(p.id); else setPick(p); }}
                />
              )}
              {!data && <p className="map-msg">Carregando os dados do radar…</p>}
              <ul className="legend" aria-label="Legenda">
                {filters.floresta && <li><i style={{ background: COLORS.floresta }} />floresta derrubada</li>}
                {filters.lavoura && <><li><i style={{ background: COLORS.colheita }} />lavoura colhida</li><li><i style={{ background: COLORS.plantio }} />lavoura plantada ou preparada</li></>}
                {filters.floresta && <li><i className="hatch" />sem dado bom de floresta ({fmtNum((data?.landcover.nocoverage_share ?? 0) * 100)}% do estado)</li>}
                {showBase && <li><i style={{ background: '#2e6848' }} />floresta <i style={{ background: '#d6c48c', marginLeft: 6 }} />lavoura <i style={{ background: '#b8b680', marginLeft: 6 }} />campo e pasto</li>}
              </ul>
              {pick && data && (
                <div className="drawer">
                  {pick.kind === 'floresta' && selected && <ForestDetail e={selected} onClose={() => setPick(null)} />}
                  {pick.kind === 'lavoura' && <FarmDetail row={pick.row} periods={data.periods} municipio={data.municipios.find((m) => m.id === pick.row[6])} onClose={() => setPick(null)} />}
                  {pick.kind === 'municipio' && (() => { const m = data.municipios.find((x) => x.id === pick.id); return m ? <MunDetail m={m} filtered={filters.municipio === m.id} onFilter={() => { setMun(filters.municipio === m.id ? null : m.id); setPick(null); }} onClose={() => setPick(null)} /> : null; })()}
                </div>
              )}
              {intro && data && (
                <div className="intro" role="dialog" aria-labelledby="intro-h">
                  <h2 id="intro-h">Como ler este mapa</h2>
                  <ol>
                    <li><b style={{ color: COLORS.floresta }}>Laranja</b>: lugares onde a floresta pode ter sido derrubada.</li>
                    <li><b style={{ color: COLORS.colheita }}>Amarelo</b> e <b style={{ color: COLORS.plantio }}>verde-claro</b>: lavouras colhidas ou plantadas.</li>
                    <li>Embaixo, a <b>linha do tempo</b>: clique numa coluna para ver só aqueles 12 dias.</li>
                    <li>Clique em qualquer ponto para ler o que aconteceu ali.</li>
                  </ol>
                  <button type="button" className="btn primary" onClick={() => { setIntro(false); store.set('sartellite.intro-visto', true); }}>Entendi</button>
                </div>
              )}
            </div>

            {data && <TimeBar periods={data.periods} stats={stats} range={filters.range} onRange={(r) => setFilters((f) => ({ ...f, range: r }))} showFloresta={filters.floresta} showLavoura={filters.lavoura} />}
          </div>
        )}
        {view !== 'mapa' && (
          <Suspense fallback={<div className="page"><p>Carregando…</p></div>}>
            {data ? <Pages view={view} data={data} reduce={reduce} onMap={() => go('mapa')} /> : <div className="page"><p>Carregando…</p></div>}
          </Suspense>
        )}
      </main>
    </div>
  );
}
