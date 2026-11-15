"""Focos de calor em Rondônia desde o início do NISAR.

Fonte preferida: NASA FIRMS (VIIRS S-NPP, NOAA-20, NOAA-21 e MODIS), se a
variável FIRMS_MAP_KEY existir. Sem chave, usamos os arquivos mensais abertos
do INPE (Programa Queimadas), que trazem as detecções dos mesmos satélites.
Guardamos só satélites de órbita polar (os geoestacionários repetem focos).
"""
import csv
import io
import os
import urllib.request
from datetime import date, timedelta

from common import CACHE, NISAR_START, RO_BBOX, write_json

INPE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/focos_mensal_br_{ym}.csv"
POLAR = ("AQUA", "TERRA", "NPP", "NOAA-20", "NOAA-21")
FIRMS = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{bbox}/5/{day}"
FIRMS_SRC = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"]


def months(start, end):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield f"{y}{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def from_inpe(end):
    rows = []
    for ym in months(date.fromisoformat(NISAR_START), end):
        try:
            with urllib.request.urlopen(INPE.format(ym=ym), timeout=900) as r:
                for row in csv.DictReader(io.TextIOWrapper(r, encoding="utf-8", errors="replace")):
                    if row.get("estado", "").upper() not in ("RONDÔNIA", "RONDONIA"):
                        continue
                    sat = row["satelite"].upper()
                    if not any(p in sat for p in POLAR):
                        continue
                    t = row["data_hora_gmt"][:16].replace(" ", "T") + "Z"
                    if t[:10] < NISAR_START:
                        continue
                    frp = row.get("frp") or ""
                    rows.append([round(float(row["lon"]), 4), round(float(row["lat"]), 4), t, row["satelite"],
                                 float(frp) if frp not in ("", "None") else None, row.get("municipio", "")])
            print(ym, len(rows))
        except Exception as ex:
            print(ym, "indisponível", type(ex).__name__)
    return rows, "INPE Programa Queimadas (detecções VIIRS e MODIS)", "https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/"


def from_firms(key, end):
    rows = []
    bbox = ",".join(map(str, RO_BBOX))
    d = date.fromisoformat(NISAR_START)
    while d <= end:
        for src in FIRMS_SRC:
            with urllib.request.urlopen(FIRMS.format(key=key, src=src, bbox=bbox, day=d.isoformat()), timeout=300) as r:
                for row in csv.DictReader(io.TextIOWrapper(r, encoding="utf-8")):
                    hhmm = row["acq_time"].zfill(4)
                    rows.append([round(float(row["longitude"]), 4), round(float(row["latitude"]), 4),
                                 f"{row['acq_date']}T{hhmm[:2]}:{hhmm[2:]}Z", f"{src.split('_')[0]} {row['satellite']}",
                                 float(row["frp"]) if row.get("frp") else None, ""])
        d += timedelta(days=5)
    return rows, "NASA FIRMS (VIIRS e MODIS)", "https://firms.modaps.eosdis.nasa.gov/"


def main():
    end = date.today()
    key = os.environ.get("FIRMS_MAP_KEY")
    rows, source, url = from_firms(key, end) if key else from_inpe(end)
    rows.sort(key=lambda r: r[2])
    write_json({"source": source, "source_url": url, "columns": ["lon", "lat", "utc", "satelite", "frp_mw", "municipio"], "rows": rows},
               CACHE / "fires_ro.json", compact=True)
    print("total", len(rows), "focos |", source)


if __name__ == "__main__":
    main()
