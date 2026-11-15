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
    { c: COLORS.chuva, t: 'Corte ou chuva?', d: 'Chão molhado também muda o eco. A Meteomatics diz quanto choveu nas 48 h antes de cada imagem: se estava seco, a mudança é no chão.' },
    { c: COLORS.fogo, t: 'Queimadas', d: 'Focos de calor dos satélites VIIRS e MODIS, via NASA FIRMS. Contam onde e quando houve fogo. O radar mostra o que mudou depois.' },
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
        <div className="glass block"><h2>Dá para dizer</h2><ul className="check"><li>A floresta mudou aqui, por volta desta data.</li><li>Se choveu perto das imagens (e se a mudança continuou no seco).</li><li>Teve fogo perto, segundo os satélites de calor.</li></ul></div>
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
  type Row = [React.ReactNode, string, string];
  const s1 = m.s1, s2 = data.s2;
  const grupos: { t: string; d: string; rows: Row[] }[] = [
    { t: 'O herói: radar NISAR', d: 'É dele que sai cada lugar de floresta derrubada.', rows: [
      [<><b>NISAR L2 GCOV</b> (NASA/JPL e ISRO), via <A href="https://search.asf.alaska.edu/">ASF DAAC</A> e <A href="https://cmr.earthdata.nasa.gov/search/">NASA CMR</A></>, 'Floresta derrubada (eco HV, banda L)', `${fmtNum(m.nisar.passagens)} passagens HH e ${fmtNum(m.nisar.com_hv)} HV, ${fmtDate(m.nisar.primeira)} a ${fmtDate(m.nisar.ultima)}`],
    ] },
    { t: 'Os parceiros de dança', d: 'Cada um cobre uma lacuna do NISAR.', rows: [
      ...(m.chuva ? [[<A href={m.chuva.url}>Meteomatics Weather API</A>, 'Dança 1 · Corte ou chuva?', `chuva nas 48 h antes de cada imagem (precip_24h, modelo ${m.chuva.modelo}); limite de ${m.chuva.limite_mm} mm escolhido por nós`] as Row] : []),
      ...(s1 ? [[<><A href="https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc">Sentinel-1 RTC</A> (ESA/Copernicus, banda C)</>, 'Dança 2 · Alerta em 2 etapas', `eco VH de cada lugar contra a floresta em volta; ${s1.com_alerta} de ${s1.com_alerta + s1.sem_alerta} lugares com queda vista`] as Row] : []),
      [<><A href="https://firms.modaps.eosdis.nasa.gov/">NASA FIRMS</A> (VIIRS S-NPP, NOAA-20, NOAA-21 e MODIS)</>, 'Queimadas', `${fmtNum(m.fogo.focos)} focos de calor em Rondônia. ${m.fogo.fonte}`],
    ] },
    { t: 'Imagem e contexto', d: 'O que aparece no fundo do mapa e nas conferências.', rows: [
      ...(s2 ? [[<><A href="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a">Sentinel-2 L2A</A> (ESA/Copernicus)</>, 'Foto real do mapa e de cada lugar', `mosaico de Rondônia a ${s2.res_m} m com ${s2.cenas} cenas (${s2.periodo}) e recortes de 10 m em volta de cada lugar`] as Row] : []),
      [<><A href="https://terrabrasilis.dpi.inpe.br/">INPE DETER</A> (TerraBrasilis)</>, 'Conferir a floresta: selo "O INPE também viu"', `${fmtNum(m.deter.poligonos)} alertas desde junho. Não entra na detecção`],
      [<A href="https://geoportal.sedam.ro.gov.br/">GeoPortal SEDAM-RO</A>, 'Municípios, Terras Indígenas e UCs', 'camadas públicas (IBGE, FUNAI, ICMBio, SEDAM)'],
      [<><A href="https://planetarycomputer.microsoft.com/dataset/io-lulc-annual-v02">Cobertura do solo 10 m</A> (Impact Observatory, Esri)</>, 'Onde é floresta', `mapa anual de ${data.landcover.year}`],
      [<><A href="https://visibleearth.nasa.gov/collection/1484/blue-marble">NASA Blue Marble</A> (GIBS) e <A href="https://www.naturalearthdata.com/">Natural Earth</A></>, 'Fundo do mapa fora de Rondônia', 'imagem do mundo, países, rios e cidades'],
    ] },
    { t: 'Referências citadas', d: 'O que dizemos fora dos dados.', rows: [
      [<A href="https://www.spaceappschallenge.org/">NASA Space Apps Challenge 2026</A>, 'O desafio', 'Dancing with the SARs'],
      [<A href="https://nisar.jpl.nasa.gov/">Missão NISAR (NASA/JPL e ISRO)</A>, 'Como o radar funciona', 'banda L, revisita de 12 dias'],
      [<A href="https://eur-lex.europa.eu/eli/reg/2023/1115/oj">Regulamento (UE) 2023/1115 (EUDR)</A>, 'Meu painel: exportar para a Europa', 'data de corte em 31/12/2020'],
    ] },
    { t: 'Ferramentas', d: 'Código aberto.', rows: [
      [<><A href="https://maplibre.org/">MapLibre GL JS</A>, React, Vite, TypeScript</>, 'O site', 'sem servidor: tudo roda no navegador'],
      [<>Python: rasterio, numpy, pyproj, shapely, <A href="https://planetarycomputer.microsoft.com/">Planetary Computer</A> (STAC)</>, 'O pipeline', 'pipeline/rondonia, do r01 ao r13'],
      [<>GitHub Actions e GitHub Pages</>, 'Atualização diária', 'o pipeline roda sozinho todo dia e republica o site'],
    ] },
  ];
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Fontes e conferência</p>
        <h1>De onde vem cada número</h1>
        <p className="lede">Tudo é público e processado pelos scripts de <code>pipeline/rondonia</code>. Nada é simulado.</p>
        <p className="upd"><i />Dados atualizados em {fmtDate(m.generated_at)} · o pipeline roda todo dia</p>
      </header>
      {grupos.map((g) => (
        <section key={g.t} className="src-group">
          <h2>{g.t}<small>{g.d}</small></h2>
          <div className="table-wrap glass">
            <table>
              <thead><tr><th scope="col">Fonte</th><th scope="col">Para quê</th><th scope="col">O que usamos</th></tr></thead>
              <tbody>{g.rows.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ))}
      <h2 className="src-h">Como conferimos</h2>
      <section className="stats">
        <div className="glass"><b>{m.floresta.por_certeza.confirmado ?? 0} de {m.floresta.eventos}</b><span>lugares de floresta que o INPE também registrou</span></div>
        <div className="glass"><b>{fmtNum(v.precision_near_deter * 100)}%</b><span>dos pixels marcados ficam a até 360 m de um desmatamento do DETER</span></div>
        <div className="glass"><b>{fmtNum(v.deter_polys_found * 100)}%</b><span>dos polígonos do DETER encontrados (derrubadas pequenas somem no pixel de 3 ha)</span></div>
        <div className="glass"><b>{fmtNum(data.landcover.nocoverage_share * 100)}%</b><span>de Rondônia sem dado bom de floresta (riscado no mapa)</span></div>
      </section>
      <p className="fine">Por que tão baixo? Usamos a prévia pública do NISAR (8 bits, 180 m). O produto calibrado de 20 m exige login e cerca de 2 GB por imagem: é o próximo passo.</p>
      <p className="fine">Lista completa, com endereços e o que ainda falta conferir, em <code>FONTES_E_REFERENCIAS.md</code> no repositório. Créditos: NISAR, NASA/JPL-Caltech e ISRO, via ASF DAAC · NASA FIRMS · ESA/Copernicus (Sentinel-1 e Sentinel-2) · Meteomatics · INPE · SEDAM-RO, IBGE, FUNAI, ICMBio · Impact Observatory, Microsoft, Esri · NASA Blue Marble · Natural Earth · MapLibre GL JS.</p>
    </div>
  );
}
