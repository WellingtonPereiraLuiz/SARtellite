"""Camadas de referência: cobertura do solo e água histórica.

- Cobertura do solo 10 m (Impact Observatory / Esri, coleção
  `io-lulc-annual-v02`, ano mais recente disponível). Classe 2 = árvores.
- Ocorrência de água superficial 1984-2020 (JRC Global Surface Water,
  coleção `jrc-gsw`): porcentagem do tempo em que cada pixel teve água.
São mapas de referência de outros autores, com datas diferentes das cenas.
"""
import numpy as np

import config as C
import lib

CLASSES = {1: "Água", 2: "Árvores", 4: "Vegetação alagada", 5: "Lavoura", 7: "Área construída",
           8: "Solo exposto", 9: "Neve ou gelo", 10: "Nuvem", 11: "Campo ou pastagem"}
FOREST_RGBA = (74, 173, 113, 150)


def main():
    _, w, h, bounds = lib.aoi_grid()
    bbox = lib.bbox_lonlat(bounds)
    items = lib.http_json(C.STAC + "/search", {"collections": ["io-lulc-annual-v02"], "bbox": bbox, "limit": 50})["features"]
    it = max(items, key=lambda f: f["properties"]["start_datetime"])
    year = it["properties"]["start_datetime"][:4]
    lulc = lib.read_to_grid(it["assets"]["data"]["href"], resampling="mode").astype("uint8")
    rgba = np.zeros((h, w, 4), "uint8")
    rgba[lulc == 2] = FOREST_RGBA
    lib.save_png(rgba, C.OUT_AOI / "ref/forest.png")
    shares = {CLASSES.get(int(k), str(k)): round(float((lulc == k).mean()), 4) for k in np.unique(lulc) if k in CLASSES}
    C.CACHE_AOI.mkdir(parents=True, exist_ok=True)
    np.save(C.CACHE_AOI / "lulc.npy", lulc)

    jrc_items = lib.http_json(C.STAC + "/search", {"collections": ["jrc-gsw"], "bbox": bbox, "limit": 10})["features"]
    occ = None
    for j in jrc_items:
        a = lib.read_to_grid(j["assets"]["occurrence"]["href"], resampling="bilinear").astype("float32")
        occ = a if occ is None else np.maximum(occ, a)
    occ = np.where(occ > 100, 0, occ)
    rgba = np.zeros((h, w, 4), "uint8")
    m = occ >= 5
    rgba[m, :3] = (86, 156, 235)
    rgba[m, 3] = (110 + 1.4 * occ[m]).clip(0, 250).astype("uint8")
    lib.save_png(rgba, C.OUT_AOI / "ref/water_hist.png")
    out = {
        "lulc": {"item": it["id"], "year": year, "class_shares": shares, "image_forest": "ref/forest.png",
                 "source_url": "https://planetarycomputer.microsoft.com/dataset/io-lulc-annual-v02"},
        "jrc": {"items": [j["id"] for j in jrc_items], "period": "1984-2020", "image": "ref/water_hist.png",
                "area_ha_occ_ge_50": round(float((occ >= 50).sum()) * C.RES**2 / 1e4, 1),
                "area_ha_occ_ge_5": round(float(m.sum()) * C.RES**2 / 1e4, 1),
                "source_url": "https://planetarycomputer.microsoft.com/dataset/jrc-gsw"},
    }
    lib.write_json(out, C.CACHE_AOI / "context.json")
    print(C.AOI_ID, out["lulc"]["year"], shares, "JRC ha>=50%:", out["jrc"]["area_ha_occ_ge_50"])


if __name__ == "__main__":
    main()
