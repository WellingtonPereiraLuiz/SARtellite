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
from datetime import date
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
RES = 80           # metros por pixel do mosaico
CHIP = 1200        # metros: metade do lado da foto de perto
PATCH = 4000       # metros: metade do lado do recorte nítido (10 m) que entra no mapa ao chegar perto
HOJE = date.today().isoformat()
R = 6378137.0


def merc(lon, lat):
    return lon * math.pi / 180 * R, math.log(math.tan(math.pi / 4 + lat * math.pi / 360)) * R


def mosaic(cat):
    """Mosaico do estado a 80 m por pixel, em 4 pedaços (2 x 2) para caber na placa de vídeo de qualquer aparelho."""
    X0, Y0 = merc(RO_BBOX[0] - 0.3, RO_BBOX[1] - 0.3)
    X1, Y1 = merc(RO_BBOX[2] + 0.3, RO_BBOX[3] + 0.3)
    bb = [RO_BBOX[0] - 0.3, RO_BBOX[1] - 0.3, RO_BBOX[2] + 0.3, RO_BBOX[3] + 0.3]
    items = list(cat.search(collections=["sentinel-2-l2a"], bbox=bb, datetime=f"2026-06-01/{HOJE}",
                            query={"eo:cloud_cover": {"lt": 90}}).item_collection())
    by = {}
    for it in items:
        # cada órbita cobre só parte da quadrícula: separa por quadrícula e órbita
        by.setdefault((it.properties.get("s2:mgrs_tile"), it.properties.get("sat:relative_orbit")), []).append(it)
    pick = [i for v in by.values() for i in sorted(v, key=lambda i: i.properties["eo:cloud_cover"])[:3]]
    order = sorted(pick, key=lambda i: i.properties["eo:cloud_cover"])
    print("quadrículas:", len(by), "cenas usadas:", len(pick), "de", len(items))
    lon = lambda x: x / R * 180 / math.pi
    lat = lambda y: (2 * math.atan(math.exp(y / R)) - math.pi / 2) * 180 / math.pi
    tiles = []
    for q in range(4):
        qx, qy = q % 2, q // 2
        x0, x1 = X0 + (X1 - X0) / 2 * qx, X0 + (X1 - X0) / 2 * (qx + 1)
        y0, y1 = Y0 + (Y1 - Y0) / 2 * qy, Y0 + (Y1 - Y0) / 2 * (qy + 1)
        w, h = int((x1 - x0) / RES), int((y1 - y0) / RES)
        dst_t = tfb(x0, y0, x1, y1, w, h)
        qb = (lon(x0), lat(y0), lon(x1), lat(y1))
        mine = [i for i in order if not (i.bbox[2] < qb[0] or i.bbox[0] > qb[2] or i.bbox[3] < qb[1] or i.bbox[1] > qb[3])]
        out = np.zeros((3, h, w), dtype=np.uint8)

        def one(it):
            try:
                href = pc.sign(it).assets["visual"].href
                with rasterio.open(href, overview_level=2) as src:
                    arr, st, sc = src.read(), src.transform, src.crs
            except Exception as ex:
                print(it.id, "falhou", type(ex).__name__)
                return None
            buf = np.zeros((3, h, w), dtype=np.uint8)
            for b in range(3):
                reproject(arr[b], buf[b], src_transform=st, src_crs=sc, dst_transform=dst_t, dst_crs="EPSG:3857",
                          resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
            return buf

        with ThreadPoolExecutor(4) as ex:
            for k in range(0, len(mine), 4):  # em lotes, para não estourar a memória
                for buf in ex.map(one, mine[k:k + 4]):
                    if buf is None:
                        continue
                    m = (buf.sum(0) > 0) & (out.sum(0) == 0)  # menos nuvem primeiro; as outras só preenchem buracos
                    out[:, m] = buf[:, m]
                    del buf
        alpha = ((out.sum(0) > 12) * 255).astype(np.uint8)  # buraco sem imagem fica transparente
        Image.fromarray(np.dstack([np.moveaxis(out, 0, -1), alpha]), "RGBA").save(O / f"s2_ro_{q}.webp", quality=70, method=4)
        tiles.append({"image": f"ro/s2_ro_{q}.webp", "corners": [[lon(x0), lat(y1)], [lon(x1), lat(y1)], [lon(x1), lat(y0)], [lon(x0), lat(y0)]]})
        print("pedaço", q, w, "x", h, "cenas", len(mine), flush=True)
    meta = {"tiles": tiles, "res_m": RES, "periodo": f"jun/2026 a {HOJE}", "cenas": len(pick),
            "fonte": "Sentinel-2 L2A (ESA/Copernicus) via Microsoft Planetary Computer"}
    (O / "s2_ro.json").write_text(json.dumps(meta))


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
                           datetime=f"{e['first_date']}/{HOJE}", query={"eo:cloud_cover": {"lt": 40}}).item_collection()
        if not len(items):
            items = cat.search(collections=["sentinel-2-l2a"], intersects={"type": "Point", "coordinates": [lon, lat]},
                               datetime=f"2026-07-01/{HOJE}", query={"eo:cloud_cover": {"lt": 40}}).item_collection()
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


def patches(cat):
    """Recorte nítido (10 m por pixel, 8 km de lado) em volta de cada lugar, para o mapa não borrar de perto."""
    (O / "s2p").mkdir(exist_ok=True)
    events = read_json(O / "events.json")
    old = read_json(O / "s2p" / "index.json") if (O / "s2p" / "index.json").exists() else {}
    idx = {}
    (O / "s2").mkdir(exist_ok=True)
    chips_idx = read_json(O / "s2" / "index.json") if (O / "s2" / "index.json").exists() else {}
    n = PATCH * 2 // 10
    ramp = np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / (n * 0.06), 0, 1)
    alpha = (np.minimum.outer(ramp, ramp) * 255).astype(np.uint8)  # borda suave para emendar com o mosaico

    def one(e):
        if e["id"] in old and (O / "s2p" / f"{e['id']}.webp").exists():
            return e["id"], old[e["id"]]
        lon, lat = e["lon"], e["lat"]
        x, y = merc(lon, lat)
        k = PATCH / math.cos(math.radians(lat))  # metros de verdade -> metros Mercator
        ilon = lambda v: v / R * 180 / math.pi
        ilat = lambda v: (2 * math.atan(math.exp(v / R)) - math.pi / 2) * 180 / math.pi
        box = [ilon(x - k), ilat(y - k), ilon(x + k), ilat(y + k)]
        dst_t = tfb(x - k, y - k, x + k, y + k, n, n)
        pt = {"type": "Point", "coordinates": [lon, lat]}
        items = cat.search(collections=["sentinel-2-l2a"], intersects=pt, datetime=f"{e['first_date']}/{HOJE}",
                           query={"eo:cloud_cover": {"lt": 40}}).item_collection()
        if not len(items):
            items = cat.search(collections=["sentinel-2-l2a"], intersects=pt, datetime=f"2026-07-01/{HOJE}",
                               query={"eo:cloud_cover": {"lt": 40}}).item_collection()
        best = None
        for it in sorted(items, key=lambda i: i.properties["eo:cloud_cover"])[:6]:
            try:
                href = pc.sign(it).assets["visual"].href
                with rasterio.open(href) as src:
                    b = transform_bounds("EPSG:4326", src.crs, box[0] - 0.01, box[1] - 0.01, box[2] + 0.01, box[3] + 0.01)
                    win = wfb(*b, transform=src.transform)
                    a = src.read(window=win, boundless=True, fill_value=0)
                    st, sc = src.window_transform(win), src.crs
                out = np.zeros((3, n, n), dtype=np.uint8)
                for bnd in range(3):
                    reproject(a[bnd], out[bnd], src_transform=st, src_crs=sc, dst_transform=dst_t, dst_crs="EPSG:3857",
                              resampling=Resampling.bilinear, src_nodata=0, dst_nodata=0)
            except Exception as ex:
                print(e["id"], "falhou", type(ex).__name__)
                continue
            if (out.sum(0) == 0).mean() > 0.03:
                continue
            # nota local: nuvem (pixel muito claro) pesa mais; névoa e fumaça levantam o azul mais escuro
            nota = (out.min(0) > 190).mean() * 4 + np.percentile(out[2], 5) / 255
            if best is None or nota < best[0]:
                best = (nota, out, it)
            if nota < 0.12:
                break
        if best is None:
            return e["id"], None
        _, out, it = best
        f = out.astype(np.float32)
        # tira a névoa: desconta o escuro de cada cor e aplica um ganho só, igual nas três, para não mudar a cor
        los = [np.percentile(f[bnd], 1) * 0.7 for bnd in range(3)]
        g = min(2.0, 215 / max(max(np.percentile(f[bnd], 99.5) - los[bnd] for bnd in range(3)), 1))
        for bnd in range(3):
            f[bnd] = 255 * (np.clip((f[bnd] - los[bnd]) * g, 0, 255) / 255) ** 0.8
        out = np.clip(f, 0, 255).astype(np.uint8)
        Image.fromarray(np.dstack([np.moveaxis(out, 0, -1), alpha]), "RGBA").save(O / "s2p" / f"{e['id']}.webp", quality=76, method=4)
        # a foto do cartão é o miolo do mesmo recorte (2,4 km), para mapa e cartão mostrarem a mesma cena
        c = int(n * CHIP / PATCH / 2)
        Image.fromarray(np.moveaxis(out[:, n // 2 - c:n // 2 + c, n // 2 - c:n // 2 + c], 0, -1)).resize((360, 360), Image.LANCZOS).save(O / "s2" / f"{e['id']}.jpg", quality=84)
        kc = k * CHIP / PATCH
        cb = [ilon(x - kc), ilat(y - kc), ilon(x + kc), ilat(y + kc)]
        chips_idx[e["id"]] = {"img": f"ro/s2/{e['id']}.jpg", "corners": [[cb[0], cb[3]], [cb[2], cb[3]], [cb[2], cb[1]], [cb[0], cb[1]]],
                              "data": it.datetime.date().isoformat(), "nuvem": round(it.properties["eo:cloud_cover"], 1)}
        return e["id"], {"img": f"ro/s2p/{e['id']}.webp", "corners": [[box[0], box[3]], [box[2], box[3]], [box[2], box[1]], [box[0], box[1]]],
                         "data": it.datetime.date().isoformat()}

    with ThreadPoolExecutor(6) as ex:
        for k, v in ex.map(one, events):
            if v:
                idx[k] = v
    (O / "s2p" / "index.json").write_text(json.dumps(idx))
    (O / "s2" / "index.json").write_text(json.dumps(chips_idx))
    print("recortes nítidos:", len(idx), "de", len(events))


if __name__ == "__main__":
    cat = pystac_client.Client.open(CAT)
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "chips"):
        chips(cat)
    if what in ("all", "patches"):
        patches(cat)
    if what in ("all", "mosaic"):
        mosaic(cat)
