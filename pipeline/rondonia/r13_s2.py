"""Imagem de satélite real para o mapa: Sentinel-2 L2A (ESA/Copernicus), cor verdadeira, via Planetary Computer.

1. Mosaico de Rondônia (~160 m por pixel, Web Mercator), juntando a cena com menos nuvem de cada quadrícula
   MGRS na estação seca (jul a set/2026). Vira public/data/ro/s2_ro.jpg + s2_ro.json (cantos).
2. Foto de perto de cada lugar de floresta derrubada (10 m, 2,4 km de lado), da cena com menos nuvem
   depois da queda vista pelo NISAR. Vira public/data/ro/s2/<id>.jpg + s2/index.json (cantos e data).
"""
from __future__ import annotations

import json
import math
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import planetary_computer as pc
import pystac_client
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.transform import from_bounds as tfb
from rasterio.windows import from_bounds as wfb

from common import OUT, RO_BBOX, read_json

warnings.filterwarnings("ignore")
O = OUT / "ro"
CAT = "https://planetarycomputer.microsoft.com/api/stac/v1"
RES = 160          # metros por pixel do mosaico
CHIP = 1200        # metros: metade do lado da foto de perto
R = 6378137.0


def merc(lon, lat):
    return lon * math.pi / 180 * R, math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * R


def mosaic(cat):
    x0, y0 = merc(RO_BBOX[0] - 0.3, RO_BBOX[1] - 0.3)
    x1, y1 = merc(RO_BBOX[2] + 0.3, RO_BBOX[3] + 0.3)
    w, h = int((x1 - x0) / RES), int((y1 - y0) / RES)
    dst_t = tfb(x0, y0, x1, y1, w, h)
    bb = [RO_BBOX[0] - 0.3, RO_BBOX[1] - 0.3, RO_BBOX[2] + 0.3, RO_BBOX[3] + 0.3]
    items = list(cat.search(collections=["sentinel-2-l2a"], bbox=bb, datetime="2026-06-01/2026-10-31",
                            query={"eo:cloud_cover": {"lt": 90}}).item_collection())
    by = {}
    for it in items:
        # cada órbita cobre só parte da quadrícula: separa por quadrícula e órbita
        by.setdefault((it.properties.get("s2:mgrs_tile"), it.properties.get("sat:relative_orbit")), []).append(it)
    pick = [i for v in by.values() for i in sorted(v, key=lambda i: i.properties["eo:cloud_cover"])[:3]]
    best = {i.id: i for i in pick}
    print("quadrículas:", len(by), "cenas usadas:", len(pick), "de", len(items))
    out = np.zeros((3, h, w), dtype=np.uint8)

    def one(it):
        href = pc.sign(it).assets["visual"].href
        with rasterio.open(href, overview_level=3) as src:
            arr, st, sc = src.read(), src.transform, src.crs
        buf = np.zeros((3, h, w), dtype=np.uint8)
        for b in range(3):
            reproject(arr[b], buf[b], src_transform=st, src_crs=sc, dst_transform=dst_t, dst_crs="EPSG:3857",
                      resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
        return buf

    order = sorted(pick, key=lambda i: i.properties["eo:cloud_cover"])
    with ThreadPoolExecutor(6) as ex:
        for k in range(0, len(order), 6):  # em lotes, para não estourar a memória
            for buf in ex.map(one, order[k:k + 6]):
                m = (buf.sum(0) > 0) & (out.sum(0) == 0)  # menos nuvem primeiro; as outras só preenchem buracos
                out[:, m] = buf[:, m]
                del buf
    alpha = ((out.sum(0) > 12) * 255).astype(np.uint8)  # buraco sem imagem fica transparente
    img = Image.fromarray(np.dstack([np.moveaxis(out, 0, -1), alpha]), "RGBA")
    img.save(O / "s2_ro.webp", quality=72, method=4)
    lon = lambda x: x / R * 180 / math.pi
    lat = lambda y: (2 * math.atan(math.exp(y / R)) - math.pi / 2) * 180 / math.pi
    corners = [[lon(x0), lat(y1)], [lon(x1), lat(y1)], [lon(x1), lat(y0)], [lon(x0), lat(y0)]]
    meta = {"image": "ro/s2_ro.webp", "corners": corners, "res_m": RES, "periodo": "jul a set/2026", "cenas": len(pick),
            "fonte": "Sentinel-2 L2A (ESA/Copernicus) via Microsoft Planetary Computer"}
    (O / "s2_ro.json").write_text(json.dumps(meta))
    print("mosaico", w, "x", h)


def chips(cat):
    (O / "s2").mkdir(exist_ok=True)
    events = read_json(O / "events.json")
    idx = {}

    def one(e):
        lon, lat = e["lon"], e["lat"]
        d = CHIP / 111320
        dl = d / math.cos(math.radians(lat))
        box = [lon - dl, lat - d, lon + dl, lat + d]
        items = cat.search(collections=["sentinel-2-l2a"], intersects={"type": "Point", "coordinates": [lon, lat]},
                           datetime=f"{e['first_date']}/2026-11-08", query={"eo:cloud_cover": {"lt": 40}}).item_collection()
        if not len(items):
            items = cat.search(collections=["sentinel-2-l2a"], intersects={"type": "Point", "coordinates": [lon, lat]},
                               datetime="2026-07-01/2026-11-08", query={"eo:cloud_cover": {"lt": 40}}).item_collection()
        for it in sorted(items, key=lambda i: i.properties["eo:cloud_cover"])[:3]:
            href = pc.sign(it).assets["visual"].href
            with rasterio.open(href) as src:
                b = transform_bounds("EPSG:4326", src.crs, *box)
                win = wfb(*b, transform=src.transform)
                a = src.read(window=win, out_shape=(3, 240, 240), boundless=True, fill_value=0, resampling=Resampling.bilinear)
            if (a.sum(0) == 0).mean() > 0.05 or a.mean() > 170:  # sem dado ou nuvem demais
                continue
            Image.fromarray(np.moveaxis(a, 0, -1)).save(O / "s2" / f"{e['id']}.jpg", quality=82)
            return e["id"], {"img": f"ro/s2/{e['id']}.jpg", "corners": [[box[0], box[3]], [box[2], box[3]], [box[2], box[1]], [box[0], box[1]]],
                             "data": it.datetime.date().isoformat(), "nuvem": round(it.properties["eo:cloud_cover"], 1)}
        return e["id"], None

    with ThreadPoolExecutor(8) as ex:
        for k, v in ex.map(one, events):
            if v:
                idx[k] = v
    (O / "s2" / "index.json").write_text(json.dumps(idx))
    print("fotos de perto:", len(idx), "de", len(events))


if __name__ == "__main__":
    cat = pystac_client.Client.open(CAT)
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "chips"):
        chips(cat)
    if what in ("all", "mosaic"):
        mosaic(cat)
