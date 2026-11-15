import { fmtDate, fmtNum } from '../lib/time';
import type { RoData } from '../lib/ro';
import { COLORS } from './MapView';
import SarExplainer from './SarExplainer';

const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

function Como({ data, reduce, onMap }: { data: RoData; reduce: boolean; onMap: () => void }) {
  const m = data.meta;
  const c = m.floresta.por_certeza;
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Como funciona</p>
        <h1>O radar grita e escuta o eco</h1>
        <p className="lede">O NISAR manda ondas de rádio para o chão e mede quanto volta. Floresta em pé devolve muito eco. Chão limpo devolve pouco. Como ele faz a própria "luz", enxerga de noite e através de nuvem e fumaça.</p>
      </header>

      <SarExplainer reducedMotion={reduce} />

      <section className="steps">
        <article>
          <span className="num">1</span>
          <h2>O satélite passa</h2>
          <p>Desde {fmtDate(m.nisar.primeira)}, o NISAR passou {fmtNum(m.nisar.passagens)} vezes sobre Rondônia, em {m.nisar.quadros} pedaços de cerca de 240 km. Cada pedaço é visto de novo a cada 12 dias.</p>
        </article>
        <article>
          <span className="num" style={{ background: COLORS.floresta }}>2</span>
          <h2>Floresta derrubada</h2>
          <p>Usamos o eco que volta "girado" (polarização HV). Ele vem das copas e cai quando as árvores somem. Um lugar só entra no mapa se três coisas acontecerem juntas:</p>
          <ul className="check">
            <li>o eco caiu forte em relação à floresta vizinha;</li>
            <li>continuou baixo nas passagens seguintes;</li>
            <li>a floresta em volta não escureceu junto (isso seria seca ou cheia baixando, não derrubada).</li>
          </ul>
        </article>
        <article>
          <span className="num" style={{ background: COLORS.colheita, color: '#2a1d00' }}>3</span>
          <h2>Lavoura</h2>
          <p>Só nas áreas de lavoura, olhamos a maior mudança entre uma passagem e a seguinte. <b>O eco caiu</b>: a planta foi colhida ou o solo ficou exposto. <b>O eco subiu</b>: a planta cresceu, o solo foi preparado ou choveu.</p>
        </article>
        <article>
          <span className="num" style={{ background: '#39C6C3', color: '#04211f' }}>4</span>
          <h2>Quão certo é</h2>
          <p>O radar marcou {m.floresta.eventos} lugares de floresta. Mostramos {m.floresta.mostrados}: {c.confirmado ?? 0} que o INPE também viu com outro satélite e {c.provavel ?? 0} prováveis. Os outros {c.possivel ?? 0} ficam escondidos como sinal fraco. Dentro de Terra Indígena ou Unidade de Conservação, só aparece o que o INPE também registrou.</p>
        </article>
      </section>

      <section className="two">
        <div>
          <h2>O que dá para dizer</h2>
          <ul className="check">
            <li>A floresta mudou aqui, por volta desta data.</li>
            <li>A lavoura foi colhida ou plantada neste período.</li>
            <li>Teve fogo perto, segundo os satélites de calor.</li>
          </ul>
        </div>
        <div>
          <h2>O que não dá</h2>
          <ul className="cross">
            <li>Quem derrubou, ou se tinha autorização.</li>
            <li>Ver pessoas, máquinas ou cargas debaixo das árvores.</li>
            <li>Contar árvores uma por uma.</li>
          </ul>
        </div>
      </section>
      <p><button type="button" className="btn primary big" onClick={onMap}>Voltar ao mapa</button></p>
    </div>
  );
}

function Fontes({ data }: { data: RoData }) {
  const m = data.meta;
  const v = m.floresta.validacao_pixels;
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Fontes e conferência</p>
        <h1>De onde vem cada informação</h1>
        <p className="lede">Tudo foi baixado de fontes públicas e processado pelos scripts da pasta <code>pipeline/rondonia</code>. Nada é simulado. Atualizado em {fmtDate(m.generated_at)}.</p>
      </header>
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Fonte</th><th scope="col">Para quê</th><th scope="col">O que usamos</th></tr></thead>
          <tbody>
            <tr><td><b>NISAR</b> (NASA e ISRO), produto GCOV, via <A href="https://search.asf.alaska.edu/">ASF</A></td><td>Os dois insights</td><td>{fmtNum(m.nisar.passagens)} prévias públicas HH e {fmtNum(m.nisar.com_hv)} HV, de {fmtDate(m.nisar.primeira)} a {fmtDate(m.nisar.ultima)}, {m.nisar.quadros} quadros, 180 m por pixel</td></tr>
            <tr><td><A href="https://planetarycomputer.microsoft.com/dataset/io-lulc-annual-v02">Cobertura do solo 10 m</A> (Impact Observatory, Esri)</td><td>Saber onde era floresta e onde é lavoura</td><td>Mapa de {data.landcover.year}</td></tr>
            <tr><td><A href="https://geoportal.sedam.ro.gov.br/">GeoPortal SEDAM-RO</A></td><td>Dizer onde: municípios, Terras Indígenas, Unidades de Conservação</td><td>Camadas públicas da GeoServer</td></tr>
            <tr><td><A href="https://terrabrasilis.dpi.inpe.br/">INPE DETER</A></td><td>Conferir a floresta (não entra na detecção)</td><td>{fmtNum(m.deter.poligonos)} alertas em Rondônia desde junho</td></tr>
            <tr><td><A href={m.fogo.url}>{m.fogo.fonte}</A></td><td>Pista extra: houve fogo perto?</td><td>{fmtNum(m.fogo.focos)} focos de satélites polares</td></tr>
          </tbody>
        </table>
      </div>

      <section>
        <h2>Conferência honesta com o INPE</h2>
        <ul className="ev-list">
          <li>Das {m.floresta.eventos} manchas de floresta que o radar marcou, <b>{m.floresta.por_certeza.confirmado ?? 0}</b> coincidem com alertas do INPE (desmatamento, queimada ou degradação).</li>
          <li>Pixel a pixel, {fmtNum(v.precision_near_deter * 100)}% do que marcamos fica a até 360 m de um desmatamento do DETER. O DETER tem {fmtNum(v.deter_ha)} ha de corte raso no período, e encontramos {fmtNum(v.deter_polys_found * 100)}% desses polígonos.</li>
          <li>O motivo: usamos a <b>prévia pública</b> do NISAR (8 bits, 180 m). Derrubadas pequenas somem dentro de um pixel de 3 hectares. O produto calibrado (20 m) exige login e cerca de 2 GB por imagem. É o próximo passo.</li>
          <li>{fmtNum(data.landcover.nocoverage_share * 100)}% de Rondônia ficou sem dado bom de floresta: quadros com poucas passagens HV ou com imagens defeituosas foram descartados de propósito. No mapa, essa área aparece riscada.</li>
          <li>Grade das imagens: {m.nisar.grade_kml} quadros têm a posição publicada pela ASF. Outros {m.nisar.grade_ajustada} foram encaixados por comparação com o mapa de floresta. Testado nos quadros conhecidos, o erro foi de no máximo {m.nisar.teste_grade_max_px} pixel.</li>
        </ul>
      </section>
      <p className="fine">Créditos: NISAR, NASA/JPL-Caltech e ISRO, distribuído pela ASF DAAC. Impact Observatory, Microsoft e Esri. SEDAM-RO, IBGE, FUNAI, ICMBio. INPE (DETER e Programa Queimadas). Natural Earth. MapLibre GL JS.</p>
    </div>
  );
}

function Sobre() {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Sobre</p>
        <h1>SARtellite, da equipe Astrópodes</h1>
        <p className="lede">Feito em Rondônia para o desafio Dancing with the SARs do NASA Space Apps Challenge 2026. O desafio pede uma aplicação interativa que use o radar NISAR para acompanhar e mostrar mudanças na superfície da Terra. Escolhemos as duas mudanças que mais marcam o nosso estado: a floresta que cai e a lavoura que é colhida e plantada.</p>
      </header>
      <section className="two">
        <div>
          <h2>Por que estes dois</h2>
          <ul className="ev-list">
            <li>Os dois são medidos pelo NISAR. As outras fontes só ajudam a dizer onde e a conferir.</li>
            <li>Colher milho e derrubar floresta fazem o eco do radar cair do mesmo jeito. Mostrar os dois, separados pelo tipo de terreno, evita confundir colheita com desmatamento.</li>
            <li>Funciona para qualquer lugar que o NISAR cubra: basta rodar o pipeline com outra caixa de coordenadas.</li>
          </ul>
        </div>
        <div>
          <h2>Próximos passos</h2>
          <ul className="ev-list">
            <li>Trocar a prévia pelo NISAR calibrado de 20 m.</li>
            <li>Avisar quando uma nova passagem mostrar mudança numa área escolhida.</li>
            <li>Validar em campo com quem conhece o território.</li>
          </ul>
        </div>
      </section>
      <section>
        <h2>Equipe</h2>
        <p>Leo, Bryan, Wellington e Diogo.</p>
        <h2>Aviso</h2>
        <p>Protótipo de estudantes. Não representa nem é certificado pela NASA, ISRO, INPE ou SEDAM. Os resultados são indícios para alguém conferir. Eles não identificam pessoas nem dizem se uma derrubada foi legal ou ilegal.</p>
      </section>
    </div>
  );
}

export default function Pages({ view, data, reduce, onMap }: { view: 'como-funciona' | 'fontes' | 'sobre'; data: RoData; reduce: boolean; onMap: () => void }) {
  if (view === 'como-funciona') return <Como data={data} reduce={reduce} onMap={onMap} />;
  if (view === 'fontes') return <Fontes data={data} />;
  return <Sobre />;
}
