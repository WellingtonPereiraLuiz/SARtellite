import { useEffect, useState } from 'react';

const STEPS = [
  { t: '1. Pulso', d: 'O satélite olha de lado e emite pulsos de micro-ondas. Ele produz a própria energia, por isso mede de dia e de noite.' },
  { t: '2. Nuvens', d: 'Micro-ondas com centímetros de comprimento passam por nuvens e fumaça quase sem perder força. Um satélite óptico pararia aqui.' },
  { t: '3. Copa', d: 'Na copa, parte da onda se espalha em folhas e galhos. Quanto menor o comprimento de onda, mais ela fica retida no topo.' },
  { t: '4. Troncos e chão', d: 'Parte da onda segue adiante e encontra galhos grossos, troncos e, às vezes, o solo ou a água. A penetração é parcial e depende da estrutura, da umidade, do ângulo e da frequência.' },
  { t: '5. Eco e pixel', d: 'Uma fração da energia volta ao satélite. Cada pixel guarda quanto eco voltou daquele pedaço de chão: muito eco, pixel claro; pouco eco, pixel escuro.' },
];

const TREES = [520, 568, 612, 660, 706, 752];

export default function SarExplainer({ reducedMotion }: { reducedMotion: boolean }) {
  const [step, setStep] = useState(0);
  const [band, setBand] = useState<'L' | 'C'>('L');
  const [auto, setAuto] = useState(!reducedMotion);
  useEffect(() => {
    if (!auto || reducedMotion) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 4200);
    return () => clearInterval(t);
  }, [auto, reducedMotion]);
  const deep = band === 'L';
  const on = (i: number) => (step >= i ? ' on' : '');
  const pix = deep ? [0.92, 0.95, 0.9, 0.3, 0.12, 0.98] : [0.8, 0.84, 0.78, 0.42, 0.1, 0.8];
  const labels = ['floresta', 'floresta', 'floresta', 'clareira', 'água calma', 'floresta alagada'];

  return (
    <figure className={`sar band-${band}${reducedMotion ? ' still' : ''}`}>
      <div className="sar-controls">
        <div className="seg" role="group" aria-label="Banda do radar">
          <button type="button" className={band === 'L' ? 'on' : ''} aria-pressed={band === 'L'} onClick={() => setBand('L')}>Banda L · NISAR · 24 cm</button>
          <button type="button" className={band === 'C' ? 'on' : ''} aria-pressed={band === 'C'} onClick={() => setBand('C')}>Banda C · Sentinel-1 · 5,6 cm</button>
        </div>
        <button type="button" className="btn" aria-pressed={auto} onClick={() => setAuto((a) => !a)} disabled={reducedMotion}>{auto && !reducedMotion ? '❚❚ Pausar' : '▶ Animar'}</button>
      </div>
      <svg viewBox="0 0 960 430" role="img" aria-label={`Esquema didático do radar de abertura sintética, etapa ${STEPS[step].t}. ${STEPS[step].d}`}>
        <defs>
          <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#081019" /><stop offset="1" stopColor="#0F2431" /></linearGradient>
          <linearGradient id="beam" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#39C6C3" stopOpacity="0.5" /><stop offset="1" stopColor="#39C6C3" stopOpacity="0.04" /></linearGradient>
        </defs>
        <rect width="960" height="430" fill="url(#sky)" rx="10" />
        {/* feixe lateral */}
        <polygon points="150,62 470,372 800,372" fill="url(#beam)" className={`fx${on(0)}`} />
        {/* pulsos descendo */}
        {[0, 1, 2].map((k) => <path key={k} d="M175 80 Q 400 190 640 330" className={`pulse p${k}${on(0)}`} />)}
        {/* nuvens */}
        <g className={`clouds${step === 1 ? ' hot' : ''}`}>
          {[[300, 150, 70], [370, 138, 56], [440, 156, 64], [560, 128, 60], [630, 144, 52], [240, 164, 44]].map(([cx, cy, r], i) => <ellipse key={i} cx={cx} cy={cy} rx={r} ry={r * 0.42} />)}
          <text x="700" y="118" className="lbl">nuvens e fumaça</text>
        </g>
        {/* chão e água */}
        <rect x="0" y="372" width="960" height="58" fill="#0b1a14" />
        <rect x="716" y="368" width="110" height="8" rx="3" fill="#39C6C3" opacity="0.85" />
        <rect x="660" y="372" width="56" height="6" fill="#39C6C3" opacity="0.5" />
        <rect x="826" y="372" width="134" height="6" fill="#39C6C3" opacity="0.5" />
        {/* árvores */}
        {TREES.map((x, i) => (
          <g key={x} className="tree">
            <rect x={x - 3} y={300} width={6} height={72} fill="#5b4632" />
            <ellipse cx={x} cy={282} rx={30} ry={34} fill="#1f6a43" />
            <ellipse cx={x - 10} cy={270} rx={16} ry={16} fill="#2c8556" opacity={0.8} />
            {i === 3 && <text x={x} y={404} className="lbl mid">tronco</text>}
          </g>
        ))}
        <text x="596" y="232" className="lbl mid">copa</text>
        <text x="771" y="398" className="lbl mid">água sob a copa</text>
        <text x="440" y="398" className="lbl mid">solo exposto</text>
        {/* espalhamento na copa */}
        <g className={`scatter canopy${on(2)}`}>
          {TREES.slice(0, 5).map((x) => <g key={x}><path d={`M${x} 262 l-16 -20 M${x} 262 l14 -22 M${x} 262 l-2 -26`} /></g>)}
        </g>
        {/* penetração parcial */}
        <g className={`scatter deepfx${on(3)}`}>
          {TREES.slice(1, 5).map((x, i) => <path key={x} d={`M${x - 26} 250 L${x - 6} ${deep ? 350 : 292}`} className={i % 2 ? 'faint' : ''} />)}
          {deep && <path d="M746 300 L752 366 L770 322" className="bounce" />}
          <text x="944" y="222" className="lbl end">{deep ? 'parte chega a troncos e chão' : 'quase tudo fica na copa'}</text>
        </g>
        {/* eco de volta */}
        {[0, 1].map((k) => <path key={k} d="M620 300 Q 380 170 190 82" className={`echo e${k}${on(4)}`} />)}
        {/* satélite */}
        <g transform="translate(150,58) rotate(18)">
          <rect x="-58" y="-9" width="40" height="18" rx="2" fill="#1c5d6b" stroke="#39C6C3" strokeWidth="1" />
          <rect x="18" y="-9" width="40" height="18" rx="2" fill="#1c5d6b" stroke="#39C6C3" strokeWidth="1" />
          <rect x="-16" y="-14" width="32" height="28" rx="4" fill="#DDE9E8" />
          <rect x="-12" y="14" width="24" height="5" fill="#F6A24F" />
        </g>
        <text x="150" y="26" className="lbl mid strong">{band === 'L' ? 'NISAR' : 'Sentinel-1'}</text>
        {/* linha de pixels */}
        <g className={`pixels${on(4)}`} transform="translate(64,236)">
          <text x="0" y="-12" className="lbl strong">o que vira imagem</text>
          {pix.map((v, i) => (
            <g key={i} transform={`translate(${i * 46},0)`}>
              <rect width="42" height="42" rx="3" fill={`rgb(${Math.round(v * 235)},${Math.round(v * 235)},${Math.round(v * 235)})`} stroke="#143D49" />
              <text x="21" y="58" className="lbl tiny mid">{labels[i].split(' ')[0]}</text>
              <text x="21" y="70" className="lbl tiny mid">{labels[i].split(' ').slice(1).join(' ')}</text>
            </g>
          ))}
        </g>
      </svg>
      <ol className="sar-steps">
        {STEPS.map((s, i) => (
          <li key={s.t}><button type="button" className={i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => { setStep(i); setAuto(false); }}>{s.t}</button></li>
        ))}
      </ol>
      <figcaption aria-live="polite"><b>{STEPS[step].t}.</b> {STEPS[step].d}{step === 3 && (deep ? ' Na banda L, mais energia alcança troncos e chão.' : ' Na banda C, a maior parte do eco vem do topo da copa.')}</figcaption>
      <p className="fine">Esquema didático, fora de escala. O radar não é raio X: não mostra o chão com nitidez sob qualquer vegetação e não identifica pessoas, veículos ou cargas.</p>
    </figure>
  );
}
