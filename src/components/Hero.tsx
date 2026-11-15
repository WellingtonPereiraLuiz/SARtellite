interface Props { onEnter: () => void; onScience: () => void; ready: boolean }

export default function Hero({ onEnter, onScience, ready }: Props) {
  return (
    <div className="hero">
      <div className="hero-copy">
        <p className="eyebrow">NASA Space Apps Challenge 2026 · Dancing with the SARs · Equipe Astrópodes</p>
        <h1>A floresta muda. Mesmo quando as nuvens escondem.</h1>
        <p className="lede">Do radar ao território: explore mudanças na floresta e na água, no tempo. Informe uma coordenada, delimite uma área e compare passagens reais do NISAR, do Sentinel-1 e do Sentinel-2.</p>
        <div className="btn-row">
          <button type="button" className="btn primary big" onClick={onEnter} disabled={!ready}>{ready ? 'Explorar o território' : 'Carregando dados…'}</button>
          <button type="button" className="btn big" onClick={onScience}>Como o SAR enxerga?</button>
        </div>
        <p className="fine">Gire o globo. O tracejado sobre Rondônia é o quadro 068/094 do NISAR. Projeto de estudantes, sem vínculo ou certificação da NASA, ISRO ou ESA.</p>
      </div>
    </div>
  );
}
