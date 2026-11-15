import { fmtDate, fmtNum } from './time';

export type Certeza = 'confirmado' | 'provavel' | 'possivel';
export type Sentido = 'colheita' | 'plantio' | 'misto';
export type Layer = 'fogo' | 'floresta' | 'lavoura';

export interface Serie { frame: string; dates: string[]; here: (number | null)[]; around: (number | null)[] }

export interface ForestEvent {
  id: string; kind: 'floresta'; date: string; first_date: string; period: number; area_ha: number; lon: number; lat: number;
  municipio: string | null; cd_mun: string | null; protegida: { nome: string; tipo: 'ti' | 'uc' }[]; certeza: Certeza;
  passagens_confirmaram: number; quadros: number; inpe: { classe: string; data: string }[]; fogo_dias: string[];
  serie: Serie | null; geometry: unknown; gtype: string;
}
/** Quadrado de 1,08 km de lavoura: [lon, lat, período, data, ha, sentido, código do município] */
export type FarmRow = [number, number, number, string, number, Sentido, string | null];
/** Foco de calor: [lon, lat, dia desde o início do NISAR, índice do município, 1 se caiu em floresta] */
export type FireRow = [number, number, number, number, number];

export interface Municipio { id: string; nome: string; lon: number; lat: number; floresta_ha: number; lavoura_ha: number; geometry: unknown; gtype: string }
export interface Protegida { nome: string; tipo: 'ti' | 'uc'; geometry: unknown; gtype: string }
export interface Period { i: number; start: string; end: string; passagens: number; quadros: number }
export interface Place { n: string; t: 'municipio' | 'estado' | 'pais'; id?: string; b: [number, number, number, number]; ro?: boolean }
export interface Meta {
  generated_at: string;
  nisar: { passagens: number; quadros: number; primeira: string; ultima: string; com_hv: number; grade_kml: number; grade_ajustada: number; teste_grade_max_px: number; quadros_floresta: number };
  floresta: { eventos: number; mostrados: number; ha_mostrados: number; por_certeza: Record<string, number>; com_fogo: number; validacao_pixels: { our_ha: number; deter_ha: number; deter_polys: number; precision_near_deter: number; deter_polys_found: number }; params: Record<string, number> };
  lavoura: { celulas: number; ha: number; por_sentido: Record<string, number> };
  deter: { poligonos: number; por_classe: Record<string, number> };
  fogo: { focos: number; fonte: string; url: string };
}
export interface RoData {
  events: ForestEvent[]; farm: FarmRow[]; fires: FireRow[]; fireMun: string[]; municipios: Municipio[]; protegidas: Protegida[];
  periods: Period[]; places: Place[]; meta: Meta;
  landcover: { image: string; corners: [number, number][]; year: string; nocoverage: string; nocoverage_share: number };
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
  const [events, farm, fires, places, periods, landcover, meta, gaz] = await Promise.all([
    getJson<ForestEvent[]>('ro/events.json'),
    getJson<{ rows: FarmRow[] }>('ro/farm.json'),
    getJson<{ rows: FireRow[]; mun_ids: string[] }>('ro/fires.json'),
    getJson<{ municipios: Municipio[]; protegidas: Protegida[] }>('ro/places.json'),
    getJson<{ periods: Period[] }>('ro/periods.json'),
    getJson<RoData['landcover']>('ro/landcover.json'),
    getJson<Meta>('ro/meta.json'),
    getJson<Place[]>('ro/gazetteer.json'),
  ]);
  return { events, farm: farm.rows, fires: fires.rows, fireMun: fires.mun_ids, municipios: places.municipios, protegidas: places.protegidas, periods: periods.periods, landcover, meta, places: gaz };
}

// ---------------------------------------------------------------- filtros

export interface Filters { range: [number, number]; municipio: string | null; layers: Record<Layer, boolean>; fracos: boolean; soProtegidas: boolean }

export const periodOfDay = (day: number) => Math.floor(day / 12);
export const inRange = (p: number, r: [number, number]) => p >= r[0] && p <= r[1];

export function filterEvents(ev: ForestEvent[], f: Filters, ignoreLayer = false): ForestEvent[] {
  if (!f.layers.floresta && !ignoreLayer) return [];
  return ev.filter((e) => inRange(e.period, f.range) && (!f.municipio || e.cd_mun === f.municipio) && (f.fracos || e.certeza !== 'possivel') && (!f.soProtegidas || e.protegida.length > 0));
}
export function filterFarm(rows: FarmRow[], f: Filters, ignoreLayer = false): FarmRow[] {
  if ((!f.layers.lavoura && !ignoreLayer) || f.soProtegidas) return [];
  return rows.filter((r) => inRange(r[2], f.range) && (!f.municipio || r[6] === f.municipio));
}
export function filterFires(rows: FireRow[], munIds: string[], f: Filters, ignoreLayer = false): FireRow[] {
  if ((!f.layers.fogo && !ignoreLayer) || f.soProtegidas) return [];
  const mi = f.municipio ? munIds.indexOf(f.municipio) : -2;
  return rows.filter((r) => inRange(periodOfDay(r[2]), f.range) && (mi === -2 || r[3] === mi));
}

export interface Totals { focos: number; focosFloresta: number; florestaHa: number; florestaN: number; confirmados: number; lavouraHa: number; colheita: number; plantio: number }
export function totals(ev: ForestEvent[], farm: FarmRow[], fires: FireRow[]): Totals {
  return {
    focos: fires.length,
    focosFloresta: fires.reduce((a, r) => a + r[4], 0),
    florestaHa: ev.reduce((a, e) => a + e.area_ha, 0),
    florestaN: ev.length,
    confirmados: ev.filter((e) => e.certeza === 'confirmado').length,
    lavouraHa: farm.reduce((a, r) => a + r[4], 0),
    colheita: farm.filter((r) => r[5] === 'colheita').reduce((a, r) => a + r[4], 0),
    plantio: farm.filter((r) => r[5] === 'plantio').reduce((a, r) => a + r[4], 0),
  };
}

/** Uma série por camada, um valor por período de 12 dias (ignora o filtro de período). */
export function seriesByPeriod(d: RoData, f: Filters): Record<Layer, number[]> {
  const all = { ...f, range: [0, d.periods.length - 1] as [number, number] };
  const n = d.periods.length;
  const out: Record<Layer, number[]> = { fogo: Array(n).fill(0), floresta: Array(n).fill(0), lavoura: Array(n).fill(0) };
  for (const r of filterFires(d.fires, d.fireMun, all, true)) { const p = periodOfDay(r[2]); if (p < n) out.fogo[p]++; }
  for (const e of filterEvents(d.events, all, true)) out.floresta[e.period] += e.area_ha;
  for (const r of filterFarm(d.farm, all, true)) out.lavoura[r[2]] += r[4];
  return out;
}

// ---------------------------------------------------------------- busca

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function searchPlaces(places: Place[], q: string, limit = 7): Place[] {
  const k = norm(q);
  if (k.length < 2) return [];
  const order = { municipio: 0, estado: 1, pais: 2 } as const;
  return places
    .map((p) => ({ p, s: norm(p.n).startsWith(k) ? 0 : norm(p.n).includes(k) ? 1 : 9 }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || order[a.p.t] - order[b.p.t] || a.p.n.localeCompare(b.p.n))
    .slice(0, limit)
    .map((x) => x.p);
}

// ---------------------------------------------------------------- linguagem simples

export const campos = (ha: number) => Math.max(1, Math.round(ha / 0.714));
export const haTxt = (ha: number) => (ha >= 10000 ? `${fmtNum(ha / 1000)} mil ha` : `${fmtNum(ha)} ha`);
export const periodLabel = (p: Period) => `${fmtDate(p.start, false)} a ${fmtDate(p.end, false)}`;

export const CERTEZA: Record<Certeza, { label: string; texto: string }> = {
  confirmado: { label: 'O INPE também viu', texto: 'O NISAR viu a floresta mudar e o INPE registrou o mesmo lugar com outro satélite.' },
  provavel: { label: 'Provável', texto: 'O eco da floresta caiu forte e ficou baixo nas passagens seguintes, enquanto a floresta em volta não mudou.' },
  possivel: { label: 'Sinal fraco', texto: 'Queda ainda sem confirmação. Dentro de Terra Indígena ou Unidade de Conservação, só chamamos de provável o que o INPE também viu.' },
};

export function frase(e: ForestEvent): string {
  return `Floresta derrubada ${e.municipio ? `em ${e.municipio}` : 'em Rondônia'}: cerca de ${fmtNum(e.area_ha)} ha (${fmtNum(campos(e.area_ha))} campos de futebol).`;
}
export function fraseLavoura(s: Sentido): string {
  if (s === 'colheita') return 'Lavoura colhida ou solo exposto.';
  if (s === 'plantio') return 'Lavoura crescendo, solo preparado ou molhado.';
  return 'Lavoura em mudança: partes colhidas, partes crescendo.';
}
