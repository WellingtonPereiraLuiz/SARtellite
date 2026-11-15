import { useState } from 'react';
import { dataUrl } from '../lib/data';
import { fmtDate } from '../lib/time';
import type { Aoi, CompareMode, NisarScene, Scene } from '../lib/types';

/** Comparação sem WebGL: duas imagens reais da área, com divisor por controle deslizante. */
export default function StaticStage({ aoi, before, after, mode, showBefore }: { aoi: Aoi; before: Scene | null; after: Scene | null; mode: CompareMode; showBefore: boolean }) {
  const [split, setSplit] = useState(50);
  const url = (s: Scene | null) => (!s ? null : s.key === 'nisar' ? dataUrl(`${aoi.id}/${(s.raw as NisarScene).image_aoi}`) : s.image);
  const a = url(before);
  const b = url(mode === 'toggle' && showBefore ? before : after);
  const swipe = mode === 'swipe' && a;
  return (
    <div className="static-stage">
      <p className="msg warn">Este navegador não oferece WebGL. Mostrando a comparação simples da área "{aoi.label}", sem globo nem mapa navegável.</p>
      <div className="static-frame">
        {b && <img src={b} alt={`Cena ${after ? fmtDate(after.date) : ''}`} />}
        {swipe && <img src={a!} alt={`Cena ${before ? fmtDate(before.date) : ''}`} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />}
        {swipe && <div className="split-line" style={{ left: `${split}%` }} />}
      </div>
      {swipe && <label htmlFor="st-split" className="slider">Divisor antes e depois<input id="st-split" type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} /></label>}
    </div>
  );
}
