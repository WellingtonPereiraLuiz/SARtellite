"""Detecção final a partir das séries salvas por r05.

Floresta derrubada usa a polarização HV (pipeline/cache/ro/stacks_hv): é o
eco da copa e cai quando as árvores são derrubadas. O HH quase não muda
(teste com os polígonos do DETER). Lavoura usa HH (stacks).

Melhorias sobre a primeira versão, cada uma medida contra o INPE DETER:
- controle de qualidade por passagem: uma data em que mais de QC_MAX da
  floresta "cai" ao mesmo tempo é defeito de imagem, não derrubada, e sai;
- linha de base robusta: mediana das três primeiras passagens boas;
- comparação local: cada pixel é medido em relação à floresta vizinha
  (janela de LOCAL px, ~6 km) na mesma passagem; se a própria vizinhança
  escureceu SEASONAL ou mais (várzea secando), a queda não conta;
- floresta alagada: base muito clara (>= FLOOD_BASE, eco de duplo ressalto)
  fica de fora, porque ela escurece quando a água baixa na seca;
- só dentro de Rondônia;
- quadros com menos de MIN_DATES passagens HV boas ou que marcam mais de
  FRAME_MAX da floresta de uma vez são descartados (ruído da prévia);
- persistência: a queda precisa se manter em pelo menos KEEP_N passagens
  seguintes; a última passagem só entra se outro quadro também viu;
- mancha mínima de MIN_PX pixels (180 m x 180 m = 3,24 ha cada).
"""
import json
import sys

import numpy as np
from scipy.ndimage import label, uniform_filter

from common import CACHE, read_json, write_json

P = dict(BASE_MIN=160, FLOOD_BASE=242, DROP=45, KEEP=30, KEEP_N=1, QC_MAX=0.03, MIN_PX=3, CROP=45, FRAME_MAX=0.004, MIN_DATES=6, LOCAL=33, BASE_DEV=25, SEASONAL=15)


def ro_mask(shape, tr):
    from rasterio.features import rasterize
    from affine import Affine
    from pyproj import Transformer
    from shapely.geometry import shape as shp
    from shapely.ops import transform as stf, unary_union
    t = Transformer.from_crs(4326, 32720, always_xy=True).transform
    fc = read_json(CACHE / "sedam" / "municipios.geojson")
    geoms = [stf(t, shp(f["geometry"])) for f in fc["features"]]
    return rasterize([(unary_union(geoms), 1)], out_shape=shape, transform=Affine(*tr), dtype="uint8") == 1


def detect(p=P, verbose=True):
    meta = read_json(CACHE / "lulc_meta.json")
    lulc = np.load(CACHE / "lulc_180m.npy")
    H, W = lulc.shape
    inro = ro_mask((H, W), meta["transform"])
    used = read_json(CACHE / "change_meta_hv.json")["frames_used"]
    used_hh = read_json(CACHE / "change_meta.json")["frames_used"]
    INF = 99999999
    first = np.full((H, W), INF, "int32"); nfr = np.zeros((H, W), "int8"); nkeep = np.zeros((H, W), "int8")
    lastonly = np.zeros((H, W), bool)
    c_date = np.zeros((H, W), "int32"); c_mag = np.zeros((H, W), "float32"); c_n = np.zeros((H, W), "int8")
    qc_log = {}
    for f in sorted(used):
        z = np.load(CACHE / "stacks_hv" / f"{f}.npz")
        S = z["S"].astype("float32"); S[S == 0] = np.nan
        r0, r1, c0, c1 = z["win"]; dates = [str(d) for d in z["dates"]]
        win = (slice(r0, r1), slice(c0, c1))
        tr = (lulc[win] == 2) & inro[win]
        # QC por data contra a mediana das 3 primeiras
        b0 = np.nanmedian(S[:3], axis=0)
        m0 = tr & (b0 >= p["BASE_MIN"])
        rates = []
        for k in range(len(S)):
            ok = m0 & np.isfinite(S[k])
            rates.append(float(((b0 - S[k])[ok] >= p["DROP"]).mean()) if ok.sum() > 2000 else 0.0)
        good = [k for k, r in enumerate(rates) if r <= p["QC_MAX"]]
        qc_log[f] = {"dates": dates, "rate": [round(r, 4) for r in rates], "kept": [dates[k] for k in good]}
        if len(good) < p["MIN_DATES"]:
            qc_log[f]["skipped"] = f"só {len(good)} passagens HV boas"
            continue
        G = S[good]; gd = [dates[k] for k in good]; dint = np.array([int(d.replace("-", "")) for d in gd])
        base_abs = np.nanmedian(G[:3], axis=0)
        forest = tr & (base_abs >= p["BASE_MIN"]) & (base_abs < p["FLOOD_BASE"])
        # cada passagem vira "diferença para a floresta vizinha" (janela de LOCAL px):
        # seca, chuva e faixas do radar mudam a vizinhança inteira e se cancelam
        BG = np.full(G.shape, np.nan, "float32")
        for k in range(len(G)):
            fm = forest & np.isfinite(G[k])
            num = uniform_filter(np.where(fm, G[k], 0), p["LOCAL"])
            den = uniform_filter(fm.astype("float32"), p["LOCAL"])
            BG[k] = np.where(den > 0.15, num / np.maximum(den, 1e-6), np.nan)
            G[k] = G[k] - BG[k]
        base = np.nanmedian(G[:3], axis=0)
        bg_base = np.nanmedian(BG[:3], axis=0)
        # maior escurecimento da vizinhança daqui para a frente (várzea seca aos poucos)
        bg_drop_after = np.full(G.shape, -np.inf, "float32")
        run = np.full(base.shape, -np.inf, "float32")
        for k in range(len(G) - 1, -1, -1):
            run = np.fmax(run, bg_base - BG[k])
            bg_drop_after[k] = run
        det = np.full(base.shape, INF, "int32"); keep = np.zeros(base.shape, "int8"); last = np.zeros(base.shape, bool)
        forest &= np.abs(base) <= p["BASE_DEV"]  # começa parecido com a floresta vizinha
        for k in range(3, len(G)):
            # várzea: se a floresta vizinha também escureceu, é seca sazonal, não derrubada
            seasonal = bg_drop_after[k] >= p["SEASONAL"]
            hit = forest & ((base - G[k]) >= p["DROP"]) & (det == INF) & ~seasonal
            later = G[k + 1:]
            if len(later):
                fin = np.isfinite(later)
                low = (base - later) >= p["KEEP"]
                hit &= np.all(~fin | low, axis=0)
                nl = np.sum(fin & low, axis=0)
                hit &= nl >= p["KEEP_N"]
                is_last = np.zeros(base.shape, bool)
            else:
                nl = np.zeros(base.shape, "int8"); is_last = hit
            det = np.where(hit, dint[k], det); keep = np.where(hit, nl, keep).astype("int8"); last |= is_last
        new = det < INF
        rate = float(new.sum() / max(forest.sum(), 1))
        qc_log[f]["forest_flag_rate"] = round(rate, 5)
        if rate > p["FRAME_MAX"]:
            # quadro que "derruba" floresta demais de uma vez: ruído da prévia, não derrubada
            qc_log[f]["skipped"] = f"marcou {rate:.2%} da floresta"
            if verbose:
                print(f, "DESCARTADO:", qc_log[f]["skipped"])
            continue
        fw = first[win]
        nfr[win] += new.astype("int8")
        first[win] = np.where(new & (det < fw), det, fw)
        nkeep[win] = np.where(new, np.maximum(nkeep[win], keep), nkeep[win])
        lastonly[win] |= last
        if verbose:
            bad = [d for d, r in zip(dates, rates) if r > p["QC_MAX"]]
            print(f, "datas boas", len(good), "de", len(dates), ("| descartadas: " + ", ".join(bad)) if bad else "", "| px", int(new.sum()))
    # lavoura (HH, todas as passagens, com o mesmo controle de qualidade por data)
    for f in sorted(used_hh):
        z = np.load(CACHE / "stacks" / f"{f}.npz")
        S = z["S"].astype("float32"); S[S == 0] = np.nan
        r0, r1, c0, c1 = z["win"]; dates = [str(d) for d in z["dates"]]
        win = (slice(r0, r1), slice(c0, c1))
        ref = np.nanmedian(S, axis=0)
        ok = np.isfinite(ref) & (lulc[win] == 2)
        # data defeituosa: a floresta (que não deveria mudar) muda demais
        good = [k for k in range(len(S)) if ok.sum() < 2000 or float((np.abs(S[k] - ref)[ok & np.isfinite(S[k])] >= p["CROP"]).mean()) <= p["QC_MAX"]]
        if len(good) < 3:
            continue
        G = S[good]; dint = np.array([int(dates[k].replace("-", "")) for k in good])
        base = G[0]
        cr = (lulc[win] == 5) & inro[win]
        best = np.zeros(base.shape, "float32"); bdate = np.zeros(base.shape, "int32")
        for k in range(1, len(G)):
            dd = G[k] - G[k - 1]
            big = cr & np.isfinite(dd) & (np.abs(dd) >= p["CROP"]) & (np.abs(dd) > np.abs(best))
            best = np.where(big, dd, best); bdate = np.where(big, dint[k], bdate)
        upd = np.abs(best) > np.abs(c_mag[win])
        c_mag[win] = np.where(upd, best, c_mag[win]); c_date[win] = np.where(upd, bdate, c_date[win])
        c_n[win] += (cr & np.isfinite(G).sum(0).astype(bool)).astype("int8")

    # última passagem só vale se outro quadro também viu
    det_ok = (first < INF) & (~lastonly | (nfr >= 2) | (nkeep >= 1))
    lab, n = label(det_ok, structure=np.ones((3, 3)))
    sizes = np.bincount(lab.ravel())
    keepmask = det_ok & (sizes[lab] >= p["MIN_PX"])
    first = np.where(keepmask, first, 0)
    return dict(first=first, nfr=nfr, nkeep=nkeep, lastonly=lastonly & keepmask, c_date=c_date, c_mag=c_mag, c_n=c_n,
                inro=inro, qc=qc_log, params=p)


def evaluate(res):
    """Compara com o DETER (corte raso) na grade de 180 m."""
    from rasterio.features import rasterize
    from affine import Affine
    from pyproj import Transformer
    from shapely.geometry import shape as shp
    from shapely.ops import transform as stf
    from scipy.ndimage import binary_dilation
    meta = read_json(CACHE / "lulc_meta.json")
    t = Transformer.from_crs(4326, 32720, always_xy=True).transform
    fc = read_json(CACHE / "deter_ro.geojson")
    gs = [stf(t, shp(f["geometry"])) for f in fc["features"] if f["properties"]["classname"].startswith("DESMATAMENTO")]
    shape = res["first"].shape
    dm = rasterize([(g, 1) for g in gs], out_shape=shape, transform=Affine(*meta["transform"]), dtype="uint8", all_touched=True) == 1
    ours = res["first"] > 0
    near = binary_dilation(dm, iterations=2)
    prec = float((ours & near).sum() / max(ours.sum(), 1))
    lab, n = label(dm, structure=np.ones((3, 3)))
    hit = np.unique(lab[binary_dilation(ours, iterations=2) & (lab > 0)])
    recall_poly = len(hit) / max(n, 1)
    return {"our_ha": round(float(ours.sum()) * 3.24), "deter_ha": round(sum(g.area for g in gs) / 1e4), "deter_polys": n,
            "precision_near_deter": round(prec, 3), "deter_polys_found": round(recall_poly, 3)}


if __name__ == "__main__":
    import itertools
    if len(sys.argv) > 1 and sys.argv[1] == "sweep":
        for drop, keep_n, flood in itertools.product([45, 55, 65], [1, 2], [242, 250]):
            p = dict(P, DROP=drop, KEEP_N=keep_n, FLOOD_BASE=flood)
            r = detect(p, verbose=False)
            print(drop, keep_n, flood, evaluate(r))
    else:
        r = detect()
        ev = evaluate(r)
        print(ev)
        np.savez_compressed(CACHE / "detect.npz", **{k: v for k, v in r.items() if isinstance(v, np.ndarray)})
        write_json({"params": r["params"], "qc": r["qc"], "validation": ev}, CACHE / "detect_meta.json")
