import { fmtDate, fmtNum } from '../lib/time';
import type { RoData } from '../lib/ro';
import { COLORS } from './MapView';
import SarExplainer from './SarExplainer';

const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

export function Como({ data, reduce, onMap }: { data: RoData; reduce: boolean; onMap: () => void }) {
  const m = data.meta;
  const c = m.floresta.por_certeza;
  const CARDS = [
    { c: COLORS.floresta, t: 'Floresta derrubada', d: 'O eco “girado” (HV) vem das copas. Se ele cai forte, fica baixo nas passagens seguintes e a floresta em volta não muda junto, marcamos o lugar.' },
    { c: COLORS.lavoura, t: 'Lavoura', d: 'Só onde já é lavoura: eco caiu é colheita ou solo exposto; eco subiu é planta crescendo ou solo preparado.' },
    { c: COLORS.fogo, t: 'Queimadas', d: 'Focos de calor dos satélites VIIRS e MODIS, via INPE. Contam onde e quando houve fogo. O radar mostra o que mudou depois.' },
  ];
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Como funciona</p>
        <h1>O radar grita e escuta o eco</h1>
        <p className="lede">Floresta em pé devolve muito eco. Chão limpo devolve pouco. Como o NISAR faz a própria “luz”, ele enxerga de noite, com nuvem e com fumaça.</p>
      </header>
      <SarExplainer reducedMotion={reduce} />
      <section className="cards3">
        {CARDS.map((k) => <article key={k.t} className="glass" style={{ ['--c' as string]: k.c }}><i className="bar" /><h2>{k.t}</h2><p>{k.d}</p></article>)}
      </section>
      <section className="two">
        <div className="glass block"><h2>Dá para dizer</h2><ul className="check"><li>A floresta mudou aqui, por volta desta data.</li><li>A lavoura foi colhida ou plantada neste período.</li><li>Teve fogo perto, segundo os satélites de calor.</li></ul></div>
        <div className="glass block"><h2>Não dá para dizer</h2><ul className="cross"><li>Quem derrubou, ou se tinha autorização.</li><li>Que o El Niño causou uma mudança. Ele aumenta o risco; o radar mostra o que já mudou no chão.</li><li>Contar árvores uma por uma.</li></ul></div>
      </section>
      <p className="fine">Dos {m.floresta.eventos} lugares de floresta marcados, mostramos {m.floresta.mostrados}: {c.confirmado ?? 0} que o INPE também viu e {c.provavel ?? 0} prováveis. Os {c.possivel ?? 0} sinais fracos ficam escondidos (dá para ligar em “Mais filtros”).</p>
      <p><button type="button" className="btn primary big" onClick={onMap}>Abrir o mapa</button></p>
    </div>
  );
}

export function Fontes({ data }: { data: RoData }) {
  const m = data.meta;
  const v = m.floresta.validacao_pixels;
  const rows: [React.ReactNode, string, string][] = [
    [<><b>NISAR</b> (NASA e ISRO), GCOV, via <A href="https://search.asf.alaska.edu/">ASF</A></>, 'Floresta e lavoura', `${fmtNum(m.nisar.passagens)} passagens HH e ${fmtNum(m.nisar.com_hv)} HV, ${fmtDate(m.nisar.primeira)} a ${fmtDate(m.nisar.ultima)}`],
    [<A href={m.fogo.url}>INPE Programa Queimadas</A>, 'Queimadas', `${fmtNum(m.fogo.focos)} focos (VIIRS e MODIS)`],
    [<A href="https://terrabrasilis.dpi.inpe.br/">INPE DETER</A>, 'Conferir a floresta', `${fmtNum(m.deter.poligonos)} alertas desde junho`],
    [<A href="https://geoportal.sedam.ro.gov.br/">GeoPortal SEDAM-RO</A>, 'Municípios, TIs e UCs', 'camadas públicas (WFS)'],
    [<A href="https://planetarycomputer.microsoft.com/dataset/io-lulc-annual-v02">Cobertura do solo 10 m</A>, 'Onde é floresta e lavoura', `Impact Observatory, ${data.landcover.year}`],
    [<A href="https://visibleearth.nasa.gov/collection/1484/blue-marble">NASA Blue Marble</A>, 'Fundo do mapa', 'imagem de satélite sem nuvens'],
  ];
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Fontes e conferência</p>
        <h1>De onde vem cada número</h1>
        <p className="lede">Tudo é público e processado pelos scripts de <code>pipeline/rondonia</code>. Nada é simulado. Atualizado em {fmtDate(m.generated_at)}. Lista completa em <code>FONTES_E_REFERENCIAS.md</code>.</p>
      </header>
      <div className="table-wrap glass">
        <table>
          <thead><tr><th scope="col">Fonte</th><th scope="col">Para quê</th><th scope="col">O que usamos</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
        </table>
      </div>
      <section className="stats">
        <div className="glass"><b>{m.floresta.por_certeza.confirmado ?? 0} de {m.floresta.eventos}</b><span>lugares de floresta que o INPE também registrou</span></div>
        <div className="glass"><b>{fmtNum(v.precision_near_deter * 100)}%</b><span>dos pixels marcados ficam a até 360 m de um desmatamento do DETER</span></div>
        <div className="glass"><b>{fmtNum(v.deter_polys_found * 100)}%</b><span>dos polígonos do DETER encontrados (derrubadas pequenas somem no pixel de 3 ha)</span></div>
        <div className="glass"><b>{fmtNum(data.landcover.nocoverage_share * 100)}%</b><span>de Rondônia sem dado bom de floresta (riscado no mapa)</span></div>
      </section>
      <p className="fine">Por que tão baixo? Usamos a prévia pública do NISAR (8 bits, 180 m). O produto calibrado de 20 m exige login e cerca de 2 GB por imagem: é o próximo passo. A lavoura ainda não foi validada em campo.</p>
      <p className="fine">Créditos: NISAR, NASA/JPL-Caltech e ISRO, via ASF DAAC · INPE · SEDAM-RO, IBGE, FUNAI, ICMBio · Impact Observatory, Microsoft, Esri · NASA Blue Marble · Natural Earth · MapLibre GL JS.</p>
    </div>
  );
}
