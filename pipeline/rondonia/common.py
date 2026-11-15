"""Configuração e utilidades do pipeline estadual (Rondônia inteira)."""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import lib  # noqa: E402  (http_json, download, save_*)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CACHE = HERE.parent / "cache" / "ro"
OUT = ROOT / "public" / "data"

# Caixa de busca de Rondônia (oeste, sul, leste, norte) e início dos dados NISAR calibrados
RO_BBOX = (-66.9, -13.8, -59.7, -7.8)
NISAR_START = "2026-06-17"
CMR_COLLECTIONS = {"C2854338529-ASF": "NISAR_L2_GCOV_PROVISIONAL_V1", "C3622241360-ASF": "NISAR_L2_GCOV_V1"}
BROWSE = "https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/{coll}/{g}/{g}{suffix}"

# Grade comum do estado: UTM 20S, 180 m (o espaçamento das prévias NISAR)
EPSG = 32720
RES = 180.0

SEDAM_WFS = "https://geoportal.sedam.ro.gov.br/geoserver/ows"
GRANULE_RE = re.compile(r"NISAR_L2_(\w\w)_GCOV_(\d{3})_(\d{3})_([AD])_(\d{3})_(\d{4})_(\w{4})_\w_(\d{8})T(\d{6})")


def frame_key(track: int, ad: str, frame: int) -> str:
    return f"{track:03d}{ad}{frame:03d}"


def read_json(p: Path):
    return json.loads(p.read_text())


def write_json(obj, p: Path, compact: bool = False):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(obj, ensure_ascii=False, indent=1))


def wfs(layer: str, extra: str = "") -> dict:
    url = f"{SEDAM_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeName={layer}&outputFormat=application/json&srsName=EPSG:4326{extra}"
    req = urllib.request.Request(url, headers={"User-Agent": "SARtellite-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)
