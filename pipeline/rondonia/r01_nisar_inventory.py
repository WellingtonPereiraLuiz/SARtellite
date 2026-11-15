"""Lista todas as passagens NISAR GCOV sobre Rondônia (NASA CMR) e baixa as prévias HH.

As prévias públicas (`_NATIVE_A_HHHH.png`) não exigem login. Para cada quadro
também tentamos o KML de um produto validado, que dá a grade exata em UTM.
"""
import collections
from concurrent.futures import ThreadPoolExecutor

from common import BROWSE, CACHE, CMR_COLLECTIONS, GRANULE_RE, NISAR_START, RO_BBOX, frame_key, lib, write_json


def cmr_granules():
    out = []
    bbox = ",".join(map(str, RO_BBOX))
    for cid, coll in CMR_COLLECTIONS.items():
        page = 1
        while True:
            u = f"https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id={cid}&bounding_box={bbox}&page_size=2000&page_num={page}&temporal={NISAR_START}T00:00:00Z,"
            e = lib.http_json(u, timeout=180)["feed"]["entry"]
            out += [(coll, x) for x in e]
            if len(e) < 2000:
                break
            page += 1
    return out


def main():
    rows = {}
    for coll, x in cmr_granules():
        g = x.get("producer_granule_id") or x["title"]
        m = GRANULE_RE.match(g)
        if not m:
            continue
        _, cycle, track, ad, frame, _, pol, date, hms = m.groups()
        key = frame_key(int(track), ad, int(frame))
        ring = [tuple(map(float, p.split())) for p in [x["polygons"][0][0]]][0]
        poly = [[ring[i + 1], ring[i]] for i in range(0, len(ring), 2)]  # CMR: lat lon -> lon lat
        rec = {"granule": g, "collection": coll, "frame": key, "track": int(track), "direction": ad, "frame_no": int(frame),
               "cycle": int(cycle), "date": f"{date[:4]}-{date[4:6]}-{date[6:]}", "time": f"{hms[:2]}:{hms[2:4]}",
               "pol": pol, "footprint": poly, "size_mb": float(x.get("granule_size") or 0)}
        # mesmo quadro e data repetidos: fica o validado, senão o mais novo
        k = (key, rec["date"])
        if k not in rows or coll.endswith("_V1") or g > rows[k]["granule"]:
            rows[k] = rec
    recs = sorted(rows.values(), key=lambda r: (r["frame"], r["date"]))
    print(len(recs), "passagens em", len({r['frame'] for r in recs}), "quadros")

    def get(rec, suffix, sub):
        dest = CACHE / "nisar" / rec["frame"] / f"{rec['date']}{sub}"
        try:
            lib.download(BROWSE.format(coll=rec["collection"], g=rec["granule"], suffix=suffix), dest)
            return True
        except Exception:
            return False

    with ThreadPoolExecutor(12) as ex:
        ok = list(ex.map(lambda r: get(r, "_NATIVE_A_HHHH.png", ".png"), recs))
    for r, o in zip(recs, ok):
        r["browse_ok"] = o
    kml = {}
    for r in recs:
        if r["collection"].endswith("_V1") and r["frame"] not in kml and get(r, "_NATIVE_A_HHHH.kml", ".kml"):
            kml[r["frame"]] = r["date"]
    print("prévias baixadas:", sum(ok), "de", len(recs), "| quadros com KML público:", len(kml))
    write_json({"passes": recs, "kml": kml}, CACHE / "inventory.json")
    c = collections.Counter(r["frame"] for r in recs if r["browse_ok"])
    print(dict(sorted(c.items())))


if __name__ == "__main__":
    main()
