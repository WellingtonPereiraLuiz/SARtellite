"""Mapa base que funciona sem internet.

- NASA Blue Marble Next Generation (GIBS/WMTS): mundo inteiro nos zooms 0 a 3,
  América do Sul no zoom 4 e a região do quadro NISAR nos zooms 5 a 8.
- Natural Earth (domínio público): países, estados do Brasil, rios e cidades.
- Fonte tipográfica em PBF para os rótulos do MapLibre (Open Sans, intervalo 0-255).
"""
import json
import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import config as C
import lib

GIBS = ("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/"
        "2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg")
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson"
SA = (-90.0, -34.0, -33.0, 13.0)        # América do Sul
REGION = (-66.5, -14.0, -58.5, -7.5)    # entorno do quadro NISAR


def tiles_for(bbox, z):
    w, s, e, n = bbox
    def xy(lon, lat):
        x = (lon + 180) / 360 * 2**z
        y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**z
        return int(x), int(y)
    x0, y0 = xy(w, n)
    x1, y1 = xy(e, s)
    return [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def tile_bounds(tiles):
    z = tiles[0][0]
    xs, ys = [t[1] for t in tiles], [t[2] for t in tiles]
    lon = lambda x: x / 2**z * 360 - 180
    lat = lambda y: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / 2**z))))
    return [lon(min(xs)), lat(max(ys) + 1), lon(max(xs) + 1), lat(min(ys))]


def get_tile(t):
    z, x, y = t
    lib.download(GIBS.format(z=z, x=x, y=y), C.OUT / "tiles" / "bm" / str(z) / str(x) / f"{y}.jpg")


def rnd(coords, nd):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    return [rnd(c, nd) for c in coords]


def ne(name):
    return json.loads(lib.download(NE.format(name=name), C.CACHE / "ne" / f"{name}.geojson").read_text())


def in_box(geom, box):
    w, s, e, n = box
    def walk(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            yield c
        else:
            for k in c:
                yield from walk(k)
    return any(w <= p[0] <= e and s <= p[1] <= n for p in walk(geom["coordinates"]))


def main():
    world = [(z, x, y) for z in range(4) for x in range(2**z) for y in range(2**z)]
    sa = tiles_for(SA, 4)
    region = [t for z in range(5, 9) for t in tiles_for(REGION, z)]
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(get_tile, world + sa + region))
    sources = {
        "world": {"minzoom": 0, "maxzoom": 3},
        "south_america": {"minzoom": 4, "maxzoom": 4, "bounds": tile_bounds(sa)},
        "region": {"minzoom": 5, "maxzoom": 8, "bounds": tile_bounds(tiles_for(REGION, 5))},
    }
    # limites exatos da pirâmide regional: usa o zoom 8 (o mais restrito)
    sources["region"]["bounds"] = tile_bounds(tiles_for(REGION, 8))
    print("tiles:", len(world), len(sa), len(region))

    feats = []
    for f in ne("ne_110m_admin_0_countries")["features"]:
        feats.append({"type": "Feature", "properties": {"k": "country"}, "geometry": {**f["geometry"], "coordinates": rnd(f["geometry"]["coordinates"], 2)}})
    for f in ne("ne_50m_admin_1_states_provinces")["features"]:
        if f["properties"].get("adm0_a3") == "BRA":
            feats.append({"type": "Feature", "properties": {"k": "state", "name": f["properties"].get("name"), "uf": (f["properties"].get("iso_3166_2") or "")[-2:]},
                          "geometry": {**f["geometry"], "coordinates": rnd(f["geometry"]["coordinates"], 3)}})
    for f in ne("ne_10m_rivers_lake_centerlines")["features"]:
        if f["geometry"] and in_box(f["geometry"], REGION):
            feats.append({"type": "Feature", "properties": {"k": "river", "name": f["properties"].get("name")},
                          "geometry": {**f["geometry"], "coordinates": rnd(f["geometry"]["coordinates"], 4)}})
    for f in ne("ne_10m_populated_places_simple")["features"]:
        if in_box(f["geometry"], REGION):
            feats.append({"type": "Feature", "properties": {"k": "city", "name": f["properties"].get("name"), "pop": f["properties"].get("pop_max")},
                          "geometry": {**f["geometry"], "coordinates": rnd(f["geometry"]["coordinates"], 4)}})
    (C.OUT / "basemap.json").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")))
    font = "Open Sans Semibold"
    lib.download("https://demotiles.maplibre.org/font/" + urllib.request.quote(font) + "/0-255.pbf",
                 C.OUT / "fonts" / font.replace(" ", "") / "0-255.pbf")
    lib.write_json({"tile_sources": sources, "font": font.replace(" ", ""),
                    "counts": {k: sum(1 for f in feats if f["properties"]["k"] == k) for k in ("country", "state", "river", "city")}},
                   C.CACHE / "basemap.json")
    print(json.loads((C.CACHE / "basemap.json").read_text()))


if __name__ == "__main__":
    main()
