import { useEffect, useMemo, useState } from 'react';
import { fmtDate, fmtNum } from '../lib/time';
import { campos, dataUrl, haTxt, VEREDITO, type ForestEvent, type RoData } from '../lib/ro';
import { COLORS } from './MapView';

/** Como funciona: siga um lugar de verdade, passo a passo, do radar ao veredito. */

type Ring = [number, number][];
function rings(e: ForestEvent): Ring[] {
  const g = e.geometry as number[][][] | number[][][][];
  if (e.gtype === 'Polygon') return [(g as number[][][])[0] as Ring];
  if (e.gtype === 'MultiPolygon') return (g as number[][][][]).map((p) => p[0] as Ring);
  return [];
}

const PASSOS = [
  { k: 'lugar', t: 'O lugar', s: 'Foto real do Sentinel-2' },
  { k: 'nisar', t: 'O NISAR mede o eco', s: 'radar, a cada 12 dias' },
  { k: 'chuva', t: 'Choveu?', s: 'Meteomatics' },
  { k: 's1', t: 'Outro satélite viu?', s: 'Sentinel-1' },
  { k: 'fim', t: 'Resultado', s: 'todos juntos' },
] as const;

function Chart({ dates, here, around, cursor, marks }: { dates: string[]; here: (number | null)[]; around: (number | null)[]; cursor: number; marks?: { d: string; c: string; t: string }[] }) {
  const W = 560, H = 200, L = 46, R = 22, T = 18, B = 28;
  const vals = [...here, ...around].filter((v): v is number => v !== null);
  const lo = Math.min(...vals) - 4, hi = Math.max(...vals) + 4;
  const t0 = Date.parse(dates[0]), t1 = Date.parse(dates[dates.length - 1]);
  const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (a: (number | null)[]) => a.map((v, i) => (v === null || i > cursor ? '' : `${i && a[i - 1] !== null ? 'L' : 'M'}${x(dates[i]).toFixed(1)},${y(v).toFixed(1)}`)).join(' ');
  const ticks = [lo + 4, (lo + hi) / 2, hi - 4].map((v) => Math.round(v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cf-chart" role="img" aria-label="Eco do radar no lugar e na floresta em volta">
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="cf-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="cf-ax">{v}</text></g>)}
      {(marks ?? []).map((m) => <g key={m.t}><line x1={x(m.d)} x2={x(m.d)} y1={T} y2={H - B} stroke={m.c} strokeDasharray="4 3" strokeWidth={1.5} /><text x={x(m.d) + 4} y={T + 10} className="cf-mk" fill={m.c}>{m.t}</text></g>)}
      <path d={path(around)} className="cf-around" />
      <path d={path(here)} className="cf-here" />
      {here[cursor] !== null && <circle cx={x(dates[cursor])} cy={y(here[cursor]!)} r={6} className="cf-dot" />}
      {around[cursor] !== null && <circle cx={x(dates[cursor])} cy={y(around[cursor]!)} r={4} className="cf-dot2" />}
      {dates.map((d, i) => (i % 2 === 0 ? <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="cf-ax">{fmtDate(d, false)}</text> : null))}
    </svg>
  );
}

export default function ComoFunciona({ data, onMap }: { data: RoData; onMap: (id: string) => void }) {
  const opcoes = useMemo(() => data.events
    .filter((e) => e.certeza !== 'possivel' && e.serie && e.chuva && e.s1 && data.chips[e.id])
    .sort((a, b) => (b.s1?.alerta ? 1 : 0) - (a.s1?.alerta ? 1 : 0) || (b.certeza === 'confirmado' ? 1 : 0) - (a.certeza === 'confirmado' ? 1 : 0) || b.area_ha - a.area_ha), [data]);
  const [id, setId] = useState(() => opcoes[0]?.id ?? '');
  const e = opcoes.find((x) => x.id === id) ?? opcoes[0];
  const [step, setStep] = useState(0);
  const [cur, setCur] = useState(0);
  const [play, setPlay] = useState(false);
  const s = e?.serie;
  const n = s?.dates.length ?? 0;

  useEffect(() => { setCur(0); setStep(0); setPlay(false); }, [id]);
  useEffect(() => { if (step === 1) { setCur(0); setPlay(true); } else setPlay(false); }, [step]);
  useEffect(() => {
    if (!play || !n) return;
    const t = setInterval(() => setCur((c) => { if (c >= n - 1) { setPlay(false); return c; } return c + 1; }), 650);
    return () => clearInterval(t);
  }, [play, n]);

  if (!e || !s) return <div className="page"><p className="fine">Carregando o exemplo…</p></div>;
  const chip = data.chips[e.id];
  const c = e.chuva!, s1 = e.s1!;
  const [[x0, y1], [x1], , [, y0]] = chip.corners as [[number, number], [number, number], [number, number], [number, number]];
  const px = (lon: number) => ((lon - x0) / (x1 - x0)) * 480;
  const py = (lat: number) => ((y1 - lat) / (y1 - y0)) * 480;
  const qi = Math.max(0, s.dates.indexOf(e.first_date));
  const here0 = s.here.find((v) => v !== null) ?? 0;
  const v = s.here[cur], a = s.around[cur];
  const caiu = cur >= qi;
  const verd = VEREDITO[c.veredito];

  return (
    <div className="page cf">
      <header className="page-head">
        <p className="kicker">Como funciona</p>
        <h1>Siga um lugar de verdade</h1>
        <p className="lede">Quatro satélites, um lugar em Rondônia. Avance os passos e veja como o SARtellite decide que a floresta foi derrubada.</p>
      </header>

      <div className="cf-pick">
        <label htmlFor="cf-ev">Lugar</label>
        <select id="cf-ev" value={e.id} onChange={(ev) => setId(ev.target.value)}>
          {opcoes.map((o) => <option key={o.id} value={o.id}>{haTxt(o.area_ha)} em {o.municipio} ({fmtDate(o.first_date, false)})</option>)}
        </select>
      </div>

      <ol className="cf-steps" role="tablist" aria-label="Passos">
        {PASSOS.map((p, i) => (
          <li key={p.k}>
            <button type="button" role="tab" aria-selected={step === i} className={`${step === i ? 'on' : ''}${i < step ? ' done' : ''}`} onClick={() => setStep(i)}>
              <span className="n">{i + 1}</span><b>{p.t}</b><small>{p.s}</small>
            </button>
          </li>
        ))}
      </ol>

      <section className="cf-stage glass" aria-live="polite">
        {step === 0 && (
          <div className="cf-two">
            <figure className="cf-photo">
              <img src={dataUrl(chip.img)} alt={`Foto do Sentinel-2 de ${fmtDate(chip.data)} sobre o lugar em ${e.municipio}`} />
              <svg viewBox="0 0 480 480" aria-hidden="true">
                {rings(e).map((r, i) => <polygon key={i} points={r.map(([lo, la]) => `${px(lo).toFixed(1)},${py(la).toFixed(1)}`).join(' ')} className="cf-poly" />)}
              </svg>
              <figcaption>Sentinel-2, {fmtDate(chip.data)} · 2,4 km de lado</figcaption>
            </figure>
            <div className="cf-text">
              <h2>{haTxt(e.area_ha)} em {e.municipio}</h2>
              <p>Do tamanho de <b>{fmtNum(campos(e.area_ha))} campos de futebol</b>. O contorno rosa é onde o radar viu a floresta sumir.</p>
              <p className="fine">Esta foto é de um satélite comum (óptico). Ele só funciona quando não há nuvem nem fumaça. Na seca de Rondônia, isso é raro. Por isso o resto do caminho é feito com radar.</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="cf-two">
            <div>
              <Chart dates={s.dates} here={s.here} around={s.around} cursor={cur} marks={[{ d: e.first_date, c: COLORS.floresta, t: 'queda' }]} />
              <div className="cf-ctrl">
                <button type="button" className="round" onClick={() => { if (cur >= n - 1) setCur(0); setPlay((p) => !p); }} aria-label={play ? 'Pausar' : 'Ver passagem a passagem'}>{play ? '❚❚' : '▶'}</button>
                <input type="range" min={0} max={n - 1} value={cur} onChange={(ev) => { setPlay(false); setCur(Number(ev.target.value)); }} aria-label="Passagem do NISAR" />
                <span>{fmtDate(s.dates[cur])}</span>
              </div>
            </div>
            <div className="cf-text">
              <div className="cf-big"><span>eco aqui</span><b style={{ color: COLORS.floresta }}>{v ?? '—'}</b><span>floresta em volta</span><b className="muted">{a ?? '—'}</b></div>
              <p>O NISAR manda ondas de rádio e mede quanto volta. <b>Floresta em pé devolve muito eco</b>; chão limpo devolve pouco.</p>
              <p className={caiu ? 'cf-alert' : 'fine'}>{caiu ? `Em ${fmtDate(e.first_date, false)} o eco daqui caiu (de ~${here0} para ${v ?? '—'}) e a floresta em volta continuou igual. Algo mudou só aqui.` : 'Até aqui, o eco do lugar acompanha a floresta em volta.'}</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="cf-two">
            <div className="cf-rain">
              {[{ t: 'Imagem de antes', d: c.base, mm: c.base_mm }, { t: 'Imagem da queda', d: c.deteccao, mm: c.deteccao_mm }].map((r) => (
                <div key={r.t} className="cf-rb">
                  <div className="cf-col"><i style={{ height: `${Math.min(100, (r.mm / Math.max(15, c.base_mm, c.deteccao_mm)) * 100)}%` }} className={r.mm >= 5 ? 'wet' : ''} /></div>
                  <b>{fmtNum(r.mm, r.mm < 10 ? 1 : 0)} mm</b><span>{r.t}<br />{fmtDate(r.d, false)}</span>
                </div>
              ))}
              <div className="cf-lim"><span>5 mm em 48 h = chão molhado</span></div>
            </div>
            <div className="cf-text">
              <h2>{verd.label}</h2>
              <p>Chão molhado também muda o eco do radar. Então perguntamos à <b>Meteomatics</b> quanto choveu nas 48 h antes de cada imagem.</p>
              <p>{verd.texto}</p>
              <p className="fine">O NISAR não sabe se choveu. A API de chuva não enxerga nem um graveto. Juntos, separam corte de chuva.</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="cf-two">
            <Chart dates={s1.serie.map((p) => p[0])} here={s1.serie.map((p) => p[1])} around={s1.serie.map(() => null)} cursor={s1.serie.length - 1}
              marks={[...(s1.alerta ? [{ d: s1.alerta, c: COLORS.s1, t: 'Sentinel-1' }] : []), { d: s1.queda_nisar, c: COLORS.floresta, t: 'NISAR' }]} />
            <div className="cf-text">
              <h2>{s1.alerta ? ((s1.dias_antes ?? 0) > 0 ? `O Sentinel-1 avisou ${s1.dias_antes} dias antes` : 'O Sentinel‑1 também viu') : 'Só o NISAR viu'}</h2>
              <p>O <b>Sentinel-1</b> é outro radar (europeu), de onda mais curta: enxerga a <b>copa</b>. O NISAR, de onda longa, chega aos <b>troncos</b>.</p>
              <p>{s1.alerta ? 'A linha roxa é o eco do Sentinel-1 aqui comparado com a floresta em volta. Quando ela cai e fica baixa, a copa sumiu.' : 'A copa não mudou o bastante para o Sentinel-1; a mudança pode estar debaixo dela.'}</p>
              <p className="fine">Passando em dias diferentes, os dois juntos dão uma imagem a cada {fmtNum(s1.revisita_juntos_dias ?? 7, 1)} dias aqui.</p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="cf-end">
            <ul>
              <li><i style={{ background: COLORS.floresta }} /><b>NISAR</b><span>o eco caiu e ficou baixo só aqui</span><em>✓</em></li>
              <li><i style={{ background: COLORS.chuva }} /><b>Meteomatics</b><span>{c.veredito === 'duvida' ? 'choveu perto: pode ser umidade' : 'não é efeito de chuva'}</span><em>{c.veredito === 'duvida' ? '?' : '✓'}</em></li>
              <li><i style={{ background: COLORS.s1 }} /><b>Sentinel-1</b><span>{s1.alerta ? `copa caiu em ${fmtDate(s1.alerta, false)}` : 'não viu na copa'}</span><em>{s1.alerta ? '✓' : '–'}</em></li>
              <li><i style={{ background: COLORS.fogo }} /><b>Focos de calor (NASA FIRMS)</b><span>{e.fogo_dias.length ? `fogo perto em ${e.fogo_dias.length} dias` : 'sem fogo perto'}</span><em>{e.fogo_dias.length ? '🔥' : '–'}</em></li>
              {e.inpe.length > 0 && <li><i style={{ background: '#9be15d' }} /><b>INPE DETER</b><span>também registrou o lugar</span><em>✓</em></li>}
            </ul>
            <p className="cf-verdict">{c.veredito === 'duvida' ? 'Provável derrubada, mas esperar a próxima passagem seca.' : 'Floresta derrubada, com mais de um satélite concordando.'}</p>
            <p className="fine">O radar não diz quem fez nem se foi permitido. Ele mostra onde olhar primeiro.</p>
            <button type="button" className="btn primary big" onClick={() => onMap(e.id)}>Ver este lugar no mapa</button>
          </div>
        )}

        <div className="cf-nav">
          <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((x) => Math.max(0, x - 1))}>← Voltar</button>
          <span>{step + 1} de {PASSOS.length}</span>
          <button type="button" className="btn primary" disabled={step === PASSOS.length - 1} onClick={() => setStep((x) => Math.min(PASSOS.length - 1, x + 1))}>Próximo →</button>
        </div>
      </section>
    </div>
  );
}
