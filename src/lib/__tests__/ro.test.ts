import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { campos, filterEvents, filterFarm, frase, totals, type FarmRow, type Filters, type ForestEvent } from '../ro';

const events = JSON.parse(readFileSync('public/data/ro/events.json', 'utf8')) as ForestEvent[];
const farm = (JSON.parse(readFileSync('public/data/ro/farm.json', 'utf8')) as { rows: FarmRow[] }).rows;
const periods = (JSON.parse(readFileSync('public/data/ro/periods.json', 'utf8')) as { periods: { i: number; start: string; end: string }[] }).periods;
const all: Filters = { range: [0, periods.length - 1], municipio: null, floresta: true, lavoura: true, fracos: false, soProtegidas: false };

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
    const r = filterEvents(events, { ...all, range: [5, 5] });
    expect(r.every((e) => e.period === 5)).toBe(true);
    const mun = events.find((e) => e.cd_mun)!.cd_mun;
    expect(filterFarm(farm, { ...all, municipio: mun }).every((x) => x[6] === mun)).toBe(true);
  });
  it('desligar um insight esvazia só ele', () => {
    expect(filterEvents(events, { ...all, floresta: false })).toHaveLength(0);
    expect(filterFarm(farm, { ...all, lavoura: false })).toHaveLength(0);
    expect(filterFarm(farm, all).length).toBeGreaterThan(0);
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
    const t = totals(ev, farm);
    expect(t.florestaN).toBe(ev.length);
    expect(Math.round(t.lavouraHa)).toBe(Math.round(farm.reduce((a, r) => a + r[4], 0)));
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
