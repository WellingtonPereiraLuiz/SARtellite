import type { Corners, CustomArea, LngLat } from './types';

export interface CoordCheck { ok: boolean; lat?: number; lon?: number; error?: string }

/** Aceita "-11,797" ou "-11.797". Latitude em [-90, 90], longitude em [-180, 180]. */
export function parseCoord(latText: string, lonText: string): CoordCheck {
  const num = (t: string) => (t.trim() === '' ? NaN : Number(t.trim().replace(',', '.')));
  const lat = num(latText);
  const lon = num(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: 'Digite latitude e longitude em graus decimais, por exemplo -11,797 e -62,791.' };
  if (lat < -90 || lat > 90) return { ok: false, error: 'A latitude precisa ficar entre -90 e 90.' };
  if (lon < -180 || lon > 180) return { ok: false, error: 'A longitude precisa ficar entre -180 e 180.' };
  return { ok: true, lat, lon };
}

/** Lê um par colado no formato "lat, lon" (vírgula decimal ou ponto). */
export function splitPair(text: string): [string, string] | null {
  const m = text.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (m) return [m[1], m[2]];
  const parts = text.trim().split(/\s*[;]\s*|\s+/);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

const KM_PER_DEG = 111.32;

export function areaCorners(a: CustomArea): Corners {
  const dLat = a.radiusKm / KM_PER_DEG;
  const dLon = a.radiusKm / (KM_PER_DEG * Math.cos((a.lat * Math.PI) / 180));
  return [[a.lon - dLon, a.lat + dLat], [a.lon + dLon, a.lat + dLat], [a.lon + dLon, a.lat - dLat], [a.lon - dLon, a.lat - dLat]];
}

/** Área do quadrado de lado 2r em hectares (1 km² = 100 ha). */
export const squareAreaHa = (radiusKm: number) => (2 * radiusKm) ** 2 * 100;

export function areaFromBox(a: LngLat, b: LngLat): CustomArea {
  const lat = (a[1] + b[1]) / 2;
  const lon = (a[0] + b[0]) / 2;
  const hKm = (Math.abs(a[1] - b[1]) / 2) * KM_PER_DEG;
  const wKm = (Math.abs(a[0] - b[0]) / 2) * KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  return { lat, lon, radiusKm: Math.max(0.5, Math.round(Math.max(hKm, wKm) * 10) / 10) };
}

export function pointInPolygon(p: LngLat, poly: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type Coverage = 'full' | 'partial' | 'none';

/** Uma área só conta como coberta se os 4 cantos caem dentro de TODAS as pegadas. */
export function coverage(corners: Corners, footprints: LngLat[][]): Coverage {
  const pts: LngLat[] = [...corners, [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2]];
  const hits = pts.filter((p) => footprints.every((f) => pointInPolygon(p, f))).length;
  return hits === pts.length ? 'full' : hits > 0 ? 'partial' : 'none';
}

export function boundsOf(corners: LngLat[]): [[number, number], [number, number]] {
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

export const fmtCoord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4).replace('.', ',')}° ${v >= 0 ? pos : neg}`;
