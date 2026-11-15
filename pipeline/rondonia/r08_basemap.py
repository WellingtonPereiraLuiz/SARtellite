"""Mapa base plano de Rondônia: cobertura do solo simplificada em Web Mercator.

Verde = floresta, bege = lavoura, palha = campo e pasto, azul = água,
cinza = cidade. Fora de Rondônia fica transparente (o site escurece).
"""
import numpy as np
from affine import Affine
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject, transform_bounds

from common import CACHE, OUT, RO_BBOX, read_json, write_json

COLORS = {1: (64, 139, 196), 2: (46, 104, 72), 4: (78, 128, 112), 5: (214, 196, 140), 7: (150, 150, 150),
          8: (196, 170, 140), 11: (184, 182, 128)}


def main():
    meta = read_json(CACHE / "lulc_meta.json")
    lulc = np.load(CACHE / "lulc_180m.npy")
    inro = np.load(CACHE / "detect.npz")["inro"]
    w, s, e, n = RO_BBOX
    mb = transform_bounds("EPSG:4326", "EPSG:3857", w, s, e, n)
    W = 2400
    H = round(W * (mb[3] - mb[1]) / (mb[2] - mb[0]))
    dst = from_bounds(*mb, W, H)
    out = np.zeros((H, W), "uint8")
    reproject(np.where(inro, lulc, 0).astype("uint8"), out, src_transform=Affine(*meta["transform"]), src_crs="EPSG:32720",
              dst_transform=dst, dst_crs="EPSG:3857", resampling=Resampling.mode)
    rgba = np.zeros((H, W, 4), "uint8")
    for k, c in COLORS.items():
        rgba[out == k] = (*c, 255)
    Image.fromarray(rgba).save(OUT / "ro" / "landcover.png", optimize=True)
    # onde o radar consegue procurar floresta derrubada (quadros HV aprovados)
    det = read_json(CACHE / "detect_meta.json")
    cov = np.zeros(lulc.shape, "uint8")
    for f, q in det["qc"].items():
        if "skipped" in q or q.get("forest_flag_rate") is None:
            continue
        z = np.load(CACHE / "stacks_hv" / f"{f}.npz")
        r0, r1, c0, c1 = z["win"]
        cov[r0:r1, c0:c1] |= ((z["S"] > 0).sum(0) >= 6).astype("uint8")
    cov = (cov == 0) & inro
    co = np.zeros((H, W), "uint8")
    reproject(cov.astype("uint8"), co, src_transform=Affine(*meta["transform"]), src_crs="EPSG:32720",
              dst_transform=dst, dst_crs="EPSG:3857", resampling=Resampling.nearest)
    yy, xx = np.mgrid[0:H, 0:W]
    stripe = ((xx + yy) // 6) % 2 == 0
    hatch = np.zeros((H, W, 4), "uint8")
    hatch[(co == 1) & stripe] = (11, 20, 27, 110)
    Image.fromarray(hatch).save(OUT / "ro" / "nocoverage.png", optimize=True)
    share = float(cov.sum() / inro.sum())
    print("Rondônia sem cobertura para floresta:", round(share * 100, 1), "%")
    ll = transform_bounds("EPSG:3857", "EPSG:4326", *mb)
    write_json({"image": "ro/landcover.png", "corners": [[ll[0], ll[3]], [ll[2], ll[3]], [ll[2], ll[1]], [ll[0], ll[1]]],
                "year": meta["year"], "nocoverage": "ro/nocoverage.png", "nocoverage_share": round(share, 3), "source": "Impact Observatory / Microsoft / Esri, cobertura do solo 10 m"}, OUT / "ro" / "landcover.json")
    print("landcover.png", W, H, (OUT / "ro" / "landcover.png").stat().st_size // 1000, "kB")


if __name__ == "__main__":
    main()
