"""Contexto de 'onde': limites e nomes (SEDAM), floresta de referência e alertas DETER.

- SEDAM GeoServer (WFS público): municípios 2025, sedes municipais, Terras
  Indígenas (FUNAI), Unidades de Conservação estaduais e federais.
- Floresta: classe Árvores do mapa de cobertura 10 m da Impact Observatory
  (Planetary Computer), reamostrada por moda para a grade de 180 m.
- INPE DETER (TerraBrasilis WFS): alertas de desmatamento e cicatrizes de
  queimada em RO desde o início do NISAR. Usado SÓ para conferir o NISAR.
"""
import json
import urllib.parse

import numpy as np
from PIL import Image

from common import CACHE, EPSG, NISAR_START, OUT, RES, RO_BBOX, lib, wfs, write_json

LAYERS = {
    "municipios": "ibge:ro_municipios_2025",
    "sedes": "emater:pontos_sedes_ro",
    "tis": "funai:tis_poligonais",
    "ucs_est": "cuc:limites_ucs_estaduais",
    "ucs_fed": "icmbio:limites_ucs_federais",
}


def sedam():
    for k, layer in LAYERS.items():
        dest = CACHE / "sedam" / f"{k}.geojson"
        if dest.exists():
            continue
        fc = wfs(layer)
        write_json(fc, dest, compact=True)
        print(k, len(fc["features"]), "feições; campos:", list(fc["features"][0]["properties"])[:12] if fc["features"] else [])


def state_grid():
    """Grade comum (UTM 20S, 180 m) cobrindo a caixa de Rondônia."""
    from rasterio.transform import from_origin
    from rasterio.warp import transform_bounds
    x0, y0, x1, y1 = transform_bounds("EPSG:4326", f"EPSG:{EPSG}", *RO_BBOX, densify_pts=41)
    x0, y1 = np.floor(x0 / RES) * RES, np.ceil(y1 / RES) * RES
    w, h = int(np.ceil((x1 - x0) / RES)), int(np.ceil((y1 - y0) / RES))
    return from_origin(x0, y1, RES, RES), w, h


def landcover():
    dest = CACHE / "lulc_180m.npy"
    if dest.exists():
        return
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    tr, w, h = state_grid()
    items = lib.http_json("https://planetarycomputer.microsoft.com/api/stac/v1/search",
                          {"collections": ["io-lulc-annual-v02"], "bbox": list(RO_BBOX), "limit": 100})["features"]
    year = max(i["properties"]["start_datetime"][:4] for i in items)
    items = [i for i in items if i["properties"]["start_datetime"][:4] == year]
    out = np.zeros((h, w), "uint8")
    for it in items:
        with rasterio.open(lib.sign(it["assets"]["data"]["href"])) as src:
            with WarpedVRT(src, crs=f"EPSG:{EPSG}", transform=tr, width=w, height=h, resampling=Resampling.mode) as vrt:
                a = vrt.read(1)
        out = np.where(out == 0, a, out)
        print("LULC", it["id"], "ok")
    np.save(dest, out)
    write_json({"year": year, "items": [i["id"] for i in items], "transform": list(tr)[:6], "shape": [h, w]}, CACHE / "lulc_meta.json")


def deter():
    dest = CACHE / "deter_ro.geojson"
    if dest.exists():
        return
    cql = f"uf='RO' AND view_date>='{NISAR_START}'"
    url = ("https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/ows?service=WFS&version=2.0.0&request=GetFeature"
           "&typeName=deter-amz:deter_amz&outputFormat=application/json&srsName=EPSG:4326&CQL_FILTER=" + urllib.parse.quote(cql))
    fc = lib.http_json(url, timeout=300)
    write_json(fc, dest, compact=True)
    from collections import Counter
    print("DETER RO:", len(fc["features"]), Counter(f["properties"]["classname"] for f in fc["features"]))


if __name__ == "__main__":
    sedam()
    deter()
    landcover()
