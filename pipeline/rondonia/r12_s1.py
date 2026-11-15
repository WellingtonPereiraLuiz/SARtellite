"""Caso 2, "Alerta em 2 etapas": Sentinel-1 avisa cedo, NISAR confirma, FIRMS/INPE diz se queimou.

Sentinel-1 (ESA, banda C) passa mais vezes que o NISAR, mas a banda C só vê a copa. O NISAR (banda L)
vê troncos e galhos: confirma que a floresta sumiu de fato. Juntos: alerta rápido e confirmado.

Para cada lugar de floresta derrubada (events.json):
  - busca todas as imagens Sentinel-1 RTC (Planetary Computer) de jun a nov/2026
  - eco VH (dB) dentro da mancha menos o eco da floresta em volta (anel de ~1,5 km), por imagem
  - linha de base por órbita: mediana da diferença antes da imagem NISAR "de antes"
  - alerta do Sentinel-1: primeira imagem em que a diferença cai 1,5 dB ou mais abaixo da base
    e a imagem seguinte da mesma órbita confirma (queda que persiste)
  - dias_antes = data da queda no NISAR - data do alerta do Sentinel-1 (positivo: o Sentinel-1 avisou antes)

Saída: events.json ganha e["s1"]; meta.json ganha "s1".
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import planetary_computer as pc
import pystac_client
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds
from shapely.geometry import mapping, shape as shp
from shapely.ops import transform as stransform

from common import CACHE, OUT, read_json, write_json

warnings.filterwarnings("ignore", category=DeprecationWarning)

O = OUT / "ro"
CAT = "https://planetarycomputer.microsoft.com/api/stac/v1"
T0, T1 = "2026-06-01", dt.date.today().isoformat()
QUEDA = 1.5      # dB abaixo da base para contar como queda
ANEL = 1500      # metros: raio da floresta em volta
FOLGA = 200      # metros entre a mancha e o anel


def db(x):
    with np.errstate(divide="ignore", invalid="ignore"):
        return 10 * np.log10(x)


def read_one(item, geom_ll):
    href = item.assets["vh"].href
    with rasterio.open(href) as src:
        to = Transformer.from_crs(4326, src.crs, always_xy=True).transform
        g = stransform(to, geom_ll)
        ring = g.centroid.buffer(ANEL).difference(g.buffer(FOLGA))
        b = g.centroid.buffer(ANEL).bounds
        win = from_bounds(*b, transform=src.transform).round_offsets().round_lengths()
        a = src.read(1, window=win, boundless=True, fill_value=0).astype("float32")
        tr = src.window_transform(win)
    if a.size == 0 or not np.isfinite(a).any() or (a > 0).mean() < 0.5:
        return None
    inside = ~geometry_mask([mapping(g)], a.shape, tr, all_touched=True)
    around = ~geometry_mask([mapping(ring)], a.shape, tr)
    v = db(a)
    ok = np.isfinite(v) & (a > 0)
    hi, ar = v[inside & ok], v[around & ok]
    if hi.size < 4 or ar.size < 50:
        return None
    return round(float(np.median(hi)), 2), round(float(np.median(ar)), 2)


def series(e, cat):
    geom = shp({"type": e["gtype"], "coordinates": e["geometry"]})
    items = cat.search(collections=["sentinel-1-rtc"], intersects=mapping(geom.centroid.buffer(0.001)),
                       datetime=f"{T0}/{T1}").item_collection()
    rows = {}
    for it in items:
        try:
            r = read_one(pc.sign(it), geom)
        except Exception as ex:  # imagem com problema: segue sem ela
            print("  falhou", it.id, ex, file=sys.stderr)
            continue
        if r:
            d = it.datetime.date().isoformat()
            orb = it.properties.get("sat:relative_orbit")
            plat = it.properties.get("platform", "")
            rows[(d, orb)] = (r[0], r[1], plat)
    out = sorted(([d, orb, h, a, p] for (d, orb), (h, a, p) in rows.items()), key=lambda x: x[0])
    return out


def alert(e, rows):
    c = e.get("chuva") or {}
    dates = e["serie"]["dates"] if e.get("serie") else []
    base = c.get("base") or ([d for d in dates if d < e["first_date"]] or [None])[-1]
    nisar = e["first_date"]
    if not base or len(rows) < 4:
        return None
    by_orb = {}
    for d, orb, h, a, _ in rows:
        by_orb.setdefault(orb, []).append((d, h - a))
    first = None
    for orb, xs in by_orb.items():
        pre = [x for d, x in xs if d <= base]
        if len(pre) < 2:
            continue
        b = float(np.median(pre))
        post = [(d, x - b) for d, x in xs if d > base]
        for i in range(len(post) - 1):
            if post[i][1] <= -QUEDA and post[i + 1][1] <= -QUEDA:
                if first is None or post[i][0] < first:
                    first = post[i][0]
                break
    res = {"imagens": len(rows), "orbitas": len(by_orb), "base_nisar": base, "queda_nisar": nisar, "alerta": first}
    if first:
        res["dias_antes"] = (dt.date.fromisoformat(nisar) - dt.date.fromisoformat(first)).days
    # intervalo médio entre imagens Sentinel-1 no lugar (dias)
    ds = sorted({dt.date.fromisoformat(r[0]) for r in rows})
    # NISAR + Sentinel-1 juntos: intervalo médio entre imagens de qualquer um dos dois
    ws = sorted(set(ds) | {dt.date.fromisoformat(d) for d in dates})
    res["revisita_juntos_dias"] = round(float(np.mean([(y - x).days for x, y in zip(ws, ws[1:])])), 1) if len(ws) > 1 else None
    res["revisita_dias"] = round(float(np.mean([(y - x).days for x, y in zip(ds, ds[1:])])), 1) if len(ds) > 1 else None
    return res


def main(limit=None):
    cache = CACHE / "s1"
    cache.mkdir(parents=True, exist_ok=True)
    events = read_json(O / "events.json")
    todo = [e for e in events if e.get("serie")][: limit or None]
    cat = pystac_client.Client.open(CAT)

    def one(e):
        f = cache / f"{e['id']}.json"
        if f.exists():
            return e["id"], json.loads(f.read_text())
        rows = series(e, cat)
        f.write_text(json.dumps(rows))
        return e["id"], rows

    with ThreadPoolExecutor(6) as ex:
        got = dict(ex.map(one, todo))
    n = {"com_alerta": 0, "sem_alerta": 0, "sem_dado": 0}
    antes = []
    for e in events:
        rows = got.get(e["id"])
        r = alert(e, rows) if rows else None
        if r is None:
            e.pop("s1", None)
            n["sem_dado"] += 1
            continue
        r["serie"] = [[d, round(h - a, 2)] for d, _, h, a, _ in rows]
        e["s1"] = r
        if r.get("alerta"):
            n["com_alerta"] += 1
            antes.append(r["dias_antes"])
        else:
            n["sem_alerta"] += 1
    write_json(events, O / "events.json", compact=True)
    m = read_json(O / "meta.json")
    rev = [e["s1"]["revisita_dias"] for e in events if e.get("s1") and e["s1"].get("revisita_dias")]
    m["s1"] = {"fonte": "Sentinel-1 RTC (ESA/Copernicus) via Microsoft Planetary Computer", "url": "https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc",
               "queda_db": QUEDA, **n, "dias_antes_mediana": float(np.median(antes)) if antes else None,
               "avisou_antes": sum(1 for a in antes if a > 0), "revisita_mediana_dias": float(np.median(rev)) if rev else None,
               "revisita_juntos_mediana_dias": float(np.median([e["s1"]["revisita_juntos_dias"] for e in events if e.get("s1") and e["s1"].get("revisita_juntos_dias")])) if rev else None}
    write_json(m, O / "meta.json")
    print(m["s1"])


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
