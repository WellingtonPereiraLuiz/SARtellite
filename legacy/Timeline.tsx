import { useEffect, useMemo, useRef, useState } from 'react';
import { dayMs, daysBetween, fmtDate, fmtNum, fmtUtc, toMs } from '../lib/time';
import type { S2Scene, Scene, SensorKey } from '../lib/types';

export interface DayValue { date: string; v: number | null }

interface Props {
  window: [string, string];
  scenes: Scene[];
  beforeId: string | null;
  afterId: string | null;
  target: 'before' | 'after';
  onTarget: (t: 'before' | 'after') => void;
  onSelect: (id: string, as: 'before' | 'after') => void;
  onStep: (dir: 1 | -1) => void;
  playing: boolean;
  onPlay: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  fires: DayValue[] | null;
  rain: DayValue[] | null;
  rainNote: string;
  showFires: boolean;
  showRain: boolean;
  emptyMessage: string | null;
}

const ROWS: { key: SensorKey; label: string; sub: string }[] = [
  { key: 'nisar', label: 'NISAR', sub: 'radar banda L' },
  { key: 's1', label: 'Sentinel-1', sub: 'radar banda C' },
  { key: 's2', label: 'Sentinel-2', sub: 'óptico' },
];
const PAD_L = 118;
const PAD_R = 18;
const ROW_H = 30;
const TOP = 26;

export default function Timeline(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [tip, setTip] = useState<{ x: number; y: number; text: string[] } | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(720, e[0].contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const t0 = toMs(p.window[0]);
  const t1 = toMs(p.window[1]) + dayMs;
  const x = (ms: number) => PAD_L + ((ms - t0) / (t1 - t0)) * (w - PAD_L - PAD_R);
  const xd = (date: string) => x(toMs(date) + dayMs / 2);
  const months = useMemo(() => {
    const out: { ms: number; label: string }[] = [];
    const d = new Date(t0);
    d.setUTCDate(1);
    while (d.getTime() < t1) {
      if (d.getTime() >= t0) out.push({ ms: d.getTime(), label: fmtDate(d.toISOString(), false).slice(3) });
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  }, [t0, t1]);

  const before = p.scenes.find((s) => s.id === p.beforeId) ?? null;
  const after = p.scenes.find((s) => s.id === p.afterId) ?? null;
  const yFires = TOP + ROWS.length * ROW_H + 8;
  const yRain = yFires + (p.showFires ? 40 : 0);
  const h = yRain + (p.showRain ? 40 : 0) + 8;
  const maxF = Math.max(1, ...(p.fires ?? []).map((d) => d.v ?? 0));
  const maxR = Math.max(1, ...(p.rain ?? []).map((d) => d.v ?? 0));
  const barW = Math.max(1.5, (w - PAD_L - PAD_R) / ((t1 - t0) / dayMs) - 1);

  const between = before && after && before.date <= after.date ? [before.date, after.date] : after && before ? [after.date, before.date] : null;
  const sum = (arr: DayValue[] | null) => (arr && between ? arr.filter((d) => d.date >= between[0] && d.date <= between[1]).reduce((a, d) => a + (d.v ?? 0), 0) : null);
  const firesSum = sum(p.fires);
  const rainSum = sum(p.rain);

  const marker = (s: Scene, row: number) => {
    const cx = x(toMs(s.acquiredAt));
    const cy = TOP + row * ROW_H + ROW_H / 2;
    const isA = s.id === p.beforeId;
    const isB = s.id === p.afterId;
    const cloud = s.key === 's2' ? (s.raw as S2Scene).cloud_fraction_aoi : 0;
    const cls = `tl-m tl-${s.key}${isA ? ' is-a' : ''}${isB ? ' is-b' : ''}${cloud > 0.5 ? ' is-cloudy' : ''}`;
    const text = [`${s.sensorLabel}`, fmtUtc(s.acquiredAt), s.quality, s.evidence === 'preview' ? 'prévia pública, não calibrada' : 'dado real calibrado'];
    return (
      <g
        key={s.id} className={cls} role="button" tabIndex={0} transform={`translate(${cx},${cy})`}
        aria-label={`${s.sensorLabel}, ${fmtDate(s.date)}, ${s.quality}${isA ? ', selecionada como antes' : ''}${isB ? ', selecionada como depois' : ''}`}
        aria-pressed={isA || isB}
        onClick={() => p.onSelect(s.id, p.target)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect(s.id, p.target); } }}
        onMouseEnter={() => setTip({ x: cx, y: cy, text })} onMouseLeave={() => setTip(null)} onFocus={() => setTip({ x: cx, y: cy, text })} onBlur={() => setTip(null)}
      >
        <circle r={13} className="tl-hit" />
        {s.key === 'nisar' ? <rect x={-6.5} y={-6.5} width={13} height={13} transform="rotate(45)" className="tl-shape" /> : <circle r={s.key === 's1' ? 5 : 5.5} className="tl-shape" />}
        {(isA || isB) && <text y={-12} textAnchor="middle" className="tl-flag">{isA && isB ? 'A=D' : isA ? 'ANTES' : 'DEPOIS'}</text>}
      </g>
    );
  };

  return (
    <section className="timeline" aria-label="Linha do tempo de aquisições e eventos">
      <div className="tl-bar">
        <div className="tl-controls">
          <button type="button" className="btn icon" onClick={() => p.onStep(-1)} aria-label="Aquisição anterior" disabled={!after}>◂</button>
          <button type="button" className="btn play" onClick={p.onPlay} aria-pressed={p.playing} disabled={!after}>{p.playing ? '❚❚ Pausar' : '▶ Reproduzir'}</button>
          <button type="button" className="btn icon" onClick={() => p.onStep(1)} aria-label="Próxima aquisição" disabled={!after}>▸</button>
          <label className="tl-speed">Velocidade
            <select id="tl-speed" value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
              <option value={0.5}>0,5x</option><option value={1}>1x</option><option value={2}>2x</option>
            </select>
          </label>
        </div>
        <div className="seg" role="group" aria-label="O clique na linha do tempo define">
          <span className="seg-label">Clique define</span>
          <button type="button" className={p.target === 'before' ? 'on' : ''} aria-pressed={p.target === 'before'} onClick={() => p.onTarget('before')}>Antes</button>
          <button type="button" className={p.target === 'after' ? 'on' : ''} aria-pressed={p.target === 'after'} onClick={() => p.onTarget('after')}>Depois</button>
        </div>
        <p className="tl-summary" aria-live="polite">
          {before && after ? (
            <>
              <b>{fmtDate(before.date)} → {fmtDate(after.date)}</b> · {Math.abs(daysBetween(before.date, after.date))} dias
              {rainSum !== null && <> · chuva {fmtNum(rainSum)} mm</>}
              {firesSum !== null && <> · {fmtNum(firesSum)} {firesSum === 1 ? 'foco' : 'focos'} de calor</>}
              <span className="muted"> · sequência no tempo, não relação de causa</span>
            </>
          ) : (p.emptyMessage ?? 'Selecione uma cena.')}
        </p>
      </div>
      <div
        className="tl-scroll" ref={box} tabIndex={0} aria-label="Eixo do tempo. Use as setas para trocar de aquisição."
        onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); p.onStep(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); p.onStep(-1); } }}
      >
        <svg width={w} height={h} role="img" aria-label="Datas reais de aquisição por sensor, focos de calor por dia e chuva diária">
          {months.map((m) => (
            <g key={m.ms}>
              <line x1={x(m.ms)} x2={x(m.ms)} y1={18} y2={h - 4} className="tl-grid" />
              <text x={x(m.ms) + 5} y={13} className="tl-month">{m.label}</text>
            </g>
          ))}
          {between && <rect x={xd(between[0])} width={Math.max(2, xd(between[1]) - xd(between[0]))} y={18} height={h - 22} className="tl-span" />}
          {ROWS.map((r, i) => {
            const list = p.scenes.filter((s) => s.key === r.key);
            const cy = TOP + i * ROW_H + ROW_H / 2;
            return (
              <g key={r.key}>
                <text x={8} y={cy - 2} className="tl-row">{r.label}</text>
                <text x={8} y={cy + 10} className="tl-rowsub">{list.length ? r.sub : 'sem cenas nesta área'}</text>
                <line x1={PAD_L} x2={w - PAD_R} y1={cy} y2={cy} className="tl-axis" />
                {list.map((s) => marker(s, i))}
              </g>
            );
          })}
          {p.showFires && (
            <g>
              <text x={8} y={yFires + 16} className="tl-row">Focos de calor</text>
              <text x={8} y={yFires + 28} className="tl-rowsub">{p.fires ? `por dia, máx. ${maxF}` : 'não disponível'}</text>
              <line x1={PAD_L} x2={w - PAD_R} y1={yFires + 34} y2={yFires + 34} className="tl-axis" />
              {(p.fires ?? []).map((d) => d.v ? <rect key={d.date} className="tl-fire" x={xd(d.date) - barW / 2} width={barW} y={yFires + 34 - (d.v / maxF) * 30} height={(d.v / maxF) * 30}><title>{`${fmtDate(d.date)}: ${d.v} focos (INPE)`}</title></rect> : null)}
            </g>
          )}
          {p.showRain && (
            <g>
              <text x={8} y={yRain + 16} className="tl-row">Chuva</text>
              <text x={8} y={yRain + 28} className="tl-rowsub">{p.rain ? `mm/dia, máx. ${fmtNum(maxR, 1)}` : p.rainNote}</text>
              <line x1={PAD_L} x2={w - PAD_R} y1={yRain + 34} y2={yRain + 34} className="tl-axis" />
              {(p.rain ?? []).map((d) => d.v ? <rect key={d.date} className="tl-rain" x={xd(d.date) - barW / 2} width={barW} y={yRain + 34 - (d.v / maxR) * 30} height={(d.v / maxR) * 30}><title>{`${fmtDate(d.date)}: ${fmtNum(d.v, 1)} mm (NASA POWER)`}</title></rect> : null)}
            </g>
          )}
          {after && <line x1={x(toMs(after.acquiredAt))} x2={x(toMs(after.acquiredAt))} y1={16} y2={h - 2} className="tl-cursor" />}
          {before && <line x1={x(toMs(before.acquiredAt))} x2={x(toMs(before.acquiredAt))} y1={16} y2={h - 2} className="tl-cursor tl-cursor-a" />}
        </svg>
        {tip && (
          <div className="tl-tip" style={{ left: Math.min(w - 190, Math.max(4, tip.x - 90)), top: tip.y + 16 }} role="tooltip">
            {tip.text.map((t, i) => (i === 0 ? <b key={i}>{t}</b> : <span key={i}>{t}</span>))}
          </div>
        )}
      </div>
    </section>
  );
}
