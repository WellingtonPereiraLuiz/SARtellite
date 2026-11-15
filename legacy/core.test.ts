import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildScenes, stepScene } from '../data';
import { diffDb } from '../delta';
import { areaCorners, areaFromBox, coverage, parseCoord, pointInPolygon, splitPair, squareAreaHa } from '../geo';
import { daysBetween, fmtDate } from '../time';
import type { Manifest } from '../types';

// document.baseURI não existe no Node: as URLs não importam para estes testes
(globalThis as unknown as { document: { baseURI: string } }).document = { baseURI: 'http://localhost/' };
const manifest = JSON.parse(readFileSync('public/data/manifest.json', 'utf8')) as Manifest;
const footprints = Object.values(manifest.nisar_frame.footprints);

describe('coordenadas', () => {
  it('aceita vírgula ou ponto decimal', () => {
    expect(parseCoord('-11,797', '-62.7906')).toMatchObject({ ok: true, lat: -11.797, lon: -62.7906 });
  });
  it('recusa latitude e longitude fora dos limites', () => {
    expect(parseCoord('91', '0').ok).toBe(false);
    expect(parseCoord('-90.01', '0').ok).toBe(false);
    expect(parseCoord('0', '180.5').ok).toBe(false);
    expect(parseCoord('0', '-181').ok).toBe(false);
    expect(parseCoord('90', '-180').ok).toBe(true);
  });
  it('recusa texto vazio ou não numérico', () => {
    expect(parseCoord('', '-62').ok).toBe(false);
    expect(parseCoord('abc', '-62').ok).toBe(false);
  });
  it('separa um par colado', () => {
    expect(splitPair('-11.9886, -62.4846')).toEqual(['-11.9886', '-62.4846']);
    expect(splitPair('-11,9886; -62,4846')).toEqual(['-11,9886', '-62,4846']);
  });
});

describe('área e cobertura', () => {
  it('calcula a área do quadrado em hectares', () => {
    expect(squareAreaHa(15)).toBe(90000);
  });
  it('retângulo desenhado vira centro e raio', () => {
    const a = areaFromBox([-62.6, -11.9], [-62.4, -12.1]);
    expect(a.lat).toBeCloseTo(-12, 5);
    expect(a.lon).toBeCloseTo(-62.5, 5);
    expect(a.radiusKm).toBeGreaterThan(10);
  });
  it('as áreas processadas estão dentro das duas pegadas NISAR', () => {
    for (const a of manifest.aois) expect(coverage(a.corners, footprints)).toBe('full');
  });
  it('coordenada fora do quadro não ganha cenas', () => {
    expect(coverage(areaCorners({ lat: -3.1, lon: -60.0, radiusKm: 15 }), footprints)).toBe('none');
    expect(coverage(areaCorners({ lat: -9.8, lon: -63.7, radiusKm: 15 }), footprints)).toBe('partial');
  });
  it('ponto em polígono', () => {
    expect(pointInPolygon([0.5, 0.5], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
    expect(pointInPolygon([1.5, 0.5], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
  });
});

describe('linha do tempo', () => {
  const scenes = buildScenes(manifest, manifest.aois[0]);
  it('usa só datas reais do manifest, em ordem', () => {
    const total = manifest.aois[0].scenes.nisar.length + manifest.aois[0].scenes.s1.length + manifest.aois[0].scenes.s2.length;
    expect(scenes).toHaveLength(total);
    expect([...scenes].sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt))).toEqual(scenes);
  });
  it('o par NISAR é 18 jun e 28 out 2026, 132 dias', () => {
    const n = scenes.filter((s) => s.key === 'nisar');
    expect(n.map((s) => s.date)).toEqual(['2026-06-18', '2026-10-28']);
    expect(daysBetween(n[0].date, n[1].date)).toBe(132);
    expect(fmtDate(n[0].date)).toBe('18 jun 2026');
  });
  it('o passo fica no mesmo sensor e dá a volta', () => {
    const s1 = scenes.filter((s) => s.key === 's1');
    expect(stepScene(scenes, s1[0].id, 1, true).id).toBe(s1[1].id);
    expect(stepScene(scenes, s1[s1.length - 1].id, 1, true).id).toBe(s1[0].id);
    expect(stepScene(scenes, s1[0].id, -1, true).id).toBe(s1[s1.length - 1].id);
  });
  it('área fora das processadas só lista NISAR', () => {
    expect(buildScenes(manifest, null).every((s) => s.key === 'nisar')).toBe(true);
  });
  it('nenhuma cena é sintética', () => {
    expect(manifest.is_demo).toBe(false);
    for (const a of manifest.aois) for (const s of [...a.scenes.nisar, ...a.scenes.s1, ...a.scenes.s2]) expect((s as unknown as { is_synthetic: boolean }).is_synthetic).toBe(false);
  });
});

describe('diferença em dB', () => {
  it('converte níveis de cinza em dB e centra na mediana', () => {
    const a = [100, 0, 0, 255, 100, 0, 0, 255, 100, 0, 0, 255];
    const b = [100, 0, 0, 255, 58, 0, 0, 255, 100, 0, 0, 255];
    const { d, offset } = diffDb(a, b, [-26, -8]);
    expect(offset).toBe(0);
    expect(d[1]).toBeCloseTo((-42 * 18) / 254, 4); // cerca de -2,98 dB
  });
  it('pixel sem dado (zero) não entra na conta', () => {
    const { d } = diffDb([0, 0, 0, 255], [80, 0, 0, 255], [-26, -8]);
    expect(Number.isNaN(d[0])).toBe(true);
  });
});
