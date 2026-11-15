"""Sugere áreas de demonstração a partir das próprias prévias NISAR.

Não escolhemos um "hotspot" de cabeça. Este script percorre o quadro com uma
janela de 30 km e ordena as janelas por (a) queda de brilho total e (b) queda
de brilho em áreas que eram claras em junho (floresta provável), contando
também os focos de calor do INPE, se 05_fires_rain.py já tiver rodado.
As duas áreas em config.py saíram daqui. Rode depois do 01.
"""
import json

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, uniform_filter

import config as C
import lib

X0, Y1, PX = 352080, 8939520, 180   # grade das prévias do quadro 068/094 (ver 02)
WIN = 167                            # 30 km / 180 m


def main():
    a = np.asarray(Image.open(C.CACHE / "nisar" / "20260618_NATIVE_A_HHHH.png")).astype(float)
    b = np.asarray(Image.open(C.CACHE / "nisar" / "20261028_NATIVE_A_HHHH.png")).astype(float)
    v = binary_erosion((a > 0) & (b > 0), iterations=12)
    sa, sb = uniform_filter(a, 3), uniform_filter(b, 3)
    d = sb - sa
    d -= np.median(d[v])
    fire = np.zeros(a.shape)
    fpath = C.CACHE / "fires_frame.json"
    if fpath.exists():
        for lo, la, t, *_ in json.loads(fpath.read_text())["rows"]:
            if "2026-06-18" <= t[:10] <= "2026-10-28":
                x, y = lib.TO_UTM.transform(lo, la)
                i, j = int((Y1 - y) / PX), int((x - X0) / PX)
                if 0 <= i < a.shape[0] and 0 <= j < a.shape[1]:
                    fire[i, j] += 1
    inside = uniform_filter(v.astype(float), WIN) > 0.999
    fires_w = uniform_filter(fire, WIN) * WIN * WIN
    for name, mask in (("queda de brilho (qualquer cobertura)", (d < -45) & v),
                       ("queda de brilho onde junho era claro", (sa > 205) & (d < -50) & v)):
        score = np.where(inside, uniform_filter(mask.astype(float), WIN), 0)
        print(name)
        for _ in range(5):
            i, j = np.unravel_index(score.argmax(), score.shape)
            lon, lat = lib.TO_LL.transform(X0 + (j + .5) * PX, Y1 - (i + .5) * PX)
            bright = (sa[i - WIN // 2:i + WIN // 2, j - WIN // 2:j + WIN // 2] > 205).mean()
            print(f"  centro {lat:.4f}, {lon:.4f} | {score[i, j] * 100:.1f}% da janela | focos {fires_w[i, j]:.0f} | claro em junho {bright:.0%}")
            score[max(0, i - WIN):i + WIN, max(0, j - WIN):j + WIN] = 0


if __name__ == "__main__":
    main()
