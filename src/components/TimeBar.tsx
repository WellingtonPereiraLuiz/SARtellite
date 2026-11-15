import { useEffect, useRef, useState } from 'react';
import { fmtDate, fmtNum } from '../lib/time';
import type { Period } from '../lib/ro';
import { COLORS } from './MapView';

export interface PeriodStat { floresta: number; colheita: number; plantio: number; misto: number }

interface Props {
  periods: Period[];
  stats: PeriodStat[];
  range: [number, number];
  onRange: (r: [number, number]) => void;
  showFloresta: boolean;
  showLavoura: boolean;
}

export default function TimeBar({ periods, stats, range, onRange, showFloresta, showLavoura }: Props) {
  const n = periods.length;
  const all = range[0] === 0 && range[1] === n - 1;
  const [playing, setPlaying] = useState(false);
  const drag = useRef<number | null>(null);
  const maxF = Math.max(1, ...stats.map((s) => s.floresta));
  const maxL = Math.max(1, ...stats.map((s) => s.colheita + s.plantio + s.misto));

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      onRange(((r) => { const next = all || r[0] !== r[1] ? 0 : (r[0] + 1) % n; return [next, next]; })(range));
    }, 1300);
    return () => clearInterval(t);
  }, [playing, range, all, n, onRange]);

  const pick = (i: number, shift: boolean) => {
    setPlaying(false);
    if (shift) onRange([Math.min(range[0], i), Math.max(range[1], i)]);
    else if (range[0] === i && range[1] === i) onRange([0, n - 1]);
    else onRange([i, i]);
  };

  const sel = (i: number) => i >= range[0] && i <= range[1];
  const label = all ? `Desde ${fmtDate(periods[0].start)} até ${fmtDate(periods[n - 1].end)}` : range[0] === range[1] ? `${fmtDate(periods[range[0]].start)} a ${fmtDate(periods[range[0]].end)}` : `${fmtDate(periods[range[0]].start)} a ${fmtDate(periods[range[1]].end)}`;

  return (
    <section className="timebar" aria-label="Linha do tempo">
      <div className="tb-head">
        <div className="tb-ctrl">
          <button type="button" className="btn" onClick={() => setPlaying((v) => !v)} aria-pressed={playing}>{playing ? '❚❚ Pausar' : '▶ Ver passar o tempo'}</button>
          <button type="button" className="btn ghost" onClick={() => { setPlaying(false); onRange([0, n - 1]); }} disabled={all}>Todo o período</button>
        </div>
        <p className="tb-label" aria-live="polite"><b>{label}</b><span> · cada coluna é uma volta de 12 dias do NISAR. Clique numa coluna para ver só ela. Segure Shift para juntar várias.</span></p>
      </div>
      <div
        className="tb-grid" style={{ gridTemplateColumns: `128px repeat(${n}, minmax(34px, 1fr))` }}
        onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}
      >
        <div className="tb-row-label">{showFloresta ? <><i style={{ background: COLORS.floresta }} />Floresta derrubada</> : <span className="muted">Floresta (oculta)</span>}</div>
        {stats.map((s, i) => (
          <button
            key={`f${i}`} type="button" className={`tb-cell${sel(i) ? ' on' : ''}`}
            aria-label={`${fmtDate(periods[i].start)} a ${fmtDate(periods[i].end)}: ${fmtNum(s.floresta)} hectares de floresta`}
            onPointerDown={(e) => { drag.current = i; pick(i, e.shiftKey); }}
            onPointerEnter={() => { if (drag.current !== null && drag.current !== i) onRange([Math.min(drag.current, i), Math.max(drag.current, i)]); }}
          >
            {showFloresta && s.floresta > 0 && <span className="bar" style={{ height: `${Math.max(6, (s.floresta / maxF) * 100)}%`, background: COLORS.floresta }} />}
            {showFloresta && s.floresta > 0 && <span className="val">{fmtNum(s.floresta)}</span>}
          </button>
        ))}
        <div className="tb-row-label">{showLavoura ? <><i style={{ background: COLORS.colheita }} /><i style={{ background: COLORS.plantio }} />Lavoura que mudou</> : <span className="muted">Lavoura (oculta)</span>}</div>
        {stats.map((s, i) => {
          const tot = s.colheita + s.plantio + s.misto;
          return (
            <button
              key={`l${i}`} type="button" className={`tb-cell${sel(i) ? ' on' : ''}`}
              aria-label={`${fmtDate(periods[i].start)} a ${fmtDate(periods[i].end)}: ${fmtNum(tot)} hectares de lavoura mudaram`}
              onPointerDown={(e) => { drag.current = i; pick(i, e.shiftKey); }}
              onPointerEnter={() => { if (drag.current !== null && drag.current !== i) onRange([Math.min(drag.current, i), Math.max(drag.current, i)]); }}
            >
              {showLavoura && tot > 0 && (
                <span className="stack" style={{ height: `${Math.max(6, (tot / maxL) * 100)}%` }}>
                  <span style={{ flex: s.plantio, background: COLORS.plantio }} />
                  <span style={{ flex: s.misto, background: COLORS.misto }} />
                  <span style={{ flex: s.colheita, background: COLORS.colheita }} />
                </span>
              )}
              {showLavoura && tot > 0 && <span className="val">{tot >= 1000 ? `${fmtNum(tot / 1000)} mil` : fmtNum(tot)}</span>}
            </button>
          );
        })}
        <div className="tb-row-label small">Passagens do NISAR</div>
        {periods.map((p, i) => <div key={`p${i}`} className={`tb-pass${sel(i) ? ' on' : ''}${p.passagens < 25 ? ' few' : ''}`} title={`${p.passagens} imagens de radar neste período`}>{p.passagens}</div>)}
        <div className="tb-row-label small" />
        {periods.map((p, i) => <div key={`d${i}`} className={`tb-date${sel(i) ? ' on' : ''}`}>{fmtDate(p.start, false)}</div>)}
      </div>
      <p className="tb-note">Períodos com poucas passagens (número apagado) cobriram só parte do estado. Ali, menos mudanças podem aparecer.</p>
    </section>
  );
}
