"""Grade de cada quadro NISAR (UTM, 180 m) e registro na grade comum do estado.

Para 33 quadros a ASF publica um KML com os cantos exatos da prévia. Para
os outros (só produtos provisórios, KML com login) estimamos a grade:
1. zona UTM e margens médias do mesmo traço (ou da mesma direção de órbita);
2. ajuste fino por correlação de fase entre a prévia (floresta clara, campo
   escuro) e a classe Árvores do mapa de cobertura do solo.
O mesmo ajuste é rodado nos quadros com KML para medir o erro do método.
"""
import re

import numpy as np
from PIL import Image
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from common import CACHE, EPSG, read_json, write_json

PX = 180.0


def kml_rect(path):
    txt = path.read_text()
    pts = [tuple(map(float, q.split(","))) for q in re.search(r"<coordinates>(.*?)</coordinates>", txt, re.S).group(1).split()]
    best = None
    for zone in (19, 20, 21):
        t = Transformer.from_crs(4326, 32700 + zone, always_xy=True)
        xy = np.array([t.transform(*q) for q in pts])
        # cantos NO? KML LatLonQuad: SO, SE, NE, NO. Retângulo alinhado => x(SO)=x(NO), x(SE)=x(NE)
        err = abs(xy[0, 0] - xy[3, 0]) + abs(xy[1, 0] - xy[2, 0]) + abs(xy[0, 1] - xy[1, 1]) + abs(xy[2, 1] - xy[3, 1])
        if best is None or err < best[0]:
            best = (err, zone, xy)
    err, zone, xy = best
    snap = lambda v: round(v / 720) * 720
    return zone, (snap(xy[:, 0].min()), snap(xy[:, 1].min()), snap(xy[:, 0].max()), snap(xy[:, 1].max())), err


def lulc_trees_grid():
    meta = read_json(CACHE / "lulc_meta.json")
    a, b, c, d, e, f = meta["transform"]
    return np.load(CACHE / "lulc_180m.npy") == 2, (a, b, c, d, e, f)


def to_state(img, zone, x0, y1, trees_shape, state_tr, resampling=Resampling.bilinear):
    from affine import Affine
    out = np.zeros(trees_shape, "float32")
    reproject(img.astype("float32"), out, src_transform=from_origin(x0, y1, PX, PX), src_crs=f"EPSG:{32700 + zone}",
              dst_transform=Affine(*state_tr), dst_crs=f"EPSG:{EPSG}", resampling=resampling, src_nodata=0, dst_nodata=0)
    return out


def refine(img, zone, x0, y1, trees, state_tr):
    """Desloca a grade estimada até a prévia casar com o mapa de árvores (em px de 180 m)."""
    g = to_state(img, zone, x0, y1, trees.shape, state_tr)
    v = g > 0
    H, W = g.shape
    h = 256
    if v.sum() < (2 * h) ** 2 * 0.6:
        return 0, 0, 0.0
    ys, xs = np.where(v)
    cy = int(np.clip(np.median(ys), h, H - h))
    cx = int(np.clip(np.median(xs), h, W - h))
    A = g[cy - h:cy + h, cx - h:cx + h]
    B = trees[cy - h:cy + h, cx - h:cx + h].astype("float32")
    m = A > 0
    if m.mean() < 0.6:
        return 0, 0, 0.0
    A = np.where(m, A - A[m].mean(), 0)
    B = np.where(m, B - B[m].mean(), 0)
    F = np.fft.fft2(B) * np.conj(np.fft.fft2(A))
    c = np.fft.ifft2(F / (np.abs(F) + 1e-9)).real
    i = np.unravel_index(c.argmax(), c.shape)
    dy, dx = [int(k if k < h else k - 2 * h) for k in i]
    return dy, dx, float(c.max())


def main():
    inv = read_json(CACHE / "inventory.json")
    trees, state_tr = lulc_trees_grid()
    frames = sorted({p["frame"] for p in inv["passes"] if p["browse_ok"]})
    fp = {f: next(p for p in inv["passes"] if p["frame"] == f) for f in frames}
    grids, margins = {}, {}
    for f in frames:
        img = Image.open(CACHE / "nisar" / f / f"{fp[f]['date']}.png")
        W, H = img.size
        poly = np.array(fp[f]["footprint"])
        if f in inv["kml"]:
            zone, (x0, y0, x1, y1), err = kml_rect(CACHE / "nisar" / f / f"{inv['kml'][f]}.kml")
            t = Transformer.from_crs(4326, 32700 + zone, always_xy=True)
            xy = np.array([t.transform(*q) for q in poly])
            margins[f] = (xy[:, 0].min() - x0, y1 - xy[:, 1].max())
            grids[f] = {"zone": zone, "x0": x0, "y1": y1, "w": W, "h": H, "px_x": (x1 - x0) / W, "px_y": (y1 - y0) / H,
                        "source": "kml", "kml_fit_m": round(err, 1)}
    for f in frames:
        if f in grids:
            continue
        poly = np.array(fp[f]["footprint"])
        zone = int((poly[:, 0].mean() + 180) // 6) + 1
        # mesma zona dos vizinhos de traço com KML, se houver
        same_track = [g for g in margins if g[:4] == f[:4]]
        if same_track:
            zone = grids[same_track[0]]["zone"]
            mx = np.mean([margins[g][0] for g in same_track]); my = np.mean([margins[g][1] for g in same_track])
        else:
            same_dir = [g for g in margins if g[3] == f[3]]
            mx = np.mean([margins[g][0] for g in same_dir]); my = np.mean([margins[g][1] for g in same_dir])
        t = Transformer.from_crs(4326, 32700 + zone, always_xy=True)
        xy = np.array([t.transform(*q) for q in poly])
        img = Image.open(CACHE / "nisar" / f / f"{fp[f]['date']}.png")
        W, H = img.size
        grids[f] = {"zone": zone, "x0": round((xy[:, 0].min() - mx) / 720) * 720, "y1": round((xy[:, 1].max() + my) / 720) * 720,
                    "w": W, "h": H, "px_x": PX, "px_y": PX, "source": "estimated"}
    # ajuste fino (e teste do método nos quadros com KML)
    tests = []
    for f in frames:
        g = grids[f]
        a = np.asarray(Image.open(CACHE / "nisar" / f / f"{fp[f]['date']}.png")).astype("float32")
        dy, dx, peak = refine(a, g["zone"], g["x0"], g["y1"], trees, state_tr)
        g["refine_px"] = [dy, dx]
        g["refine_peak"] = round(peak, 3)
        if g["source"] == "kml":
            tests.append((f, dy, dx, round(peak, 3)))
        elif abs(dy) <= 60 and abs(dx) <= 60 and peak > 0.05:
            # deslocamento medido na grade do estado (UTM 20S); aplica no quadro
            g["x0"] += dx * PX
            g["y1"] -= dy * PX
            g["source"] = "estimated+refined"
        print(f, g["source"], "zona", g["zone"], "ajuste px", (dy, dx), "pico", round(peak, 3))
    errs = [max(abs(t[1]), abs(t[2])) for t in tests]
    print("TESTE nos quadros com KML: erro máximo", max(errs), "px; mediana", float(np.median(errs)), "px")
    write_json({"grids": grids, "method_test": tests}, CACHE / "grids.json")


if __name__ == "__main__":
    main()
