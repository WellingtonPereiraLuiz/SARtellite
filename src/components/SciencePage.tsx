import { useState } from 'react';
import { fmtNum } from '../lib/time';
import SarExplainer from './SarExplainer';

export default function SciencePage({ reducedMotion, onExplore }: { reducedMotion: boolean; onExplore: () => void }) {
  const [ha, setHa] = useState(100);
  const [forest, setForest] = useState(4);
  const [pasture, setPasture] = useState(1);
  const diff = Math.max(0, forest - pasture);
  const litros = ha * diff * 10000;
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">Ciência</p>
        <h1>Como o SAR enxerga?</h1>
        <p className="lede">SAR é o radar de abertura sintética. Ele envia micro-ondas, mede o eco que volta e monta a imagem a partir dele. O brilho de cada pixel depende da forma da superfície e da água que ela contém.</p>
      </header>

      <SarExplainer reducedMotion={reducedMotion} />

      <section>
        <h2>Pixel claro, pixel escuro</h2>
        <div className="cards3">
          <article className="mini"><span className="chip-px" style={{ background: '#e9e9e9' }} /><h3>Floresta: eco forte</h3><p>Copa, galhos e troncos espalham a onda em todas as direções. Uma parte sempre volta ao satélite.</p></article>
          <article className="mini"><span className="chip-px" style={{ background: '#1d1d1d' }} /><h3>Água calma: eco fraco</h3><p>Superfície lisa funciona como espelho e manda a onda para longe. O rio aparece escuro, mesmo sendo pura água.</p></article>
          <article className="mini"><span className="chip-px" style={{ background: '#ffffff' }} /><h3>Floresta alagada: eco muito forte</h3><p>A onda bate na água, depois no tronco, e volta. É o duplo ressalto. Por isso água sob a copa pode aparecer clara.</p></article>
        </div>
      </section>

      <section>
        <h2>Três sensores, três perguntas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col"></th><th scope="col">Sentinel-2 (óptico)</th><th scope="col">Sentinel-1 (radar banda C)</th><th scope="col">NISAR (radar banda L)</th></tr></thead>
            <tbody>
              <tr><th scope="row">Comprimento de onda</th><td>luz visível e infravermelho</td><td>cerca de 5,6 cm</td><td>cerca de 24 cm</td></tr>
              <tr><th scope="row">Nuvem e fumaça</th><td>bloqueiam</td><td>não impedem a medição</td><td>não impedem a medição</td></tr>
              <tr><th scope="row">Na floresta, responde a</th><td>cor e vigor das folhas</td><td>folhas e galhos finos</td><td>galhos grossos, troncos e, em parte, o chão</td></tr>
              <tr><th scope="row">No SARtellite</th><td>cor verdadeira, nuvem, água e NDVI</td><td>série de 12 em 12 dias, diferença em dB</td><td>prévias HH de 18 jun e 28 out 2026</td></tr>
              <tr><th scope="row">Cuidado</th><td>sem imagem útil quando há nuvem</td><td>chuva e colheita mudam o eco</td><td>versões de processamento diferentes entre as datas</td></tr>
            </tbody>
          </table>
        </div>
        <p className="fine">Bandas diferentes nunca são subtraídas uma da outra. Cada sensor é comparado consigo mesmo e os resultados são cruzados depois.</p>
      </section>

      <section className="two">
        <div>
          <h2>O que dá para afirmar</h2>
          <ul className="check">
            <li>O sinal de radar mudou nesta área entre duas datas reais.</li>
            <li>No mesmo intervalo houve tantos focos de calor e tanta chuva, segundo INPE e NASA POWER.</li>
            <li>A queda de radar coincide ou não com queda de vegetação no óptico.</li>
          </ul>
        </div>
        <div>
          <h2>O que não dá</h2>
          <ul className="cross">
            <li>Dizer que foi desmatamento, fogo ou ação de alguém só pelo radar.</li>
            <li>Ver pessoas, veículos ou cargas sob as árvores.</li>
            <li>Identificar cada árvore caída.</li>
            <li>Medir quanto deixou de chover em outro lugar.</li>
          </ul>
        </div>
      </section>

      <section className="scenario">
        <p className="eyebrow">Cenário pedagógico, não é medição</p>
        <h2>Por que a floresta importa para a chuva: os rios voadores</h2>
        <p>As árvores devolvem água do solo para o ar. Esse vapor viaja com o vento e ajuda a formar chuva longe dali. A conta abaixo usa taxas médias divulgadas na <a href="https://documentacao.socioambiental.org/noticias/anexo_noticia/28851_20141031_121828.pdf" target="_blank" rel="noreferrer">cobertura do relatório O Futuro Climático da Amazônia</a> (Antonio Nobre, 2014): cerca de 4 mm por dia na floresta e 1 mm por dia no pasto. Você escolhe a área. Nenhum número aqui vem das imagens.</p>
        <div className="calc">
          <label htmlFor="c-ha">Área hipotética (ha)<input id="c-ha" type="number" min={1} max={100000} value={ha} onChange={(e) => setHa(Math.max(0, Number(e.target.value)))} /></label>
          <label htmlFor="c-f">Floresta: {fmtNum(forest, 1)} mm/dia<input id="c-f" type="range" min={3} max={5} step={0.1} value={forest} onChange={(e) => setForest(Number(e.target.value))} /></label>
          <label htmlFor="c-p">Pasto: {fmtNum(pasture, 1)} mm/dia<input id="c-p" type="range" min={0.5} max={2.5} step={0.1} value={pasture} onChange={(e) => setPasture(Number(e.target.value))} /></label>
          <output htmlFor="c-ha c-f c-p"><b>{fmtNum(litros)} litros por dia</b> a menos de vapor, no cenário escolhido<small>{fmtNum(ha)} ha × ({fmtNum(forest, 1)} − {fmtNum(pasture, 1)}) mm × 10.000 L por mm e por hectare. A taxa real varia com a estação, o lugar e a vegetação.</small></output>
        </div>
      </section>

      <p><button type="button" className="btn primary big" onClick={onExplore}>Voltar ao mapa</button></p>
    </div>
  );
}
