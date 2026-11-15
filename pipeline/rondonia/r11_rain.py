"""Caso 1, "Corte ou chuva?": NISAR + Meteomatics.

O NISAR vê a floresta mudar, mas sozinho não sabe se o eco mudou porque o chão estava molhado.
A Meteomatics vê a chuva, mas sozinha não enxerga nem um graveto. Juntos: mudança real, sem
falso alarme de chuva.

Para cada lugar de floresta derrubada (events.json):
  - imagem de antes  = última passagem NISAR antes da queda
  - imagem da queda  = primeira passagem em que o eco caiu
  - chuva em 48 h antes de cada imagem (as passagens sobre RO são por volta das 10:00 UTC)
  - passagens seguintes secas em que a queda continuou (o detector já exige que a queda persista)

Veredito:
  corte             -> seco (< LIMITE mm) antes das duas imagens
  corte_apos_chuva  -> choveu perto de alguma imagem, mas houve passagem seca depois e a queda continuou
  duvida            -> choveu perto e ainda não houve passagem seca depois

Também gera a chuva média de Rondônia por dia e por período de 12 dias (linha do tempo).

Dados: Meteomatics Weather API (modelo 'mix', parâmetro precip_24h:mm).
  - Com METEOMATICS_USERNAME e METEOMATICS_PASSWORD no ambiente, baixa direto da API.
  - Sem elas, usa o que já está em pipeline/cache/ro/meteomatics/ (baixado pelo conector MCP).
A credencial nunca vai para o site: o navegador só lê public/data/ro/rain.json.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import urllib.request

from common import CACHE, OUT, read_json, write_json

O = OUT / "ro"
MM = CACHE / "meteomatics"
LIMITE = 5.0          # mm em 48 h: abaixo disso, chão considerado seco
HORA = "10:00:00Z"    # horário aproximado das passagens NISAR sobre RO
PARAM = "precip_24h:mm"
MODEL = "mix"
# contorno simplificado de Rondônia (lat,lon) para a média estadual
RO_POLY = [(-7.97, -63.6), (-8.8, -61.6), (-10.1, -61.5), (-11.9, -60.1), (-12.8, -60.4),
           (-13.6, -61.0), (-13.0, -62.5), (-12.3, -63.9), (-11.0, -65.3), (-9.7, -65.4),
           (-9.3, -66.6), (-8.6, -64.2)]


def day(s: str) -> dt.date:
    return dt.date.fromisoformat(s[:10])


def api(path: str):
    user, pw = os.environ["METEOMATICS_USERNAME"], os.environ["METEOMATICS_PASSWORD"]
    req = urllib.request.Request(f"https://api.meteomatics.com/{path}/json?model={MODEL}")
    req.add_header("Authorization", "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode())
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def fetch_points(events):
    """{event_id: {YYYY-MM-DD: mm nas 24 h até as 10:00 UTC}} para cada passagem e o dia anterior."""
    out = {}
    for e in events:
        dates = e["serie"]["dates"]
        t0, t1 = day(dates[0]) - dt.timedelta(days=1), day(dates[-1])
        js = api(f"{t0}T{HORA}--{t1}T{HORA}:P1D/{PARAM}/{e['lat']},{e['lon']}")
        out[e["id"]] = {d["date"][:10]: d["value"] for d in js["data"][0]["coordinates"][0]["dates"]}
    return out


def fetch_state(t0: str, t1: str):
    poly = "_".join(f"{la},{lo}" for la, lo in RO_POLY)
    js = api(f"{t0}T{HORA}--{t1}T{HORA}:P1D/{PARAM}/{poly}:mean")
    return [[d["date"][:10], d["value"]] for d in js["data"][0]["coordinates"][0]["dates"]]


def rain48(series: dict, d: str) -> float | None:
    a = series.get(d)
    b = series.get(str(day(d) - dt.timedelta(days=1)))
    if a is None or b is None:
        return None
    return round(a + b, 1)


def classify(e, series):
    dates = e["serie"]["dates"]
    first = e["first_date"]
    before = [d for d in dates if d < first]
    after = [d for d in dates if d > first]
    if not before:
        return None
    base, det = before[-1], first
    bmm, dmm = rain48(series, base), rain48(series, det)
    if bmm is None or dmm is None:
        return None
    secas = sum(1 for d in after if (r := rain48(series, d)) is not None and r < LIMITE)
    if bmm < LIMITE and dmm < LIMITE:
        v = "corte"
    elif secas > 0:
        v = "corte_apos_chuva"
    else:
        v = "duvida"
    return {"base": base, "deteccao": det, "base_mm": bmm, "deteccao_mm": dmm, "secas_depois": secas, "veredito": v}


def main():
    MM.mkdir(parents=True, exist_ok=True)
    events = read_json(O / "events.json")
    periods = read_json(O / "periods.json")["periods"]
    if os.environ.get("METEOMATICS_USERNAME"):
        write_json(fetch_points([e for e in events if e.get("serie")]), MM / "points.json")
        write_json(fetch_state(periods[0]["start"], periods[-1]["end"]), MM / "ro_daily.json")
    points = read_json(MM / "points.json")
    daily = read_json(MM / "ro_daily.json")

    n = {"corte": 0, "corte_apos_chuva": 0, "duvida": 0, "sem_dado": 0}
    for e in events:
        c = classify(e, points.get(e["id"], {})) if e.get("serie") else None
        if c:
            e["chuva"] = c
            n[c["veredito"]] += 1
        else:
            e.pop("chuva", None)
            n["sem_dado"] += 1
    write_json(events, O / "events.json", compact=True)

    by_day = {d: v for d, v in daily}
    per = [round(sum(by_day.get(str(day(p["start"]) + dt.timedelta(days=k)), 0) for k in range(12)), 1) for p in periods]
    write_json({"fonte": "Meteomatics Weather API", "modelo": MODEL, "parametro": PARAM, "limite_mm": LIMITE,
                "daily": daily, "periods": per}, O / "rain.json", compact=True)

    m = read_json(O / "meta.json")
    m["chuva"] = {"fonte": "Meteomatics Weather API", "modelo": MODEL, "limite_mm": LIMITE, **n,
                  "mm_periodo": per, "url": "https://www.meteomatics.com/en/weather-api/"}
    write_json(m, O / "meta.json")
    print("vereditos:", n, "| chuva RO por período (mm):", per)


if __name__ == "__main__":
    main()
