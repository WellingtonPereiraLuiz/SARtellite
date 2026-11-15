import { fmtDate, fmtNum } from './time';

export type Certeza = 'confirmado' | 'provavel' | 'possivel';
export type Sentido = 'colheita' | 'plantio' | 'misto';

export interface Serie { frame: string; dates: string[]; here: (number | null)[]; around: (number | null)[] }

export interface ForestEvent {
  id: string; kind: 'floresta'; date: string; first_date: string; period: number; area_ha: number; lon: number; lat: number;
  municipio: string | null; cd_mun: string | null; protegida: { nome: string; tipo: 'ti' | 'uc' }[]; certeza: Certeza;
  passagens_confirmaram: number; quadros: number; inpe: { classe: string; data: string }[]; fogo_dias: string[];
  serie: Serie | null; geometry: unknown; gtype: string;
}

/** Célula de 1,08 km de lavoura: [lon, lat, período, data, ha, sentido, código do município] */
export type FarmRow = [number, number, number, string, number, Sentido, string | null];

export interface Municipio { id: string; nome: string; lon: number; lat: number; floresta_ha: number; lavoura_ha: number; geometry: unknown; gtype: string }
export interface Protegida { nome: string; tipo: 'ti' | 'uc'; geometry: unknown; gtype: string }
export interface Period { i: number; start: string; end: string; passagens: number; quadros: number }
export interface RoData {
  events: ForestEvent[]; farm: FarmRow[]; municipios: Municipio[]; protegidas: Protegida[]; periods: Period[];
  landcover: { image: string; corners: [number, number][]; year: string; nocoverage: string; nocoverage_share: number };
  meta: Meta;
}

export interface Meta {
  generated_at: string;
  nisar: { passagens: number; quadros: number; primeira: string; ultima: string; com_hv: number; grade_kml: number; grade_ajustada: number; teste_grade_max_px: number; quadros_floresta: number };
  floresta: { eventos: number; mostrados: number; ha_mostrados: number; por_certeza: Record<string, number>; com_fogo: number; validacao_pixels: { our_ha: number; deter_ha: number; deter_polys: number; precision_near_deter: number; deter_polys_found: number }; params: Record<string, number> };
  lavoura: { celulas: number; ha: number; por_sentido: Record<string, number> };
  deter: { poligonos: number; por_classe: Record<string, number> };
  fogo: { focos: number; fonte: string; url: string };
}

export const dataUrl = (path: string) => {
  try { return new URL(`data/${path}`, document.baseURI).href; } catch { return `data/${path}`; }
};

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(dataUrl(path));
  if (!r.ok) throw new Error(`${path} respondeu ${r.status}`);
  return (await r.json()) as T;
}

export async function loadRo(): Promise<RoData> {
  const [events, farm, places, periods, landcover, meta] = await Promise.all([
    getJson<ForestEvent[]>('ro/events.json'),
    getJson<{ rows: FarmRow[] }>('ro/farm.json'),
    getJson<{ municipios: Municipio[]; protegidas: Protegida[] }>('ro/places.json'),
    getJson<{ periods: Period[] }>('ro/periods.json'),
    getJson<RoData['landcover']>('ro/landcover.json'),
    getJson<Meta>('ro/meta.json'),
  ]);
  return { events, farm: farm.rows, municipios: places.municipios, protegidas: places.protegidas, periods: periods.periods, landcover, meta };
}

// ---------------------------------------------------------------- filtros

export interface Filters {
  range: [number, number];           // períodos incluídos (índices)
  municipio: string | null;          // código IBGE
  floresta: boolean;
  lavoura: boolean;
  fracos: boolean;                   // mostrar sinais "possível"
  soProtegidas: boolean;
}

export const inRange = (p: number, r: [number, number]) => p >= r[0] && p <= r[1];

export function filterEvents(ev: ForestEvent[], f: Filters): ForestEvent[] {
  if (!f.floresta) return [];
  return ev.filter((e) => inRange(e.period, f.range) && (!f.municipio || e.cd_mun === f.municipio) && (f.fracos || e.certeza !== 'possivel') && (!f.soProtegidas || e.protegida.length > 0));
}

export function filterFarm(rows: FarmRow[], f: Filters): FarmRow[] {
  if (!f.lavoura || f.soProtegidas) return [];
  return rows.filter((r) => inRange(r[2], f.range) && (!f.municipio || r[6] === f.municipio));
}

export function totals(ev: ForestEvent[], farm: FarmRow[]) {
  const colheita = farm.filter((r) => r[5] === 'colheita').reduce((a, r) => a + r[4], 0);
  const plantio = farm.filter((r) => r[5] === 'plantio').reduce((a, r) => a + r[4], 0);
  return {
    florestaHa: ev.reduce((a, e) => a + e.area_ha, 0),
    florestaN: ev.length,
    confirmados: ev.filter((e) => e.certeza === 'confirmado').length,
    comFogo: ev.filter((e) => e.fogo_dias.length > 0).length,
    lavouraHa: farm.reduce((a, r) => a + r[4], 0),
    colheita, plantio,
  };
}

// ---------------------------------------------------------------- linguagem simples

/** Campo de futebol oficial: 105 m x 68 m = 0,714 ha. */
export const campos = (ha: number) => Math.max(1, Math.round(ha / 0.714));

export const periodLabel = (p: Period) => `${fmtDate(p.start, false)} a ${fmtDate(p.end, false)}`;

export const CERTEZA: Record<Certeza, { label: string; texto: string }> = {
  confirmado: { label: 'O INPE também viu', texto: 'O radar NISAR viu a floresta mudar aqui, e o INPE também registrou, com outro satélite, desmatamento, queimada ou degradação no mesmo lugar.' },
  provavel: { label: 'Provável', texto: 'O eco da floresta caiu forte e continuou baixo nas passagens seguintes do NISAR. A floresta em volta não mudou do mesmo jeito.' },
  possivel: { label: 'Sinal fraco', texto: 'O radar viu uma queda, mas ainda não há confirmação. Pode ser derrubada, pode ser outra coisa. Dentro de Terra Indígena ou Unidade de Conservação, só chamamos de provável o que o INPE também viu.' },
};

export function frase(e: ForestEvent): string {
  const onde = e.municipio ? `em ${e.municipio}` : 'em Rondônia';
  return `A floresta pode ter sido derrubada ${onde}: cerca de ${fmtNum(e.area_ha)} hectares, mais ou menos ${fmtNum(campos(e.area_ha))} campos de futebol.`;
}

export function fraseLavoura(sentido: Sentido): string {
  if (sentido === 'colheita') return 'A lavoura foi colhida ou o solo ficou exposto: o eco do radar caiu.';
  if (sentido === 'plantio') return 'A lavoura começou a crescer ou o solo foi preparado ou molhado: o eco do radar subiu.';
  return 'A lavoura mudou várias vezes: partes foram colhidas e partes começaram a crescer.';
}
