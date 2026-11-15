import { useEffect, useMemo, useState } from 'react';
import { fmtDate, fmtNum } from '../lib/time';
import { CERTEZA, dateOf, dayOf, filterEvents, filterFires, haTxt, rainSum, searchPlaces, seriesByPeriod, totals, type Filters, type Layer, type Place, type RoData, type Serie3 } from '../lib/ro';
import { FireDetail, ForestDetail, MunDetail } from './Detail';
import MapView, { COLORS, RO_BOUNDS, type Pick } from './MapView';
import TimeSeries from './TimeSeries';

type Bounds = [[number, number], [number, number]];
const boundsOf = (g: unknown): Bounds => {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (c: unknown): void => { if (Array.isArray(c) && typeof c[0] === 'number') { const [x, y] = c as number[]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } else if (Array.isArray(c)) c.forEach(walk); };
  walk(g);
  return [[x0, y0], [x1, y1]];
};

const LENSES = [
  { t: 'Alagamentos', d: 'Água aberta e floresta alagada vistas pelo radar, mesmo com chuva.' },
  { t: 'Seca dos rios', d: 'Margens e bancos de areia aparecendo a cada 12 dias.' },
  { t: 'Queimadas e floresta', d: 'O mesmo que hoje fazemos em Rondônia, para qualquer lugar coberto pelo NISAR.' },
];

export default function MapPage({ data, filters, setFilters, reduce, jump }: { data: RoData; filters: Filters; setFilters: (f: (x: Filters) => Filters) => void; reduce: boolean; jump: { id: string | null; n: number } }) {
  const [pick, setPick] = useState<Pick>(null);
  const [focus, setFocus] = useState<{ bounds: Bounds; n: number; max?: number } | null>(null);
  const [q, setQ] = useState('');
  const [outside, setOutside] = useState<Place | null>(null);
  const [movedOut, setMovedOut] = useState(false);
  const [more, setMore] = useState(false);
  const [showProt, setShowProt] = useState(false);
  const [terreno, setTerreno] = useState(true);
  const [compare, setCompare] = useState<Serie3[]>(['floresta', 'chuva']);
  const [listOpen, setListOpen] = useState(true);
  const [tsOpen, setTsOpen] = useState(() => window.innerWidth >= 760);

  const events = useMemo(() => filterEvents(data.events, filters), [data, filters]);
  const fires = useMemo(() => filterFires(data.fires, data.fireMun, filters), [data, filters]);
  const t = useMemo(() => totals(filterEvents(data.events, filters, true), filterFires(data.fires, data.fireMun, filters, true)), [data, filters]);
  const series = useMemo(() => seriesByPeriod(data, filters), [data, filters]);
  const results = useMemo(() => searchPlaces(data.places, q), [data.places, q]);
  const munSel = data.municipios.find((m) => m.id === filters.municipio);
  const go = (bounds: Bounds, max?: number) => setFocus((f) => ({ bounds, n: (f?.n ?? 0) + 1, max }));
  const setMun = (id: string | null) => {
    setFilters((f) => ({ ...f, municipio: id }));
    const m = data.municipios.find((x) => x.id === id);
    go(m ? boundsOf(m.geometry) : RO_BOUNDS);
  };
  const choose = (p: Place) => {
    setQ('');
    if (p.t === 'municipio' && p.id) { setOutside(null); setMun(p.id); return; }
    if (p.ro) { setOutside(null); setMun(null); return; }
    setOutside(p);
    go([[p.b[0], p.b[1]], [p.b[2], p.b[3]]], 7);
  };
  useEffect(() => {
    if (jump.n > 0) { setOutside(null); setMovedOut(false); setPick(null); setMun(jump.id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump.n]);
  const toggle = (l: Layer) => setFilters((f) => ({ ...f, layers: { ...f.layers, [l]: !f.layers[l] } }));
  const openEvent = (id: string) => {
    const e = data.events.find((x) => x.id === id);
    if (!e) return;
    setPick({ kind: 'floresta', id });
    go([[e.lon - 0.12, e.lat - 0.12], [e.lon + 0.12, e.lat + 0.12]], 12);
  };
  // ao clicar num evento, a linha do tempo abre junto com o cartão
  useEffect(() => { if (pick && pick.kind !== 'municipio') setTsOpen(true); }, [pick]);
  const selected = pick?.kind === 'floresta' ? data.events.find((e) => e.id === pick.id) : undefined;
  const rank = { confirmado: 0, provavel: 1, possivel: 2 } as const;
  const top = [...events].sort((a, b) => rank[a.certeza] - rank[b.certeza] || b.area_ha - a.area_ha).slice(0, 6);
  const munFocos = (id: string) => { const i = data.fireMun.indexOf(id); return data.fires.filter((r) => r[3] === i).length; };

  const LAYERS: { l: Layer; label: string; value: string; sub: string; color: string }[] = [
    { l: 'fogo', label: 'Queimadas', value: fmtNum(t.focos), sub: `focos · ${t.focos ? Math.round((t.focosFloresta / t.focos) * 100) : 0}% na floresta`, color: COLORS.fogo },
    { l: 'floresta', label: 'Floresta derrubada', value: haTxt(t.florestaHa), sub: t.comChuva ? `${t.florestaN} lugares · ${t.semChuva} sem chuva · ${t.duvida} pode ser chuva` : `${t.florestaN} lugares · ${t.confirmados} INPE confirmou`, color: COLORS.floresta },
  ];

  return (
    <div className={`mapage${tsOpen ? '' : ' ts-off'}`}>
      <MapView
        data={data} events={events} fires={fires} selectedId={selected?.id ?? null} municipio={filters.municipio}
        showProtegidas={showProt} showTerreno={terreno} showNoCoverage={filters.layers.floresta && terreno} reduce={reduce} focus={focus}
        onPick={(p) => (p?.kind === 'floresta' ? openEvent(p.id) : setPick(p))}
        onMoveOut={setMovedOut}
      />

      <div className="panel glass">
        <div className="search">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <input id="busca" type="search" placeholder="Buscar município, estado ou país" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar lugar" autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) choose(results[0]); }} />
          {results.length > 0 && (
            <ul className="results glass" role="listbox">
              {results.map((p) => <li key={p.n + p.t}><button type="button" onClick={() => choose(p)}><b>{p.n}</b><span>{p.t === 'municipio' ? 'Município de RO' : p.t === 'estado' ? 'Estado' : 'País'}</span></button></li>)}
            </ul>
          )}
        </div>

        <div className="scope">
          <span>{munSel ? munSel.nome : 'Rondônia'}</span>
          {munSel && <button type="button" className="link" onClick={() => setMun(null)}>× estado inteiro</button>}
        </div>

        <div className="layers">
          {LAYERS.map((x) => (
            <button key={x.l} type="button" className={`layer${filters.layers[x.l] ? ' on' : ''}`} aria-pressed={filters.layers[x.l]} onClick={() => toggle(x.l)} style={{ ['--c' as string]: x.color }}>
              <i className="sw" />
              <span className="l-name">{x.label}</span>
              <span className="l-val">{x.value}</span>
              <span className="l-sub">{x.sub}</span>
            </button>
          ))}
        </div>

        <button type="button" className="more" aria-expanded={more} onClick={() => setMore((v) => !v)}>Mais filtros {more ? '▴' : '▾'}</button>
        {more && (
          <div className="opts">
            <label htmlFor="o-mun">Município
              <select id="o-mun" value={filters.municipio ?? ''} onChange={(e) => setMun(e.target.value || null)}>
                <option value="">Rondônia inteira</option>
                {data.municipios.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </label>
            <label className="sw-row" htmlFor="o-prot"><input id="o-prot" type="checkbox" checked={showProt} onChange={(e) => setShowProt(e.target.checked)} /> Terras Indígenas e UCs</label>
            <label className="sw-row" htmlFor="o-so"><input id="o-so" type="checkbox" checked={filters.soProtegidas} onChange={(e) => { setFilters((f) => ({ ...f, soProtegidas: e.target.checked })); if (e.target.checked) setShowProt(true); }} /> Só floresta dentro delas</label>
            {data.rain && <label className="sw-row" htmlFor="o-du"><input id="o-du" type="checkbox" checked={!filters.duvidas} onChange={(e) => setFilters((f) => ({ ...f, duvidas: !e.target.checked }))} /> Esconder o que pode ser chuva</label>}
            <label className="sw-row" htmlFor="o-fr"><input id="o-fr" type="checkbox" checked={filters.fracos} onChange={(e) => setFilters((f) => ({ ...f, fracos: e.target.checked }))} /> Sinais fracos de floresta</label>
            <label className="sw-row" htmlFor="o-ter"><input id="o-ter" type="checkbox" checked={terreno} onChange={(e) => setTerreno(e.target.checked)} /> Cores do terreno</label>
          </div>
        )}

        {filters.layers.floresta && top.length > 0 && (
          <div className="top">
            <button type="button" className="top-h" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}>Maiores derrubadas {listOpen ? '▴' : '▾'}</button>
            {listOpen && (
              <ol>
                {top.map((e) => (
                  <li key={e.id}>
                    <button type="button" className={selected?.id === e.id ? 'on' : ''} onClick={() => openEvent(e.id)}>
                      <b>{fmtNum(e.area_ha)} ha</b><span>{e.municipio}</span><small className={`c-${e.certeza}`}>{CERTEZA[e.certeza].label} · {fmtDate(e.date, false)}{e.chuva && <em className={`vb v-${e.chuva.veredito}`}> · {e.chuva.veredito === 'duvida' ? 'pode ser chuva' : 'sem chuva'}</em>}</small>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {pick && (
        <div className="drawer">
          {pick.kind === 'floresta' && selected && <ForestDetail e={selected} onClose={() => setPick(null)} />}
          {pick.kind === 'fogo' && <FireDetail day={pick.day} hour={pick.hour} forest={pick.forest} start={data.periods[0].start} onClose={() => setPick(null)} />}
          {pick.kind === 'municipio' && (() => { const m = data.municipios.find((x) => x.id === pick.id); return m ? <MunDetail m={m} focos={munFocos(m.id)} filtered={filters.municipio === m.id} onFilter={() => { setMun(filters.municipio === m.id ? null : m.id); setPick(null); }} onClose={() => setPick(null)} /> : null; })()}
        </div>
      )}

      {(outside || movedOut) && !pick && (
        <div className="outside glass" role="status">
          <span className="pill demo"><i />Demonstração</span>
          <h2>{outside ? outside.n : 'Fora de Rondônia'}</h2>
          <p>Ainda não processamos esta região. Estas são as lentes que o SARtellite pode ganhar com o mesmo radar:</p>
          <ul>{LENSES.map((l) => <li key={l.t}><b>{l.t}</b><span>{l.d}</span><em>em breve</em></li>)}</ul>
          <p className="note">Nada é mostrado no mapa aqui: sem dado real, sem mancha.</p>
          <button type="button" className="btn primary" onClick={() => { setOutside(null); setMovedOut(false); setMun(null); }}>Voltar para Rondônia</button>
        </div>
      )}

      <div className={`legend glass${pick ? ' hidden-l' : ''}`} aria-label="Legenda">
        {filters.layers.fogo && <span><i style={{ background: COLORS.fogo }} />queimada</span>}
        {filters.layers.floresta && <span><i style={{ background: COLORS.floresta }} />floresta derrubada</span>}
        {filters.layers.floresta && data.rain && <span><i className="ring" style={{ borderColor: COLORS.chuva }} />pode ser chuva</span>}
        {filters.layers.floresta && terreno && <span><i className="hatch" />sem dado de floresta</span>}
      </div>

      <TimeSeries periods={data.periods} series={series} totals={{ fogo: t.focos, floresta: t.florestaHa, chuva: rainSum(data.rain, filters.range) }} compare={compare} onCompare={setCompare} range={filters.range} onRange={(r) => setFilters((f) => ({ ...f, range: r }))} hours={filters.hours} onHours={(h) => setFilters((f) => ({ ...f, hours: h }))} open={tsOpen} onOpen={setTsOpen}
        mark={selected ? { day: dayOf(selected.date), label: `${fmtNum(selected.area_ha)} ha · ${fmtDate(selected.date, false)}`, color: COLORS.floresta }
          : pick?.kind === 'fogo' ? { day: pick.day, label: `foco · ${fmtDate(dateOf(pick.day), false)}`, color: COLORS.fogo } : null} />
    </div>
  );
}
