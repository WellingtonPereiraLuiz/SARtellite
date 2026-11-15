import type { EvidenceInfo } from '../components/EvidenceCard';
import type { DeltaResult } from './delta';
import { daysBetween, fmtDate, fmtNum, fmtUtc } from './time';
import type { Aoi, Manifest, NisarScene, S1Scene, S2Scene, Scene } from './types';

const pct = (v: number, d = 1) => `${fmtNum(v * 100, d)}%`;
const src = (s: Scene) => ({ label: `${s.sensorLabel}, ${fmtDate(s.date)}: ${'product_id' in s.raw ? s.raw.product_id : (s.raw as S2Scene).product_ids[0]}`, url: s.raw.source_url });

export function buildEvidence(m: Manifest, aoi: Aoi | null, before: Scene | null, after: Scene | null, delta: DeltaResult | null): EvidenceInfo | null {
  if (!after) return null;
  const b = before ?? after;
  const title = b.id === after.id ? `${after.title}, ${fmtDate(after.date)}` : `${b.title}, ${fmtDate(b.date)} × ${after.title}, ${fmtDate(after.date)}`;
  const sources = b.id === after.id ? [src(after)] : [src(b), src(after)];
  const span = Math.abs(daysBetween(b.date, after.date));

  if (b.id === after.id) {
    return {
      stage: 1, title, metrics: [], sources,
      observed: <p>Uma única cena selecionada. Escolha outra data como Antes para comparar.</p>,
      mayIndicate: <p>Uma imagem sozinha mostra o estado da superfície naquele instante, não uma mudança.</p>,
      confirm: <p>Selecione duas datas do mesmo sensor na linha do tempo.</p>,
      processing: [`Aquisição: ${fmtUtc(after.acquiredAt)}.`, after.quality],
    };
  }

  if (b.key === 'nisar' && after.key === 'nisar') {
    const f = m.nisar_frame.diff;
    const n0 = b.raw as NisarScene;
    const n1 = after.raw as NisarScene;
    const drop = aoi ? aoi.nisar_diff.share_drop : f.share_drop;
    const rise = aoi ? aoi.nisar_diff.share_rise : f.share_rise;
    const where = aoi ? 'da área' : 'do quadro inteiro';
    return {
      stage: 1, title, sources,
      metrics: [
        { label: 'Eco mais fraco', value: pct(drop), note: `${where}, além de ${f.floor_dn} níveis de cinza` },
        { label: 'Eco mais forte', value: pct(rise), note: where },
        { label: 'Intervalo', value: `${span} dias`, note: aoi ? `${fmtNum(aoi.rain.total_between_nisar_mm)} mm de chuva e ${aoi.fires.count_between_nisar} focos de calor na área` : undefined },
      ],
      observed: <p>O brilho da prévia HH mudou entre as duas passagens. Laranja marca onde o eco ficou mais fraco. Azul-esverdeado marca onde ficou mais forte. Sem hectares: uma prévia de 8 bits não permite medir área com segurança.</p>,
      mayIndicate: <p>Colheita ou preparo de lavoura, corte ou queima de vegetação, solo mais úmido com a volta da chuva, água sob a vegetação, ou diferença entre as versões de processamento. O radar não diz qual delas.</p>,
      confirm: <p>Compare com Sentinel-1 e Sentinel-2 nas áreas já processadas, com os mapas do INPE e do MapBiomas, ou com vistoria de campo.</p>,
      processing: [
        'Prévias públicas da ASF, 180 m por pixel, 8 bits. Não são o retroespalhamento calibrado em dB do HDF5.',
        `${fmtDate(b.date)}: CRID ${n0.crid}, ${n0.processing_maturity === 'VALIDATED' ? 'validado' : 'provisório'}, polarizações ${n0.polarizations_available.join(' e ')}. ${fmtDate(after.date)}: CRID ${n1.crid}, ${n1.processing_maturity === 'VALIDATED' ? 'validado' : 'provisório'}, ${n1.polarizations_available.join(' e ')}. Só HH é comum.`,
        `Mesma grade nas duas datas: deslocamento de ${m.nisar_frame.grid_check.shift_px.join(' e ')} px por correlação de fase.`,
        'Diferença: outubro menos junho, média 3x3, centrada na mediana do quadro.',
      ],
    };
  }

  if (b.key === 's1' && after.key === 's1') {
    const s0 = b.raw as S1Scene;
    const s1 = after.raw as S1Scene;
    if (s0.relative_orbit !== s1.relative_orbit) {
      return {
        stage: 1, title, sources, metrics: [],
        observed: <p>As duas cenas vêm de órbitas relativas diferentes ({s0.relative_orbit} e {s1.relative_orbit}). O ângulo de visada muda, então a diferença não é calculada.</p>,
        mayIndicate: <p>Diferenças de brilho entre órbitas distintas refletem principalmente a geometria.</p>,
        confirm: <p>Escolha duas datas da mesma órbita relativa.</p>,
        processing: ['Sentinel-1 RTC gamma0, VH, 20 m.'],
      };
    }
    const an = aoi?.analysis;
    const isPair = !!an && ((an.s1_pair.before === b.id && an.s1_pair.after === after.id) || (an.s1_pair.before === after.id && an.s1_pair.after === b.id));
    const c = an?.corroboration ?? null;
    const metrics: EvidenceInfo['metrics'] = [];
    if (isPair && an) {
      const ha = an.area_ha_by_threshold['-3.0'];
      metrics.push({ label: 'Queda de VH acima de 3 dB', value: `${fmtNum(ha)} ha`, note: `${pct(ha / an.aoi_area_ha)} da área, grade de 20 m. Com 2 dB: ${fmtNum(an.area_ha_by_threshold['-2.0'])} ha. Com 4 dB: ${fmtNum(an.area_ha_by_threshold['-4.0'])} ha.` });
    } else if (delta) {
      metrics.push({ label: 'Queda de VH acima de 3 dB', value: `${fmtNum(delta.dropHa)} ha`, note: `${pct(delta.dropHa / delta.areaHa)} da área. Limiar experimental, conta feita no navegador a 40 m.` });
      metrics.push({ label: 'Alta de VH acima de 3 dB', value: `${fmtNum(delta.riseHa)} ha`, note: `${pct(delta.riseHa / delta.areaHa)} da área` });
    }
    if (isPair && c) metrics.push({ label: 'Confirmado pelo óptico', value: `${fmtNum(c.area_ha)} ha`, note: `queda de NDVI maior que ${Math.abs(c.ndvi_drop_threshold).toString().replace('.', ',')}; ${fmtNum(c.area_ha_in_trees_class)} ha na classe Árvores` });
    const classes = isPair && an ? Object.entries(an.area_ha_by_class).sort((x, y) => y[1] - x[1]).slice(0, 3) : [];
    return {
      stage: isPair && c ? 3 : 2, title, sources, metrics,
      observed: (
        <>
          <p>O eco VH do Sentinel-1 mudou entre as duas datas. Laranja: queda. Azul-esverdeado: alta. A conta é feita no seu navegador a partir das duas imagens reais.</p>
          {classes.length > 0 && <p>No par de referência, a queda acima de 3 dB se distribui assim no mapa de cobertura: {classes.map(([k, v]) => `${k} ${fmtNum(v)} ha`).join(', ')}.</p>}
        </>
      ),
      mayIndicate: <p>Em lavoura, quase sempre colheita ou solo preparado. Em área de árvores, corte, queima ou dano na copa. Chuva recente também muda o eco. O radar aponta onde olhar, não a causa.</p>,
      confirm: isPair && c
        ? <p>Já conferido com Sentinel-2: {pct(c.share_of_radar_drop_confirmed, 0)} dos pixels com queda de radar também perderam NDVI. Ative "Alterações com dois sensores". Falta validação de campo ou de mapa oficial.</p>
        : <p>Ative o Sentinel-2 em data próxima sem nuvem, ou a camada "Alterações com dois sensores" no par de referência.</p>,
      processing: [
        `Sentinel-1 RTC gamma0 (correção radiométrica de terreno), VH, órbita relativa ${s0.relative_orbit}, 10 m reamostrado por média para 20 m e filtro 3x3.`,
        isPair && an ? `Par de referência: diferença centrada na mediana dos pixels da classe Árvores (${fmtNum(an.reference_offset_db, 2)} dB), área contada em grade UTM de 20 m. A camada do mapa é desenhada no navegador a 40 m.` : delta ? `Diferença em dB calculada a ${fmtNum(delta.pixelM)} m, centrada na mediana da área (${fmtNum(delta.offsetDb, 2)} dB) para descontar umidade.` : 'Calculando a diferença…',
        'Banda C: sensível a folhas e galhos finos. Não se mistura com a banda L do NISAR.',
      ],
    };
  }

  if (b.key === 's2' && after.key === 's2') {
    const a0 = b.raw as S2Scene;
    const a1 = after.raw as S2Scene;
    return {
      stage: 1, title, sources,
      metrics: [
        { label: `Nuvem em ${fmtDate(b.date, false)}`, value: pct(a0.cloud_fraction_aoi, 0), note: 'da área (classificação SCL)' },
        { label: `Nuvem em ${fmtDate(after.date, false)}`, value: pct(a1.cloud_fraction_aoi, 0), note: 'da área' },
        { label: 'Água mapeada', value: `${fmtNum(a0.water_area_ha, 1)} → ${fmtNum(a1.water_area_ha, 1)} ha`, note: 'classe água do SCL; nuvem esconde água' },
      ],
      observed: <p>Duas imagens ópticas em cor verdadeira. Onde há nuvem, não há observação da superfície.</p>,
      mayIndicate: <p>Mudança de cor entre junho e outubro acompanha a estação seca: lavoura colhida, pasto seco, queimadas. Compare com o radar para separar estrutura de cor.</p>,
      confirm: <p>Use o divisor para conferir os polígonos que o radar destacou.</p>,
      processing: ['Sentinel-2 L2A (refletância de superfície), bandas B04, B03, B02, 10 m reamostrado para 20 m.', 'Nuvem e água vêm da classificação de cena SCL do próprio produto.'],
    };
  }

  const s2 = [b, after].find((s) => s.key === 's2');
  const radar = [b, after].find((s) => s.key !== 's2');
  const sameDay = b.date === after.date;
  const cloud = s2 ? (s2.raw as S2Scene).cloud_fraction_aoi : 0;
  return {
    stage: 1, title, sources,
    metrics: s2 ? [{ label: 'Nuvem no óptico', value: pct(cloud, 0), note: `da área em ${fmtDate(s2.date)}` }, { label: 'Diferença de datas', value: sameDay ? 'mesmo dia' : `${span} dias` }] : [{ label: 'Diferença de datas', value: `${span} dias` }],
    observed: s2 && radar && sameDay && cloud > 0.5
      ? <p>No mesmo dia, dois satélites passaram sobre a área. O Sentinel-2 ({fmtUtc(s2.acquiredAt)}) registrou {pct(cloud, 0)} de nuvem. O radar ({fmtUtc(radar.acquiredAt)}) registrou a superfície.</p>
      : <p>Sensores diferentes lado a lado. A comparação é visual: não subtraímos imagens de sensores distintos.</p>,
    mayIndicate: <p>O radar emite a própria energia em micro-ondas, que passa pelas nuvens. O óptico depende da luz do sol refletida e para na nuvem.</p>,
    confirm: <p>Para medir mudança, selecione duas datas do mesmo sensor.</p>,
    processing: ['Banda L (NISAR), banda C (Sentinel-1) e óptico (Sentinel-2) respondem a coisas diferentes. Cada um é comparado só consigo mesmo.'],
  };
}
