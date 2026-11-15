import { fmtNum } from '../lib/time';
import { haTxt, type RoData } from '../lib/ro';
import { CorteOuChuva } from './Detail';

interface Caso { n: number; t: string; par: string; ida: [string, string]; volta: [string, string]; juntos: string; ativo?: boolean }

const CASOS: Caso[] = [
  { n: 1, t: 'Corte ou chuva?', par: 'NISAR × Meteomatics', ativo: true,
    ida: ['NISAR → clima', 'a API de chuva não enxerga nem um graveto; o NISAR vê a floresta'],
    volta: ['Meteomatics → NISAR', 'diz se o eco mudou por solo molhado ou por tronco caído'],
    juntos: 'mudança real, sem falso alarme de chuva' },
  { n: 2, t: 'Alerta em 2 etapas', par: 'NISAR × Sentinel-1 (+ FIRMS)',
    ida: ['NISAR → Sentinel-1', 'a banda C só vê a copa; o NISAR confirma que o tronco sumiu'],
    volta: ['Sentinel-1 → NISAR', 'passa mais vezes e avisa antes dos 12 dias'],
    juntos: 'alerta rápido e confirmado; o FIRMS diz se queimou' },
  { n: 3, t: 'Floresta alagada', par: 'NISAR × SWOT / ANA',
    ida: ['NISAR → SWOT/ANA', 'vê a água escondida debaixo da copa'],
    volta: ['SWOT/ANA → NISAR', 'dão a altura da água, que o NISAR não mede'],
    juntos: 'inundação em área e em altura' },
  { n: 4, t: 'Seca dos rios', par: 'NISAR × CHIRPS / El Niño (+ ANA)',
    ida: ['NISAR → clima', 'mede quanta água sumiu dos rios e lagos'],
    volta: ['clima → NISAR', 'explica por que sumiu: chuva abaixo da média, El Niño'],
    juntos: 'quanto sumiu e por quê' },
  { n: 5, t: 'Risco de fogo', par: 'NISAR / SMAP × FIRMS (+ ERA5)',
    ida: ['NISAR → FIRMS', 'mede a secura do solo e da vegetação antes da chama'],
    volta: ['FIRMS → NISAR', 'o histórico de focos prova se o risco acerta'],
    juntos: 'risco previsto e conferido com o passado' },
  { n: 6, t: 'Garimpo em rio', par: 'NISAR × Sentinel-2 / CBERS-4A / Amazonia-1',
    ida: ['NISAR → óptico', 'vê a balsa mesmo com nuvem'],
    volta: ['óptico → NISAR', 'mostra a água barrenta que o radar não vê'],
    juntos: 'balsa + lama = garimpo provável' },
  { n: 7, t: 'Agro em Rondônia', par: 'NISAR × SMAP',
    ida: ['NISAR → SMAP', 'dá detalhe na escala do talhão'],
    volta: ['SMAP → NISAR', 'passa com frequência, mas em pixel grosso'],
    juntos: 'janela de plantio por talhão' },
  { n: 8, t: 'Carbono', par: 'NISAR × GEDI × BIOMASS',
    ida: ['NISAR → GEDI/BIOMASS', 'cobre toda a área, não só faixas'],
    volta: ['GEDI/BIOMASS → NISAR', 'o laser mede a altura; a banda P não satura em mata densa'],
    juntos: 'carbono perdido por polígono' },
];

const LACUNAS: [string, string][] = [
  ['Volta a cada 12 dias', 'Sentinel-1'],
  ['Sem histórico antes de 2025', 'ALOS-2 / ALOS-4'],
  ['Chuva molha o chão e muda o eco', 'Meteomatics (chuva)'],
  ['Não mede calor', 'FIRMS (MODIS/VIIRS)'],
  ['Imagem difícil de ler', 'Sentinel-2, CBERS-4A, Amazonia-1'],
  ['Ruído da ionosfera perto do Equador', 'Sentinel-1'],
  ['Vê a área da água, não o nível', 'SWOT + ANA'],
  ['Satura em mata muito densa', 'BIOMASS + GEDI'],
];

function Card({ c, children }: { c: Caso; children?: React.ReactNode }) {
  return (
    <article className={`caso glass${c.ativo ? ' ativo' : ''}`}>
      <header>
        <h3>{c.n}. {c.t}</h3>
        <span className={`pill${c.ativo ? '' : ' next'}`} style={{ ['--c' as string]: c.ativo ? '#9BE15D' : '#9fb3b8' }}><i />{c.ativo ? 'Funcionando' : 'Próximo passo'}</span>
      </header>
      <p className="par">{c.par}</p>
      <ul>
        <li><span className="ar">→</span><span><b>{c.ida[0]}:</b> {c.ida[1]}</span></li>
        <li><span className="ar">←</span><span><b>{c.volta[0]}:</b> {c.volta[1]}</span></li>
      </ul>
      <p className="juntos">Juntos: {c.juntos}</p>
      {children}
    </article>
  );
}

export default function Danca({ data, onMap }: { data: RoData; onMap: () => void }) {
  const ch = data.meta.chuva;
  const com = data.events.filter((e) => e.chuva && e.certeza !== 'possivel');
  const ok = com.filter((e) => e.chuva!.veredito !== 'duvida');
  const duv = com.filter((e) => e.chuva!.veredito === 'duvida');
  const exemplo = [...duv, ...ok].sort((a, b) => b.area_ha - a.area_ha)[0];
  return (
    <div className="page">
      <header className="page-head">
        <p className="kicker">Dancing with the SARs</p>
        <h1>Nenhum satélite dança sozinho</h1>
        <p className="lede">O NISAR é uma revolução: vê através de nuvem, fumaça e copa. Mas ninguém é perfeito. Cada parceiro cobre uma lacuna dele, e ele cobre uma lacuna de cada parceiro.</p>
      </header>

      <Card c={CASOS[0]}>
        {com.length > 0 ? (
          <div className="caso-live">
            <div className="stats3">
              <div><b>{com.length}</b><span>lugares de floresta no mapa conferidos com a chuva</span></div>
              <div><b className="ok">{ok.length}</b><span>mudança real (sem chuva ou confirmada no seco)</span></div>
              <div><b className="wet">{duv.length}</b><span>pode ser chuva: esperar a próxima passagem</span></div>
            </div>
            {exemplo?.chuva && (
              <div className="caso-ex">
                <p className="fine">Exemplo: {haTxt(exemplo.area_ha)} em {exemplo.municipio}</p>
                <CorteOuChuva c={exemplo.chuva} limite={ch?.limite_mm ?? 5} />
              </div>
            )}
            <button type="button" className="btn primary" onClick={onMap}>Ver no mapa</button>
          </div>
        ) : (
          <p className="fine">Aguardando a chuva da Meteomatics para estes lugares.</p>
        )}
        <p className="fine">Regra: chuva de {fmtNum(ch?.limite_mm ?? 5)} mm ou mais nas 48 h antes de uma imagem conta como chão molhado. FIRMS (fogo) e SEDAM-RO (áreas protegidas) entram como contexto.</p>
      </Card>

      <section>
        <h2 className="sec">Próximas danças</h2>
        <div className="casos">{CASOS.slice(1).map((c) => <Card key={c.n} c={c} />)}</div>
      </section>

      <section className="glass block">
        <h2>As lacunas do NISAR e quem preenche</h2>
        <table className="gaps">
          <tbody>{LACUNAS.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
