"""Focos de calor em Rondônia desde o início do NISAR.

Fonte: NASA FIRMS (VIIRS S-NPP, NOAA-20, NOAA-21 e MODIS).
Com a chave gratuita FIRMS_MAP_KEY, baixa o histórico inteiro pela API. Sem chave, soma os últimos
7 dias (arquivos abertos do FIRMS) ao que já está guardado. Os arquivos mensais do INPE (Programa
Queimadas, mesmas detecções) ficam só como reserva para a primeira execução sem chave.
Guardamos só satélites de órbita polar (os geoestacionários repetem focos).
"""
import csv
import io
import os
import urllib.request
from datetime import date, timedelta

from common import CACHE, NISAR_START, RO_BBOX, read_json, write_json

INPE = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/focos_mensal_br_{ym}.csv"
POLAR = ("AQUA", "TERRA", "NPP", "NOAA-20", "NOAA-21")
FIRMS = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{bbox}/5/{day}"
FIRMS_SRC = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"]
_F7 = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/"
FIRMS_7D = [_F7 + "suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_7d.csv", _F7 + "noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_7d.csv",
            _F7 + "noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_7d.csv", _F7 + "modis-c6.1/csv/MODIS_C6_1_South_America_7d.csv"]
SAT = {"N": "NPP-375", "N20": "NOAA-20", "N21": "NOAA-21", "1": "NOAA-20", "2": "NOAA-21", "Terra": "TERRA_M-T", "Aqua": "AQUA_M-T", "T": "TERRA_M-T", "A": "AQUA_M-T"}


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
    """Histórico completo pela API de área do FIRMS (precisa da chave gratuita FIRMS_MAP_KEY)."""
    rows = []
    bbox = ",".join(map(str, RO_BBOX))
    d = date.fromisoformat(NISAR_START)
    while d <= end:
        for src in FIRMS_SRC:
            try:
                with urllib.request.urlopen(FIRMS.format(key=key, src=src, bbox=bbox, day=d.isoformat()), timeout=300) as r:
                    for row in csv.DictReader(io.TextIOWrapper(r, encoding="utf-8")):
                        rows.append(firms_row(row))
            except Exception as ex:
                print(d, src, "indisponível", type(ex).__name__)
        d += timedelta(days=5)
    return rows


def firms_row(row):
    hhmm = row["acq_time"].zfill(4)
    return [round(float(row["longitude"]), 4), round(float(row["latitude"]), 4), f"{row['acq_date']}T{hhmm[:2]}:{hhmm[2:]}Z",
            SAT.get(row.get("satellite", ""), row.get("satellite", "")), float(row["frp"]) if row.get("frp") else None, ""]


def from_firms_7d():
    """Últimos 7 dias pelos arquivos abertos do FIRMS (sem chave). Usado na atualização diária."""
    rows = []
    w, s, e, n = RO_BBOX
    for url in FIRMS_7D:
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                for row in csv.DictReader(io.TextIOWrapper(r, encoding="utf-8")):
                    if w <= float(row["longitude"]) <= e and s <= float(row["latitude"]) <= n:
                        rows.append(firms_row(row))
        except Exception as ex:
            print(url.rsplit("/", 1)[-1], "indisponível", type(ex).__name__)
    return rows


def in_rondonia(rows):
    """O FIRMS não diz o município: descobrimos pelo limite oficial (SEDAM/IBGE) e descartamos o que cai fora de RO."""
    from shapely.geometry import Point, shape
    from shapely.strtree import STRtree
    feats = read_json(CACHE / "sedam" / "municipios.geojson")["features"]
    geoms = [shape(f["geometry"]) for f in feats]
    tree = STRtree(geoms)
    out = []
    for r in rows:
        if r[5]:
            out.append(r)
            continue
        p = Point(r[0], r[1])
        for i in tree.query(p):
            if geoms[i].contains(p):
                out.append(r[:5] + [feats[i]["properties"]["NM_MUN"]])
                break
    return out


def main():
    end = date.today()
    key = os.environ.get("FIRMS_MAP_KEY")
    dest = CACHE / "fires_ro.json"
    old = read_json(dest) if dest.exists() else {"rows": [], "source": ""}
    if key:
        rows = from_firms(key, end)
        source = "NASA FIRMS (VIIRS S-NPP, NOAA-20, NOAA-21 e MODIS)"
        if len(rows) < 100:  # API fora do ar: não apaga o que já temos
            rows, source = old["rows"] + from_firms_7d(), old["source"] or source
    else:
        novos = from_firms_7d()
        rows = old["rows"] + novos
        source = old["source"] or "NASA FIRMS (VIIRS e MODIS)"
        if "INPE" in source and "FIRMS" not in source and novos:
            source = "NASA FIRMS (últimos dias) + INPE Programa Queimadas (histórico, mesmas detecções VIIRS e MODIS)"
        if not rows:  # primeira vez sem chave e sem FIRMS: cai nos arquivos mensais do INPE
            rows, source, _ = from_inpe(end)
    rows = in_rondonia(rows)
    seen, uniq = set(), []
    for r in sorted(rows, key=lambda r: r[2]):
        k = (round(r[0], 3), round(r[1], 3), r[2])
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    write_json({"source": source, "source_url": "https://firms.modaps.eosdis.nasa.gov/", "columns": ["lon", "lat", "utc", "satelite", "frp_mw", "municipio"],
                "rows": uniq}, dest, compact=True)
    print("total", len(uniq), "focos |", source)


if __name__ == "__main__":
    main()
