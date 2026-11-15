"""Confirma os dois granules NISAR no catálogo da ASF e baixa as prévias.

A busca da ASF é pública. As prévias (browse PNG) também. Os HDF5 completos
(1,5 a 2 GB cada) exigem Earthdata Login e não são baixados aqui.
"""
import re

import config as C
import lib

KEEP = ("_NATIVE_A_HHHH.png", "_NATIVE_A_HHHH.kml", "_LATLON.kml")


def main():
    meta = []
    for g in C.NISAR_GRANULES:
        feats = lib.http_json(f"{C.ASF_SEARCH}?granule_list={g}&output=geojson")["features"]
        if not feats:
            raise SystemExit(f"Granule não encontrado na ASF: {g}")
        f = feats[0]
        p = f["properties"]
        date = re.search(r"_A_(\d{8})T", g).group(1)
        files = {}
        for u in p["browse"] + p["additionalUrls"]:
            if u.endswith(KEEP) and "PRIVATE" not in u:
                dest = C.CACHE / "nisar" / f"{date}{u[u.rfind('_NATIVE') if '_NATIVE' in u else u.rfind('_LATLON'):]}"
                try:
                    lib.download(u, dest)
                    files[dest.name] = u
                except Exception as ex:  # alguns KML exigem login
                    print("  sem acesso público:", dest.name, type(ex).__name__)
        meta.append({
            "granule": g, "date": date, "start": p["startTime"], "stop": p["stopTime"],
            "path": p["pathNumber"], "frame": p["frameNumber"], "direction": p["flightDirection"],
            "orbit": p["orbit"], "crid": p["crid"], "pge_version": p["pgeVersion"],
            "collection": p["collectionName"], "processing_date": p["processingDate"],
            "polarizations": p["mainBandPolarization"], "range_bandwidth": p["rangeBandwidth"],
            "frame_coverage": p["frameCoverage"], "h5_url": p["url"], "h5_bytes": p["bytes"][p["fileName"]]["bytes"],
            "footprint": f["geometry"]["coordinates"][0], "files": files,
        })
        print(date, p["collectionName"], p["crid"], p["mainBandPolarization"], list(files))
    lib.write_json(meta, C.CACHE / "nisar_meta.json")


if __name__ == "__main__":
    main()
