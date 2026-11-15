# Fontes de dados e referências

Documento vivo do SARtellite. **Toda vez que um dado, número ou frase nova entrar no site, no pitch ou nos slides, a fonte entra aqui.**
Última revisão: 15 nov 2026 (manhã: entrou a Meteomatics, saiu a lavoura).

Legenda: ✅ usado no site · 📣 usado só na narrativa/pitch · ⏳ planejado · ⚠️ não verificado

## 1. Dados que o site mostra

| # | Fonte | Para quê | Acesso | Status |
|---|---|---|---|---|
| D1 | **NISAR L2 GCOV** (NASA/JPL e ISRO), coleções `C2854338529-ASF` (provisória) e `C3622241360-ASF` (V1) | Floresta derrubada (HV) e lavoura (HH) | Busca no NASA CMR: https://cmr.earthdata.nasa.gov/search/granules.json · Prévias PNG públicas e KML na ASF: https://search.asf.alaska.edu/ | ✅ 412 passagens, 18 jun a 30 out 2026 |
| D2 | **INPE Programa Queimadas** (arquivos mensais; mesmas detecções VIIRS e MODIS) | Reserva: histórico de focos de 17 jun a 14 nov/2026, baixado antes da troca para o FIRMS. Sai quando o pipeline rodar com `FIRMS_MAP_KEY` | https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/ | ✅ em uso só no histórico, até a chave do FIRMS entrar |
| D3 | **INPE DETER** (`deter-amz:deter_amz`, WFS) | Conferir a floresta (não entra na detecção) e selo "O INPE também viu" | https://terrabrasilis.dpi.inpe.br/geoserver/ows | ✅ 662 alertas em RO desde 17 jun |
| D4 | **GeoPortal SEDAM-RO** (GeoServer WFS): `ibge:ro_municipios_2025`, `funai:tis_poligonais`, `cuc:limites_ucs_estaduais`, `icmbio:limites_ucs_federais`, `emater:pontos_sedes_ro` | Municípios, Terras Indígenas, UCs, filtros | https://geoportal.sedam.ro.gov.br/geoserver/ows | ✅ |
| D5 | **Impact Observatory / Esri 10 m Annual Land Use Land Cover** (`io-lulc-annual-v02`, 2023), via Microsoft Planetary Computer | Onde é floresta e onde é lavoura; cores do terreno | https://planetarycomputer.microsoft.com/dataset/io-lulc-annual-v02 | ✅ |
| D6 | **NASA Blue Marble** (via NASA GIBS) | Fundo do mapa, mundo inteiro | https://visibleearth.nasa.gov/collection/1484/blue-marble · https://nasa-gibs.github.io/gibs-api-docs/ | ✅ ladrilhos (mundo z0–3, América do Sul z4–6, RO z7–8) em `public/data/tiles/bm` |
| D7 | **Natural Earth** (países, estados, rios, cidades) | Contornos, busca de lugares fora de RO | https://www.naturalearthdata.com/ | ✅ |
| D8 | **NASA FIRMS** (VIIRS S-NPP, NOAA-20, NOAA-21 e MODIS) | Camada Queimadas (fonte oficial desde 15/11). Sem chave: últimos 7 dias pelos arquivos abertos, somados todo dia. Com `FIRMS_MAP_KEY`: histórico inteiro pela API de área. Município de cada foco calculado pelo limite do SEDAM/IBGE | https://firms.modaps.eosdis.nasa.gov/ · arquivos de 7 dias: https://firms.modaps.eosdis.nasa.gov/active_fire/ · API: https://firms.modaps.eosdis.nasa.gov/api/ | ✅ últimos 7 dias · ⏳ histórico (falta cadastrar a chave gratuita) |
| D9 | **Meteomatics Weather API** (conta do hackathon, modelo `mix`, `precip_24h:mm`) | Caso 1 "Corte ou chuva?": chuva nas 48 h antes de cada imagem NISAR em cada lugar de floresta; chuva média diária de RO na linha do tempo | https://www.meteomatics.com/en/weather-api/ · baixado pelo conector MCP em 15/11/2026 12:48 UTC (cache em `pipeline/cache/ro/meteomatics/`); `r11_rain.py` também baixa direto com `METEOMATICS_USERNAME`/`METEOMATICS_PASSWORD`. Credencial nunca vai para o navegador | ✅ |
| D10 | **NISAR GCOV calibrado (HDF5, 20 m)** | Precisão maior na floresta | ASF, exige Earthdata Login, ~2 GB por imagem | ⏳ próximo passo |
| D12 | **Sentinel-1 RTC** (ESA/Copernicus, banda C, VH, 10 m) via Microsoft Planetary Computer | Caso 2 "Alerta em 2 etapas": a copa caiu no Sentinel-1 antes ou depois do NISAR? | https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc · `r12_s1.py` | ✅ 46 lugares, jun a nov/2026 (Sentinel-1A e 1D) |
| D13 | **Sentinel-2 L2A** (ESA/Copernicus, cor verdadeira) via Microsoft Planetary Computer | Fundo realista do mapa (mosaico de RO a 80 m em 4 pedaços, de jun/2026 até hoje, mais um recorte de 8 km a 10 m em volta de cada lugar, que entra quando o mapa chega perto) e foto real de cada lugar (10 m) no cartão e no Como funciona | https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a · `r13_s2.py` | ✅ 413 cenas no mosaico; fotos de 45 lugares |
| D11 | JRC Global Surface Water, Sentinel-1 RTC, Sentinel-2 L2A (Planetary Computer) | Usados na v1 (antes e depois em duas áreas) | https://planetarycomputer.microsoft.com/ | Histórico, fora do site atual |

Processamento: `pipeline/rondonia/r01` a `r10` (ver `README.md` e `DATA_PROVENANCE.md`). Todos os números do site saem de `public/data/ro/meta.json`.

## 2. Narrativa: El Niño 2026 → Amazônia → Rondônia

| # | Afirmação usada | Fonte | Status |
|---|---|---|---|
| N1 | O El Niño chegou a +2,0 °C no índice oficial da NOAA (RONI) de agosto a outubro de 2026, a 2ª maior marca para essa época do ano desde 1950 | Watchers, 10 nov 2026, citando a atualização semanal do CPC de 9 nov: https://watchers.news/2026/11/10/el-nino-2026-roni-2-0-behind-1997-record-forecast/ | 📣✅ (na Home) |
| N2 | A NOAA deu 69% (ago), 75% (set) e depois 83% de chance de um El Niño histórico (RONI ≥ +2,5 °C) em out–dez | CPC, discussão de 13 ago 2026: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_disc_aug2026/ensodisc.shtml · set 2026: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_disc_sep2026/ensodisc.shtml · o 83% vem de resumo secundário (verificar na discussão de out/nov antes de citar) | 📣 69% e 75% ✅ · 83% ⚠️ |
| N3 | Porto Velho em situação de emergência por estiagem: decreto municipal 22.515 de 01/10/2026, reconhecido pela Portaria federal nº 3.611 de 20/10/2026 (Defesa Civil Nacional, MIDR) | DOU via Atlas Público: https://atlaspublico.com.br/regulacao/dou/portaria-n-3-611-de-20-de-outubro-de-2026-869146 | 📣✅ |
| N4 | Cerca de 22,9 mil pessoas afetadas em 85 localidades de Porto Velho | Portal Amazônia, citando a Prefeitura: https://portalamazonia.com/meio-ambiente/rio-madeira-seca-porto-velho-2026/ | 📣✅ (na Home) |
| N5 | A floresta amazônica devolve água à atmosfera e ajuda a formar chuva em outras regiões ("rios voadores") | Conhecimento científico consolidado; para slide, citar INPE/CEMADEN ou artigo de revisão | 📣 conferir referência antes de citar número |
| N6 | EUDR (lei europeia contra desmatamento): aplicação a partir de 30/12/2026 para grandes operadores; corte em 31/12/2020 | Regulamento (UE) 2023/1115 e adiamento de 2025: https://eur-lex.europa.eu/eli/reg/2023/1115/oj | 📣 conferir a data final no texto consolidado antes do pitch |
| N7 | "O alerta público só vê de 6,25 ha para cima" | Sem fonte. DETER e PRODES têm áreas mínimas diferentes entre si | ⚠️ **não usar** até confirmar no site do INPE |

### Regras de linguagem da narrativa (combinadas pela equipe)

- Nunca dizer "o radar mostra o efeito do El Niño". Dizer: **"o El Niño aumenta o risco; o radar mostra o que já mudou no chão."**
- Não chamar 2026 de "seca histórica" da Amazônia inteira. Falar do que está documentado (Porto Velho, rio Madeira).
- O herói é o **NISAR**. Queimadas (INPE) e SEDAM são contexto.
- O agro é vítima e usuário da ferramenta, não vilão.
- Pergunta "El Niño ou agro?": **"O El Niño é o gatilho que não controlamos. A floresta é o amortecedor que podemos proteger."**

## 3. O desafio e o evento

| # | Referência | Link |
|---|---|---|
| E1 | Desafio "Dancing with the SARs" (Space Apps 2026) | https://www.spaceappschallenge.org/2026/challenges/ |
| E2 | Critérios de avaliação (Impacto, Criatividade, Validade, Relevância, Apresentação) | Guia de julgamento: https://www.spaceappschallenge.org/2025/awards/ |
| E3 | Vencedores globais 2025: 10 projetos entre mais de 11.500 enviados, mais de 114 mil participantes | https://www.spaceappschallenge.org/2025/awards/global-winners/ · https://www.nasa.gov/learning-resources/stem-engagement-at-nasa/nasa-announces-2025-international-space-apps-challenge-global-winners/ |
| E4 | Missão NISAR (NASA/ISRO) | https://nisar.jpl.nasa.gov/ |

## 4. Ferramentas

MapLibre GL JS 5 (BSD-3) · React 18 · Vite 6 · Archivo e IBM Plex (SIL OFL) · Python: numpy, rasterio, shapely, pyproj, Pillow.

## 5. Como atualizar este documento

1. Dado novo no site → linha na seção 1, com link e o arquivo em `public/data` que ele gera.
2. Frase nova no pitch → linha na seção 2 com link. Sem link, marque ⚠️ e não use em público.
3. Rodou o pipeline de novo → atualize os números da coluna Status e a data no topo.

## 6. Mudanças de escopo

- **15/11, manhã:** a camada Lavoura saiu do site (o detector continua no pipeline, `r06`/`r07`). No lugar, entrou o caso 1 "Corte ou chuva?" (NISAR + Meteomatics). A narrativa ativa do pitch é "No satellite dances alone" (v3); os casos 2 a 8 aparecem como próximos passos na página "A dança".
