# Pitch do SARtellite

Equipe Astrópodes · NASA Space Apps Challenge 2026 · Vilhena, RO · Desafio Dancing with the SARs

## A ideia em uma frase

Digite uma coordenada, selecione uma área e viaje no tempo para ver como a floresta e a água mudaram, mesmo quando as nuvens escondem a paisagem.

## Pitch de 90 segundos

> Somos a equipe Astrópodes, de Rondônia, e criamos o SARtellite.
>
> No dia 28 de outubro de 2026, o satélite óptico Sentinel-2 passou sobre o sul de Rondônia e viu isto: cem por cento de nuvem. Oito horas depois passou o NISAR, o radar da NASA com a agência espacial da Índia. Ele viu a superfície. *(mostrar o divisor)*
>
> Aqui na Amazônia, a floresta e a água mudam enquanto nuvem e fumaça tapam a vista. Quem cuida do território fica sem resposta para uma pergunta simples: o que mudou aqui, e quando?
>
> O SARtellite responde com uma linha do tempo. Você informa a coordenada, delimita a área e compara passagens reais do NISAR, do Sentinel-1 e do Sentinel-2, com focos de calor do INPE e chuva da NASA no mesmo eixo.
>
> O nosso diferencial é a honestidade do resultado. Nesta área, o radar acusou mais de seis mil hectares de mudança. Parece alarmante. Mas o mapa de cobertura e o satélite óptico mostram que 96% disso é lavoura e pasto: é a colheita. Já nesta outra, dentro da floresta, o sinal cai ao longo de um rio onde o INPE registrou 71 focos de calor. É ali que alguém precisa olhar.
>
> Não prometemos raio X de floresta. Cada resultado vem com sensor, data, fonte e grau de evidência. O radar aponta onde olhar; a confirmação vem de outro sensor ou do campo.
>
> O protótipo roda com dados reais e o código é aberto. O próximo passo é processar o NISAR calibrado e avisar quando uma nova passagem chegar sobre uma área salva. A nossa ideia é simples: dar memória ao território.

Tempo de leitura em voz alta: cerca de 85 segundos. Ensaie com cronômetro.

### De onde vem cada número do pitch

| Frase | Valor exato | Onde está |
|---|---|---|
| "cem por cento de nuvem" | 100% da área na classificação SCL, 28 out 2026 14:30 UTC | DATA_PROVENANCE.md, seção 3 |
| "oito horas depois" | NISAR em 28 out 2026 22:27 UTC | seção 1 |
| "mais de seis mil hectares" | 6.151 ha com queda de VH acima de 3 dB, Sentinel-1, 22 jun a 8 nov | seção 4 |
| "96% é lavoura e pasto" | 3.008 + 2.903 = 5.910 ha de 6.151 ha | seção 4 |
| "71 focos de calor" | INPE, área de floresta, 18 jun a 28 out | seção 4 |

Atenção: os seis mil hectares são do **Sentinel-1**, não do NISAR. Do NISAR temos as duas prévias reais e a diferença de brilho entre elas, sem hectares. Se perguntarem, digam exatamente isso.

## Roteiro de demonstração (60 a 90 segundos)

| Tempo | Ação | Fala |
|---|---|---|
| 0 a 10 s | Abrir o site. Girar o globo. Clicar em **Explorar o território**. | "Este é o quadro do NISAR sobre Rondônia." |
| 10 a 25 s | Roteiro **Nuvem × radar em 28 out**. Arrastar o divisor. | "Mesmo dia. À esquerda, o óptico. À direita, o radar." |
| 25 a 45 s | Roteiro **NISAR: junho × outubro**. Mostrar os focos sobre o corredor do rio e a ficha da evidência. | "Laranja: o eco ficou mais fraco. Os pontos são focos de calor do INPE no intervalo." |
| 45 a 65 s | Área **Mosaico agrícola e reserva**, roteiro **Sentinel-1: o que mudou na seca**. Apontar os números da ficha. | "Seis mil hectares de mudança. Quase tudo lavoura e pasto. O site diz isso sozinho." |
| 65 a 80 s | Digitar uma coordenada fora do quadro, por exemplo `-3,10` e `-60,02`. | "Fora da cobertura, ele não inventa nada." |
| 80 a 90 s | Aba **Ciência**, etapa 4, alternar banda L e banda C. | "Penetração parcial. Não é raio X." |

Plano B sem internet: `npm run preview` no notebook. Todos os dados estão embutidos. A única coisa que depende de rede é a chuva ao vivo para coordenadas novas.

## Sete slides

1. **A pergunta.** O que mudou aqui quando não dava para ver? Imagem: o Sentinel-2 de 28 out, todo branco.
2. **Quem precisa.** Gestão ambiental, pesquisadores, comunidades e produtores de Rondônia. Dados espalhados em formatos técnicos.
3. **Por que radar.** Pulso e eco. Passa por nuvem. Banda L do NISAR interage com troncos e chão. Limite: não é raio X.
4. **O protótipo.** Coordenada, área, linha do tempo, antes e depois. Captura da tela do explorador.
5. **A prova.** Par NISAR real (18 jun e 28 out 2026, trilha 068, quadro 094) mais Sentinel-1 calibrado. Os dois achados: colheita e corredor do rio.
6. **O diferencial.** Três sensores, um eixo de tempo, grau de evidência em cada resultado. O site diz o que não sabe.
7. **Impacto e próximos passos.** NISAR calibrado, alerta a cada nova passagem, validação com PRODES, DETER e campo. Equipe.

## Perguntas prováveis da banca

**Vocês enxergam contrabando ou pessoas debaixo das árvores?**
Não. A banda L interage com galhos grossos, troncos e, em parte, com o chão. Ela revela mudança de estrutura e de umidade, não objetos. O sistema aponta áreas a verificar.

**Então o pixel escuro é desmatamento?**
Não necessariamente. No nosso próprio exemplo, a maior mudança de radar era colheita. Por isso cruzamos com o óptico, com o mapa de cobertura e com os focos de calor antes de chamar de alerta.

**Vocês usaram o dado NISAR de verdade?**
Usamos as prévias públicas dos dois produtos GCOV reais, georreferenciadas por nós, com 180 m por pixel. Elas não são calibradas em dB, então não tiramos hectares delas. O dado calibrado tem cerca de 2 GB por cena e exige login; o script para processá-lo está no repositório e ainda não foi testado com os arquivos.

**Qual é a inovação, se já existe alerta por radar?**
Existe, com Sentinel-1: os alertas RADD, no Global Forest Watch. O que fazemos de novo é juntar a banda L do NISAR, que acabou de ficar disponível, com banda C, óptico, fogo e chuva em uma linha do tempo que qualquer pessoa consegue ler, deixando explícito o grau de evidência.

**Por que os números de chuva são iguais nas duas áreas?**
Porque as duas caem na mesma célula do NASA POWER, que tem cerca de 50 km. É contexto regional, e o site avisa.

**Como isso vira produto?**
Um serviço que roda o pipeline para qualquer coordenada, guarda as áreas do usuário e avisa quando chega uma passagem nova. Tudo com dado aberto.

## Checklist antes de subir no palco

- [ ] Site aberto em tela cheia, zoom do navegador em 100%.
- [ ] `npm run preview` rodando como plano B.
- [ ] Roteiros testados na ordem, uma vez, no notebook da apresentação.
- [ ] Quem fala o quê: problema, demo, ciência, próximos passos.
- [ ] Ninguém diz "desmatamento detectado". Dizemos "mudança de sinal" e "indício para averiguação".
