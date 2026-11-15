"""Funções compartilhadas do pipeline SARtellite."""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer

import config as C

_ca = Path.home() / ".ccr" / "ca-bundle.crt"
if _ca.exists():  # ambiente com proxy corporativo
    os.environ.setdefault("CURL_CA_BUNDLE", str(_ca))
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "4")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "2")

TO_LL = Transformer.from_crs(C.EPSG, 4326, always_xy=True)
TO_UTM = Transformer.from_crs(4326, C.EPSG, always_xy=True)


def http_json(url: str, body: dict | None = None, timeout: int = 90):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def download(url: str, dest: Path, timeout: int = 300) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "SARtellite-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        dest.write_bytes(r.read())
    return dest


# ---------- grade da área de demonstração ----------
def aoi_grid():
    """Retorna (transform, largura, altura, bounds UTM) alinhados a C.RES."""
    from rasterio.transform import from_origin

    cx, cy = TO_UTM.transform(*C.AOI["center_lonlat"])
    half = C.AOI["size_m"] / 2
    x0 = round((cx - half) / C.RES) * C.RES
    y1 = round((cy + half) / C.RES) * C.RES
    n = int(C.AOI["size_m"] / C.RES)
    return from_origin(x0, y1, C.RES, C.RES), n, n, (x0, y1 - n * C.RES, x0 + n * C.RES, y1)


def corners_lonlat(bounds):
    """Cantos na ordem que o MapLibre espera: NO, NE, SE, SO."""
    x0, y0, x1, y1 = bounds
    pts = [(x0, y1), (x1, y1), (x1, y0), (x0, y0)]
    return [[round(v, 6) for v in TO_LL.transform(*p)] for p in pts]


def bbox_lonlat(bounds):
    c = corners_lonlat(bounds)
    xs, ys = [p[0] for p in c], [p[1] for p in c]
    return [min(xs), min(ys), max(xs), max(ys)]


# ---------- Planetary Computer ----------
def stac_search(collection: str, bbox, start: str, end: str, query: dict | None = None):
    body = {"collections": [collection], "bbox": bbox, "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z", "limit": 500}
    if query:
        body["query"] = query
    feats = http_json(C.STAC + "/search", body)["features"]
    return sorted(feats, key=lambda f: f["properties"].get("datetime") or f["properties"].get("start_datetime"))


@lru_cache(maxsize=None)
def _token(account: str, container: str) -> str:
    return http_json(f"{C.SAS}/{account}/{container}")["token"]


def sign(href: str) -> str:
    u = urllib.parse.urlparse(href)
    account = u.netloc.split(".")[0]
    container = u.path.lstrip("/").split("/")[0]
    return f"{href}?{_token(account, container)}"


def read_to_grid(href: str, resampling: str = "average", band: int = 1, signed: bool = True) -> np.ndarray:
    """Lê um COG remoto direto na grade da área de demonstração."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT

    tr, w, h, _ = aoi_grid()
    url = sign(href) if signed else href
    with rasterio.open(url) as src:
        with WarpedVRT(src, crs=f"EPSG:{C.EPSG}", transform=tr, width=w, height=h,
                       resampling=getattr(Resampling, resampling)) as vrt:
            return vrt.read(band)


# ---------- imagens ----------
def to_db(power: np.ndarray) -> np.ndarray:
    return 10 * np.log10(np.where(power > 0, power, np.nan))


def scale_u8(a: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Escala linear lo..hi para 1..255. Zero fica reservado para 'sem dado'."""
    s = 1 + (np.clip(a, lo, hi) - lo) / (hi - lo) * 254
    return np.where(np.isfinite(a), s, 0).astype(np.uint8)


def save_webp(arr: np.ndarray, path: Path, quality: int = 82, lossless: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr).save(path, "WEBP", quality=quality, lossless=lossless, method=6)
    return path.stat().st_size


def save_png(arr: np.ndarray, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr).save(path, "PNG", optimize=True)
    return path.stat().st_size


def write_json(obj, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1))
