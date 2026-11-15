"""Diferença NISAR em dB calibrado a partir dos HDF5 GCOV completos.

ESTADO: escrito conforme a documentação do produto, AINDA NÃO TESTADO com os
arquivos reais (cada HDF5 tem 1,5 a 2 GB e exige Earthdata Login). Antes de
confiar no resultado, rode `python inspecionar_nisar_gcov.py arquivo.h5` e
confira os nomes dos datasets e o EPSG.

Uso:
    SART_AOI=ro-sul-floresta python nisar_gcov_change.py antes.h5 depois.h5

Passos (os mesmos do guia da equipe):
1. lê /science/LSAR/GCOV/grids/frequencyA/HHHH e as coordenadas x/y;
2. recorta a mesma caixa UTM nas duas datas, pelas COORDENADAS;
3. converte potência em dB (10 log10), sem aplicar log duas vezes;
4. média 5x5 em potência para reduzir o speckle;
5. diferença depois - antes, descontando a mediana nos pixels de árvores
   (cache lulc.npy do script 06) para compensar umidade e versão de
   processamento (junho é provisório, outubro é validado);
6. exporta imagens e um JSON com área por limiar. Só HH é comum às datas.
O resultado continua sendo "alteração radar exploratória" até ser conferido
com outra fonte.
"""
import sys

import numpy as np
from scipy.ndimage import uniform_filter, zoom

import config as C
import lib

G = "/science/LSAR/GCOV/grids/frequencyA"
DB_RANGE = (-25.0, 0.0)


def read_crop(path, bounds):
    import h5py
    x0, y0, x1, y1 = bounds
    with h5py.File(path, "r") as f:
        g = f[G]
        x, y = g["xCoordinates"][:], g["yCoordinates"][:]
        epsg = int(np.array(g["projection"]).item()) if "projection" in g else None
        if epsg and epsg != C.EPSG:
            raise SystemExit(f"EPSG do arquivo ({epsg}) difere do pipeline ({C.EPSG}). Reprojete antes.")
        ix = np.where((x >= x0) & (x <= x1))[0]
        iy = np.where((y >= y0) & (y <= y1))[0]
        if not len(ix) or not len(iy):
            raise SystemExit("A área não cai dentro deste arquivo.")
        hh = g["HHHH"][iy.min():iy.max() + 1, ix.min():ix.max() + 1].astype("float32")
        px = float(abs(x[1] - x[0]))
    return hh, px


def smooth(p, n=5):
    m = ~np.isfinite(p) | (p <= 0)
    s = uniform_filter(np.where(m, 0, p), n)
    w = uniform_filter((~m).astype("float32"), n)
    return np.where(w > 0.5, s / np.maximum(w, 1e-6), np.nan)


def main(before, after):
    _, n, _, bounds = lib.aoi_grid()
    a, px = read_crop(before, bounds)
    b, _ = read_crop(after, bounds)
    h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
    da, db = lib.to_db(smooth(a[:h, :w])), lib.to_db(smooth(b[:h, :w]))
    d = db - da
    ref = "mediana da área"
    lulc_path = C.CACHE_AOI / "lulc.npy"
    if lulc_path.exists():
        lulc = np.load(lulc_path)
        trees = zoom((lulc == 2).astype("float32"), (h / lulc.shape[0], w / lulc.shape[1]), order=0) > 0.5
        if trees.sum() > 1000:
            d -= np.nanmedian(d[trees])
            ref = "mediana nos pixels da classe Árvores"
    if ref == "mediana da área":
        d -= np.nanmedian(d)
    ha = px * px / 1e4
    stats = {str(t): round(float((d < t).sum()) * ha, 1) for t in (-2.0, -3.0, -4.0)}
    lib.save_webp(lib.scale_u8(da, *DB_RANGE), C.OUT_AOI / "nisar/gcov_hh_db_antes.webp")
    lib.save_webp(lib.scale_u8(db, *DB_RANGE), C.OUT_AOI / "nisar/gcov_hh_db_depois.webp")
    lib.write_json({"pixel_m": px, "shape": [h, w], "db_range": DB_RANGE, "reference": ref,
                    "area_ha_by_threshold": stats, "evidence": "exploratory", "is_synthetic": False,
                    "note": "Só HH. Junho provisório, outubro validado. Não é desmatamento medido."},
                   C.OUT_AOI / "nisar/gcov_change.json")
    print("pixel", px, "m | referência:", ref, "| ha por limiar:", stats)
    print("Próximo passo: apontar o manifest para estas imagens (08_manifest.py) e trocar evidence para 'real'.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
