"""Georreferencia as prévias NISAR (HH, frequência A) e compara as duas datas.

O QUE ESTAS IMAGENS SÃO: prévias públicas de 8 bits distribuídas pela ASF
junto de cada GCOV, com cerca de 180 m por pixel. São dado real da missão,
mas NÃO são o retroespalhamento calibrado em dB do HDF5. Por isso a camada
de diferença gerada aqui é chamada de "diferença de brilho da prévia" e não
recebe hectares nem a palavra desmatamento.

Passos:
1. Lê o retângulo UTM do KML de outubro e confere que é uma grade de 180 m.
2. Confere por correlação de fase que junho usa a mesma grade (o KML de
   junho exige login). Deslocamento esperado: 0 px.
3. Reprojeta para Web Mercator (EPSG:3857) para o mapa.
4. Diferença outubro - junho após média 3x3, centrada na mediana do quadro.
5. Recorta as duas datas e a diferença na grade da área de demonstração.
"""
import json
import re

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_bounds, from_origin
from rasterio.warp import Resampling, reproject, transform_bounds
from scipy.ndimage import binary_erosion, uniform_filter

import config as C
import lib

ORANGE, TEAL = (246, 162, 79), (57, 198, 195)
FLOOR, FULL = 22.0, 70.0   # níveis de cinza (DN) onde a cor começa e satura


def utm_rect(kml_path):
    txt = kml_path.read_text()
    pts = [tuple(map(float, p.split(","))) for p in re.search(r"<coordinates>(.*?)</coordinates>", txt, re.S).group(1).split()]
    xy = [lib.TO_UTM.transform(*p) for p in pts]
    xs, ys = [round(p[0] / 10) * 10 for p in xy], [round(p[1] / 10) * 10 for p in xy]
    return min(xs), min(ys), max(xs), max(ys)


def phase_shift(a, b, half=400):
    v = (a > 0) & (b > 0)
    ys, xs = np.where(v)
    cy, cx = (ys.min() + ys.max()) // 2, (xs.min() + xs.max()) // 2
    A, B = a[cy - half:cy + half, cx - half:cx + half], b[cy - half:cy + half, cx - half:cx + half]
    F = np.fft.fft2(A - A.mean()) * np.conj(np.fft.fft2(B - B.mean()))
    c = np.fft.ifft2(F / (np.abs(F) + 1e-9)).real
    i = np.unravel_index(c.argmax(), c.shape)
    return [int(k if k < half else k - 2 * half) for k in i], float(c.max())


def colorize(d, valid):
    rgba = np.zeros(d.shape + (4,), "uint8")
    mag = np.clip((np.abs(d) - FLOOR) / (FULL - FLOOR), 0, 1)
    for mask, col in ((d < 0, ORANGE), (d > 0, TEAL)):
        m = mask & valid & (mag > 0)
        rgba[m, :3] = col
        rgba[m, 3] = (90 + 150 * mag[m]).astype("uint8")
    return rgba


def gray_rgba(g, valid):
    return np.dstack([g, g, g, np.where(valid, 255, 0)]).astype("uint8")


def main():
    meta = json.loads((C.CACHE / "nisar_meta.json").read_text())
    jun, oct_ = meta[0], meta[1]
    a = np.asarray(Image.open(C.CACHE / "nisar" / "20260618_NATIVE_A_HHHH.png")).astype("float32")
    b = np.asarray(Image.open(C.CACHE / "nisar" / "20261028_NATIVE_A_HHHH.png")).astype("float32")
    x0, y0, x1, y1 = utm_rect(C.CACHE / "nisar" / "20261028_NATIVE_A_HHHH.kml")
    h, w = b.shape
    px = ((x1 - x0) / w, (y1 - y0) / h)
    shift, peak = phase_shift(a, b)
    print("retângulo UTM", (x0, y0, x1, y1), "pixel", px, "| deslocamento jun x out", shift, "pico", round(peak, 3))
    assert a.shape == b.shape and shift == [0, 0], "as duas prévias não compartilham a grade"
    src_tr = from_origin(x0, y1, px[0], px[1])
    src_crs = f"EPSG:{C.EPSG}"

    valid = binary_erosion((a > 0) & (b > 0), iterations=6)
    d = uniform_filter(b, 3) - uniform_filter(a, 3)
    offset = float(np.median(d[valid]))
    d = np.where(valid, d - offset, 0)

    # ---- quadro inteiro em Web Mercator ----
    mb = transform_bounds(src_crs, "EPSG:3857", x0, y0, x1, y1, densify_pts=41)
    W = 1900
    H = round(W * (mb[3] - mb[1]) / (mb[2] - mb[0]))
    dst_tr = from_bounds(*mb, W, H)

    def warp(src, tr, crs, shape, resampling):
        out = np.zeros(shape, "float32")
        reproject(src, out, src_transform=src_tr, src_crs=src_crs, dst_transform=tr, dst_crs=crs, resampling=resampling)
        return out

    ll = transform_bounds("EPSG:3857", "EPSG:4326", *mb)
    corners = [[ll[0], ll[3]], [ll[2], ll[3]], [ll[2], ll[1]], [ll[0], ll[1]]]
    sizes = {}
    for tag, img in (("20260618", a), ("20261028", b)):
        g = warp(img, dst_tr, "EPSG:3857", (H, W), Resampling.bilinear)
        v = warp((img > 0).astype("float32"), dst_tr, "EPSG:3857", (H, W), Resampling.nearest) > 0.5
        sizes[tag] = lib.save_webp(gray_rgba(g, v), C.OUT / f"nisar/nisar_hh_{tag}.webp", quality=84)
    dW = warp(d, dst_tr, "EPSG:3857", (H, W), Resampling.bilinear)
    vW = warp(valid.astype("float32"), dst_tr, "EPSG:3857", (H, W), Resampling.nearest) > 0.5
    sizes["diff"] = lib.save_webp(colorize(dW, vW), C.OUT / "nisar/nisar_diff.webp", quality=88)

    # ---- recorte na grade da área de demonstração (20 m, UTM) ----
    tr, n, _, bounds = lib.aoi_grid()
    for tag, img in (("20260618", a), ("20261028", b)):
        g = warp(img, tr, src_crs, (n, n), Resampling.bilinear)
        lib.save_webp(g.astype("uint8"), C.OUT_AOI / f"nisar/aoi_hh_{tag}.webp", quality=82)
    dA = warp(d, tr, src_crs, (n, n), Resampling.bilinear)
    vA = warp(valid.astype("float32"), tr, src_crs, (n, n), Resampling.nearest) > 0.5
    lib.save_webp(colorize(dA, vA), C.OUT_AOI / "nisar/aoi_diff.webp", quality=88)
    C.CACHE_AOI.mkdir(parents=True, exist_ok=True)
    np.save(C.CACHE_AOI / "nisar_aoi_diff.npy", dA.astype("float32"))

    info = {
        "utm_rect": [x0, y0, x1, y1], "epsg": C.EPSG, "pixel_m": px[0], "shape": [h, w],
        "grid_check": {"method": "correlação de fase, janela 800 px", "shift_px": shift, "peak": round(peak, 3)},
        "frame_corners": [[round(v, 6) for v in c] for c in corners],
        "aoi_fully_covered": bool(vA.mean() > 0.999),
        "diff": {"offset_dn": round(offset, 2), "floor_dn": FLOOR, "full_dn": FULL,
                 "share_drop": round(float(((d < -FLOOR) & valid).sum() / valid.sum()), 4),
                 "share_rise": round(float(((d > FLOOR) & valid).sum() / valid.sum()), 4),
                 "method": "média 3x3, outubro menos junho, centrado na mediana da área comum"},
    }
    lib.write_json(info, C.CACHE_AOI / "nisar_overlay.json")
    print(info["diff"], "AOI coberta:", info["aoi_fully_covered"], {k: f"{v/1e3:.0f} kB" for k, v in sizes.items()})


if __name__ == "__main__":
    main()
