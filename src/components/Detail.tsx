import { fmtDate, fmtNum } from '../lib/time';
import { campos, CERTEZA, frase, fraseLavoura, type FarmRow, type ForestEvent, type Municipio, type Period, type Serie } from '../lib/ro';
import { COLORS } from './MapView';

function Sparkline({ s, mark }: { s: Serie; mark: string }) {
  const W = 300, H = 120, L = 34, R = 8, T = 10, B = 26;
  const vals = [...s.here, ...s.around].filter((v): v is number => v !== null);
  if (vals.length < 3) return null;
  const lo = Math.max(0, Math.floor(Math.min(...vals) / 20) * 20);
  const hi = Math.min(255, Math.ceil(Math.max(...vals) / 20) * 20);
  const t0 = Date.parse(s.dates[0]); const t1 = Date.parse(s.dates[s.dates.length - 1]);
  const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const path = (arr: (number | null)[]) => arr.map((v, i) => (v === null ? '' : `${i && arr[i - 1] !== null ? 'L' : 'M'}${x(s.dates[i]).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
  const mx = x(mark);
  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Eco do radar NISAR aqui e na floresta em volta, em cada passagem">
        {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="sp-grid" /><text x={L - 5} y={y(v) + 3} className="sp-ax" textAnchor="end">{Math.round(v)}</text></g>)}
        <line x1={mx} x2={mx} y1={T} y2={H - B} className="sp-mark" />
        <text x={mx} y={H - 4} textAnchor="middle" className="sp-ax strong">{fmtDate(mark, false)}</text>
        {mx - L > 50 && <text x={L} y={H - 4} className="sp-ax">{fmtDate(s.dates[0], false)}</text>}
        {W - R - mx > 50 && <text x={W - R} y={H - 4} textAnchor="end" className="sp-ax">{fmtDate(s.dates[s.dates.length - 1], false)}</text>}
        <path d={path(s.around)} className="sp-around" />
        <path d={path(s.here)} className="sp-here" />
        {s.here.map((v, i) => v === null ? null : <circle key={i} cx={x(s.dates[i])} cy={y(v)} r={2.6} className="sp-dot" />)}
      </svg>
      <figcaption><i className="sw" style={{ background: COLORS.floresta }} />aqui <i className="sw ring" />floresta em volta. Mais alto quer dizer eco mais forte, como o de uma floresta de pé.</figcaption>
    </figure>
  );
}

const classe = (c: string) => ({ DESMATAMENTO_CR: 'desmatamento', DESMATAMENTO_VEG: 'desmatamento', CICATRIZ_DE_QUEIMADA: 'área queimada', DEGRADACAO: 'floresta degradada' } as Record<string, string>)[c] ?? c.toLowerCase();

export function ForestDetail({ e, onClose }: { e: ForestEvent; onClose: () => void }) {
  const c = CERTEZA[e.certeza];
  const fogo = e.fogo_dias;
  return (
    <article className="detail" aria-labelledby="d-title">
      <header>
        <span className={`tag t-${e.certeza}`}>{c.label}</span>
        <button type="button" className="x" onClick={onClose} aria-label="Fechar">×</button>
      </header>
      <h2 id="d-title">{frase(e)}</h2>
      <dl className="facts">
        <div><dt>Quando</dt><dd>O NISAR notou na passagem de <b>{fmtDate(e.date)}</b>.</dd></div>
        <div><dt>Onde</dt><dd>{e.municipio ?? 'Rondônia'}{e.protegida.length > 0 && <>, dentro de <b>{e.protegida.map((p) => p.nome).join(' e ')}</b></>}. <span className="mono">{e.lat.toFixed(4).replace('.', ',')}, {e.lon.toFixed(4).replace('.', ',')}</span></dd></div>
        <div><dt>Tamanho</dt><dd>{fmtNum(e.area_ha)} ha, mais ou menos {fmtNum(campos(e.area_ha))} campos de futebol.</dd></div>
      </dl>
      <h3>O que o radar viu</h3>
      {e.serie ? <Sparkline s={e.serie} mark={e.date} /> : <p className="muted">Sem série completa para este lugar.</p>}
      <p className="explain">{c.texto}</p>
      {(e.inpe.length > 0 || fogo.length > 0) && (
        <>
          <h3>Outras pistas</h3>
          <ul className="clues">
            {e.inpe.length > 0 && <li><b>INPE (DETER):</b> registrou {classe(e.inpe[0].classe)} aqui em {fmtDate(e.inpe[0].data)}.</li>}
            {fogo.length > 0 && <li><b>Fogo:</b> satélites de calor (VIIRS e MODIS) viram fogo aqui em {fogo.length} {fogo.length === 1 ? 'dia' : 'dias'}, entre {fmtDate(fogo[0], false)} e {fmtDate(fogo[fogo.length - 1], false)}. Na Amazônia, é comum derrubar e depois queimar.</li>}
          </ul>
        </>
      )}
      <p className="caveat">O radar mostra que a floresta mudou. Ele não diz quem fez, nem se foi permitido. Isto é um aviso para alguém conferir no local.</p>
    </article>
  );
}

export function FarmDetail({ row, periods, municipio, onClose }: { row: FarmRow; periods: Period[]; municipio: Municipio | undefined; onClose: () => void }) {
  const p = periods[row[2]];
  return (
    <article className="detail" aria-labelledby="d-title">
      <header>
        <span className="tag t-lavoura" style={{ background: COLORS[row[5]] }}>Lavoura</span>
        <button type="button" className="x" onClick={onClose} aria-label="Fechar">×</button>
      </header>
      <h2 id="d-title">{fraseLavoura(row[5])}</h2>
      <dl className="facts">
        <div><dt>Quando</dt><dd>Maior mudança entre <b>{fmtDate(p.start)}</b> e <b>{fmtDate(p.end)}</b> (passagem de {fmtDate(row[3])}).</dd></div>
        <div><dt>Onde</dt><dd>{municipio?.nome ?? 'Rondônia'}, num quadrado de cerca de 1 km.</dd></div>
        <div><dt>Tamanho</dt><dd>{fmtNum(row[4])} ha de lavoura mudaram neste quadrado.</dd></div>
      </dl>
      {municipio && <p className="explain">No município inteiro, {fmtNum(municipio.lavoura_ha)} ha de lavoura mudaram desde junho.</p>}
      <p className="explain">De junho a agosto, em Rondônia, é tempo de colher o milho safrinha. De setembro em diante, o solo é preparado e a soja começa a ser plantada. O radar acompanha esse ritmo a cada 12 dias, mesmo com nuvem.</p>
      <p className="caveat">Chuva forte também deixa o solo mais claro no radar. Por isso, plantio quer dizer plantio, preparo do solo ou solo molhado.</p>
    </article>
  );
}

export function MunDetail({ m, onFilter, onClose, filtered }: { m: Municipio; onFilter: () => void; onClose: () => void; filtered: boolean }) {
  return (
    <article className="detail" aria-labelledby="d-title">
      <header><span className="tag">Município</span><button type="button" className="x" onClick={onClose} aria-label="Fechar">×</button></header>
      <h2 id="d-title">{m.nome}</h2>
      <dl className="facts">
        <div><dt>Floresta derrubada</dt><dd>{m.floresta_ha > 0 ? `${fmtNum(m.floresta_ha)} ha desde junho (prováveis e confirmados)` : 'Nenhum sinal forte desde junho.'}</dd></div>
        <div><dt>Lavoura que mudou</dt><dd>{m.lavoura_ha > 0 ? `${fmtNum(m.lavoura_ha)} ha desde junho` : 'Pouca ou nenhuma lavoura.'}</dd></div>
      </dl>
      <button type="button" className="btn primary" onClick={onFilter}>{filtered ? 'Ver o estado inteiro' : `Ver só ${m.nome}`}</button>
    </article>
  );
}
