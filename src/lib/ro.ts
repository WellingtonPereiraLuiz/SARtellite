import { daysBetween, fmtDate, fmtNum } from './time';

export type Certeza = 'confirmado' | 'provavel' | 'possivel';
/** Camadas do mapa. */
export type Layer = 'fogo' | 'floresta';
/** Séries que dá para comparar na linha do tempo. */
export type Serie3 = 'fogo' | 'floresta' | 'chuva';
/** Caso 1, "Corte ou chuva?": o NISAR vê a mudança; a Meteomatics diz se choveu perto das imagens. */
export type Veredito = 'corte' | 'corte_apos_chuva' | 'duvida';
export interface Chuva {
  base: string; deteccao: string;        // data da imagem de antes e da imagem em que a queda apareceu
  base_mm: number; deteccao_mm: number;  // chuva nas 48 h antes de cada imagem (mm)
  secas_depois: number;                  // passagens seguintes sem chuva em que a queda continuou
  veredito: Veredito;
}
/** Caso 2, "Alerta em 2 etapas": Sentinel-1 (banda C, copa) avisa; NISAR (banda L, troncos) confirma. */
export interface S1 {
  imagens: number; orbitas: number; base_nisar: string; queda_nisar: string; alerta: string | null; dias_antes?: number;
  revisita_dias: number | null; revisita_juntos_dias: number | null; serie: [string, number][];
}
/** Foto de perto do Sentinel-2 (cor verdadeira, 10 m) de cada lugar, depois da queda. */
export interface Chip { img: string; corners: [number, number][]; data: string; nuvem: number }
export interface S2Mosaic { image: string; corners: [number, number][]; res_m: number; periodo: string; cenas: number; fonte: string }
export interface Rain { fonte: string; modelo: string; parametro: string; limite_mm: number; daily: [string, number][]; periods: number[] }

export interface Serie { frame: string; dates: string[]; here: (number | null)[]; around: (number | null)[] }

export interface ForestEvent {
  id: string; kind: 'floresta'; date: string; first_date: string; period: number; area_ha: number; lon: number; lat: number;
  municipio: string | null; cd_mun: string | null; protegida: { nome: string; tipo: 'ti' | 'uc' }[]; certeza: Certeza;
  passagens_confirmaram: number; quadros: number; inpe: { classe: string; data: string }[]; fogo_dias: string[];
  serie: Serie | null; geometry: unknown; gtype: string; chuva?: Chuva; s1?: S1;
}
/** Foco de calor: [lon, lat, dia desde o início do NISAR, índice do município, 1 se caiu em floresta, hora local de RO] */
export type FireRow = [number, number, number, number, number, number?];

export interface Municipio { id: string; nome: string; lon: number; lat: number; floresta_ha: number; geometry: unknown; gtype: string }
export interface Protegida { nome: string; tipo: 'ti' | 'uc'; geometry: unknown; gtype: string }
export interface Period { i: number; start: string; end: string; passagens: number; quadros: number }
export interface Place { n: string; t: 'municipio' | 'estado' | 'pais'; id?: string; b: [number, number, number, number]; ro?: boolean }
export interface Meta {
  generated_at: string;
  nisar: { passagens: number; quadros: number; primeira: string; ultima: string; com_hv: number; grade_kml: number; grade_ajustada: number; teste_grade_max_px: number; quadros_floresta: number };
  floresta: { eventos: number; mostrados: number; ha_mostrados: number; por_certeza: Record<string, number>; com_fogo: number; validacao_pixels: { our_ha: number; deter_ha: number; deter_polys: number; precision_near_deter: number; deter_polys_found: number }; params: Record<string, number> };
  deter: { poligonos: number; por_classe: Record<string, number> };
  fogo: { focos: number; fonte: string; url: string };
  s1?: { fonte: string; url: string; queda_db: number; com_alerta: number; sem_alerta: number; sem_dado: number; dias_antes_mediana: number | null; avisou_antes: number; revisita_mediana_dias: number | null; revisita_juntos_mediana_dias: number | null };
  chuva?: { fonte: string; modelo: string; limite_mm: number; corte: number; corte_apos_chuva: number; duvida: number; sem_dado: number; url: string };
}
export interface RoData {
  events: ForestEvent[]; fires: FireRow[]; rain: Rain | null; chips: Record<string, Chip>; s2: S2Mosaic | null; fireMun: string[]; municipios: Municipio[]; protegidas: Protegida[];
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
  const [events, rain, fires, places, periods, landcover, meta, gaz, chips, s2] = await Promise.all([
    getJson<ForestEvent[]>('ro/events.json'),
    getJson<Rain>('ro/rain.json').catch(() => null),
    getJson<{ rows: FireRow[]; mun_ids: string[] }>('ro/fires.json'),
    getJson<{ municipios: Municipio[]; protegidas: Protegida[] }>('ro/places.json'),
    getJson<{ periods: Period[] }>('ro/periods.json'),
    getJson<RoData['landcover']>('ro/landcover.json'),
    getJson<Meta>('ro/meta.json'),
    getJson<Place[]>('ro/gazetteer.json'),
    getJson<Record<string, Chip>>('ro/s2/index.json').catch(() => ({})),
    getJson<S2Mosaic>('ro/s2_ro.json').catch(() => null),
  ]);
  return { events, rain, chips, s2, fires: fires.rows, fireMun: fires.mun_ids, municipios: places.municipios, protegidas: places.protegidas, periods: periods.periods, landcover, meta, places: gaz };
}

// ---------------------------------------------------------------- filtros

/** Primeiro dia dos períodos do NISAR em Rondônia; os filtros contam dias a partir dele. */
export const START = '2026-06-17';
export const dayOf = (iso: string) => daysBetween(START, iso);
export const dateOf = (day: number) => new Date(Date.parse(`${START}T00:00:00Z`) + day * 86400000).toISOString().slice(0, 10);

/** range: dias desde START (inclusivo). hours: horário local de RO [início, fim), só para queimadas. */
export interface Filters { range: [number, number]; hours: [number, number]; municipio: string | null; layers: Record<Layer, boolean>; fracos: boolean; soProtegidas: boolean; duvidas: boolean }

export const periodOfDay = (day: number) => Math.floor(day / 12);
export const inRange = (p: number, r: [number, number]) => p >= r[0] && p <= r[1];

export function filterEvents(ev: ForestEvent[], f: Filters, ignoreLayer = false): ForestEvent[] {
  if (!f.layers.floresta && !ignoreLayer) return [];
  return ev.filter((e) => inRange(dayOf(e.date), f.range) && (!f.municipio || e.cd_mun === f.municipio) && (f.fracos || e.certeza !== 'possivel') && (!f.soProtegidas || e.protegida.length > 0) && (f.duvidas || e.chuva?.veredito !== 'duvida'));
}
export function filterFires(rows: FireRow[], munIds: string[], f: Filters, ignoreLayer = false): FireRow[] {
  if ((!f.layers.fogo && !ignoreLayer) || f.soProtegidas) return [];
  const mi = f.municipio ? munIds.indexOf(f.municipio) : -2;
  const allDay = f.hours[0] === 0 && f.hours[1] === 24;
  return rows.filter((r) => inRange(r[2], f.range) && (mi === -2 || r[3] === mi) && (allDay || r[5] === undefined || (r[5] >= f.hours[0] && r[5] < f.hours[1])));
}

export interface Totals { focos: number; focosFloresta: number; florestaHa: number; florestaN: number; confirmados: number; semChuva: number; duvida: number; comChuva: number }
export function totals(ev: ForestEvent[], fires: FireRow[]): Totals {
  return {
    focos: fires.length,
    focosFloresta: fires.reduce((a, r) => a + r[4], 0),
    florestaHa: ev.reduce((a, e) => a + e.area_ha, 0),
    florestaN: ev.length,
    confirmados: ev.filter((e) => e.certeza === 'confirmado').length,
    semChuva: ev.filter((e) => e.chuva && e.chuva.veredito !== 'duvida').length,
    duvida: ev.filter((e) => e.chuva?.veredito === 'duvida').length,
    comChuva: ev.filter((e) => e.chuva).length,
  };
}

/** Uma série por camada, um valor por período de 12 dias (ignora o filtro de período). */
/** Chuva média de RO somada no intervalo de dias (mm). */
export function rainSum(rain: Rain | null, range: [number, number]): number {
  if (!rain) return 0;
  return rain.daily.reduce((a, [d, v]) => (inRange(dayOf(d), range) ? a + v : a), 0);
}

export function seriesByPeriod(d: RoData, f: Filters): Record<Serie3, number[]> {
  const all = { ...f, range: [0, d.periods.length * 12 - 1] as [number, number] };
  const n = d.periods.length;
  const out: Record<Serie3, number[]> = { fogo: Array(n).fill(0), floresta: Array(n).fill(0), chuva: Array(n).fill(0) };
  for (const r of filterFires(d.fires, d.fireMun, all, true)) { const p = periodOfDay(r[2]); if (p < n) out.fogo[p]++; }
  for (const e of filterEvents(d.events, all, true)) out.floresta[e.period] += e.area_ha;
  if (d.rain) d.rain.periods.slice(0, n).forEach((v, i) => (out.chuva[i] = v));
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
export const VEREDITO: Record<Veredito, { label: string; texto: string }> = {
  corte: { label: 'Corte, sem chuva', texto: 'Não choveu perto das duas imagens. A queda do eco é mudança no chão, não umidade.' },
  corte_apos_chuva: { label: 'Corte, confirmado no seco', texto: 'Choveu perto de uma das imagens, mas a queda continuou nas passagens secas seguintes.' },
  duvida: { label: 'Pode ser chuva', texto: 'Choveu perto das imagens e ainda não houve passagem seca depois. Melhor esperar a próxima volta do NISAR.' },
};
