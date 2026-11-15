import { fmtDate, fmtNum } from '../lib/time';
import { campos, CERTEZA, VEREDITO, type Chuva, type ForestEvent, type Municipio, type S1, type Serie } from '../lib/ro';
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

/** Caso 1: o NISAR vê a mudança; a Meteomatics diz se choveu perto das duas imagens. */
export function CorteOuChuva({ c, limite = 5 }: { c: Chuva; limite?: number }) {
  const v = VEREDITO[c.veredito];
  const max = Math.max(limite * 3, c.base_mm, c.deteccao_mm);
  const Bar = ({ label, d, mm }: { label: string; d: string; mm: number }) => (
    <li>
      <span>{label} <small>{fmtDate(d, false)}</small></span>
      <i className="rb"><i style={{ width: `${Math.max(2, (mm / max) * 100)}%` }} className={mm >= limite ? 'wet' : ''} /></i>
      <b>{fmtNum(mm, mm < 10 ? 1 : 0)} mm</b>
    </li>
  );
  return (
    <section className={`coc v-${c.veredito}`} aria-label="Corte ou chuva?">
      <header><b>Corte ou chuva?</b><span className="pill" style={{ ['--c' as string]: c.veredito === 'duvida' ? '#5FB8FF' : '#9BE15D' }}><i />{v.label}</span></header>
      <ul>
        <Bar label="Imagem de antes" d={c.base} mm={c.base_mm} />
        <Bar label="Imagem da queda" d={c.deteccao} mm={c.deteccao_mm} />
      </ul>
      <p className="note">Chuva nas 48 h antes de cada imagem (Meteomatics). {v.texto}{c.secas_depois > 0 && c.veredito !== 'corte' ? ` A queda continuou em ${c.secas_depois} ${c.secas_depois === 1 ? 'passagem seca' : 'passagens secas'}.` : ''}</p>
    </section>
  );
}

/** Caso 2: o Sentinel-1 avisa (copa, banda C); o NISAR confirma (troncos, banda L); o fogo diz se queimou. */
export function AlertaDuasEtapas({ s, fogo }: { s: S1; fogo: number }) {
  const W = 300, H = 64, L = 6, R = 6, T = 8, B = 16;
  const pts = s.serie;
  const t0 = Date.parse(pts[0][0]), t1 = Date.parse(pts[pts.length - 1][0]);
  const vs = pts.map((p) => p[1]);
  const lo = Math.min(...vs) - 0.3, hi = Math.max(...vs) + 0.3;
  const x = (d: string) => L + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const a = s.alerta;
  const txt = !a
    ? 'O Sentinel-1 não viu queda forte na copa. A mudança pode estar debaixo dela: só a banda L do NISAR enxerga troncos.'
    : (s.dias_antes ?? 0) > 0
      ? `O Sentinel-1 avisou ${s.dias_antes} dias antes; o NISAR confirmou que o tronco sumiu.`
      : (s.dias_antes ?? 0) === 0
        ? 'Os dois viram a queda na mesma semana.'
        : `O NISAR viu primeiro; o Sentinel-1 confirmou na copa ${-(s.dias_antes ?? 0)} dias depois.`;
  return (
    <section className="a2e" aria-label="Alerta em 2 etapas">
      <header><b>Alerta em 2 etapas</b><span className="pill" style={{ ['--c' as string]: a ? '#C9A6FF' : '#9fb3b8' }}><i />{a ? 'Dois satélites viram' : 'Só o NISAR viu'}</span></header>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Eco do Sentinel-1 no lugar menos a floresta em volta, imagem a imagem">
        <line x1={x(s.queda_nisar)} x2={x(s.queda_nisar)} y1={T - 4} y2={H - B} className="a-nisar" />
        {a && <line x1={x(a)} x2={x(a)} y1={T - 4} y2={H - B} className="a-s1" />}
        <polyline points={pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} className="a-line" />
        {pts.map((p) => <circle key={p[0]} cx={x(p[0])} cy={y(p[1])} r={2} className="a-dot" />)}
      </svg>
      <ul className="steps2">
        <li><i className="k1" /><span>1. Sentinel-1 avisa</span><b>{a ? fmtDate(a, false) : '—'}</b></li>
        <li><i className="k2" /><span>2. NISAR confirma</span><b>{fmtDate(s.queda_nisar, false)}</b></li>
        <li><i className="k3" /><span>Fogo perto (INPE)</span><b>{fogo ? `${fogo} ${fogo === 1 ? 'dia' : 'dias'}` : 'não'}</b></li>
      </ul>
      <p className="note">{txt} {s.revisita_juntos_dias ? `Juntos, os dois dão uma imagem a cada ${fmtNum(s.revisita_juntos_dias, 1)} dias aqui.` : ''}</p>
    </section>
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
      {e.chuva && <CorteOuChuva c={e.chuva} />}
      {e.s1 && e.s1.serie.length > 2 && <AlertaDuasEtapas s={e.s1} fogo={e.fogo_dias.length} />}
      <div className="clues">
        {e.inpe.length > 0 && <span className="clue">INPE: {classe(e.inpe[0].classe)} em {fmtDate(e.inpe[0].data, false)}</span>}
        {e.fogo_dias.length > 0 && <span className="clue fire">Fogo perto em {e.fogo_dias.length} {e.fogo_dias.length === 1 ? 'dia' : 'dias'}</span>}
      </div>
      <p className="note">{c.texto} O radar não diz quem fez nem se foi permitido.</p>
    </Shell>
  );
}

export function FireDetail({ day, hour, forest, start, onClose }: { day: number; hour?: number; forest: boolean; start: string; onClose: () => void }) {
  const d = new Date(Date.parse(`${start}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 10);
  return (
    <Shell tag="Queimada" color={COLORS.fogo} title={`Foco de calor em ${fmtDate(d)}${hour !== undefined ? `, por volta das ${hour}h` : ''}`} onClose={onClose}>
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
      </ul>
      <button type="button" className="btn primary" onClick={onFilter}>{filtered ? 'Ver Rondônia inteira' : `Filtrar ${m.nome}`}</button>
    </Shell>
  );
}
