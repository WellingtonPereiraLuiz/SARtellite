import { fmtNum } from '../lib/time';
import { dataUrl, haTxt, type RoData } from '../lib/ro';
import { COLORS } from './MapView';
import type { Layer } from '../lib/ro';

const STORY = [
  { k: 'Mundo', t: 'El Niño de 2026', d: '+2,0 °C de ago a out: a 2ª maior marca para essa época desde 1950.', s: 'NOAA' },
  { k: 'Amazônia', t: 'A bomba d’água', d: 'A floresta devolve água ao ar e ajuda a fazer a chuva do continente.', s: '' },
  { k: 'Rondônia', t: 'Porto Velho em emergência', d: 'Estiagem reconhecida em outubro; 22,9 mil pessoas afetadas.', s: 'Defesa Civil' },
  { k: 'Problema', t: 'Fumaça e nuvem', d: 'Na seca, fogo e derrubada acontecem onde a foto não enxerga.', s: '' },
  { k: 'Solução', t: 'O radar vê', d: 'O NISAR atravessa nuvem e fumaça a cada 12 dias. O SARtellite traduz.', s: 'NASA/ISRO' },
];

export default function Home({ data, onOpen, go }: { data: RoData; onOpen: (only?: Layer) => void; go: (v: 'perfil' | 'como-funciona') => void }) {
  const m = data.meta;
  const focos = data.fires.length;
  const lav = data.farm.reduce((a, r) => a + r[4], 0);
  return (
    <div className="home">
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,11,16,0.96) 0%, rgba(5,11,16,0.7) 45%, rgba(5,11,16,0.15) 100%), url(${dataUrl('ro/hero.webp')})` }}>
        <div className="hero-in">
          <p className="kicker">NASA Space Apps 2026 · Dancing with the SARs · Equipe Astrópodes</p>
          <h1>A floresta muda.<br />O radar vê.</h1>
          <p className="sub">Queimadas, floresta derrubada e lavouras em Rondônia, vistas pelo radar NISAR, mesmo com nuvem e fumaça.</p>
          <div className="kpis">
            <button type="button" className="kpi glass" onClick={() => onOpen('fogo')} style={{ ['--c' as string]: COLORS.fogo }}><i /><b>{fmtNum(focos)}</b><span>focos de queimada</span></button>
            <button type="button" className="kpi glass" onClick={() => onOpen('floresta')} style={{ ['--c' as string]: COLORS.floresta }}><i /><b>{haTxt(m.floresta.ha_mostrados)}</b><span>de floresta derrubada</span></button>
            <button type="button" className="kpi glass" onClick={() => onOpen('lavoura')} style={{ ['--c' as string]: COLORS.lavoura }}><i /><b>{haTxt(lav)}</b><span>de lavoura em movimento</span></button>
          </div>
          <div className="cta"><button type="button" className="btn primary big" onClick={() => onOpen()}>Abrir o mapa</button><span>desde 18 jun 2026 · {fmtNum(m.nisar.passagens)} imagens de radar</span></div>
        </div>
      </section>

      <section className="story">
        {STORY.map((s, i) => (
          <article key={s.k} className="beat glass">
            <span className="n">{i + 1}</span>
            <p className="bk">{s.k}</p>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
            {s.s && <small>{s.s}</small>}
          </article>
        ))}
      </section>

      <section className="split">
        <div className="block glass">
          <h2>Como o radar vê</h2>
          <ol className="how">
            <li><b>Grita</b><span>manda ondas de rádio para o chão</span></li>
            <li><b>Escuta</b><span>floresta devolve muito eco, chão limpo pouco</span></li>
            <li><b>Compara</b><span>a cada 12 dias, o que mudou</span></li>
          </ol>
          <button type="button" className="btn" onClick={() => go('como-funciona')}>Ver a explicação</button>
        </div>
        <div className="block glass">
          <h2>Para quem</h2>
          <ul className="who">
            <li><b>Produtor rural</b><span>mostrar que produz sem derrubar</span></li>
            <li><b>Prefeitura e órgãos</b><span>saber onde olhar primeiro</span></li>
            <li><b>Comunidade e escola</b><span>entender o próprio território</span></li>
          </ul>
          <button type="button" className="btn" onClick={() => go('perfil')}>Montar meu painel</button>
        </div>
      </section>

      <footer className="foot">
        <p>SARtellite · Leo, Bryan, Wellington e Diogo · Vilhena, RO</p>
        <p>Protótipo de estudantes. Não é produto oficial da NASA, ISRO, INPE ou SEDAM.</p>
      </footer>
    </div>
  );
}
