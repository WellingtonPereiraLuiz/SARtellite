import { useEffect, useMemo, useState } from 'react';
import { fmtNum } from '../lib/time';
import { haTxt, type Layer, type RoData } from '../lib/ro';
import { COLORS } from './MapView';

type Persona = 'produtor' | 'prefeitura' | 'comunidade';
interface Prefs { persona: Persona; seguindo: string[]; alertas: Record<Layer, boolean> }
const KEY = 'sartellite.perfil.v2';
const DEFAULT: Prefs = { persona: 'produtor', seguindo: ['1100304'], alertas: { fogo: true, floresta: true } };

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

export default function Profile({ data, onOpenMun }: { data: RoData; onOpenMun: (id: string) => void }) {
  const [p, setP] = useState<Prefs>(load);
  const [add, setAdd] = useState('');
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sem armazenamento: segue em memória */ } }, [p]);

  const resumo = useMemo(() => {
    const out = new Map<string, { focos: number; floresta: number; semChuva: number; duvida: number }>();
    for (const id of p.seguindo) {
      const mi = data.fireMun.indexOf(id);
      out.set(id, {
        focos: mi < 0 ? 0 : data.fires.filter((r) => r[3] === mi).length,
        floresta: data.events.filter((e) => e.cd_mun === id && e.certeza !== 'possivel').reduce((a, e) => a + e.area_ha, 0),
        semChuva: data.events.filter((e) => e.cd_mun === id && e.certeza !== 'possivel' && e.chuva && e.chuva.veredito !== 'duvida').length,
        duvida: data.events.filter((e) => e.cd_mun === id && e.certeza !== 'possivel' && e.chuva?.veredito === 'duvida').length,
      });
    }
    return out;
  }, [data, p.seguindo]);
  const nome = (id: string) => data.municipios.find((m) => m.id === id)?.nome ?? id;
  const livres = data.municipios.filter((m) => !p.seguindo.includes(m.id)).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Meu painel</p>
        <h1>O que você quer acompanhar?</h1>
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
        <div className="mun-cards">
          {p.seguindo.map((id) => {
            const r = resumo.get(id)!;
            return (
              <article key={id} className="mun-card glass">
                <header><h3>{nome(id)}</h3><button type="button" className="x" aria-label={`Deixar de seguir ${nome(id)}`} onClick={() => setP({ ...p, seguindo: p.seguindo.filter((x) => x !== id) })}>×</button></header>
                <ul>
                  <li style={{ ['--c' as string]: COLORS.fogo }}><i /><b>{fmtNum(r.focos)}</b> focos de queimada</li>
                  <li style={{ ['--c' as string]: COLORS.floresta }}><i /><b>{r.floresta ? haTxt(r.floresta) : '0 ha'}</b> de floresta derrubada</li>
                  {(r.semChuva > 0 || r.duvida > 0) && <li style={{ ['--c' as string]: COLORS.chuva }}><i /><b>{r.semChuva}</b> sem chuva · <b>{r.duvida}</b> pode ser chuva</li>}
                </ul>
                <button type="button" className="btn" onClick={() => onOpenMun(id)}>Ver no mapa</button>
              </article>
            );
          })}
        </div>
      </section>

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
            <p>Abra o mapa no seu município e ligue só “Floresta derrubada”. Os lugares com selo “O INPE também viu” são os mais seguros.</p>
          </div>
        )}
      </section>
    </div>
  );
}
