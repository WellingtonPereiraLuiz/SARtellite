"""Baixa a prévia HV (polarização cruzada) das passagens que a têm (modo DH).

O HV vem do espalhamento de volume na copa. Quando a floresta é derrubada,
o HV cai; o HH quase não muda (troncos no chão ainda refletem). Por isso a
detecção de floresta derrubada usa HV.
"""
from concurrent.futures import ThreadPoolExecutor

from common import BROWSE, CACHE, lib, read_json


def main():
    inv = read_json(CACHE / "inventory.json")
    dh = [p for p in inv["passes"] if p["pol"] == "DHDH" and p["browse_ok"]]

    def get(r):
        dest = CACHE / "nisar_hv" / r["frame"] / f"{r['date']}.png"
        try:
            lib.download(BROWSE.format(coll=r["collection"], g=r["granule"], suffix="_NATIVE_A_HVHV.png"), dest)
            return True
        except Exception:
            return False

    with ThreadPoolExecutor(12) as ex:
        ok = list(ex.map(get, dh))
    print("HV baixadas:", sum(ok), "de", len(dh))


if __name__ == "__main__":
    main()
