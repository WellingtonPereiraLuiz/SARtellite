import type { S1Scene } from './types';

export interface DeltaResult {
  url: string; dropHa: number; riseHa: number; offsetDb: number; thresholdDb: number; pixelM: number; areaHa: number;
}

const SIZE = 750; // a diferença é calculada a 40 m (média 2x2 da grade de 20 m) para reduzir o speckle
const FLOOR = 2.0; // dB onde a cor começa
const FULL = 6.0; // dB onde a cor satura
export const DELTA_THRESHOLD_DB = -3;

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`não foi possível carregar ${url}`));
    im.src = url;
  });
}

function pixels(im: HTMLImageElement): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, 0, 0, SIZE, SIZE);
  return ctx.getImageData(0, 0, SIZE, SIZE).data;
}

/** Converte o par de níveis de cinza em diferença de dB (b - a), centrada na mediana da área. */
export function diffDb(a: ArrayLike<number>, b: ArrayLike<number>, range: [number, number], stride = 4): { d: Float32Array; offset: number } {
  const n = a.length / stride;
  const k = (range[1] - range[0]) / 254;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const va = a[i * stride];
    const vb = b[i * stride];
    d[i] = va === 0 || vb === 0 ? NaN : (vb - va) * k;
  }
  const sorted = Float32Array.from(d).filter((v) => !Number.isNaN(v)).sort();
  const offset = sorted.length ? sorted[sorted.length >> 1] : 0;
  for (let i = 0; i < n; i++) d[i] -= offset;
  return { d, offset };
}

/** Diferença Sentinel-1 VH entre duas datas quaisquer, calculada no navegador. */
export async function computeDelta(urlA: string, urlB: string, a: S1Scene, sizeKm: number): Promise<DeltaResult> {
  const [ia, ib] = await Promise.all([load(urlA), load(urlB)]);
  const { d, offset } = diffDb(pixels(ia), pixels(ib), a.db_range_vh);
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  let drop = 0;
  let rise = 0;
  for (let i = 0; i < d.length; i++) {
    const v = d[i];
    if (Number.isNaN(v)) continue;
    if (v < DELTA_THRESHOLD_DB) drop++;
    if (v > -DELTA_THRESHOLD_DB) rise++;
    const mag = Math.min(1, Math.max(0, (Math.abs(v) - FLOOR) / (FULL - FLOOR)));
    if (mag <= 0) continue;
    const o = i * 4;
    if (v < 0) { img.data[o] = 246; img.data[o + 1] = 162; img.data[o + 2] = 79; } else { img.data[o] = 57; img.data[o + 1] = 198; img.data[o + 2] = 195; }
    img.data[o + 3] = 90 + 150 * mag;
  }
  ctx.putImageData(img, 0, 0);
  const pixelM = (sizeKm * 1000) / SIZE;
  const ha = (pixelM * pixelM) / 1e4;
  return { url: c.toDataURL('image/png'), dropHa: drop * ha, riseHa: rise * ha, offsetDb: offset, thresholdDb: DELTA_THRESHOLD_DB, pixelM, areaHa: sizeKm * sizeKm * 100 };
}
