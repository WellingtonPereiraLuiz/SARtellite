import { useEffect, useRef, useState } from 'react';
import { fmtDate, fmtNum } from '../lib/time';
import { dateOf, dayOf, haTxt, type Period, type Serie3 } from '../lib/ro';
import { COLORS } from './MapView';

const META: Record<Serie3, { label: string; unit: (v: number) => string; color: string }> = {
  fogo: { label: 'Queimadas', unit: (v) => `${fmtNum(v)} focos`, color: COLORS.fogo },
  floresta: { label: 'Floresta derrubada', unit: (v) => haTxt(v), color: COLORS.floresta },
  chuva: { label: 'Chuva', unit: (v) => `${fmtNum(v)} mm`, color: COLORS.chuva },
};

const HOURS: { k: string; label: string; h: [number, number] }[] = [
  { k: 'dia', label: 'Dia todo', h: [0, 24] },
  { k: 'madrugada', label: 'Madrugada (0h–6h)', h: [0, 6] },
  { k: 'manha', label: 'Manhã (6h–12h)', h: [6, 12] },
  { k: 'tarde', label: 'Tarde (12h–18h)', h: [12, 18] },
  { k: 'noite', label: 'Noite (18h–24h)', h: [18, 24] },
];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

interface Props {
  periods: Period[];
  series: Record<Serie3, number[]>;
  totals: Record<Serie3, number>;
  compare: Serie3[];
  onCompare: (l: Serie3[]) => void;
  range: [number, number];
  onRange: (r: [number, number]) => void;
  hours: [number, number];
  onHours: (h: [number, number]) => void;
}

/** Linha do tempo: ano, datas (dia a dia), horário das queimadas e o que comparar.
 *  Cada linha usa a própria escala (0 a 100% do seu maior valor), por volta de 12 dias do NISAR. */
export default function TimeSeries({ periods, series, totals, compare, onCompare, range, onRange, hours, onHours }: Props) {
  const n = periods.length;
  const D = n * 12;
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<number | null>(null);
  const all = range[0] === 0 && range[1] === D - 1;
  const year = periods[0].start.slice(0, 4);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(300, e[0].contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const H = 76, PX = 6, top = 8, bot = 18;
  const dx = (w - 2 * PX) / D;
  const xd = (d: number) => PX + dx * d;
  const cx = (i: number) => xd(i * 12 + 6);
  const y = (v: number, max: number) => top + (1 - (max > 0 ? v / max : 0)) * (H - top - bot);
  const toDay = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(D - 1, Math.floor((clientX - r.left - PX) / dx)));
  };
  const path = (vals: number[], max: number, close: boolean) => {
    const pts = vals.map((v, i) => [cx(i), y(v, max)] as const);
    let d = `M${xd(0)},${pts[0][1]} L${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const mx = (x0 + x1) / 2;
      d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }
    d += ` L${xd(D)},${pts[pts.length - 1][1]}`;
    return close ? `${d} L${xd(D)},${H - bot} L${xd(0)},${H - bot} Z` : d;
  };
  const toggle = (l: Serie3) => onCompare(compare.includes(l) ? compare.filter((x) => x !== l) : [...compare, l]);
  const setDate = (k: 0 | 1, iso: string) => {
    if (!iso) return;
    const d = Math.max(0, Math.min(D - 1, dayOf(iso)));
    onRange(k === 0 ? [Math.min(d, range[1]), range[1]] : [range[0], Math.max(d, range[0])]);
  };
  const months: { d: number; t: string }[] = [];
  for (let d = 0; d < D; d++) { const iso = dateOf(d); if (iso.endsWith('-01')) months.push({ d, t: MESES[Number(iso.slice(5, 7)) - 1] }); }
  const hp = HOURS.find((x) => x.h[0] === hours[0] && x.h[1] === hours[1])?.k ?? 'dia';
  const hoverPeriod = hover === null ? null : Math.min(n - 1, Math.floor(hover / 12));

  return (
    <section className="ts glass" aria-label="Linha do tempo">
      <div className="ts-bar">
        <h2 className="ts-h">Linha do tempo</h2>
        <label className="fld" htmlFor="ts-ano">Ano
          <select id="ts-ano" value={year} onChange={() => undefined}>
            <option value={year}>{year}</option>
            <option value="2025" disabled>2025 (ainda não processado)</option>
          </select>
        </label>
        <label className="fld" htmlFor="ts-de">De
          <input id="ts-de" type="date" min={dateOf(0)} max={dateOf(D - 1)} value={dateOf(range[0])} onChange={(e) => setDate(0, e.target.value)} />
        </label>
        <label className="fld" htmlFor="ts-ate">até
          <input id="ts-ate" type="date" min={dateOf(0)} max={dateOf(D - 1)} value={dateOf(range[1])} onChange={(e) => setDate(1, e.target.value)} />
        </label>
        <label className="fld" htmlFor="ts-hora">Hora das queimadas
          <select id="ts-hora" value={hp} onChange={(e) => onHours(HOURS.find((x) => x.k === e.target.value)!.h)}>
            {HOURS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
          </select>
        </label>
        {(!all || hp !== 'dia') && <button type="button" className="link" onClick={() => { onRange([0, D - 1]); onHours([0, 24]); }}>limpar filtros</button>}
      </div>

      <div className="ts-cmp" role="group" aria-label="O que comparar">
        <span className="chips-label">Comparar</span>
        {(Object.keys(META) as Serie3[]).map((l) => (
          <button key={l} type="button" className={`cmp${compare.includes(l) ? ' on' : ''}`} aria-pressed={compare.includes(l)} onClick={() => toggle(l)} style={{ ['--c' as string]: META[l].color }}>
            <i />
            <span className="cmp-t">{META[l].label}</span>
            <b>{META[l].unit(totals[l])}</b>
          </button>
        ))}
      </div>

      <div
        className="ts-plot" ref={box}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const d = toDay(e.clientX); drag.current = d; onRange([d, d]); }}
        onPointerMove={(e) => { const d = toDay(e.clientX); setHover(d); if (drag.current !== null && d !== drag.current) onRange([Math.min(drag.current, d), Math.max(drag.current, d)]); }}
        onPointerUp={(e) => { if (drag.current !== null && drag.current === toDay(e.clientX)) { const p = Math.floor(drag.current / 12); onRange([p * 12, Math.min(D - 1, p * 12 + 11)]); } drag.current = null; }}
        onPointerLeave={() => { setHover(null); drag.current = null; }}
        onDoubleClick={() => onRange([0, D - 1])}
        role="slider" aria-label="Período: arraste para escolher os dias" aria-valuemin={0} aria-valuemax={D - 1} aria-valuenow={range[0]} aria-valuetext={`${fmtDate(dateOf(range[0]))} a ${fmtDate(dateOf(range[1]))}`} tabIndex={0}
        onKeyDown={(e) => {
          const len = range[1] - range[0];
          if (e.key === 'ArrowRight') { e.preventDefault(); const a = Math.min(D - 1 - len, range[0] + 1); onRange([a, a + len]); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); const a = Math.max(0, range[0] - 1); onRange([a, a + len]); }
          if (e.key === 'Escape') onRange([0, D - 1]);
        }}
      >
        <svg width={w} height={H} aria-hidden="true">
          {months.map((m) => <line key={m.d} x1={xd(m.d)} x2={xd(m.d)} y1={top} y2={H - bot} className="ts-grid" />)}
          {!all && <rect x={xd(range[0])} width={Math.max(2, dx * (range[1] - range[0] + 1))} y={2} height={H - bot} rx={4} className="ts-sel" />}
          {compare.length === 0 && <text x={w / 2} y={H / 2} textAnchor="middle" className="ts-empty">Escolha acima o que comparar</text>}
          {compare.map((l) => {
            const vals = series[l]; const max = Math.max(...vals);
            return (
              <g key={l} style={{ ['--c' as string]: META[l].color }}>
                <path d={path(vals, max, true)} className="ts-area" />
                <path d={path(vals, max, false)} className="ts-line" />
              </g>
            );
          })}
          {hover !== null && <line x1={xd(hover) + dx / 2} x2={xd(hover) + dx / 2} y1={4} y2={H - bot} className="ts-cursor" />}
          {months.map((m) => <text key={m.d} x={xd(m.d) + 4} y={H - 4} className="ts-tick">{m.t}</text>)}
        </svg>
        {hover !== null && hoverPeriod !== null && compare.length > 0 && (
          <div className="ts-tip glass" style={{ left: Math.min(w - 210, Math.max(0, xd(hover) - 105)) }}>
            <b>{fmtDate(dateOf(hover))}</b>
            <small>volta do NISAR: {fmtDate(periods[hoverPeriod].start, false)} a {fmtDate(periods[hoverPeriod].end, false)}</small>
            {compare.map((l) => <span key={l}><i style={{ background: META[l].color }} />{META[l].label}: {META[l].unit(series[l][hoverPeriod])}</span>)}
          </div>
        )}
      </div>
      <p className="ts-hint">Clique numa volta de 12 dias ou arraste para escolher os dias · duplo clique volta a tudo · cada linha na sua escala · os satélites de calor passam de madrugada e à tarde</p>
    </section>
  );
}
