import { STAGES } from './EvidenceCard';
import { fmtDate, fmtNum, fmtUtc } from '../lib/time';
import type { Manifest } from '../lib/types';

const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>;

function Sources({ m }: { m: Manifest }) {
  const n = m.aois[0].scenes.nisar;
  const months = Object.values(m.fires.months).filter((v) => typeof v === 'number').length;
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Fontes e proveniência</p>
        <h1>De onde vem cada pixel</h1>
        <p className="lede">Tudo o que aparece no mapa foi baixado de catálogos públicos e processado pelos scripts da pasta <code>pipeline/</code> do repositório. Nada é simulado. Gerado em {fmtUtc(m.generated_at)}.</p>
      </header>

      <section>
        <h2>Grau de evidência</h2>
        <ol className="stages wide">{STAGES.map((s, i) => <li key={s} className={i === 0 || i === 4 ? '' : 'done'}><span className="dot" />{s}</li>)}</ol>
        <p>As prévias NISAR estão em <b>dado real bruto</b>. A diferença do Sentinel-1 está em <b>alteração radar exploratória</b>. A camada que cruza Sentinel-1 e Sentinel-2 chega a <b>alerta corroborado</b>. Nada aqui foi validado em campo, e não há camada de demonstração.</p>
      </section>

      <section>
        <h2>NISAR, quadro {String(m.nisar_frame.path).padStart(3, '0')}/{String(m.nisar_frame.frame).padStart(3, '0')}, órbita descendente</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Aquisição</th><th scope="col">Produto</th><th scope="col">Maturidade</th><th scope="col">Polarizações</th><th scope="col">HDF5 completo</th></tr></thead>
            <tbody>
              {n.map((s) => (
                <tr key={s.id}>
                  <td>{fmtUtc(s.acquired_at)}</td>
                  <td><A href={s.source_url}><code className="wrap">{s.product_id}</code></A></td>
                  <td>{s.processing_maturity === 'VALIDATED' ? 'validado' : 'provisório'}, CRID {s.crid}, processado em {fmtDate(s.processed_at)}</td>
                  <td>{s.polarizations_available.join(', ')}</td>
                  <td>{fmtNum(s.h5_bytes / 1e9, 2)} GB, exige Earthdata Login</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="ev-list">
          <li>Confirmado no catálogo da ASF: os dois granules existem e a pegada cobre o centro-sul de Rondônia.</li>
          <li>O que usamos: a prévia pública HH da frequência A, 8 bits, {m.nisar_frame.pixel_m} m por pixel, em UTM 20S (EPSG:{m.nisar_frame.epsg}).</li>
          <li>As duas datas compartilham a grade: deslocamento de {m.nisar_frame.grid_check.shift_px.join(' e ')} px, pico de correlação {fmtNum(m.nisar_frame.grid_check.peak, 2)}.</li>
          <li>O que falta: abrir os HDF5 e calcular a diferença em dB calibrado. O script <code>pipeline/nisar_gcov_change.py</code> está pronto para isso e ainda não foi testado com os arquivos reais.</li>
        </ul>
      </section>

      <section>
        <h2>Demais fontes</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Fonte</th><th scope="col">Uso</th><th scope="col">Situação</th></tr></thead>
            <tbody>
              <tr><td><A href="https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc">Sentinel-1 RTC</A>, Copernicus via Microsoft Planetary Computer</td><td>Radar banda C, VH em dB, {m.aois.map((a) => `${a.scenes.s1.length} datas em ${a.label}`).join('; ')}</td><td className="ok">Conectado e processado</td></tr>
              <tr><td><A href="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a">Sentinel-2 L2A</A>, Copernicus via Planetary Computer</td><td>Cor verdadeira, nuvem e água (SCL), NDVI para conferir o radar</td><td className="ok">Conectado e processado</td></tr>
              <tr><td><A href="https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/">INPE Queimadas</A>, focos MODIS e VIIRS</td><td>{fmtNum(m.fires.count)} focos de satélites polares no quadro, {months} meses</td><td className="ok">Conectado e processado</td></tr>
              <tr><td><A href="https://power.larc.nasa.gov/">NASA POWER</A>, PRECTOTCORR</td><td>Chuva diária no centro de cada área, cerca de 50 km de resolução</td><td className="ok">Conectado e processado</td></tr>
              <tr><td><A href="https://planetarycomputer.microsoft.com/dataset/io-lulc-annual-v02">Impact Observatory LULC 10 m</A></td><td>Classe Árvores como mapa de floresta de referência ({m.aois[0].reference.lulc.year})</td><td className="ok">Conectado e processado</td></tr>
              <tr><td><A href="https://planetarycomputer.microsoft.com/dataset/jrc-gsw">JRC Global Surface Water</A></td><td>Ocorrência histórica de água, {m.aois[0].reference.jrc.period}</td><td className="ok">Conectado e processado</td></tr>
              <tr><td><A href="https://earthdata.nasa.gov/gibs">NASA GIBS</A>, Blue Marble; <A href="https://www.naturalearthdata.com/">Natural Earth</A></td><td>Globo e mapa base embutidos, funcionam sem internet</td><td className="ok">Embutido</td></tr>
              <tr><td><A href="https://firms.modaps.eosdis.nasa.gov/api/area/">NASA FIRMS</A></td><td>Focos direto da NASA</td><td className="no">Não conectado: exige MAP_KEY</td></tr>
              <tr><td><A href="https://gpm.nasa.gov/data/imerg">NASA GPM IMERG</A></td><td>Chuva em mapa</td><td className="no">Não conectado</td></tr>
              <tr><td>Meteomatics</td><td>Clima e previsão</td><td className="no">Não conectado: exige credenciais em servidor</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Como a mudança é calculada</h2>
        <ol className="ev-list">
          <li><b>NISAR:</b> outubro menos junho nas prévias HH, média 3x3, centrado na mediana do quadro. Cor a partir de {m.nisar_frame.diff.floor_dn} níveis de cinza. Sem hectares.</li>
          <li><b>Sentinel-1:</b> VH em dB, mesma órbita relativa, diferença entre duas datas, centrada na mediana. No par de referência, a mediana vem dos pixels da classe Árvores.</li>
          <li><b>Dois sensores:</b> pixels com queda de VH maior que 3 dB e queda de NDVI maior que 0,2 entre datas ópticas sem nuvem.</li>
          <li><b>Área:</b> contagem de pixels de 20 m em grade UTM 20S. Limiar experimental, mostrado com as alternativas de 2 e 4 dB no arquivo de proveniência.</li>
        </ol>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Área</th><th scope="col">Par Sentinel-1</th><th scope="col">Queda de VH acima de 2 / 3 / 4 dB</th><th scope="col">Com queda de NDVI</th><th scope="col">Focos e chuva entre as datas NISAR</th></tr></thead>
            <tbody>
              {m.aois.map((a) => (
                <tr key={a.id}>
                  <td>{a.label}</td>
                  <td>{fmtDate(a.analysis.s1_pair.before.slice(3))} → {fmtDate(a.analysis.s1_pair.after.slice(3))}, órbita {a.analysis.s1_pair.relative_orbit}</td>
                  <td>{['-2.0', '-3.0', '-4.0'].map((k) => fmtNum(a.analysis.area_ha_by_threshold[k])).join(' / ')} ha de {fmtNum(a.analysis.aoi_area_ha)} ha</td>
                  <td>{a.analysis.corroboration ? `${fmtNum(a.analysis.corroboration.area_ha)} ha (${fmtNum(a.analysis.corroboration.area_ha_in_trees_class)} ha em Árvores)` : 'sem par óptico'}</td>
                  <td>{a.fires.count_between_nisar} focos, {fmtNum(a.rain.total_between_nisar_mm)} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine">Estes números são mudança de sinal, não desmatamento medido. Créditos: contém dados Copernicus Sentinel modificados (2026); NISAR cortesia NASA/JPL-Caltech e ISRO, distribuído pela ASF DAAC; INPE, Programa Queimadas; NASA POWER; Impact Observatory, Microsoft e Esri; JRC/Google; NASA GIBS; Natural Earth.</p>
      </section>
    </div>
  );
}

function About({ m }: { m: Manifest }) {
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Sobre</p>
        <h1>SARtellite, da equipe Astrópodes</h1>
        <p className="lede">Projeto para o desafio Dancing with the SARs do NASA Space Apps Challenge 2026, etapa de Vilhena, Rondônia. A proposta: dar memória ao território, para que mudanças na floresta e na água deixem de ficar invisíveis sob as nuvens.</p>
      </header>
      <section className="two">
        <div>
          <h2>O que já funciona</h2>
          <ul className="check">
            <li>Coordenadas, raio e retângulo desenhado no mapa, com checagem de cobertura do quadro NISAR.</li>
            <li>Linha do tempo com {m.aois.reduce((t, a) => t + a.scenes.nisar.length + a.scenes.s1.length + a.scenes.s2.length, 0)} aquisições reais em {m.aois.length} áreas.</li>
            <li>Antes e depois com divisor, alternância e diferença.</li>
            <li>Camadas de alteração, floresta, água, focos de calor e chuva, cada uma com fonte e limite.</li>
            <li>Globo 3D e mapa que funcionam sem internet.</li>
          </ul>
        </div>
        <div>
          <h2>Próximos passos</h2>
          <ul className="ev-list">
            <li>Processar os HDF5 NISAR calibrados e trocar a prévia pela diferença em dB.</li>
            <li>Rodar o pipeline sob demanda para qualquer coordenada.</li>
            <li>Validar os alertas com PRODES, DETER, MapBiomas e campo.</li>
            <li>Alertar quando chegar uma nova passagem sobre uma área salva.</li>
          </ul>
        </div>
      </section>
      <section>
        <h2>Equipe</h2>
        <p>Leo, Bryan, Wellington e Diogo. Estudantes de Rondônia.</p>
        <h2>Aviso</h2>
        <p>Este é um protótipo de estudantes. Não representa a NASA, a ISRO, a ESA ou o INPE e não é certificado por nenhuma delas. Os resultados são indícios para averiguação: não identificam pessoas, propriedades ou causas, e não substituem os sistemas oficiais de monitoramento.</p>
        <p>As coordenadas que você digita ficam só no seu navegador. O site não envia sua área para nenhum servidor nosso. Fora das áreas processadas, ele consulta a chuva diretamente na API pública do NASA POWER.</p>
      </section>
    </div>
  );
}

export default function InfoPages({ view, manifest }: { view: 'fontes' | 'sobre'; manifest: Manifest }) {
  return view === 'fontes' ? <Sources m={manifest} /> : <About m={manifest} />;
}
