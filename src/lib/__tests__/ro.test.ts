import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { campos, filterEvents, filterFires, frase, haTxt, norm, searchPlaces, totals, type FireRow, type Filters, type ForestEvent, type Place, type Rain } from '../ro';

const events = JSON.parse(readFileSync('public/data/ro/events.json', 'utf8')) as ForestEvent[];
const periods = (JSON.parse(readFileSync('public/data/ro/periods.json', 'utf8')) as { periods: { i: number; start: string; end: string }[] }).periods;
const fireJson = JSON.parse(readFileSync('public/data/ro/fires.json', 'utf8')) as { rows: FireRow[]; mun_ids: string[] };
const places = JSON.parse(readFileSync('public/data/ro/gazetteer.json', 'utf8')) as Place[];
const layers = { fogo: true, floresta: true };
const all: Filters = { range: [0, periods.length * 12 - 1], hours: [0, 24], municipio: null, layers, fracos: false, soProtegidas: false, duvidas: true };

describe('períodos do NISAR', () => {
  it('começam em 17 jun 2026 e têm 12 dias cada', () => {
    expect(periods[0].start).toBe('2026-06-17');
    for (const p of periods) expect((Date.parse(p.end) - Date.parse(p.start)) / 86400000).toBe(11);
  });
  it('cada evento cai no período da sua data', () => {
    for (const e of events) {
      const p = periods[e.period];
      expect(e.date >= p.start && e.date <= p.end).toBe(true);
    }
  });
});

describe('filtros', () => {
  it('por padrão escondem os sinais fracos', () => {
    expect(filterEvents(events, all).some((e) => e.certeza === 'possivel')).toBe(false);
    expect(filterEvents(events, { ...all, fracos: true })).toHaveLength(events.length);
  });
  it('dentro de área protegida, só aparece o que o INPE confirmou', () => {
    for (const e of filterEvents(events, { ...all, soProtegidas: true })) expect(e.certeza).toBe('confirmado');
  });
  it('período e município restringem', () => {
    const r = filterEvents(events, { ...all, fracos: true, range: [60, 71] });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.period === 5)).toBe(true);
    const mun = events.find((e) => e.cd_mun)!.cd_mun;
    expect(filterEvents(events, { ...all, municipio: mun, fracos: true }).every((x) => x.cd_mun === mun)).toBe(true);
  });
  it('desligar um insight esvazia só ele', () => {
    expect(filterEvents(events, { ...all, layers: { ...layers, floresta: false } })).toHaveLength(0);
    expect(filterFires(fireJson.rows, fireJson.mun_ids, { ...all, layers: { ...layers, fogo: false } })).toHaveLength(0);
    expect(filterFires(fireJson.rows, fireJson.mun_ids, { ...all, layers: { ...layers, fogo: false } }, true).length).toBe(fireJson.rows.length);
  });
});

describe('linguagem simples', () => {
  it('converte hectares em campos de futebol', () => {
    expect(campos(0.714)).toBe(1);
    expect(campos(71.4)).toBe(100);
  });
  it('a frase cita o município e o tamanho', () => {
    const e = events.find((x) => x.municipio)!;
    expect(frase(e)).toContain(e.municipio!);
    expect(frase(e)).toContain('campos de futebol');
  });
  it('os totais somam os filtrados', () => {
    const ev = filterEvents(events, all);
    const t = totals(ev, fireJson.rows);
    expect(t.focos).toBe(fireJson.rows.length);
    expect(filterFires(fireJson.rows, fireJson.mun_ids, all).length).toBe(fireJson.rows.length);
    expect(t.florestaN).toBe(ev.length);
  });
});

describe('dados reais', () => {
  it('nenhum evento sem data, área ou geometria', () => {
    for (const e of events) {
      expect(e.area_ha).toBeGreaterThan(0);
      expect(e.date).toMatch(/^2026-\d\d-\d\d$/);
      expect(e.geometry).toBeTruthy();
    }
  });
});

describe('queimadas', () => {
  it('cada foco tem posição em Rondônia e dia dentro do NISAR', () => {
    const last = periods.length * 12;
    for (const r of fireJson.rows) {
      expect(r[0]).toBeGreaterThan(-67.5); expect(r[0]).toBeLessThan(-59);
      expect(r[1]).toBeGreaterThan(-14.5); expect(r[1]).toBeLessThan(-7);
      expect(r[2]).toBeGreaterThanOrEqual(0); expect(r[2]).toBeLessThan(last);
    }
  });
  it('filtro de município pega só os focos dele', () => {
    const id = fireJson.mun_ids[0];
    const r = filterFires(fireJson.rows, fireJson.mun_ids, { ...all, municipio: id });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x[3] === 0)).toBe(true);
  });
});

describe('filtro de dia e hora', () => {
  it('horário só deixa focos daquela faixa', () => {
    const r = filterFires(fireJson.rows, fireJson.mun_ids, { ...all, hours: [12, 18] });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => (x[5] as number) >= 12 && (x[5] as number) < 18)).toBe(true);
  });
  it('um dia só traz focos daquele dia', () => {
    const r = filterFires(fireJson.rows, fireJson.mun_ids, { ...all, range: [70, 70] });
    expect(r.every((x) => x[2] === 70)).toBe(true);
  });
});

describe('busca', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(norm('Rondônia')).toBe('rondonia');
    expect(searchPlaces(places, 'vilhena')[0].n).toBe('Vilhena');
    expect(searchPlaces(places, 'rondonia').some((p) => p.ro)).toBe(true);
  });
  it('acha lugares fora de Rondônia', () => {
    expect(searchPlaces(places, 'bolivia').some((p) => p.t === 'pais')).toBe(true);
  });
  it('escreve hectares grandes em mil', () => {
    expect(haTxt(637637)).toBe('638 mil ha');
    expect(haTxt(586)).toBe('586 ha');
  });
});

describe('corte ou chuva (NISAR + Meteomatics)', () => {
  const comChuva = events.filter((e) => e.chuva);
  it('o veredito segue a regra das 48 h', () => {
    const lim = existsSync('public/data/ro/rain.json') ? (JSON.parse(readFileSync('public/data/ro/rain.json', 'utf8')) as Rain).limite_mm : 5;
    for (const e of comChuva) {
      const c = e.chuva!;
      const seco = c.base_mm < lim && c.deteccao_mm < lim;
      if (seco) expect(c.veredito).toBe('corte');
      else expect(c.veredito).toBe(c.secas_depois > 0 ? 'corte_apos_chuva' : 'duvida');
      expect(c.base < c.deteccao).toBe(true);
    }
  });
  it('esconder o que pode ser chuva tira só as dúvidas', () => {
    const r = filterEvents(events, { ...all, fracos: true, duvidas: false });
    expect(r.some((e) => e.chuva?.veredito === 'duvida')).toBe(false);
    expect(r.length).toBe(events.length - comChuva.filter((e) => e.chuva!.veredito === 'duvida').length);
  });
});

describe('alerta em 2 etapas (Sentinel-1 + NISAR)', () => {
  it('dias_antes bate com as datas', () => {
    for (const e of events.filter((x) => x.s1?.alerta)) {
      const s = e.s1!;
      const d = Math.round((Date.parse(s.queda_nisar) - Date.parse(s.alerta!)) / 86400000);
      expect(s.dias_antes).toBe(d);
      expect(s.alerta! > s.base_nisar).toBe(true);
    }
  });
  it('juntos passam mais vezes que o NISAR sozinho', () => {
    for (const e of events.filter((x) => x.s1?.revisita_juntos_dias)) expect(e.s1!.revisita_juntos_dias!).toBeLessThan(12);
  });
});
