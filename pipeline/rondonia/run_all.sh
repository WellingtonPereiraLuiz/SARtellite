#!/usr/bin/env bash
# Refaz todos os dados do mapa de Rondônia a partir das fontes públicas.
# Tempo aproximado: 30 a 40 minutos (download de ~700 prévias NISAR e dos focos do INPE).
set -euo pipefail
cd "$(dirname "$0")"
python r01_nisar_inventory.py   # passagens NISAR (CMR) + prévias HH + KML
python r01b_nisar_hv.py         # prévias HV das passagens com dupla polarização
python r02_context.py           # SEDAM (municípios, TIs, UCs), DETER, cobertura do solo
python r03_fires.py             # focos de calor (FIRMS se FIRMS_MAP_KEY existir; senão INPE)
python r04_georef.py            # grade de cada quadro (KML ou ajuste por correlação)
python r05_change.py            # séries HH na grade do estado
SART_POL=HV python r05_change.py  # séries HV
python r06_detect.py            # floresta (HV) e lavoura (HH) + conferência com DETER
python r07_events.py            # eventos, células de lavoura, municípios, períodos
python r08_basemap.py           # mapa base e área sem cobertura
python r09_meta.py              # resumo para as páginas Fontes e Sobre
python r10_web.py              # versão web: focos, contornos suaves, busca, fundo Blue Marble e imagem de capa
python r11_rain.py             # caso 1 "Corte ou chuva?": chuva da Meteomatics nas datas das imagens NISAR
python r12_s1.py               # caso 2 "Alerta em 2 etapas": Sentinel-1 (Planetary Computer) avisa, NISAR confirma
python r13_s2.py               # imagem real: mosaico Sentinel-2 de RO e foto de perto de cada lugar
