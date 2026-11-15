import type { Aoi, Corners, FiresFile, Manifest, Scene } from './types';

/** Tudo é servido da pasta data/ ao lado do index.html: funciona offline e em subpastas. */
export function dataUrl(path: string): string {
  try {
    return new URL(`data/${path}`, document.baseURI).href;
  } catch {
    return `data/${path}`; // base sem URL válida (página embutida): cai no caminho relativo
  }
}

export async function loadManifest(): Promise<Manifest> {
  const r = await fetch(dataUrl('manifest.json'));
  if (!r.ok) throw new Error(`manifest.json respondeu ${r.status}`);
  const m = (await r.json()) as Manifest;
  if (!Array.isArray(m.aois) || !m.nisar_frame) throw new Error('manifest.json fora do contrato esperado');
  return m;
}

export async function loadFires(m: Manifest): Promise<FiresFile> {
  const r = await fetch(dataUrl(m.fires.file));
  if (!r.ok) throw new Error(`fires.json respondeu ${r.status}`);
  return (await r.json()) as FiresFile;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Junta as cenas dos três sensores em ordem de aquisição. aoi = null: só o quadro NISAR. */
export function buildScenes(m: Manifest, aoi: Aoi | null): Scene[] {
  const frame = m.nisar_frame;
  const src = aoi ?? m.aois[0];
  const out: Scene[] = src.scenes.nisar.map((s) => ({
    id: s.id, key: 'nisar', sensorLabel: 'NISAR banda L', date: s.acquired_at.slice(0, 10), acquiredAt: s.acquired_at,
    title: 'NISAR HH', image: dataUrl(s.image_frame), corners: frame.image_corners as Corners, evidence: s.evidence,
    quality: s.processing_maturity === 'VALIDATED' ? 'produto validado' : 'produto provisório', raw: s,
  }));
  if (aoi) {
    for (const s of aoi.scenes.s1) {
      out.push({
        id: s.id, key: 's1', sensorLabel: 'Sentinel-1 banda C', date: s.acquired_at.slice(0, 10), acquiredAt: s.acquired_at,
        title: 'Sentinel-1 VH', image: dataUrl(`${aoi.id}/${s.image_vh}`), corners: aoi.corners, evidence: s.evidence,
        quality: `órbita relativa ${s.relative_orbit}`, orbit: s.relative_orbit, raw: s,
      });
    }
    for (const s of aoi.scenes.s2) {
      out.push({
        id: s.id, key: 's2', sensorLabel: 'Sentinel-2 óptico', date: s.acquired_at.slice(0, 10), acquiredAt: s.acquired_at,
        title: 'Sentinel-2 cor verdadeira', image: dataUrl(`${aoi.id}/${s.image_rgb}`), corners: aoi.corners, evidence: s.evidence,
        quality: `${pct(s.cloud_fraction_aoi)} de nuvem na área`, raw: s,
      });
    }
  }
  return out.sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
}

export const sceneById = (scenes: Scene[], id: string | null) => scenes.find((s) => s.id === id) ?? null;

/** Passo da linha do tempo: próxima ou anterior aquisição, opcionalmente só do mesmo sensor. */
export function stepScene(scenes: Scene[], currentId: string, dir: 1 | -1, sameSensor: boolean): Scene {
  const cur = sceneById(scenes, currentId)!;
  const pool = sameSensor ? scenes.filter((s) => s.key === cur.key) : scenes;
  const i = pool.findIndex((s) => s.id === currentId);
  return pool[(i + dir + pool.length) % pool.length];
}
