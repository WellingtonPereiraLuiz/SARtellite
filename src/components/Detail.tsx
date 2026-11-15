import { fmtDate, fmtNum } from '../lib/time';
import { campos, CERTEZA, fraseLavoura, type FarmRow, type ForestEvent, type Municipio, type Period, type Serie } from '../lib/ro';
import { COLORS } from './MapView';

function Spark({ s, mark }: { s: Serie; mark: string }) {
  const W = 300, H = 96, L = 8, R = 8, T = 8, B = 20;
  const vals = [...s.here, ...s.around].filter((v): v is number => v !== null);
  if (vals.length < 3) return null;
  const lo = Math.min(...vals) - 5, hi = Math.max(...vals) + 5;
  const t0 = Date.parse(s.dates[0]), t1 = Date.parse(s.dates[s.dates.length - 1]);
  const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (a: (number | null)[]) => a.map((v, i) => (v === null ? '' : `${i && a[i - 1] !== null ? 'L' : 'M'}${x(s.dates[i]).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Eco do radar aqui e na floresta em volta, passagem a passagem">
        <line x1={x(mark)} x2={x(mark)} y1={T} y2={H - B} className="sp-mark" />
        <text x={x(mark)} y={H - 5} textAnchor="middle" className="sp-ax">{fmtDate(mark, false)}</text>
        <path d={path(s.around)} className="sp-around" />
        <path d={path(s.here)} className="sp-here" />
      </svg>
      <figcaption><i className="k here" />aqui <i className="k around" />floresta em volta</figcaption>
    </figure>
  );
}

const classe = (c: string) => ({ DESMATAMENTO_CR: 'desmatamento', DESMATAMENTO_VEG: 'desmatamento', CICATRIZ_DE_QUEIMADA: 'área queimada', DEGRADACAO: 'floresta degradada' } as Record<string, string>)[c] ?? c.toLowerCase();

function Shell({ tag, color, title, onClose, children }: { tag: string; color: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <article className="detail glass" aria-labelledby="d-title">
      <header><span className="pill" style={{ ['--c' as string]: color }}><i />{tag}</span><button type="button" className="x" onClick={onClose} aria-label="Fechar">×</button></header>
      <h2 id="d-title">{title}</h2>
      {children}
    </article>
  );
}

export function ForestDetail({ e, onClose }: { e: ForestEvent; onClose: () => void }) {
  const c = CERTEZA[e.certeza];
  return (
    <Shell tag={c.label} color={COLORS.floresta} title={`${fmtNum(e.area_ha)} ha de floresta derrubada`} onClose={onClose}>
      <ul className="facts">
        <li><span>Onde</span>{e.municipio ?? 'Rondônia'}{e.protegida.length > 0 && <em> · {e.protegida[0].nome}</em>}</li>
        <li><span>Quando</span>NISAR, {fmtDate(e.date)}</li>
        <li><span>Tamanho</span>{fmtNum(campos(e.area_ha))} campos de futebol</li>
      </ul>
      {e.serie && <Spark s={e.serie} mark={e.date} />}
      <div className="clues">
        {e.inpe.length > 0 && <span className="clue">INPE: {classe(e.inpe[0].classe)} em {fmtDate(e.inpe[0].data, false)}</span>}
        {e.fogo_dias.length > 0 && <span className="clue fire">Fogo perto em {e.fogo_dias.length} {e.fogo_dias.length === 1 ? 'dia' : 'dias'}</span>}
      </div>
      <p className="note">{c.texto} O radar não diz quem fez nem se foi permitido.</p>
    </Shell>
  );
}

export function FarmDetail({ row, periods, mun, onClose }: { row: FarmRow; periods: Period[]; mun?: Municipio; onClose: () => void }) {
  const p = periods[row[2]];
  return (
    <Shell tag={row[5] === 'colheita' ? 'Colheita' : row[5] === 'plantio' ? 'Plantio' : 'Lavoura'} color={COLORS[row[5] === 'plantio' ? 'plantio' : 'colheita']} title={fraseLavoura(row[5])} onClose={onClose}>
      <ul className="facts">
        <li><span>Onde</span>{mun?.nome ?? 'Rondônia'}</li>
        <li><span>Quando</span>{fmtDate(p.start, false)} a {fmtDate(p.end, false)}</li>
        <li><span>Área</span>{fmtNum(row[4])} ha neste quadrado de 1 km</li>
      </ul>
      <p className="note">Em Rondônia, junho a agosto é colheita do milho safrinha; de setembro em diante começa o plantio da soja. Chuva também deixa o solo mais claro no radar.</p>
    </Shell>
  );
}

export function FireDetail({ day, forest, start, onClose }: { day: number; forest: boolean; start: string; onClose: () => void }) {
  const d = new Date(Date.parse(`${start}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 10);
  return (
    <Shell tag="Queimada" color={COLORS.fogo} title={`Foco de calor em ${fmtDate(d)}`} onClose={onClose}>
      <ul className="facts">
        <li><span>Terreno</span>{forest ? 'dentro de floresta' : 'área aberta (pasto, lavoura ou capoeira)'}</li>
        <li><span>Satélite</span>VIIRS ou MODIS (NASA/NOAA), via INPE</li>
      </ul>
      <p className="note">Foco de calor é um ponto quente visto do espaço. Não é o tamanho da área queimada.</p>
    </Shell>
  );
}

export function MunDetail({ m, onFilter, filtered, onClose, focos }: { m: Municipio; onFilter: () => void; filtered: boolean; onClose: () => void; focos: number }) {
  return (
    <Shell tag="Município" color="#7fe3ff" title={m.nome} onClose={onClose}>
      <ul className="facts">
        <li><span>Queimadas</span>{fmtNum(focos)} focos desde junho</li>
        <li><span>Floresta</span>{m.floresta_ha > 0 ? `${fmtNum(m.floresta_ha)} ha derrubados` : 'sem sinal forte'}</li>
        <li><span>Lavoura</span>{m.lavoura_ha > 0 ? `${fmtNum(m.lavoura_ha)} ha mudaram` : 'pouca ou nenhuma'}</li>
      </ul>
      <button type="button" className="btn primary" onClick={onFilter}>{filtered ? 'Ver Rondônia inteira' : `Filtrar ${m.nome}`}</button>
    </Shell>
  );
}
