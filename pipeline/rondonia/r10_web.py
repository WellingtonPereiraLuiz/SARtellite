"""Pacotes leves para o site v3.

- fires.json      focos de calor em RO desde o início do NISAR: [lon, lat, dia, mun, floresta]
- gazetteer.json  busca: municípios de RO, estados do Brasil, países (com caixa)
- events.json     regravado com contornos suavizados (sem "escadinha" de pixel)
- tiles/bm        NASA Blue Marble: mundo (z0-4), América do Sul (z5-6), Rondônia (z7-8)
- hero.webp       retrato de Rondônia com focos, lavoura e floresta (imagem da Home)
"""
import datetime as dt
import math
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import numpy as np
from affine import Affine
from PIL import Image, ImageDraw, ImageFilter
from pyproj import Transformer
from shapely.geometry import mapping, shape as shp

from common import CACHE, NISAR_START, OUT, lib, read_json, write_json

O = OUT / "ro"
T0 = date.fromisoformat(NISAR_START)
GIBS = ("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/"
        "2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg")


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").upper().strip()


def rnd(c, nd=5):
    if isinstance(c[0], (int, float)):
        return [round(c[0], nd), round(c[1], nd)]
    return [rnd(x, nd) for x in c]


def bbox(g):
    b = shp(g).bounds
    return [round(b[0], 3), round(b[1], 3), round(b[2], 3), round(b[3], 3)]


def fires():
    places = read_json(O / "places.json")["municipios"]
    by_name = {norm(m["nome"]): i for i, m in enumerate(places)}
    meta = read_json(CACHE / "lulc_meta.json")
    lulc = np.load(CACHE / "lulc_180m.npy")
    inv = ~Affine(*meta["transform"])
    to_utm = Transformer.from_crs(4326, 32720, always_xy=True).transform
    last = len(read_json(O / "periods.json")["periods"]) * 12  # só os dias cobertos pelos períodos do NISAR
    rows = []
    for lo, la, t, sat, frp, mun in read_json(CACHE / "fires_ro.json")["rows"]:
        loc = dt.datetime.fromisoformat(t.replace("Z", "+00:00")) - dt.timedelta(hours=4)  # hora de Rondônia (UTC-4)
        d = (loc.date() - T0).days
        if d < 0 or d >= last:
            continue
        c, r = inv * to_utm(lo, la)
        r, c = int(r), int(c)
        forest = int(0 <= r < lulc.shape[0] and 0 <= c < lulc.shape[1] and lulc[r, c] == 2)
        rows.append([round(lo, 3), round(la, 3), d, by_name.get(norm(mun), -1), forest, loc.hour])
    write_json({"start": NISAR_START, "columns": ["lon", "lat", "dia", "mun", "floresta", "hora_local"], "mun_ids": [m["id"] for m in places],
                "rows": rows}, O / "fires.json", compact=True)
    m = read_json(O / "meta.json")
    m["fogo"]["focos"] = len(rows)
    write_json(m, O / "meta.json")
    print("focos:", len(rows), "na floresta:", sum(r[4] for r in rows), "sem município:", sum(r[3] < 0 for r in rows))


def smooth_events():
    ev = read_json(O / "events.json")
    for e in ev:
        if e.get("suave"):
            continue  # já suavizado: rodar de novo não deforma
        e["suave"] = True
        g = shp({"type": e["gtype"], "coordinates": e["geometry"]})
        s = g.buffer(0.0009, join_style=1).buffer(-0.0007, join_style=1).simplify(0.0002)
        if s.is_empty:
            continue
        e["geometry"] = rnd(mapping(s)["coordinates"])
        e["gtype"] = s.geom_type
    write_json(ev, O / "events.json", compact=True)


def gazetteer():
    out = []
    for m in read_json(O / "places.json")["municipios"]:
        out.append({"n": m["nome"], "t": "municipio", "id": m["id"], "b": bbox({"type": m["gtype"], "coordinates": m["geometry"]})})
    ne = CACHE.parent / "ne"
    for f in read_json(ne / "ne_50m_admin_1_states_provinces.geojson")["features"]:
        p = f["properties"]
        if p.get("adm0_a3") == "BRA":
            out.append({"n": p["name"], "t": "estado", "b": bbox(f["geometry"]), "ro": p["name"] == "Rondônia"})
    pt = {"Brazil": "Brasil", "Bolivia": "Bolívia", "Peru": "Peru", "Colombia": "Colômbia", "Venezuela": "Venezuela", "Paraguay": "Paraguai",
          "Argentina": "Argentina", "Chile": "Chile", "Ecuador": "Equador", "Uruguay": "Uruguai", "Guyana": "Guiana", "Suriname": "Suriname",
          "United States of America": "Estados Unidos", "India": "Índia", "China": "China", "Indonesia": "Indonésia", "Mexico": "México",
          "Canada": "Canadá", "Australia": "Austrália", "Germany": "Alemanha", "France": "França", "Spain": "Espanha", "Portugal": "Portugal",
          "Italy": "Itália", "United Kingdom": "Reino Unido", "Japan": "Japão", "Democratic Republic of the Congo": "República Democrática do Congo",
          "Nigeria": "Nigéria", "South Africa": "África do Sul", "Egypt": "Egito", "Russia": "Rússia", "Bangladesh": "Bangladesh", "Pakistan": "Paquistão"}
    for f in read_json(ne / "ne_110m_admin_0_countries.geojson")["features"]:
        p = f["properties"]
        name = pt.get(p["NAME"] if "NAME" in p else p.get("name"), p.get("NAME") or p.get("name"))
        g = shp(f["geometry"])
        if g.geom_type == "MultiPolygon":  # caixa da maior parte (evita países com ilhas do outro lado do mundo)
            g = max(g.geoms, key=lambda x: x.area)
        out.append({"n": name, "t": "pais", "b": bbox(mapping(g))})
    write_json(out, O / "gazetteer.json", compact=True)
    print("gazetteer:", len(out))


def tiles():
    def xy(lon, lat, z):
        return int((lon + 180) / 360 * 2**z), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**z)

    def box(b, z):
        x0, y0 = xy(b[0], b[3], z); x1, y1 = xy(b[2], b[1], z)
        return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]

    # mundo até z3; América do Sul z4–6; Rondônia z7–8 (cabe no limite de 512 arquivos do artifact)
    todo = [(z, x, y) for z in range(4) for x in range(2**z) for y in range(2**z)]
    todo += box((-82, -35, -34, 13), 4) + box((-82, -35, -34, 13), 5) + box((-82, -35, -34, 13), 6)
    todo += box((-67.5, -14.5, -59, -7), 7) + box((-67.5, -14.5, -59, -7), 8)

    def get(t):
        z, x, y = t
        lib.download(GIBS.format(z=z, x=x, y=y), O.parent / "tiles" / "bm" / str(z) / str(x) / f"{y}.jpg")

    with ThreadPoolExecutor(10) as ex:
        list(ex.map(get, todo))
    print("tiles:", len(todo))


def hero():
    """Imagem real (não ilustração): cobertura do solo de RO escurecida + lavoura + focos + floresta derrubada."""
    lc = Image.open(O / "landcover.png").convert("RGBA")
    W, H = lc.size
    lcj = read_json(O / "landcover.json")
    (x0, y1), (x1, _), (_, y0), _ = lcj["corners"]
    mx = lambda lon: (lon - x0) / (x1 - x0) * W
    yy = lambda la: math.log(math.tan(math.pi / 4 + math.radians(la) / 2))
    my = lambda la: (yy(y1) - yy(la)) / (yy(y1) - yy(y0)) * H
    base = Image.new("RGBA", (W, H), (7, 13, 19, 255))
    dark = Image.eval(lc, lambda v: v)
    a = np.asarray(dark).astype(float)
    a[..., :3] *= 0.42
    base.alpha_composite(Image.fromarray(a.astype("uint8")))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    for r in read_json(O / "farm.json")["rows"]:
        c = (242, 179, 61, 70) if r[5] == "colheita" else (155, 225, 93, 70)
        d.ellipse([mx(r[0]) - 2, my(r[1]) - 2, mx(r[0]) + 2, my(r[1]) + 2], fill=c)
    for r in read_json(O / "fires.json")["rows"]:
        d.ellipse([mx(r[0]) - 2.2, my(r[1]) - 2.2, mx(r[0]) + 2.2, my(r[1]) + 2.2], fill=(255, 96, 52, 170))
    glow = glow.filter(ImageFilter.GaussianBlur(2.2))
    base.alpha_composite(glow)
    d = ImageDraw.Draw(base)
    for e in read_json(O / "events.json"):
        if e["certeza"] != "possivel":
            rr = 4 + math.sqrt(e["area_ha"]) * 0.8
            d.ellipse([mx(e["lon"]) - rr, my(e["lat"]) - rr, mx(e["lon"]) + rr, my(e["lat"]) + rr], outline=(255, 255, 255, 230), width=2)
    base.convert("RGB").resize((W // 2 * 2 // 2 * 1, H // 2 * 2 // 2 * 1)).save(O / "hero.webp", "WEBP", quality=80)
    print("hero.webp", (O / "hero.webp").stat().st_size // 1000, "kB")


if __name__ == "__main__":
    fires()
    smooth_events()
    gazetteer()
    tiles()
    hero()
