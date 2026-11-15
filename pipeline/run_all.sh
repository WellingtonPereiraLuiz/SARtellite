#!/usr/bin/env bash
# Refaz todos os dados do site a partir das fontes públicas. Leva cerca de 20 minutos.
set -euo pipefail
cd "$(dirname "$0")"
python 01_nisar_asf.py
python 05_fires_rain.py            # focos do quadro + chuva da primeira área
python 00_candidatos.py            # opcional: mostra de onde saíram as áreas
python 07_basemap.py
for AOI in $(python -c "import config as C; print(' '.join(C.AOIS))"); do
  export SART_AOI="$AOI"
  python 02_nisar_overlays.py
  python 03_sentinel1.py
  python 04_sentinel2.py
  python 06_context.py
  python -c "import importlib; importlib.import_module('05_fires_rain').rain()"
done
python 08_manifest.py
