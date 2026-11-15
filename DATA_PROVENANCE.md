# Proveniência dos dados do SARtellite

Gerado pelo pipeline em 15 nov 2026, 01:37 UTC (noite de 14 nov em Rondônia). Todos os valores abaixo estão em `public/data/manifest.json`. **Nenhum dado é sintético** (`is_demo: false`, `is_synthetic: false` em todas as cenas).

## Grau de evidência

`demo visual` → `dado real bruto` → `alteração radar exploratória` → `alerta corroborado` → `validado em campo`

| Resultado no site | Grau |
|---|---|
| Prévias NISAR HH e a diferença de brilho entre elas | dado real bruto (prévia não quantificada) |
| Imagens Sentinel-1 e Sentinel-2 | dado real bruto (calibrado) |
| Diferença de VH do Sentinel-1 entre duas datas | alteração radar exploratória |
| Camada "alterações com dois sensores" | alerta corroborado (radar + óptico) |
| Qualquer coisa | **nada** foi validado em campo |

## 1. NISAR GCOV, quadro 068/094, órbita descendente

Consulta: `https://api.daac.asf.alaska.edu/services/search/param?granule_list=<granule>&output=geojson` (pública).

| | Antes | Depois |
|---|---|---|
| Granule | `NISAR_L2_PR_GCOV_023_068_D_094_2005_DHDH_A_20260618T222706_20260618T222741_P05023_N_F_J_001` | `NISAR_L2_PR_GCOV_034_068_D_094_2005_SHSH_A_20261028T222703_20261028T222737_P05036_N_F_J_001` |
| Aquisição (UTC) | 2026-06-18 22:27:06 | 2026-10-28 22:27:03 |
| Coleção | NISAR_L2_GCOV_PROVISIONAL_V1 | NISAR_L2_GCOV_V1 |
| Maturidade, CRID | provisório, P05023 | validado, P05036 |
| Versão do processador | R05.02.3 | R05.03.2 |
| Processado em | 2026-07-09 | 2026-11-12 |
| Polarizações | HH, HV | HH |
| Órbita absoluta | 4665 | 6568 |
| HDF5 completo | 1,95 GB | 1,53 GB |
| Intervalo | 132 dias | |

**O que foi confirmado:** os dois granules existem na ASF; cobertura de quadro "Full"; a pegada vai de cerca de 9,7° S a 12,4° S e de 61,5° O a 64,2° O, no centro-sul de Rondônia.

**O que usamos:** o arquivo `_NATIVE_A_HHHH.png` de cada granule (prévia pública, frequência A, HH, 8 bits em tons de cinza). O KML de outubro dá o retângulo em UTM 20S (EPSG:32720): 352080 a 684720 E, 8614800 a 8939520 N, 1848 x 1804 pixels de **180 m**.

**Checagem de grade:** o KML de junho exige login. Conferimos por correlação de fase (janela de 800 px) que junho usa a mesma grade: deslocamento 0 px, pico 0,81.

**O que NÃO fizemos:** não abrimos os HDF5. A prévia não é retroespalhamento em dB; o contraste foi ajustado pelo gerador de prévias. Diferenças entre as duas prévias podem vir de mudança real, de umidade ou do próprio ajuste. Por isso:
- a camada se chama "diferença de brilho da prévia";
- não há hectares para o NISAR;
- o piso de cor é 22 níveis de cinza e a saturação, 70 (escolha visual, não limiar físico).

No quadro inteiro, 5,4% dos pixels escureceram e 12,8% clarearam além do piso. Contexto: o NASA POWER indica 3,3 mm de chuva nos 30 dias antes de 18 jun e 127,7 mm nos 30 dias antes de 28 out.

## 2. Sentinel-1 RTC (banda C)

Fonte: Microsoft Planetary Computer, coleção `sentinel-1-rtc` (gamma0 com correção radiométrica de terreno, 10 m). STAC público; os COGs são lidos com token SAS anônimo.

Processamento (`pipeline/03_sentinel1.py`): leitura direto na grade UTM 20S da área com reamostragem por média para 20 m; filtro de média 3x3 em potência; conversão para dB; VH exportado em 8 bits (-26 a -8 dB em 1 a 255; 0 é sem dado).

| Área | Órbita relativa | Passagens | Primeira e última |
|---|---|---|---|
| Floresta com corredor de rio | 10 | 14 | 2026-06-05 a 2026-11-03 |
| Mosaico agrícola e reserva | 83 | 13 | 2026-06-10 a 2026-11-08 |

Só entram passagens que cobrem pelo menos 98% da área. A diferença só é calculada dentro da mesma órbita relativa.

## 3. Sentinel-2 L2A (óptico)

Fonte: Planetary Computer, coleção `sentinel-2-l2a`. Para cada mês, a passagem com menos nuvem **sobre a área** (classes 3, 8, 9 e 10 da classificação de cena SCL), mais a passagem do mesmo dia de cada cena NISAR, mesmo nublada.

| Data (UTC) | Nuvem na área de floresta | Nuvem no mosaico agrícola |
|---|---|---|
| 2026-06-18 14:27 | 5,2% | 0,2% |
| 2026-10-11 14:27 | 3,0% | 3,9% |
| **2026-10-28 14:30** | **100%** | **100%** |

Água: classe 6 do SCL. Na área de floresta, 6,4 ha em 18 jun e 0,0 ha em 11 out; no mosaico agrícola, 14,2 ha e 0,0 ha. São corpos d'água pequenos; a classe SCL erra em açudes estreitos, então leia como tendência.

## 4. Análise cruzada (`pipeline/08_manifest.py`)

- Par Sentinel-1 mais próximo das datas NISAR, mesma órbita.
- Diferença de VH em dB, descontada a mediana nos pixels da classe Árvores.
- Área em grade UTM de 20 m (400 m² por pixel). Cada área de demonstração tem 90.000 ha.
- Corroboração: queda de VH maior que 3 dB **e** queda de NDVI maior que 0,2 entre 18 jun e 11 out.

| | Floresta com corredor de rio | Mosaico agrícola e reserva |
|---|---|---|
| Par Sentinel-1 | 17 jun → 22 out | 22 jun → 8 nov |
| Desconto de referência | +0,10 dB | -0,18 dB |
| Queda de VH > 2 dB | 3.115 ha | 12.823 ha |
| **Queda de VH > 3 dB** | **359 ha** | **6.151 ha** |
| Queda de VH > 4 dB | 35 ha | 2.842 ha |
| Da queda > 3 dB, em Árvores | 254 ha | 221 ha |
| Da queda > 3 dB, em Lavoura | 19 ha | 3.008 ha |
| Da queda > 3 dB, em Campo ou pastagem | 84 ha | 2.903 ha |
| Com queda de NDVI (dois sensores) | 77,5 ha (23,8 ha em Árvores) | 4.240 ha (86 ha em Árvores) |
| Pixels de queda conferidos no óptico | 93% | 97% |
| Desses, confirmados | 23% | 71% |
| Focos de calor entre as datas NISAR | 71 | 33 |
| Chuva entre as datas NISAR | 211 mm | 211 mm |

**Sensibilidade:** de 2 para 4 dB a área cai cerca de 90 vezes na floresta e 4,5 vezes no mosaico. O limiar de 3 dB é ponto de partida, não verdade.

**Leitura honesta:** no mosaico, a queda é quase toda em lavoura e pasto: ciclo agrícola. Na floresta, a queda acima de 3 dB na classe Árvores (254 ha) está perto do ruído da banda C; só 23% se confirma no óptico. Estes números **não são desmatamento medido**.

A chuva é a mesma nas duas áreas porque elas caem na mesma célula do NASA POWER.

## 5. Focos de calor

Fonte: INPE, Programa Queimadas, arquivos mensais abertos `focos_mensal_br_AAAAMM.csv`. Filtramos o retângulo do quadro NISAR e os satélites de órbita polar (AQUA, TERRA, S-NPP, NOAA-20, NOAA-21). Total: 3.306 focos de jun a nov 2026 (83, 224, 562, 924, 1.327 e 186 por mês; novembro até a data do download).

Foco de calor é uma detecção térmica com data e hora. Não é perímetro de fogo nem área queimada. O NASA FIRMS direto não está conectado (exige MAP_KEY).

## 6. Chuva

Fonte: NASA POWER, parâmetro `PRECTOTCORR` (mm/dia), comunidade AG, ponto central de cada área, 1 jun a 13 nov 2026. Resolução nativa de cerca de 0,5° x 0,625°. Os dois últimos dias vieram sem valor (-999) e ficam como `null`.

Fora das áreas processadas, o site consulta a mesma API ao vivo. Se a rede bloquear, a camada diz "serviço indisponível".

## 7. Camadas de referência

- **Floresta**: classe 2 (Árvores) do mapa anual de cobertura do solo 10 m da Impact Observatory, ano 2023 (`io-lulc-annual-v02`). É de 2023: não reflete 2026.
- **Água histórica**: JRC Global Surface Water, ocorrência 1984-2020 (`jrc-gsw`), pixels com água em 5% do tempo ou mais.

## 8. Mapa base

- NASA Blue Marble Next Generation via GIBS WMTS (`BlueMarble_NextGeneration`, 2004-08-01, EPSG:3857): 158 tiles embutidos.
- Natural Earth (domínio público): países 1:110m, estados do Brasil 1:50m, rios e cidades 1:10m.
- Fonte dos rótulos: Open Sans Semibold em PBF (demotiles.maplibre.org).

## 9. Cenário dos rios voadores

A calculadora da aba Ciência **não usa nenhum dado das imagens**. O usuário digita a área. As taxas padrão (4 mm/dia na floresta, 1 mm/dia no pasto) vêm da cobertura do relatório "O Futuro Climático da Amazônia" (Antonio Nobre, 2014): https://documentacao.socioambiental.org/noticias/anexo_noticia/28851_20141031_121828.pdf. A conta é 1 mm sobre 1 ha = 10.000 litros.

## 10. Como reproduzir

```bash
pip install -r pipeline/requirements.txt
bash pipeline/run_all.sh
```

Os catálogos mudam. Uma nova execução pode trazer passagens novas e números um pouco diferentes.
