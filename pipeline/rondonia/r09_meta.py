"""Resumo do processamento para as páginas Fontes e Sobre (public/data/ro/meta.json)."""
from collections import Counter
from datetime import datetime, timezone

from common import CACHE, OUT, read_json, write_json


def main():
    inv = read_json(CACHE / "inventory.json")
    grids = read_json(CACHE / "grids.json")
    det = read_json(CACHE / "detect_meta.json")
    ev = read_json(OUT / "ro" / "events.json")
    farm = read_json(OUT / "ro" / "farm.json")["rows"]
    fires = read_json(CACHE / "fires_ro.json")
    deter = read_json(CACHE / "deter_ro.geojson")["features"]
    passes = [p for p in inv["passes"] if p["browse_ok"]]
    hv_used = [f for f, q in det["qc"].items() if "skipped" not in q and q.get("forest_flag_rate") is not None]
    shown = [e for e in ev if e["certeza"] != "possivel"]
    write_json({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "nisar": {"passagens": len(passes), "quadros": len({p["frame"] for p in passes}),
                  "primeira": min(p["date"] for p in passes), "ultima": max(p["date"] for p in passes),
                  "com_hv": sum(1 for p in passes if p["pol"] == "DHDH"),
                  "grade_kml": sum(1 for g in grids["grids"].values() if g["source"] == "kml"),
                  "grade_ajustada": sum(1 for g in grids["grids"].values() if g["source"] == "estimated+refined"),
                  "teste_grade_max_px": max(max(abs(t[1]), abs(t[2])) for t in grids["method_test"]),
                  "quadros_floresta": len(hv_used)},
        "floresta": {"eventos": len(ev), "mostrados": len(shown), "ha_mostrados": round(sum(e["area_ha"] for e in shown)),
                     "por_certeza": Counter(e["certeza"] for e in ev), "com_fogo": sum(1 for e in shown if e["fogo_dias"]),
                     "validacao_pixels": det["validation"], "params": det["params"]},
        "lavoura": {"celulas": len(farm), "ha": round(sum(r[4] for r in farm)), "por_sentido": Counter(r[5] for r in farm)},
        "deter": {"poligonos": len(deter), "por_classe": Counter(f["properties"]["classname"] for f in deter)},
        "fogo": {"focos": len(fires["rows"]), "fonte": fires["source"], "url": fires["source_url"]},
    }, OUT / "ro" / "meta.json")
    print(read_json(OUT / "ro" / "meta.json"))


if __name__ == "__main__":
    main()
