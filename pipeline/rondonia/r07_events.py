"""Transforma as detecções em acontecimentos simples para o site.

Saídas em public/data/ro/:
- events.json      manchas de floresta derrubada, com frase, lugar, data,
                   tamanho, grau de certeza, série do radar e pistas extras
- farm.json        células de 1 km de lavoura que mudaram, com data e sentido
- places.json      municípios (com totais por período), TIs e UCs
- periods.json     períodos de 12 dias do NISAR e quantas passagens houve
"""
import json
from collections import Counter, defaultdict
from datetime import date, timedelta

import numpy as np
from affine import Affine
from pyproj import Transformer
from rasterio.features import rasterize, shapes
from scipy.ndimage import binary_dilation, label
from shapely.geometry import mapping, shape as shp
from shapely.ops import transform as stf, unary_union

from common import CACHE, NISAR_START, OUT, read_json, write_json

O = OUT / "ro"
PX_HA = 3.24
CELL = 6  # 6 x 6 pixels de 180 m = 1,08 km
TO_LL = Transformer.from_crs(32720, 4326, always_xy=True).transform
TO_UTM = Transformer.from_crs(4326, 32720, always_xy=True).transform
T0 = date.fromisoformat(NISAR_START)


def period_of(d: str) -> int:
    return (date.fromisoformat(d) - T0).days // 12


def iso(i: int) -> str:
    s = str(int(i))
    return f"{s[:4]}-{s[4:6]}-{s[6:]}"


def rnd(c, nd=5):
    if isinstance(c[0], (int, float)):
        return [round(c[0], nd), round(c[1], nd)]
    return [rnd(x, nd) for x in c]


def main():
    meta = read_json(CACHE / "lulc_meta.json")
    tr = Affine(*meta["transform"])
    lulc = np.load(CACHE / "lulc_180m.npy")
    det = np.load(CACHE / "detect.npz")
    dmeta = read_json(CACHE / "detect_meta.json")
    inv = read_json(CACHE / "inventory.json")
    first, nkeep, nfr = det["first"], det["nkeep"], det["nfr"]
    inro = det["inro"]
    H, W = first.shape

    # ---------------- lugares ----------------
    mun = read_json(CACHE / "sedam" / "municipios.geojson")["features"]
    mun_utm = [(f["properties"]["NM_MUN"], f["properties"]["CD_MUN"], stf(TO_UTM, shp(f["geometry"]))) for f in mun]
    mun_ras = rasterize([(g, i + 1) for i, (_, _, g) in enumerate(mun_utm)], out_shape=(H, W), transform=tr, dtype="int16")
    prot = []
    for f in read_json(CACHE / "sedam" / "tis.geojson")["features"]:
        prot.append(("Terra Indígena " + (f["properties"].get("terrai_nome") or "").strip(), "ti", shp(f["geometry"])))
    for f in read_json(CACHE / "sedam" / "ucs_est.geojson")["features"]:
        prot.append((f["properties"]["nome_uc"].title(), "uc", shp(f["geometry"])))
    ro_ll = unary_union([shp(f["geometry"]) for f in mun])
    for f in read_json(CACHE / "sedam" / "ucs_fed.geojson")["features"]:
        if "RO" in (f["properties"].get("ufabrang") or ""):
            g = shp(f["geometry"])
            if g.intersects(ro_ll):
                prot.append((f["properties"]["nomeuc"].title(), "uc", g))
    prot_utm = [(n, k, stf(TO_UTM, g).buffer(0)) for n, k, g in prot]
    prot_ras = rasterize([(g, i + 1) for i, (_, _, g) in enumerate(prot_utm)], out_shape=(H, W), transform=tr, dtype="int16")

    # ---------------- validação e pistas ----------------
    deter = read_json(CACHE / "deter_ro.geojson")["features"]
    dshapes = [(f["properties"], stf(TO_UTM, shp(f["geometry"]))) for f in deter
               if f["properties"]["classname"] in ("DESMATAMENTO_CR", "DESMATAMENTO_VEG", "CICATRIZ_DE_QUEIMADA", "DEGRADACAO")]
    dras = rasterize([(g, i + 1) for i, (_, g) in enumerate(dshapes)], out_shape=(H, W), transform=tr, dtype="int16", all_touched=True)
    fires = read_json(CACHE / "fires_ro.json")
    fire_px = defaultdict(list)
    inv_tr = ~tr
    for lo, la, t, sat, frp, _ in fires["rows"]:
        x, y = TO_UTM(lo, la)
        c, r = inv_tr * (x, y)
        r, c = int(r), int(c)
        if 0 <= r < H and 0 <= c < W:
            fire_px[(r, c)].append(t[:10])

    # séries HV por quadro (para o gráfico do cartão)
    stacks = {}
    for f in read_json(CACHE / "change_meta_hv.json")["frames_used"]:
        if f in dmeta["qc"] and "skipped" not in dmeta["qc"][f]:
            stacks[f] = np.load(CACHE / "stacks_hv" / f"{f}.npz")

    # ---------------- floresta derrubada ----------------
    mask = first > 0
    lab, n = label(mask, structure=np.ones((3, 3)))
    events = []
    for i in range(1, n + 1):
        m = lab == i
        rr, cc = np.where(m)
        r0, r1, c0, c1 = rr.min(), rr.max() + 1, cc.min(), cc.max() + 1
        sub = m[r0:r1, c0:c1]
        dates = first[r0:r1, c0:c1][sub]
        d = iso(Counter(dates.tolist()).most_common(1)[0][0])
        dmin = iso(dates.min())
        area = float(sub.sum()) * PX_HA
        cx, cy = tr * (cc.mean() + 0.5, rr.mean() + 0.5)
        lon, lat = TO_LL(cx, cy)
        mid = Counter(mun_ras[m].tolist()).most_common(1)[0][0]
        pid = [p for p in np.unique(prot_ras[m]) if p > 0]
        # pistas
        near = binary_dilation(m[max(r0 - 3, 0):r1 + 3, max(c0 - 3, 0):c1 + 3], iterations=2)
        dids = np.unique(dras[max(r0 - 3, 0):r1 + 3, max(c0 - 3, 0):c1 + 3][near])
        dids = [x for x in dids if x > 0]
        deter_hit = [{"classe": dshapes[x - 1][0]["classname"], "data": dshapes[x - 1][0]["view_date"]} for x in dids]
        fdays = sorted({t for (r, c) in zip(*np.where(near)) for t in fire_px.get((r + max(r0 - 3, 0), c + max(c0 - 3, 0)), [])})
        fire_after = [t for t in fdays if t >= (date.fromisoformat(dmin) - timedelta(days=45)).isoformat()]
        conf = int(nkeep[m].max())
        frames = int(nfr[m].max())
        tier = "confirmado" if deter_hit else ("provavel" if (conf >= 2 and area >= 3 * PX_HA) or frames >= 2 else "possivel")
        # cautela: dentro de Terra Indígena ou Unidade de Conservação, só aparece como
        # provável/confirmado o que o INPE também registrou
        if pid and not deter_hit:
            tier = "possivel"
        # série do radar
        series = None
        best = None
        for f, z in stacks.items():
            wr0, wr1, wc0, wc1 = z["win"]
            if wr0 <= r0 and r1 <= wr1 and wc0 <= c0 and c1 <= wc1:
                S = z["S"][:, r0 - wr0:r1 - wr0, c0 - wc0:c1 - wc0]
                vals = S[:, sub].astype(float)
                vals[vals == 0] = np.nan
                if np.isnan(vals).mean() < 0.2 and (best is None or len(z["dates"]) > best):
                    ring = binary_dilation(m[max(r0 - 8, 0):r1 + 8, max(c0 - 8, 0):c1 + 8], iterations=6) & ~binary_dilation(m[max(r0 - 8, 0):r1 + 8, max(c0 - 8, 0):c1 + 8], iterations=2)
                    ring &= lulc[max(r0 - 8, 0):r1 + 8, max(c0 - 8, 0):c1 + 8] == 2
                    S2 = z["S"][:, max(r0 - 8, 0) - wr0:r1 + 8 - wr0, max(c0 - 8, 0) - wc0:c1 + 8 - wc0].astype(float)
                    S2[S2 == 0] = np.nan
                    around = np.nanmean(S2[:, ring[:S2.shape[1], :S2.shape[2]]], axis=1) if ring.sum() > 5 else np.full(len(z["dates"]), np.nan)
                    series = {"frame": f, "dates": [str(x) for x in z["dates"]], "here": [None if np.isnan(v) else round(v, 1) for v in np.nanmean(vals, 1)],
                              "around": [None if np.isnan(v) else round(float(v), 1) for v in around]}
                    best = len(z["dates"])
        # geometria
        geoms = [stf(TO_LL, shp(g)) for g, v in shapes(sub.astype("uint8"), mask=sub, transform=tr * Affine.translation(c0, r0)) if v == 1]
        geom = unary_union(geoms).simplify(0.0008)
        events.append({
            "id": f"f{i}", "kind": "floresta", "date": d, "first_date": dmin, "period": period_of(d),
            "area_ha": round(area, 1), "lon": round(lon, 5), "lat": round(lat, 5),
            "municipio": mun_utm[mid - 1][0] if mid else None, "cd_mun": mun_utm[mid - 1][1] if mid else None,
            "protegida": [{"nome": prot_utm[p - 1][0], "tipo": prot_utm[p - 1][1]} for p in pid],
            "certeza": tier, "passagens_confirmaram": conf, "quadros": frames,
            "inpe": deter_hit[:3], "fogo_dias": fire_after[:20], "serie": series,
            "geometry": rnd(mapping(geom)["coordinates"]), "gtype": geom.geom_type,
        })
    events.sort(key=lambda e: -e["area_ha"])
    print("eventos de floresta:", len(events), Counter(e["certeza"] for e in events),
          "ha:", {k: round(sum(e["area_ha"] for e in events if e["certeza"] == k)) for k in ("confirmado", "provavel", "possivel")})

    # ---------------- lavoura ----------------
    c_date, c_mag = det["c_date"], det["c_mag"]
    crop = (lulc == 5) & inro
    farm = []
    for r in range(0, H - CELL + 1, CELL):
        for c in range(0, W - CELL + 1, CELL):
            cr = crop[r:r + CELL, c:c + CELL]
            if cr.sum() < 8:
                continue
            ch = cr & (c_date[r:r + CELL, c:c + CELL] > 0)
            if ch.sum() < max(4, 0.25 * cr.sum()):
                continue
            ds = c_date[r:r + CELL, c:c + CELL][ch]
            mg = c_mag[r:r + CELL, c:c + CELL][ch]
            dmode = iso(Counter(ds.tolist()).most_common(1)[0][0])
            down = float((mg < 0).mean())
            x, y = tr * (c + CELL / 2, r + CELL / 2)
            lon, lat = TO_LL(x, y)
            farm.append([round(lon, 4), round(lat, 4), period_of(dmode), dmode, round(float(ch.sum()) * PX_HA, 1),
                         "colheita" if down >= 0.6 else ("plantio" if down <= 0.4 else "misto"), int(mun_ras[r + CELL // 2, c + CELL // 2])])
    print("células de lavoura que mudaram:", len(farm), "ha:", round(sum(f[4] for f in farm)), Counter(f[5] for f in farm))

    # ---------------- períodos ----------------
    last = max(p["date"] for p in inv["passes"])
    nper = period_of(last) + 1
    periods = []
    for k in range(nper):
        a = T0 + timedelta(days=12 * k)
        b = a + timedelta(days=11)
        passes = [p for p in inv["passes"] if a.isoformat() <= p["date"] <= b.isoformat()]
        periods.append({"i": k, "start": a.isoformat(), "end": b.isoformat(), "passagens": len(passes),
                        "quadros": len({p["frame"] for p in passes})})

    # ---------------- municípios ----------------
    places = []
    for idx, (name, cd, g) in enumerate(mun_utm, start=1):
        gl = stf(TO_LL, g).simplify(0.004)
        ev = [e for e in events if e["cd_mun"] == cd]
        fa = [f for f in farm if f[6] == idx]
        c = gl.representative_point()
        places.append({"id": cd, "nome": name, "lon": round(c.x, 4), "lat": round(c.y, 4),
                       "floresta_ha": round(sum(e["area_ha"] for e in ev if e["certeza"] != "possivel")),
                       "lavoura_ha": round(sum(f[4] for f in fa)), "geometry": rnd(mapping(gl)["coordinates"], 4), "gtype": gl.geom_type})
    prot_out = []
    for nme, k, g in prot:
        gl = g.buffer(0).intersection(ro_ll).simplify(0.003)
        gl = unary_union([x for x in getattr(gl, "geoms", [gl]) if x.geom_type in ("Polygon", "MultiPolygon")])
        if gl.is_empty or gl.area < 1e-5:
            continue
        prot_out.append({"nome": nme, "tipo": k, "geometry": rnd(mapping(gl)["coordinates"], 4), "gtype": gl.geom_type})
    for f in farm:
        f[6] = mun_utm[f[6] - 1][1] if f[6] else None

    write_json(events, O / "events.json", compact=True)
    write_json({"columns": ["lon", "lat", "period", "date", "ha", "sentido", "cd_mun"], "cell_km": 1.08, "rows": farm}, O / "farm.json", compact=True)
    write_json({"municipios": places, "protegidas": prot_out}, O / "places.json", compact=True)
    write_json({"start": NISAR_START, "days": 12, "periods": periods}, O / "periods.json", compact=True)
    for p in sorted(O.glob("*.json")):
        print(p.name, f"{p.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
