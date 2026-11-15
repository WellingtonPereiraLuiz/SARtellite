"""Sentinel-2 L2A (óptico) na área de demonstração.

Fonte: Microsoft Planetary Computer, coleção `sentinel-2-l2a`.
Para cada mês escolhemos a passagem com menos nuvem SOBRE A ÁREA (medida na
classificação de cena SCL do próprio produto). Também guardamos a passagem
mais próxima de cada aquisição NISAR, mesmo nublada: é a prova de que o
óptico nem sempre enxerga.
Saídas por data: cor verdadeira, máscara de água (SCL = 6) e NDVI (cache).
"""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date as D

import numpy as np

import config as C
import lib

NISAR_DATES = ["2026-06-18", "2026-10-28"]
CLOUD = (8, 9, 10)      # SCL: nuvem média, nuvem alta, cirrus
SHADOW = (3,)
WATER = 6


def mosaic(items, key, resampling="average"):
    out = None
    for it in items:
        a = lib.read_to_grid(it["assets"][key]["href"], resampling=resampling).astype("float32")
        out = a if out is None else np.where(out > 0, out, a)
    return out


def main():
    _, w, h, bounds = lib.aoi_grid()
    items = lib.stac_search("sentinel-2-l2a", lib.bbox_lonlat(bounds), C.T0, C.T1)
    by_date = defaultdict(list)
    for it in items:
        by_date[it["properties"]["datetime"][:10]].append(it)
    print(len(items), "itens em", len(by_date), "datas")

    def near(d, ref):
        return abs((D.fromisoformat(d) - D.fromisoformat(ref)).days)

    nearest = {min(by_date, key=lambda d: near(d, r)) for r in NISAR_DATES}
    cand = [d for d, its in by_date.items() if min(i["properties"]["eo:cloud_cover"] for i in its) < 35 or d in nearest]

    def scl_stats(d):
        scl = mosaic(by_date[d], "SCL", "nearest")
        valid = scl > 0
        cloud = np.isin(scl, CLOUD + SHADOW) & valid
        return d, float(valid.mean()), float(cloud.sum() / max(valid.sum(), 1)), scl

    with ThreadPoolExecutor(6) as ex:
        stats = list(ex.map(scl_stats, sorted(cand)))
    table = [{"date": d, "coverage": round(v, 3), "cloud_fraction_aoi": round(c, 4)} for d, v, c, _ in stats]
    for r in table:
        print(r)
    full = [s for s in stats if s[1] > 0.99]
    chosen = {}
    for month in sorted({s[0][:7] for s in full}):
        best = min((s for s in full if s[0][:7] == month), key=lambda s: s[2])
        if best[2] < 0.15:
            chosen[best[0]] = best
    for d in nearest:
        s = next((s for s in full if s[0] == d), None)
        if s:
            chosen[d] = s

    out, ndvi_cache = [], {}
    for d in sorted(chosen):
        _, _, cloud, scl = chosen[d]
        its = by_date[d]
        with ThreadPoolExecutor(5) as ex:
            b2, b3, b4, b8, b11 = ex.map(lambda k: mosaic(its, k), ["B02", "B03", "B04", "B08", "B11"])
        # refletância: (DN - 1000) / 10000 a partir do processamento 04.00
        refl = lambda b: np.clip((b - 1000) / 10000, 0, 1)
        r, g, b, nir = refl(b4), refl(b3), refl(b2), refl(b8)
        rgb = np.dstack([np.clip((x / 0.3) ** 0.85, 0, 1) for x in (r, g, b)])
        rgb8 = (rgb * 255).astype("uint8")
        tag = d.replace("-", "")
        lib.save_webp(rgb8, C.OUT_AOI / f"s2/s2_rgb_{tag}.webp", quality=80)
        ndvi = (nir - r) / np.maximum(nir + r, 1e-6)
        clear = (scl > 0) & ~np.isin(scl, CLOUD + SHADOW)
        ndvi_cache[tag] = np.where(clear, ndvi, np.nan).astype("float32")
        water = (scl == WATER)
        rgba = np.zeros((h, w, 4), "uint8")
        rgba[water] = (57, 198, 195, 235)
        lib.save_png(rgba, C.OUT_AOI / f"s2/s2_water_{tag}.png")
        out.append({
            "id": f"s2-{d}", "sensor": "Sentinel-2", "product": "L2A (refletância de superfície)",
            "product_ids": [i["id"] for i in its], "acquired_at": its[0]["properties"]["datetime"],
            "platform": its[0]["properties"].get("platform"), "resolution_m": C.RES, "native_resolution_m": 10,
            "cloud_fraction_aoi": round(cloud, 4), "image_rgb": f"s2/s2_rgb_{tag}.webp",
            "water_mask": f"s2/s2_water_{tag}.png", "water_area_ha": round(float(water.sum()) * C.RES**2 / 1e4, 1),
            "water_method": "Classe 6 (água) da classificação de cena SCL do Sen2Cor",
            "mean_ndvi_clear": (round(float(np.nanmean(ndvi_cache[tag])), 3) if np.isfinite(ndvi_cache[tag]).any() else None),
            "source_url": f"https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/{its[0]['id']}",
            "is_synthetic": False,
        })
        print("exportado", d, "nuvem na área", round(cloud, 3), "água ha", out[-1]["water_area_ha"])
    C.CACHE_AOI.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(C.CACHE_AOI / "s2_ndvi.npz", **ndvi_cache)
    lib.write_json({"scenes": out, "cloud_table": table}, C.CACHE_AOI / "s2_scenes.json")


if __name__ == "__main__":
    main()
