"""Focos de calor (INPE) e chuva (NASA POWER) como contexto.

Focos: Programa Queimadas/INPE, arquivos mensais abertos. Eles reúnem as
detecções dos sensores MODIS (Aqua, Terra) e VIIRS (S-NPP, NOAA-20, NOAA-21)
da NASA/NOAA, entre outros. Guardamos apenas satélites de órbita polar e só
os focos dentro do quadro NISAR. Foco de calor não é área queimada.

Chuva: NASA POWER, parâmetro PRECTOTCORR (mm/dia), ponto central da área.
Resolução nativa de cerca de 0,5 x 0,625 grau: é contexto regional.
"""
import csv
import io
import json
import urllib.request

import config as C
import lib

INPE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/focos_mensal_br_{ym}.csv"
POLAR = ("AQUA", "TERRA", "NPP", "NOAA-20", "NOAA-21")
MONTHS = ["202606", "202607", "202608", "202609", "202610", "202611"]


def frame_bbox():
    meta = json.loads((C.CACHE / "nisar_meta.json").read_text())
    xs = [p[0] for g in meta for p in g["footprint"]]
    ys = [p[1] for g in meta for p in g["footprint"]]
    return min(xs), min(ys), max(xs), max(ys)


def fires():
    w, s, e, n = frame_bbox()
    rows, status = [], {}
    for ym in MONTHS:
        try:
            with urllib.request.urlopen(INPE.format(ym=ym), timeout=600) as r:
                rd = csv.DictReader(io.TextIOWrapper(r, encoding="utf-8", errors="replace"))
                k = 0
                for row in rd:
                    try:
                        la, lo = float(row["lat"]), float(row["lon"])
                    except (ValueError, KeyError):
                        continue
                    if not (s <= la <= n and w <= lo <= e):
                        continue
                    sat = row["satelite"].upper()
                    if not any(p in sat for p in POLAR):
                        continue
                    frp = row.get("frp") or ""
                    rows.append([round(lo, 4), round(la, 4), row["data_hora_gmt"][:16].replace(" ", "T") + "Z",
                                 row["satelite"], float(frp) if frp not in ("", "None") else None])
                    k += 1
                status[ym] = k
        except Exception as ex:  # mês ainda não publicado, por exemplo
            status[ym] = f"indisponível: {type(ex).__name__}"
        print(ym, status[ym])
    rows.sort(key=lambda r: r[2])
    lib.write_json({"bbox": [w, s, e, n], "months": status, "columns": ["lon", "lat", "utc", "satelite", "frp_mw"],
                    "rows": rows}, C.CACHE / "fires_frame.json")


def rain():
    lon, lat = C.AOI["center_lonlat"]
    url = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG"
           f"&longitude={lon}&latitude={lat}&start={C.T0.replace('-', '')}&end={C.T1.replace('-', '')}&format=JSON")
    d = lib.http_json(url)
    p = d["properties"]["parameter"]["PRECTOTCORR"]
    days = [{"date": f"{k[:4]}-{k[4:6]}-{k[6:]}", "mm": (v if v >= 0 else None)} for k, v in sorted(p.items())]
    lib.write_json({"source": "NASA POWER (PRECTOTCORR)", "source_url": url, "units": "mm/dia",
                    "point": [lon, lat], "days": days}, C.CACHE_AOI / "rain.json")
    print("chuva:", len(days), "dias, total", round(sum(x["mm"] or 0 for x in days), 1), "mm")


if __name__ == "__main__":
    rain()
    fires()
