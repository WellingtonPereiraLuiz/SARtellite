import { useEffect, useState } from 'react';
import { fmtCoord, parseCoord, splitPair, squareAreaHa, type Coverage } from '../lib/geo';
import { fmtNum } from '../lib/time';
import type { Aoi, CustomArea, LayerState, Manifest, SensorKey } from '../lib/types';

// ---------------------------------------------------------------- Área
interface AreaProps {
  manifest: Manifest;
  aoi: Aoi | null;
  custom: CustomArea | null;
  coverage: Coverage;
  drawing: boolean;
  point: { lat: number; lon: number; inFrame: boolean; fires: number | null } | null;
  onPreset: (id: string) => void;
  onCustom: (a: CustomArea) => void;
  onDraw: () => void;
  onFrame: () => void;
  onClearPoint: () => void;
}

export function AreaPanel(p: AreaProps) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [radius, setRadius] = useState('15');
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    const src = p.custom ?? (p.aoi ? { lat: p.aoi.center[1], lon: p.aoi.center[0], radiusKm: p.aoi.size_km / 2 } : null);
    if (!src) return;
    setLat(src.lat.toFixed(4).replace('.', ','));
    setLon(src.lon.toFixed(4).replace('.', ','));
    setRadius(String(src.radiusKm).replace('.', ','));
    setError(null);
    setLink(null);
  }, [p.custom, p.aoi]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = parseCoord(lat, lon);
    if (!c.ok) return setError(c.error!);
    const r = Number(radius.replace(',', '.'));
    if (!Number.isFinite(r) || r < 0.5 || r > 150) return setError('O raio precisa ficar entre 0,5 e 150 km.');
    setError(null);
    p.onCustom({ lat: c.lat!, lon: c.lon!, radiusKm: r });
  };
  const paste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pair = splitPair(e.clipboardData.getData('text'));
    if (pair) { e.preventDefault(); setLat(pair[0]); setLon(pair[1]); }
  };
  const share = async () => {
    const a = p.custom ?? (p.aoi ? { lat: p.aoi.center[1], lon: p.aoi.center[0], radiusKm: p.aoi.size_km / 2 } : null);
    if (!a) return;
    const url = `${location.origin}${location.pathname}?lat=${a.lat.toFixed(4)}&lon=${a.lon.toFixed(4)}&r=${a.radiusKm}`;
    setLink(url);
    try { await navigator.clipboard.writeText(url); } catch { /* o campo abaixo permite copiar à mão */ }
  };
  const r = Number(radius.replace(',', '.'));

  return (
    <section className="card" aria-labelledby="area-h">
      <h2 id="area-h">Área de interesse</h2>
      <form onSubmit={submit} noValidate>
        <div className="row2">
          <label htmlFor="in-lat">Latitude<input id="in-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} onPaste={paste} placeholder="-11,9886" aria-describedby="area-msg" /></label>
          <label htmlFor="in-lon">Longitude<input id="in-lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-62,4846" aria-describedby="area-msg" /></label>
        </div>
        <label htmlFor="in-r">Raio (km)
          <input id="in-r" inputMode="decimal" value={radius} onChange={(e) => setRadius(e.target.value)} />
        </label>
        <p className="hint">{Number.isFinite(r) && r > 0 ? `Quadrado de ${fmtNum(2 * r, 1)} km de lado, ${fmtNum(squareAreaHa(r))} ha.` : 'Informe o raio em quilômetros.'} Você pode colar o par "lat, lon" no primeiro campo.</p>
        <div className="btn-row">
          <button type="submit" className="btn primary">Definir área</button>
          <button type="button" className={`btn${p.drawing ? ' on' : ''}`} aria-pressed={p.drawing} onClick={p.onDraw}>{p.drawing ? 'Cancelar desenho' : 'Desenhar no mapa'}</button>
        </div>
        <div id="area-msg" aria-live="polite">
          {error && <p className="msg err">{error}</p>}
          {!error && p.custom && p.coverage === 'full' && <p className="msg ok">Dentro do quadro NISAR {String(p.manifest.nisar_frame.path).padStart(3, '0')}/{String(p.manifest.nisar_frame.frame).padStart(3, '0')}. Há duas prévias reais (18 jun e 28 out 2026, 180 m). Sentinel-1, Sentinel-2 e a análise ainda não foram processados aqui: rode o pipeline com estas coordenadas.</p>}
          {!error && p.custom && p.coverage === 'partial' && <p className="msg warn">A área cruza a borda do quadro NISAR. Reduza o raio ou mova o centro para dentro do tracejado.</p>}
          {!error && p.custom && p.coverage === 'none' && <p className="msg warn">Não temos imagens processadas para estas coordenadas. Nada é simulado: busque cenas no <a href="https://search.asf.alaska.edu/" target="_blank" rel="noreferrer">ASF Vertex</a> e rode o pipeline. Veja a aba Fontes.</p>}
        </div>
      </form>

      <h3>Áreas já processadas</h3>
      <ul className="presets">
        {p.manifest.aois.map((a) => (
          <li key={a.id}>
            <button type="button" className={`preset${!p.custom && p.aoi?.id === a.id ? ' on' : ''}`} aria-pressed={!p.custom && p.aoi?.id === a.id} onClick={() => p.onPreset(a.id)}>
              <b>{a.label}</b>
              <span>{a.place}</span>
              <span>{fmtCoord(a.center[1], 'N', 'S')}, {fmtCoord(a.center[0], 'L', 'O')}</span>
              <span>{a.scenes.nisar.length} NISAR · {a.scenes.s1.length} Sentinel-1 · {a.scenes.s2.length} Sentinel-2</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <button type="button" className="btn" onClick={p.onFrame}>Ver quadro inteiro</button>
        <button type="button" className="btn" onClick={share}>Copiar link da área</button>
      </div>
      {link && <label htmlFor="share-link" className="share">Link (funciona no site publicado)<input id="share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></label>}

      {p.point && (
        <div className="point" role="status">
          <b>Ponto clicado</b>
          <span>{fmtCoord(p.point.lat, 'N', 'S')}, {fmtCoord(p.point.lon, 'L', 'O')}</span>
          <span>{p.point.inFrame ? 'Dentro do quadro NISAR.' : 'Fora do quadro NISAR.'}{p.point.fires !== null && ` ${p.point.fires} ${p.point.fires === 1 ? 'foco' : 'focos'} de calor a até 2 km no intervalo selecionado.`}</span>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => { const rr = Number(radius.replace(',', '.')); p.onCustom({ lat: p.point!.lat, lon: p.point!.lon, radiusKm: Number.isFinite(rr) && rr >= 0.5 ? rr : 15 }); }}>Centralizar área aqui</button>
            <button type="button" className="btn" onClick={p.onClearPoint}>Fechar</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Camadas
interface LayersProps {
  aoi: Aoi | null;
  hasScenes: Record<SensorKey, boolean>;
  activeSensor: SensorKey | null;
  layers: LayerState;
  changeNote: string;
  waterNote: string;
  rainNote: string;
  overlayOpacity: number;
  imageOpacity: number;
  onSensor: (k: SensorKey) => void;
  onToggle: (k: keyof LayerState) => void;
  onOverlayOpacity: (v: number) => void;
  onImageOpacity: (v: number) => void;
}

function Toggle({ id, label, note, on, disabled, swatch, onChange }: { id: string; label: string; note: string; on: boolean; disabled?: boolean; swatch: string; onChange: () => void }) {
  return (
    <li className={`layer${disabled ? ' off' : ''}`}>
      <label htmlFor={id}>
        <input id={id} type="checkbox" checked={on && !disabled} disabled={disabled} onChange={onChange} />
        <span className={`sw ${swatch}`} aria-hidden="true" />
        <span className="layer-text"><b>{label}</b><small>{note}</small></span>
      </label>
    </li>
  );
}

export function LayersPanel(p: LayersProps) {
  const sensors: { k: SensorKey; label: string; note: string }[] = [
    { k: 'nisar', label: 'Radar NISAR (banda L)', note: p.hasScenes.nisar ? 'Prévia pública HH, 180 m. Real, não calibrada.' : 'Sem cobertura NISAR processada nesta área.' },
    { k: 's1', label: 'Sentinel-1 (radar banda C)', note: p.hasScenes.s1 ? 'RTC gamma0 VH em dB, 20 m. Dado calibrado.' : 'Não processado nesta área. Use uma área já processada.' },
    { k: 's2', label: 'Sentinel-2 (óptico)', note: p.hasScenes.s2 ? 'Cor verdadeira L2A, 20 m. Nuvem bloqueia.' : 'Não processado nesta área. Use uma área já processada.' },
  ];
  const noAoi = !p.aoi;
  return (
    <section className="card" aria-labelledby="layers-h">
      <h2 id="layers-h">Camadas</h2>
      <h3>Imagem de fundo</h3>
      <ul className="layers">
        {sensors.map((s) => (
          <li key={s.k} className={`layer${p.hasScenes[s.k] ? '' : ' off'}`}>
            <label htmlFor={`sens-${s.k}`}>
              <input id={`sens-${s.k}`} type="radio" name="sensor" checked={p.activeSensor === s.k} disabled={!p.hasScenes[s.k]} onChange={() => p.onSensor(s.k)} />
              <span className={`sw sw-${s.k}`} aria-hidden="true" />
              <span className="layer-text"><b>{s.label}</b><small>{s.note}</small></span>
            </label>
          </li>
        ))}
      </ul>
      <label htmlFor="op-img" className="slider">Opacidade da imagem<input id="op-img" type="range" min={0.2} max={1} step={0.05} value={p.imageOpacity} onChange={(e) => p.onImageOpacity(Number(e.target.value))} /></label>

      <h3>Sobreposições</h3>
      <ul className="layers">
        <Toggle id="ly-change" label="Alterações (diferença de radar)" note={p.changeNote} on={p.layers.change} swatch="sw-change" onChange={() => p.onToggle('change')} />
        <Toggle id="ly-corr" label="Alterações com dois sensores" note={noAoi ? 'Só nas áreas já processadas.' : p.aoi!.analysis.corroboration ? 'Queda de VH no Sentinel-1 e queda de NDVI no Sentinel-2.' : 'Sem par óptico limpo para conferir.'} on={p.layers.corroborated} disabled={noAoi || !p.aoi!.analysis.corroboration} swatch="sw-corr" onChange={() => p.onToggle('corroborated')} />
        <Toggle id="ly-forest" label="Floresta (mapa de referência)" note={noAoi ? 'Só nas áreas já processadas.' : `Classe Árvores, Impact Observatory ${p.aoi!.reference.lulc.year}, 10 m. Não é das datas das cenas.`} on={p.layers.forest} disabled={noAoi} swatch="sw-forest" onChange={() => p.onToggle('forest')} />
        <Toggle id="ly-water" label="Água superficial (Sentinel-2)" note={p.waterNote} on={p.layers.water} disabled={noAoi} swatch="sw-water" onChange={() => p.onToggle('water')} />
        <Toggle id="ly-waterh" label="Água histórica (1984 a 2020)" note={noAoi ? 'Só nas áreas já processadas.' : 'JRC Global Surface Water: onde já houve água em 5% do tempo ou mais.'} on={p.layers.waterHist} disabled={noAoi} swatch="sw-waterh" onChange={() => p.onToggle('waterHist')} />
        <Toggle id="ly-fires" label="Focos de calor" note="INPE Queimadas (MODIS e VIIRS), no intervalo entre as duas cenas. Foco não é área queimada." on={p.layers.fires} swatch="sw-fire" onChange={() => p.onToggle('fires')} />
        <Toggle id="ly-rain" label="Chuva" note={p.rainNote} on={p.layers.rain} swatch="sw-rain" onChange={() => p.onToggle('rain')} />
      </ul>
      <label htmlFor="op-ov" className="slider">Opacidade das sobreposições<input id="op-ov" type="range" min={0.2} max={1} step={0.05} value={p.overlayOpacity} onChange={(e) => p.onOverlayOpacity(Number(e.target.value))} /></label>

      <h3>Fontes ainda não conectadas</h3>
      <ul className="layers">
        <li className="layer off"><span className="layer-text"><b>NASA FIRMS direto</b><small>Exige chave MAP_KEY. Os focos mostrados vêm do INPE.</small></span></li>
        <li className="layer off"><span className="layer-text"><b>NASA GPM IMERG em mapa</b><small>Não conectado. A chuva mostrada é a série do NASA POWER.</small></span></li>
        <li className="layer off"><span className="layer-text"><b>Meteomatics</b><small>Não conectado. Exige credenciais em servidor.</small></span></li>
        <li className="layer off"><span className="layer-text"><b>NISAR GCOV calibrado (HDF5)</b><small>Exige Earthdata Login. O script de integração está em pipeline/.</small></span></li>
      </ul>
    </section>
  );
}
