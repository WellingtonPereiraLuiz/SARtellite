import { fmtDate, fmtNum } from '../lib/time';
import { dataUrl, haTxt, type RoData } from '../lib/ro';
import { COLORS } from './MapView';
import type { Layer } from '../lib/ro';

export default function Home({ data, onOpen, go }: { data: RoData; onOpen: (only?: Layer) => void; go: (v: 'perfil' | 'como-funciona' | 'danca' | 'fontes') => void }) {
  const m = data.meta;
  const focos = data.fires.length;
  const com = data.events.filter((e) => e.chuva && e.certeza !== 'possivel');
  const ok = com.filter((e) => e.chuva!.veredito !== 'duvida').length;
  const vis = data.events.filter((e) => e.certeza !== 'possivel');
  const s1a = vis.filter((e) => e.s1?.alerta).length;
  const antes = vis.filter((e) => (e.s1?.dias_antes ?? 0) > 0).length;
  const heroImg = data.s2?.tiles ? 'ro/hero_s2.webp' : 'ro/hero.webp';
  return (
    <div className="home">
      <section className="hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,11,16,0.96) 0%, rgba(5,11,16,0.7) 45%, rgba(5,11,16,0.15) 100%), url(${dataUrl(heroImg)})` }}>
        <div className="hero-in">
          <p className="kicker">NASA Space Apps 2026 · Dancing with the SARs · Equipe Astrópodes</p>
          <h1>A floresta muda.<br />O radar vê.</h1>
          <p className="upd"><i />Atualizado em {fmtDate(m.generated_at)} · atualização diária</p>
          <p className="sub">Queimadas e floresta derrubada em Rondônia, vistas pelo radar NISAR mesmo com nuvem e fumaça. A chuva e um segundo radar conferem cada lugar, para não dar alarme falso.</p>
          <div className="kpis">
            <button type="button" className="kpi glass" onClick={() => onOpen('fogo')} style={{ ['--c' as string]: COLORS.fogo }}><i /><b>{fmtNum(focos)}</b><span>focos de queimada</span></button>
            <button type="button" className="kpi glass" onClick={() => onOpen('floresta')} style={{ ['--c' as string]: COLORS.floresta }}><i /><b>{haTxt(m.floresta.ha_mostrados)}</b><span>de floresta derrubada</span></button>
            <button type="button" className="kpi glass" onClick={() => go('danca')} style={{ ['--c' as string]: COLORS.chuva }}><i /><b>{com.length ? `${ok} de ${com.length}` : '—'}</b><span>mudanças confirmadas sem chuva</span></button>
          </div>
          <div className="cta"><button type="button" className="btn primary big" onClick={() => onOpen()}>Abrir o mapa</button><span>desde 18 jun 2026 · {fmtNum(m.nisar.passagens)} imagens de radar</span></div>
        </div>
      </section>

      <section className="dance-teaser">
        <header className="sec-h">
          <p className="kicker">Nenhum satélite dança sozinho</p>
          <h2>O NISAR vê. Os parceiros conferem.</h2>
        </header>
        <div className="dt-grid">
          <div className="glass dt-card">
            <span className="dt-n">1</span>
            <h3>Corte ou chuva?</h3>
            <p className="dt-who">NISAR × Meteomatics</p>
            <p>Chão molhado também muda o eco do radar. A chuva das 48 horas antes de cada imagem separa o corte de verdade do falso alarme.</p>
            <p className="dt-num"><b>{com.length ? `${ok} de ${com.length}` : '—'}</b><span>lugares com mudança real, sem chuva para confundir</span></p>
          </div>
          <div className="glass dt-card">
            <span className="dt-n">2</span>
            <h3>Alerta em 2 etapas</h3>
            <p className="dt-who">NISAR × Sentinel-1</p>
            <p>O Sentinel-1 passa em outros dias e vê a copa cair. O NISAR atravessa a copa e confirma que o tronco sumiu.</p>
            <p className="dt-num"><b>{s1a ? `${s1a} de ${vis.length}` : '—'}</b><span>lugares vistos pelos dois radares{antes ? `; em ${antes}, o Sentinel-1 avisou antes` : ''}</span></p>
          </div>
        </div>
        <div className="dt-cta"><button type="button" className="btn primary" onClick={() => go('danca')}>Ver as danças</button><button type="button" className="btn" onClick={() => go('como-funciona')}>Seguir um lugar passo a passo</button></div>
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

      <section className="srcs" aria-label="Fontes dos dados">
        <p className="kicker">Dados abertos de</p>
        <ul>
          <li><b>NISAR</b><span>NASA e ISRO · radar banda L</span></li>
          <li><b>FIRMS</b><span>NASA · focos de calor</span></li>
          <li><b>Meteomatics</b><span>chuva</span></li>
          <li><b>Sentinel-1</b><span>ESA · radar banda C</span></li>
          <li><b>Sentinel-2</b><span>ESA · foto real</span></li>
          <li><b>DETER</b><span>INPE · conferência</span></li>
          <li><b>SEDAM-RO</b><span>limites e áreas protegidas</span></li>
        </ul>
        <button type="button" className="btn" onClick={() => go('fontes')}>Ver todas as fontes</button>
      </section>

      <footer className="foot">
        <p>SARtellite · Leo, Bryan, Wellington e Diogo · Vilhena, RO</p>
        <p>Protótipo de estudantes. Não é produto oficial da NASA, ISRO, ESA, INPE ou SEDAM.</p>
      </footer>
    </div>
  );
}
