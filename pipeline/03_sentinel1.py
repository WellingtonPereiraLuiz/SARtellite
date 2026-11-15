"""Sentinel-1 RTC (banda C) na área de demonstração.

Fonte: Microsoft Planetary Computer, coleção `sentinel-1-rtc` (gamma0 com
correção radiométrica de terreno, 10 m). Lemos VV e VH já reamostrados por
média para 20 m (reduz o speckle), convertemos para dB e exportamos uma
imagem VH por passagem (o VV entra só nas estatísticas). O site calcula a diferença entre duas datas quaisquer.
"""
import numpy as np
from scipy.ndimage import uniform_filter

import config as C
import lib

VH_RANGE = (-26.0, -8.0)   # dB mapeados em 1..255


def smooth(p, n=3):
    m = ~np.isfinite(p) | (p <= 0)
    s = uniform_filter(np.where(m, 0, p), n)
    w = uniform_filter((~m).astype("float32"), n)
    return np.where(w > 0.5, s / np.maximum(w, 1e-6), np.nan)


def main():
    _, w, h, bounds = lib.aoi_grid()
    items = lib.stac_search("sentinel-1-rtc", lib.bbox_lonlat(bounds), C.T0, C.T1)
    out, stack = [], {}
    for it in items:
        p = it["properties"]
        date = p["datetime"][:10]
        vh = smooth(lib.read_to_grid(it["assets"]["vh"]["href"]).astype("float32"))
        vv = smooth(lib.read_to_grid(it["assets"]["vv"]["href"]).astype("float32"))
        valid = float(np.isfinite(vh).mean())
        if valid < 0.98:
            print("pula", date, "cobertura", round(valid, 3))
            continue
        vh_db, vv_db = lib.to_db(vh), lib.to_db(vv)
        stack[date] = vh_db
        name = f"s1/s1_vh_{date.replace('-', '')}.webp"
        size = lib.save_webp(lib.scale_u8(vh_db, *VH_RANGE), C.OUT_AOI / name, quality=80)
        out.append({
            "id": f"s1-{date}", "sensor": "Sentinel-1", "band": "C (5,6 cm)", "product": "RTC gamma0",
            "product_id": it["id"], "acquired_at": p["datetime"], "platform": p.get("platform"),
            "orbit_state": p.get("sat:orbit_state"), "relative_orbit": p.get("sat:relative_orbit"),
            "polarizations": p.get("sar:polarizations"), "resolution_m": C.RES, "native_resolution_m": 10,
            "image_vh": name, "db_range_vh": VH_RANGE,
            "valid_fraction": round(valid, 4),
            "mean_vh_db": round(float(np.nanmean(vh_db)), 2), "mean_vv_db": round(float(np.nanmean(vv_db)), 2),
            "source_url": f"https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-1-rtc/items/{it['id']}",
            "is_synthetic": False,
        })
        print(date, it["id"][:40], "VH médio", out[-1]["mean_vh_db"], f"{size/1e3:.0f} kB")
    C.CACHE_AOI.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(C.CACHE_AOI / "s1_vh_db.npz", **{k.replace("-", ""): v.astype("float32") for k, v in stack.items()})
    lib.write_json(out, C.CACHE_AOI / "s1_scenes.json")


if __name__ == "__main__":
    main()
