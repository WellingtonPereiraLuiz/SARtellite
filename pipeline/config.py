"""Configuração única do pipeline SARtellite.

Tudo o que o site mostra como "real" nasce daqui: os dois granules NISAR
identificados pela equipe, a área de demonstração e a janela de tempo.
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "cache"
OUT = ROOT / "public" / "data"

# Par NISAR GCOV identificado pela equipe (trilha 068, descendente, quadro 094)
NISAR_GRANULES = [
    "NISAR_L2_PR_GCOV_023_068_D_094_2005_DHDH_A_20260618T222706_20260618T222741_P05023_N_F_J_001",
    "NISAR_L2_PR_GCOV_034_068_D_094_2005_SHSH_A_20261028T222703_20261028T222737_P05036_N_F_J_001",
]
ASF_SEARCH = "https://api.daac.asf.alaska.edu/services/search/param"

# Janela de tempo do estudo (um pouco antes e depois do par NISAR)
T0, T1 = "2026-06-01", "2026-11-13"

# Grade de trabalho: UTM 20S, a mesma projeção das prévias NISAR do quadro 094
EPSG = 32720
RES = 20.0  # metros por pixel nas camadas da área de demonstração

# Áreas de demonstração (30 km x 30 km). Os centros saíram de 00_candidatos.py:
# janelas com maior concentração de queda de brilho entre as prévias NISAR.
AOIS = {
    "ro-sul-floresta": {
        "label": "Floresta com corredor de rio",
        "place": "Sul de Rondônia",
        "why": "Janela de 30 km dominada por floresta onde coincidem queda de brilho na prévia NISAR e focos de calor do INPE.",
        "center_lonlat": (-62.4846, -11.9886),
        "size_m": 30000,
    },
    "ro-sul-agro": {
        "label": "Mosaico agrícola e reserva",
        "place": "Sul de Rondônia",
        "why": "Janela de 30 km com a maior concentração de queda de brilho entre as duas prévias NISAR do quadro.",
        "center_lonlat": (-62.7906, -11.7970),
        "size_m": 30000,
    },
}
AOI_ID = os.environ.get("SART_AOI", "ro-sul-floresta")
AOI = {"id": AOI_ID, **AOIS[AOI_ID]}
OUT_AOI = OUT / AOI_ID
CACHE_AOI = CACHE / AOI_ID

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
SAS = "https://planetarycomputer.microsoft.com/api/sas/v1/token"
