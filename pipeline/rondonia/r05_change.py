"""Detecção de mudanças com a série NISAR de cada quadro.

Para cada quadro com grade confiável, todas as passagens (HH, prévia de 8 bits)
vão para a grade do estado (UTM 20S, 180 m). Depois:

1. Normalização: cada data é deslocada para a mediana da série (desconta
   diferenças de ajuste entre prévias e de umidade geral).
2. Média 3x3 com tratamento de borda.
3. FLORESTA DERRUBADA, só em pixels da classe Árvores:
   - linha de base = média das duas primeiras passagens, e ela precisa ser
     clara (>= BASE_MIN), como floresta;
   - detecção = primeira passagem com queda >= DROP;
   - persistência = a queda continua >= KEEP em TODAS as passagens seguintes.
     Sem passagem seguinte, fica como "recente" (ainda não confirmada).
4. LAVOURA, só em pixels da classe Lavoura: entre passagens seguidas, a maior
   mudança (queda ou alta >= CROP) e a data em que aconteceu.
"""
import numpy as np
from affine import Affine
from PIL import Image
from rasterio.warp import Resampling, reproject
from rasterio.transform import from_origin
from scipy.ndimage import binary_erosion, uniform_filter

import os

from common import CACHE, EPSG, read_json, write_json

POL = os.environ.get("SART_POL", "HH")  # HH (padrão) ou HV
SRC = "nisar" if POL == "HH" else "nisar_hv"
STK = "stacks" if POL == "HH" else "stacks_hv"
SUF = "" if POL == "HH" else "_hv"

BASE_MIN, DROP, KEEP, CROP = 190, 50, 35, 45


def usable(g):
    return g["source"] in ("kml", "estimated+refined")


def smooth(a):
    m = np.isfinite(a)
    s = uniform_filter(np.where(m, a, 0), 3)
    w = uniform_filter(m.astype("float32"), 3)
    return np.where(w > 0.6, s / np.maximum(w, 1e-6), np.nan)


def main():
    inv = read_json(CACHE / "inventory.json")
    grids = read_json(CACHE / "grids.json")["grids"]
    meta = read_json(CACHE / "lulc_meta.json")
    lulc = np.load(CACHE / "lulc_180m.npy")
    H, W = lulc.shape
    st = Affine(*meta["transform"])
    trees, crops = lulc == 2, lulc == 5
    INF = 99999999
    f_date = np.full((H, W), INF, "int32")          # primeira data de derrubada (AAAAMMDD)
    f_keep = np.zeros((H, W), "int8")               # passagens que confirmaram
    f_frames = np.zeros((H, W), "int8")             # quadros que viram
    f_drop = np.zeros((H, W), "float32")
    c_date = np.zeros((H, W), "int32")              # data da maior mudança na lavoura
    c_mag = np.zeros((H, W), "float32")             # mudança com sinal
    covered = np.zeros((H, W), "int16")             # passagens por pixel (cobertura)
    used = {}
    for f, g in sorted(grids.items()):
        if not usable(g):
            continue
        dates = sorted(p["date"] for p in inv["passes"] if p["frame"] == f and p["browse_ok"] and (CACHE / SRC / f / f"{p['date']}.png").exists())
        if len(dates) < 3:
            continue
        stack = []
        for d in dates:
            a = np.asarray(Image.open(CACHE / SRC / f / f"{d}.png")).astype("float32")
            v = binary_erosion(a > 0, iterations=4)
            a = np.where(v, a, 0)
            out = np.zeros((H, W), "float32")
            reproject(a, out, src_transform=from_origin(g["x0"], g["y1"], g["px_x"], g["px_y"]), src_crs=f"EPSG:{32700 + g['zone']}",
                      dst_transform=st, dst_crs=f"EPSG:{EPSG}", resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
            stack.append(np.where(out > 0, out, np.nan))
        S = np.stack(stack)
        rows = np.where(np.isfinite(S).any(axis=(0, 2)))[0]
        cols = np.where(np.isfinite(S).any(axis=(0, 1)))[0]
        r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
        S = S[:, r0:r1, c0:c1]
        ref = np.nanmedian(S, axis=0)
        for k in range(len(S)):
            dlt = S[k] - ref
            S[k] = smooth(S[k] - np.nanmedian(dlt))
        win = (slice(r0, r1), slice(c0, c1))
        covered[win] += np.isfinite(S).sum(0).astype("int16")
        (CACHE / STK).mkdir(exist_ok=True)
        np.savez_compressed(CACHE / STK / f"{f}.npz",
                            S=np.where(np.isfinite(S), S, 0).clip(0, 255).astype("uint8"), win=np.array([r0, r1, c0, c1]), dates=np.array(dates))
        dint = np.array([int(d.replace("-", "")) for d in dates])

        # ---- floresta derrubada ----
        base = np.nanmean(S[:2], axis=0)
        tr = trees[win] & (base >= BASE_MIN)
        det = np.full(base.shape, INF, "int32")
        keep = np.zeros(base.shape, "int8")
        mag = np.zeros(base.shape, "float32")
        for k in range(2, len(S)):
            drop = base - S[k]
            hit = tr & (drop >= DROP) & (det == INF)
            later = S[k + 1:]
            if len(later):
                ok = np.all(~np.isfinite(later) | ((base - later) >= KEEP), axis=0)
                nl = np.sum(np.isfinite(later) & ((base - later) >= KEEP), axis=0)
                hit &= ok
            else:
                nl = np.zeros(base.shape, "int8")
            det = np.where(hit, dint[k], det)
            keep = np.where(hit, nl, keep).astype("int8")
            mag = np.where(hit, drop, mag)
        new = det < INF
        fd = f_date[win]
        f_frames[win] += new.astype("int8")
        better = new & (det < fd)
        f_date[win] = np.where(better, det, fd)
        f_keep[win] = np.where(new, np.maximum(f_keep[win], keep), f_keep[win])
        f_drop[win] = np.where(new, np.maximum(f_drop[win], mag), f_drop[win])

        # ---- lavoura ----
        cr = crops[win]
        best = np.zeros(base.shape, "float32"); bdate = np.zeros(base.shape, "int32")
        for k in range(1, len(S)):
            dd = S[k] - S[k - 1]
            big = cr & np.isfinite(dd) & (np.abs(dd) >= CROP) & (np.abs(dd) > np.abs(best))
            best = np.where(big, dd, best); bdate = np.where(big, dint[k], bdate)
        upd = (np.abs(best) > np.abs(c_mag[win]))
        c_mag[win] = np.where(upd, best, c_mag[win]); c_date[win] = np.where(upd, bdate, c_date[win])
        used[f] = dates
        print(f, len(dates), "passagens | floresta derrubada px:", int(new.sum()), "| lavoura px:", int((np.abs(best) > 0).sum()))
    f_date[f_date == INF] = 0
    np.savez_compressed(CACHE / f"change{SUF}.npz", f_date=f_date, f_keep=f_keep, f_frames=f_frames, f_drop=f_drop,
                        c_date=c_date, c_mag=c_mag, covered=covered)
    write_json({"frames_used": used, "params": {"BASE_MIN": BASE_MIN, "DROP": DROP, "KEEP": KEEP, "CROP": CROP}}, CACHE / f"change_meta{SUF}.json")
    ro_cov = covered > 0
    print("frames usados:", len(used), "| pixels com floresta derrubada:", int((f_date > 0).sum()), "≈", int((f_date > 0).sum() * 3.24), "ha")


if __name__ == "__main__":
    main()
