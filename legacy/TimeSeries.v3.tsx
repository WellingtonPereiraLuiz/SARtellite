import { useEffect, useRef, useState } from 'react';
import { fmtDate, fmtNum } from '../lib/time';
import type { Period, Serie3 } from '../lib/ro';
import { COLORS } from './MapView';

const META: Record<Serie3, { label: string; unit: (v: number) => string; color: string }> = {
  fogo: { label: 'Queimadas', unit: (v) => `${fmtNum(v)} focos`, color: COLORS.fogo },
  floresta: { label: 'Floresta derrubada', unit: (v) => `${fmtNum(v)} ha`, color: COLORS.floresta },
  chuva: { label: 'Chuva', unit: (v) => `${fmtNum(v)} mm`, color: COLORS.chuva },
};

interface Props {
  periods: Period[];
  series: Record<Serie3, number[]>;
  compare: Serie3[];
  onCompare: (l: Serie3[]) => void;
  range: [number, number];
  onRange: (r: [number, number]) => void;
  reduce: boolean;
}

/** Linha do tempo compacta: o usuário escolhe o que comparar; cada série fica na própria escala (0 a 100% do seu maior valor). */
export default function TimeSeries({ periods, series, compare, onCompare, range, onRange, reduce }: Props) {
  const n = periods.length;
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const drag = useRef<number | null>(null);
  const all = range[0] === 0 && range[1] === n - 1;

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(300, e[0].contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => onRange(((r) => { const k = r[0] === r[1] && !all ? (r[0] + 1) % n : 0; return [k, k] as [number, number]; })(range)), reduce ? 1800 : 1200);
    return () => clearInterval(t);
  }, [playing, range, all, n, onRange, reduce]);

  const H = 84, PX = 8, top = 10, bot = 18;
  const step = (w - 2 * PX) / n;
  const cx = (i: number) => PX + step * (i + 0.5);
  const y = (v: number, max: number) => top + (1 - (max > 0 ? v / max : 0)) * (H - top - bot);
  const toIdx = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((clientX - r.left - PX) / step)));
  };
  const path = (vals: number[], max: number, close: boolean) => {
    const pts = vals.map((v, i) => [cx(i), y(v, max)] as const);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const mx = (x0 + x1) / 2;
      d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    }
    return close ? `${d} L${pts[pts.length - 1][0]},${H - bot} L${pts[0][0]},${H - bot} Z` : d;
  };
  const toggle = (l: Serie3) => onCompare(compare.includes(l) ? compare.filter((x) => x !== l) : [...compare, l]);
  const sel = hover ?? (range[0] === range[1] ? range[0] : null);
  const label = all ? `${fmtDate(periods[0].start)} a ${fmtDate(periods[n - 1].end)}` : `${fmtDate(periods[range[0]].start)} a ${fmtDate(periods[range[1]].end)}`;

  return (
    <section className="ts glass" aria-label="Linha do tempo">
      <div className="ts-head">
        <button type="button" className="round" onClick={() => setPlaying((v) => !v)} aria-label={playing ? 'Pausar' : 'Reproduzir no tempo'} aria-pressed={playing}>{playing ? '❚❚' : '▶'}</button>
        <div className="ts-title">
          <b>{label}</b>
          {!all && <button type="button" className="link" onClick={() => { setPlaying(false); onRange([0, n - 1]); }}>ver tudo</button>}
        </div>
        <div className="chips" role="group" aria-label="O que comparar">
          <span className="chips-label">Comparar</span>
          {(Object.keys(META) as Serie3[]).map((l) => (
            <button key={l} type="button" className={`chip${compare.includes(l) ? ' on' : ''}`} aria-pressed={compare.includes(l)} onClick={() => toggle(l)} style={{ ['--c' as string]: META[l].color }}>
              <i />{META[l].label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="ts-plot" ref={box}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const i = toIdx(e.clientX); drag.current = i; setPlaying(false); onRange([i, i]); }}
        onPointerMove={(e) => { const i = toIdx(e.clientX); setHover(i); if (drag.current !== null && i !== drag.current) onRange([Math.min(drag.current, i), Math.max(drag.current, i)]); }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => { setHover(null); drag.current = null; }}
        onDoubleClick={() => onRange([0, n - 1])}
        role="slider" aria-label="Período" aria-valuemin={0} aria-valuemax={n - 1} aria-valuenow={range[0]} tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); const k = Math.min(n - 1, (range[0] === range[1] ? range[0] : -1) + 1); onRange([k, k]); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); const k = Math.max(0, (range[0] === range[1] ? range[0] : n) - 1); onRange([k, k]); }
          if (e.key === 'Escape') onRange([0, n - 1]);
        }}
      >
        <svg width={w} height={H} aria-hidden="true">
          {!all && <rect x={PX + step * range[0]} width={step * (range[1] - range[0] + 1)} y={2} height={H - bot} rx={6} className="ts-sel" />}
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
          {sel !== null && <line x1={cx(sel)} x2={cx(sel)} y1={4} y2={H - bot} className="ts-cursor" />}
          {periods.map((p, i) => (i % Math.max(1, Math.round(70 / step)) === 0 ? <text key={i} x={cx(i)} y={H - 4} textAnchor="middle" className="ts-tick">{fmtDate(p.start, false)}</text> : null))}
        </svg>
        {hover !== null && compare.length > 0 && (
          <div className="ts-tip glass" style={{ left: Math.min(w - 190, Math.max(0, cx(hover) - 95)) }}>
            <b>{fmtDate(periods[hover].start, false)} a {fmtDate(periods[hover].end, false)}</b>
            {compare.map((l) => <span key={l}><i style={{ background: META[l].color }} />{META[l].unit(series[l][hover])}</span>)}
            <small>{periods[hover].passagens} imagens do NISAR</small>
          </div>
        )}
      </div>
      <p className="ts-hint">Arraste para escolher um período · duplo clique volta a tudo · cada linha usa a própria escala</p>
    </section>
  );
}
