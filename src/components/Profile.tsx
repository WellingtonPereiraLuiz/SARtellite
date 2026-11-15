import { useEffect, useMemo, useState } from 'react';
import { fmtDate, fmtNum } from '../lib/time';
import { dataUrl, dayOf, haTxt, type ForestEvent, type Layer, type RoData } from '../lib/ro';
import { COLORS } from './MapView';

type Persona = 'produtor' | 'prefeitura' | 'comunidade';
interface Prefs { persona: Persona; seguindo: string[]; alertas: Record<Layer, boolean> }
const KEY = 'sartellite.perfil.v3';
const DEFAULT: Prefs = { persona: 'produtor', seguindo: ['1100304', '1100205'], alertas: { fogo: true, floresta: true } };

const load = (): Prefs => {
  try { const s = localStorage.getItem(KEY); return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT; } catch { return DEFAULT; }
};

const PERSONAS: Record<Persona, { t: string; d: string }> = {
  produtor: { t: 'Produtor rural', d: 'Acompanhar a fazenda e mostrar que produz sem derrubar.' },
  prefeitura: { t: 'Prefeitura e órgãos', d: 'Saber onde olhar primeiro no município.' },
  comunidade: { t: 'Comunidade e escola', d: 'Entender o que muda no território.' },
};
const LAY: { l: Layer; t: string; c: string }[] = [
  { l: 'fogo', t: 'Queimadas', c: COLORS.fogo },
  { l: 'floresta', t: 'Floresta derrubada', c: COLORS.floresta },
];

function Spark({ v, c }: { v: number[]; c: string }) {
  const max = Math.max(1, ...v);
  return (
    <svg className="mini-spark" viewBox={`0 0 ${v.length * 6} 26`} preserveAspectRatio="none" aria-hidden="true">
      {v.map((x, i) => <rect key={i} x={i * 6 + 1} width={4} y={26 - Math.max(1, (x / max) * 24)} height={Math.max(1, (x / max) * 24)} rx={1} fill={c} opacity={x ? 0.95 : 0.25} />)}
    </svg>
  );
}

export default function Profile({ data, onOpenMun, onOpenEvent }: { data: RoData; onOpenMun: (id: string) => void; onOpenEvent: (id: string) => void }) {
  const [p, setP] = useState<Prefs>(load);
  const [add, setAdd] = useState('');
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sem armazenamento: segue em memória */ } }, [p]);

  const resumo = useMemo(() => {
    const out = new Map<string, { focos: number; floresta: number; semChuva: number; duvida: number; dois: number; porVolta: number[]; ult7: number }>();
    const n = data.periods.length, fim = n * 12;
    for (const id of p.seguindo) {
      const mi = data.fireMun.indexOf(id);
      const fs = mi < 0 ? [] : data.fires.filter((r) => r[3] === mi);
      const porVolta = Array.from({ length: n }, () => 0);
      for (const r of fs) porVolta[Math.min(n - 1, Math.floor(r[2] / 12))]++;
      out.set(id, {
        focos: fs.length, porVolta, ult7: fs.filter((r) => r[2] >= fim - 7).length,
        dois: data.events.filter((e) => e.cd_mun === id && e.certeza !== 'possivel' && e.s1?.alerta).length,
        floresta: data.events.filter((e) => e.cd_mun === id && e.certeza !== 'possivel').reduce((a, e) => a + e.area_ha, 0),
        semChuva: data.events.filter((e) => e.cd_mun === id && e.certeza !== 'possivel' && e.chuva && e.chuva.veredito !== 'duvida').length,
        duvida: data.events.filter((e) => e.cd_mun === id && e.certeza !== 'possivel' && e.chuva?.veredito === 'duvida').length,
      });
    }
    return out;
  }, [data, p.seguindo]);
  const ultimos: ForestEvent[] = useMemo(() => data.events.filter((e) => !!e.cd_mun && p.seguindo.includes(e.cd_mun) && e.certeza !== 'possivel')
    .sort((a, b) => dayOf(b.date) - dayOf(a.date) || b.area_ha - a.area_ha).slice(0, 6), [data, p.seguindo]);
  const tot = [...resumo.values()].reduce((a, r) => ({ focos: a.focos + r.focos, ha: a.ha + r.floresta, ok: a.ok + r.semChuva, du: a.du + r.duvida }), { focos: 0, ha: 0, ok: 0, du: 0 });
  const nome = (id: string) => data.municipios.find((m) => m.id === id)?.nome ?? id;
  const livres = data.municipios.filter((m) => !p.seguindo.includes(m.id)).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Meu painel</p>
        <h1>O que você quer acompanhar?</h1>
        <p className="upd"><i />Dados atualizados em {fmtDate(data.meta.generated_at)} · atualização diária</p>
      </header>
      <p className="banner glass" role="note"><span className="pill demo"><i />Demonstração</span>Ainda não há contas nem avisos de verdade. Suas escolhas ficam só neste navegador. Os números abaixo são reais.</p>

      <section className="personas" role="radiogroup" aria-label="Quem é você">
        {(Object.keys(PERSONAS) as Persona[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={p.persona === k} className={`persona glass${p.persona === k ? ' on' : ''}`} onClick={() => setP({ ...p, persona: k })}>
            <b>{PERSONAS[k].t}</b><span>{PERSONAS[k].d}</span>
          </button>
        ))}
      </section>

      <section className="follow">
        <div className="follow-h">
          <h2>Municípios que eu sigo</h2>
          <label htmlFor="add-mun" className="sr">Seguir município</label>
          <select id="add-mun" value={add} onChange={(e) => { if (e.target.value) setP({ ...p, seguindo: [...p.seguindo, e.target.value] }); setAdd(''); }}>
            <option value="">+ seguir município</option>
            {livres.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
        {p.seguindo.length === 0 && <p className="fine">Escolha um município para ver o resumo.</p>}
        {p.seguindo.length > 0 && (
          <div className="pn-tot glass">
            <div style={{ ['--c' as string]: COLORS.fogo }}><b>{fmtNum(tot.focos)}</b><span>focos de queimada</span></div>
            <div style={{ ['--c' as string]: COLORS.floresta }}><b>{tot.ha ? haTxt(tot.ha) : '0 ha'}</b><span>de floresta derrubada</span></div>
            <div><b>{tot.ok}</b><span>mudanças reais, sem chuva</span></div>
            <div><b>{tot.du}</b><span>para olhar de novo: pode ser chuva</span></div>
          </div>
        )}
        <div className="mun-cards">
          {p.seguindo.map((id) => {
            const r = resumo.get(id)!;
            return (
              <article key={id} className="mun-card glass">
                <header><h3>{nome(id)}</h3><button type="button" className="x" aria-label={`Deixar de seguir ${nome(id)}`} onClick={() => setP({ ...p, seguindo: p.seguindo.filter((x) => x !== id) })}>×</button></header>
                <ul>
                  <li style={{ ['--c' as string]: COLORS.fogo }}><i /><b>{fmtNum(r.focos)}</b> focos de queimada{r.ult7 > 0 && <em>{r.ult7} nos últimos 7 dias</em>}</li>
                  <li className="sp"><Spark v={r.porVolta} c={COLORS.fogo} /><small>queimadas a cada 12 dias, desde junho</small></li>
                  <li style={{ ['--c' as string]: COLORS.floresta }}><i /><b>{r.floresta ? haTxt(r.floresta) : '0 ha'}</b> de floresta derrubada</li>
                  {(r.semChuva > 0 || r.duvida > 0) && <li className="sub"><b>{r.semChuva}</b> sem chuva · <b>{r.duvida}</b> pode ser chuva{r.dois > 0 && <> · <b>{r.dois}</b> com 2 satélites</>}</li>}
                </ul>
                <button type="button" className="btn" onClick={() => onOpenMun(id)}>Ver no mapa</button>
              </article>
            );
          })}
        </div>
      </section>

      {ultimos.length > 0 && (
        <section className="pn-last">
          <h2>Últimas mudanças na floresta</h2>
          <ol className="glass">
            {ultimos.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onOpenEvent(e.id)}>
                  {data.chips[e.id] ? <img src={dataUrl(data.chips[e.id].img)} alt="" loading="lazy" /> : <span className="noimg" />}
                  <span className="t"><b>{haTxt(e.area_ha)} em {e.municipio}</b><small>NISAR, {fmtDate(e.date, false)}{e.chuva && ` · ${e.chuva.veredito === 'duvida' ? 'pode ser chuva' : 'sem chuva'}`}{e.s1?.alerta && ' · 2 satélites viram'}</small></span>
                  <span className="go">Ver no mapa</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="two">
        <div className="glass block">
          <h2>Me avise quando…</h2>
          {LAY.map((x) => (
            <label key={x.l} className="toggle" htmlFor={`al-${x.l}`} style={{ ['--c' as string]: x.c }}>
              <input id={`al-${x.l}`} type="checkbox" checked={p.alertas[x.l]} onChange={(e) => setP({ ...p, alertas: { ...p.alertas, [x.l]: e.target.checked } })} />
              <span className="track"><span /></span>{x.t} aparecer num município que eu sigo
            </label>
          ))}
          <p className="fine">A cada passagem do NISAR (12 dias). Em breve.</p>
        </div>
        {p.persona === 'produtor' ? (
          <div className="glass block">
            <h2>Exportar para a Europa</h2>
            <p>A lei europeia contra desmatamento (EUDR) vale a partir de 30/12/2026 e pede provar que a área não foi desmatada depois de 31/12/2020.</p>
            <p className="fine">Ideia futura: um relatório da fazenda com o histórico do radar. Para isso falta a linha de base de 2020, que o NISAR não tem (ele começou em 2025).</p>
          </div>
        ) : (
          <div className="glass block">
            <h2>Onde olhar primeiro</h2>
            <p>Abra o mapa no seu município e ligue só “Floresta derrubada”. Linha cheia é mudança real; tracejada pode ser chuva. Os lugares com dois anéis foram vistos por dois satélites e são os mais seguros.</p>
          </div>
        )}
      </section>
    </div>
  );
}
