# Proveniência e método (versão Rondônia)

Gerado em 15 nov 2026. Todos os números estão em `public/data/ro/meta.json`. **Nenhum dado é simulado.**

## 1. NISAR

- **Busca:** NASA CMR, coleções `NISAR_L2_GCOV_PROVISIONAL_V1` (C2854338529-ASF) e `NISAR_L2_GCOV_V1` (C3622241360-ASF). Caixa de Rondônia: −66,9 a −59,7 de longitude, −13,8 a −7,8 de latitude, a partir de 17 jun 2026.
- **Resultado:** 412 passagens com prévia, 45 quadros (trilhas 017, 039, 060, 068, 089, 097, 132, 140, 161 e 169), de 18 jun a 30 out 2026.
- **O que baixamos:** a prévia pública `_NATIVE_A_HHHH.png` de cada passagem e `_NATIVE_A_HVHV.png` das 280 passagens com dupla polarização. São imagens de 8 bits com cerca de 180 m por pixel, **não** o retroespalhamento calibrado do HDF5.
- **Grade:**
  - 33 quadros têm KML público com os cantos exatos.
  - Os outros foram estimados pelas margens dos quadros vizinhos e ajustados por correlação de fase com a classe Árvores da cobertura do solo.
  - Testado nos 33 quadros conhecidos, o ajuste errou no máximo 1 pixel.
  - Quadros sem ajuste confiável foram descartados.

## 2. Floresta derrubada (HV)

**Por que HV:** dentro dos polígonos de desmatamento do DETER, o HH quase não mudou e às vezes subiu: troncos no chão ainda refletem. Já o HV caiu de cerca de 198 para 162 em média.

**Regra** (`pipeline/rondonia/r06_detect.py`), por quadro, na grade UTM 20S de 180 m:

1. **Controle por passagem:** sai a data em que mais de 3% da floresta "cai" de uma vez (defeito de imagem).
2. **Quadros fracos:** sai o quadro com menos de 6 passagens HV boas ou que marca mais de 0,4% da floresta.
3. **Floresta de partida:** classe Árvores (cobertura do solo 2023), HV de partida entre 160 e 242, parecido com o da floresta vizinha.
4. **Comparação local:** cada passagem vira "pixel menos a floresta vizinha", numa janela de 33 px (cerca de 6 km).
5. **Detecção:** queda de 45 ou mais em relação à partida.
6. **Persistência:** a queda continua (30 ou mais) em todas as passagens seguintes, com pelo menos uma depois.
7. **Várzea:** se a floresta vizinha também escureceu 15 ou mais, a queda é sazonal (cheia baixando, várzea do Guaporé) e não conta.
8. **Tamanho mínimo:** 3 pixels (cerca de 10 ha).

**Certeza:**
- **O INPE também viu:** a mancha fica a até 360 m de um alerta DETER de desmatamento, queimada ou degradação desde 17 jun.
- **Provável:** a queda se manteve em 2 ou mais passagens seguintes, ou foi vista por 2 quadros.
- **Sinal fraco:** o resto. Fica escondido por padrão.
- **Cautela:** dentro de Terra Indígena ou UC, sem confirmação do INPE, vira sinal fraco.

**Cobertura:** 62% de Rondônia tem dado bom de floresta. Os 38% restantes aparecem riscados no mapa.

**Resultado:**
- 46 manchas: 11 confirmadas pelo INPE, 20 prováveis, 15 sinais fracos.
- Mostradas: 31 manchas, 586 ha.

## 3. Conferência com o INPE DETER

- **Fonte:** TerraBrasilis WFS `deter-amz:deter_amz`, `uf='RO'`, desde 17 jun 2026.
  - 662 alertas: 365 de corte raso (5.219 ha com os de vegetação), 104 de cicatriz de queimada, 96 de degradação, 89 de corte seletivo.
- **Manchas:** 11 de 46 (24%) coincidem com algum alerta.
- **Pixels:**
  - 10,9% do que marcamos fica a até 360 m de um corte raso.
  - Encontramos 2,3% dos polígonos de corte raso.
- **Por quê:**
  - A mediana dos polígonos do DETER tem cerca de 20 ha, uns 6 pixels de 180 m.
  - A prévia de 8 bits tem ruído e ajuste de contraste próprio.
- **Próximo passo:** o produto calibrado de 20 m (HDF5, cerca de 2 GB por passagem, com Earthdata Login).

## 4. Lavoura (HH)

- **Onde:** classe Lavoura da cobertura do solo, só dentro de RO.
- **Regra:**
  - Para cada pixel, a maior mudança de HH entre duas passagens boas seguidas, se for de 45 ou mais.
  - Queda = colheita ou solo exposto.
  - Alta = planta crescendo, solo preparado ou molhado.
  - Passagens em que a floresta (que não deveria mudar) muda demais são descartadas.
- **Agregação:**
  - Quadrados de 6 × 6 pixels (1,08 km) com pelo menos 25% da lavoura mudando.
  - Data = a mais comum. Sentido = colheita se 60% ou mais caiu, plantio se 40% ou menos, misto no meio.
- **Resultado:** 10.632 quadrados, 638 mil ha.
- **Ainda não conferido:** este insight não foi validado com Sentinel-2. Na primeira versão, numa área de 30 km, 71% da queda de radar coincidiu com queda de NDVI.

## 5. Lugares (SEDAM-RO)

GeoServer `https://geoportal.sedam.ro.gov.br/geoserver/ows` (WFS público):
- `ibge:ro_municipios_2025`
- `funai:tis_poligonais`
- `cuc:limites_ucs_estaduais`
- `icmbio:limites_ucs_federais` (filtrado para RO)

## 6. Queimadas (camada do mapa e pista da floresta)

- **Fonte:** INPE Programa Queimadas, arquivos mensais, Rondônia, satélites polares (VIIRS S-NPP, NOAA-20, NOAA-21; MODIS Aqua e Terra). 28.984 focos entre 17 jun e 7 nov 2026 (só os dias cobertos pelos 12 períodos do NISAR; `r10_web.py`). Cada foco recebe o município e se caiu em floresta (cobertura do solo 2023).
- **Uso:** o cartão diz se houve foco a até cerca de 360 m da mancha, de 45 dias antes da detecção em diante.
- **FIRMS:** o NASA FIRMS direto exige `FIRMS_MAP_KEY`; com ela, `r03_fires.py` troca a fonte sozinho.

## 7. Mapa base

- **Cobertura do solo:** Impact Observatory 10 m, ano 2023, reamostrada por moda para 180 m e redesenhada em Web Mercator. É de 2023: não mostra 2026.
- **Contexto:** países, estados e rios da Natural Earth.

## 8. Versão web (`r10_web.py`)

- **Fundo do mapa:** NASA Blue Marble (via GIBS) em ladrilhos JPEG: mundo z0–4, América do Sul z5–6, Rondônia z7–8. Escurecido no estilo do mapa.
- **Busca:** municípios de RO (SEDAM), estados e países (Natural Earth). Fora de RO o site só mostra um cartão de demonstração, sem dado no mapa.
- **Contornos da floresta:** suavizados uma única vez (abre e fecha de ~80 m e simplificação). A área em hectares não muda: vem da detecção em pixels.

Lista completa de fontes e referências: [FONTES_E_REFERENCIAS.md](FONTES_E_REFERENCIAS.md).
