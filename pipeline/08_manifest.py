"""Análise cruzada e manifest.json que alimenta o site.

Para cada área de demonstração:
- par Sentinel-1 mais próximo das duas datas NISAR, mesma órbita relativa;
- diferença de VH em dB, centrada na mediana dos pixels de árvores
  (referência estável para descontar umidade e calibração);
- área (ha, em grade UTM de 20 m) abaixo de limiares experimentais;
- composição por classe de cobertura do solo;
- corroboração óptica: queda de NDVI no Sentinel-2 entre datas sem nuvem;
- focos de calor do INPE e chuva do NASA POWER no intervalo.
Nenhum número aqui é "desmatamento medido". São mudanças de sinal.
"""
import json
import subprocess
from datetime import date as D, datetime, timezone

import numpy as np

import config as C
import lib

NISAR_DATES = ["2026-06-18", "2026-10-28"]
DB_DROP, NDVI_DROP = -3.0, -0.2
MATURITY = {"NISAR_L2_GCOV_PROVISIONAL_V1": "PROVISIONAL", "NISAR_L2_GCOV_V1": "VALIDATED"}


def days(a, b):
    return (D.fromisoformat(b[:10]) - D.fromisoformat(a[:10])).days


def nearest(scenes, ref, key="acquired_at", pred=lambda s: True):
    c = [s for s in scenes if pred(s)]
    return min(c, key=lambda s: abs(days(ref, s[key]))) if c else None


def build_aoi(aoi_id, fires, nisar_meta):
    env = {"SART_AOI": aoi_id}
    import importlib, os
    os.environ.update(env)
    importlib.reload(C)
    importlib.reload(lib)
    cache, out = C.CACHE_AOI, C.OUT_AOI
    tr, n, _, bounds = lib.aoi_grid()
    px_ha = C.RES**2 / 1e4
    s1 = json.loads((cache / "s1_scenes.json").read_text())
    s2j = json.loads((cache / "s2_scenes.json").read_text())
    s2 = s2j["scenes"]
    ctx = json.loads((cache / "context.json").read_text())
    rain = json.loads((cache / "rain.json").read_text())
    ov = json.loads((cache / "nisar_overlay.json").read_text())
    lulc = np.load(cache / "lulc.npy")
    vh = np.load(cache / "s1_vh_db.npz")
    ndvi = np.load(cache / "s2_ndvi.npz")

    # --- par Sentinel-1 ---
    a = nearest(s1, NISAR_DATES[0])
    b = nearest(s1, NISAR_DATES[1], pred=lambda s: s["relative_orbit"] == a["relative_orbit"])
    da, db = a["acquired_at"][:10], b["acquired_at"][:10]
    d = vh[db.replace("-", "")] - vh[da.replace("-", "")]
    trees = lulc == 2
    offset = float(np.nanmedian(d[trees]))
    d = d - offset
    ok = np.isfinite(d)
    sens = {str(t): round(float(((d < t) & ok).sum()) * px_ha, 1) for t in (-2.0, -3.0, -4.0)}
    drop = (d < DB_DROP) & ok
    names = {1: "Água", 2: "Árvores", 4: "Vegetação alagada", 5: "Lavoura", 7: "Área construída", 8: "Solo exposto", 11: "Campo ou pastagem"}
    by_class = {names[k]: round(float((drop & (lulc == k)).sum()) * px_ha, 1) for k in names if (drop & (lulc == k)).any()}

    # --- corroboração óptica ---
    clear = [s for s in s2 if s["cloud_fraction_aoi"] < 0.15]
    oa, ob = nearest(clear, da), nearest(clear, db)
    corr = None
    if oa and ob and oa["id"] != ob["id"]:
        dn = ndvi[ob["acquired_at"][:10].replace("-", "")] - ndvi[oa["acquired_at"][:10].replace("-", "")]
        both = np.isfinite(dn) & ok
        cmask = drop & both & (dn < NDVI_DROP)
        rgba = np.zeros((n, n, 4), "uint8")
        rgba[cmask] = (255, 122, 48, 235)
        lib.save_png(rgba, out / "analysis/corroborated.png")
        corr = {
            "image": "analysis/corroborated.png",
            "optical_before": oa["id"], "optical_after": ob["id"],
            "ndvi_drop_threshold": NDVI_DROP,
            "area_ha": round(float(cmask.sum()) * px_ha, 1),
            "area_ha_in_trees_class": round(float((cmask & trees).sum()) * px_ha, 1),
            "share_of_radar_drop_checked": round(float((drop & both).sum() / max(drop.sum(), 1)), 3),
            "share_of_radar_drop_confirmed": round(float(cmask.sum() / max((drop & both).sum(), 1)), 3),
        }

    # --- focos e chuva ---
    x0, y0, x1, y1 = bounds
    in_aoi = []
    for lo, la, t, sat, frp in fires["rows"]:
        x, y = lib.TO_UTM.transform(lo, la)
        if x0 <= x <= x1 and y0 <= y <= y1:
            in_aoi.append([lo, la, t, sat, frp])
    between = [r for r in in_aoi if NISAR_DATES[0] <= r[2][:10] <= NISAR_DATES[1]]
    rdays = rain["days"]
    def rsum(start, end):
        v = [x["mm"] for x in rdays if start <= x["date"] <= end and x["mm"] is not None]
        return round(sum(v), 1)
    def before(dt, k=30):
        from datetime import timedelta
        s = (D.fromisoformat(dt) - timedelta(days=k)).isoformat()
        return rsum(s, dt)

    nisar_d = np.load(cache / "nisar_aoi_diff.npy")
    nisar_scenes = []
    for g in nisar_meta:
        iso = f"{g['date'][:4]}-{g['date'][4:6]}-{g['date'][6:]}"
        nisar_scenes.append({
            "id": f"nisar-{iso}", "sensor": "NISAR", "band": "L (24 cm)", "product": "GCOV L2 (prévia pública HH)",
            "product_id": g["granule"], "acquired_at": g["start"], "polarization": "HH",
            "polarizations_available": g["polarizations"], "processing_maturity": MATURITY.get(g["collection"], g["collection"]),
            "crid": g["crid"], "pge_version": g["pge_version"], "processed_at": g["processing_date"],
            "path": g["path"], "frame": g["frame"], "direction": g["direction"], "orbit": g["orbit"],
            "resolution_m": ov["pixel_m"], "image_frame": f"nisar/nisar_hh_{g['date']}.webp",
            "image_aoi": f"nisar/aoi_hh_{g['date']}.webp",
            "evidence": "preview", "h5_url": g["h5_url"], "h5_bytes": g["h5_bytes"],
            "source_url": f"https://search.asf.alaska.edu/#/?searchType=List%20Search&searchList={g['granule']}",
            "rain_30d_before_mm": before(iso), "is_synthetic": False,
        })
    for s in s1:
        s["evidence"] = "real"
    for s in s2:
        s["evidence"] = "real"
    info = C.AOIS[aoi_id]
    return {
        "id": aoi_id, "label": info["label"], "place": info["place"], "why": info["why"],
        "center": list(info["center_lonlat"]), "size_km": info["size_m"] / 1000, "res_m": C.RES,
        "epsg": C.EPSG, "utm_bounds": list(bounds), "corners": lib.corners_lonlat(bounds),
        "pixels": n, "coverage_confirmed": ov["aoi_fully_covered"],
        "scenes": {"nisar": nisar_scenes, "s1": s1, "s2": s2},
        "s2_cloud_table": s2j["cloud_table"],
        "nisar_diff": {"image": "nisar/aoi_diff.webp", "evidence": "preview",
                       "share_drop": round(float((nisar_d < -ov["diff"]["floor_dn"]).mean()), 4),
                       "share_rise": round(float((nisar_d > ov["diff"]["floor_dn"]).mean()), 4)},
        "reference": ctx,
        "rain": {"source": rain["source"], "source_url": rain["source_url"], "units": rain["units"], "days": rdays,
                 "total_between_nisar_mm": rsum(*NISAR_DATES)},
        "fires": {"count_window": len(in_aoi), "count_between_nisar": len(between)},
        "analysis": {
            "s1_pair": {"before": a["id"], "after": b["id"], "relative_orbit": a["relative_orbit"],
                        "days_from_nisar": [days(NISAR_DATES[0], da), days(NISAR_DATES[1], db)]},
            "polarization": "VH", "reference_offset_db": round(offset, 2),
            "reference": "mediana da diferença nos pixels da classe Árvores (cobertura do solo de referência)",
            "threshold_db": DB_DROP, "area_ha_by_threshold": sens, "area_ha_by_class": by_class,
            "aoi_area_ha": round(n * n * px_ha, 1), "corroboration": corr,
            "evidence": "exploratory" if not corr else "corroborated_two_sensors",
            "caveat": "Mudança de sinal de radar. Não é desmatamento medido nem atribuição de causa.",
        },
    }


def main():
    fires = json.loads((C.CACHE / "fires_frame.json").read_text())
    nisar_meta = json.loads((C.CACHE / "nisar_meta.json").read_text())
    base = json.loads((C.CACHE / "basemap.json").read_text())
    aois = [build_aoi(k, fires, nisar_meta) for k in C.AOIS]
    ov = json.loads((C.CACHE / next(iter(C.AOIS)) / "nisar_overlay.json").read_text())
    lib.write_json({"source": "INPE, Programa Queimadas (focos de satélites de órbita polar: MODIS Aqua/Terra, VIIRS S-NPP/NOAA-20/NOAA-21)",
                    "source_url": "https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/",
                    "bbox": fires["bbox"], "months": fires["months"], "columns": fires["columns"], "rows": fires["rows"]},
                   C.OUT / "fires.json")
    (C.OUT / "fires.json").write_text(json.dumps(json.loads((C.OUT / "fires.json").read_text()), ensure_ascii=False, separators=(",", ":")))
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=C.ROOT).stdout.strip() or None
    except Exception:
        commit = None
    manifest = {
        "project": "SARtellite", "team": "Astrópodes", "is_demo": False, "is_synthetic": False,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "pipeline_commit": commit,
        "window": [C.T0, C.T1],
        "nisar_frame": {
            "path": nisar_meta[0]["path"], "frame": nisar_meta[0]["frame"], "direction": nisar_meta[0]["direction"],
            "footprints": {g["date"]: g["footprint"] for g in nisar_meta},
            "image_corners": ov["frame_corners"], "utm_rect": ov["utm_rect"], "epsg": ov["epsg"], "pixel_m": ov["pixel_m"],
            "grid_check": ov["grid_check"],
            "images": {g["date"]: f"nisar/nisar_hh_{g['date']}.webp" for g in nisar_meta},
            "diff": {"image": "nisar/nisar_diff.webp", **ov["diff"]},
        },
        "basemap": base,
        "fires": {"file": "fires.json", "count": len(fires["rows"]), "months": fires["months"]},
        "aois": aois,
    }
    lib.write_json(manifest, C.OUT / "manifest.json")
    for a in aois:
        an = a["analysis"]
        print(a["id"], "| S1", an["s1_pair"], "| offset", an["reference_offset_db"], "| ha por limiar", an["area_ha_by_threshold"],
              "| por classe", an["area_ha_by_class"], "| corroboração", an["corroboration"], "| focos", a["fires"], "| chuva", a["rain"]["total_between_nisar_mm"])


if __name__ == "__main__":
    main()
