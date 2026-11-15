import { fmtNum } from '../lib/time';
import { dataUrl, haTxt, type RoData } from '../lib/ro';
import { COLORS } from './MapView';
import type { Layer } from '../lib/ro';

export default function Home({ data, onOpen, go }: { data: RoData; onOpen: (only?: Layer) => void; go: (v: 'perfil' | 'como-funciona' | 'danca') => void }) {
  const m = data.meta;
  const focos = data.fires.length;
  const com = data.events.filter((e) => e.chuva && e.certeza !== 'possivel');
  const ok = com.filter((e) => e.chuva!.veredito !== 'duvida').length;
  return (
    <div className="home">
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,11,16,0.96) 0%, rgba(5,11,16,0.7) 45%, rgba(5,11,16,0.15) 100%), url(${dataUrl('ro/hero.webp')})` }}>
        <div className="hero-in">
          <p className="kicker">NASA Space Apps 2026 · Dancing with the SARs · Equipe Astrópodes</p>
          <h1>A floresta muda.<br />O radar vê.</h1>
          <p className="sub">Queimadas e floresta derrubada em Rondônia, vistas pelo radar NISAR mesmo com nuvem e fumaça, e conferidas com a chuva para não dar alarme falso.</p>
          <div className="kpis">
            <button type="button" className="kpi glass" onClick={() => onOpen('fogo')} style={{ ['--c' as string]: COLORS.fogo }}><i /><b>{fmtNum(focos)}</b><span>focos de queimada</span></button>
            <button type="button" className="kpi glass" onClick={() => onOpen('floresta')} style={{ ['--c' as string]: COLORS.floresta }}><i /><b>{haTxt(m.floresta.ha_mostrados)}</b><span>de floresta derrubada</span></button>
            <button type="button" className="kpi glass" onClick={() => go('danca')} style={{ ['--c' as string]: COLORS.chuva }}><i /><b>{com.length ? `${ok} de ${com.length}` : '—'}</b><span>mudanças confirmadas sem chuva</span></button>
          </div>
          <div className="cta"><button type="button" className="btn primary big" onClick={() => onOpen()}>Abrir o mapa</button><span>desde 18 jun 2026 · {fmtNum(m.nisar.passagens)} imagens de radar</span></div>
        </div>
      </section>

      <section className="dance-teaser">
        <div className="glass dt-card">
          <p className="kicker">Nenhum satélite dança sozinho</p>
          <h2>Corte ou chuva?</h2>
          <ul>
            <li><span className="ar">→</span><span><b>NISAR → clima:</b> a API de chuva não enxerga nem um graveto; o NISAR vê a floresta.</span></li>
            <li><span className="ar">←</span><span><b>Meteomatics → NISAR:</b> diz se o eco mudou por solo molhado ou por tronco caído.</span></li>
          </ul>
          <p className="juntos">Juntos: mudança real, sem falso alarme de chuva.</p>
          <button type="button" className="btn" onClick={() => go('danca')}>Ver os 8 casos</button>
        </div>
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
