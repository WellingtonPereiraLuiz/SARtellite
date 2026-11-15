# Pitch do SARtellite (versão Rondônia)

Equipe Astrópodes · NASA Space Apps Challenge 2026 · Vilhena, RO · Dancing with the SARs

## Em uma frase

Um mapa de Rondônia que mostra, em palavras simples, onde a floresta caiu e onde a lavoura foi colhida, usando só o radar NISAR.

## Pitch de 90 segundos

> Somos a equipe Astrópodes, de Rondônia.
>
> O NISAR, radar da NASA com a Índia, passou 412 vezes sobre o nosso estado desde junho. Ele enxerga através da nuvem e da fumaça. Só que imagem de radar ninguém entende.
>
> O SARtellite traduz essas 412 imagens em duas respostas: **onde a floresta caiu** e **onde a lavoura foi colhida ou plantada**. *(mostrar o mapa)*
>
> Por que as duas juntas? Porque, para o radar, colher milho e derrubar floresta parecem a mesma coisa: o eco cai. Na nossa primeira tentativa, a maior mudança que o radar achou era colheita. Separando pelo tipo de terreno, a plataforma não confunde agricultor com desmatador.
>
> Clicando num ponto, você lê: "A floresta pode ter sido derrubada em Candeias do Jamari, cerca de 62 hectares, 86 campos de futebol. O INPE também viu." E vê o eco do radar despencando enquanto a floresta em volta continua igual. *(abrir o cartão)*
>
> Somos honestos sobre o limite: com as imagens públicas de prévia, uma em cada quatro manchas que o radar marca bate com o INPE. Dentro de Terra Indígena, só mostramos o que o INPE confirmou. Com o dado calibrado do NISAR, que é o próximo passo, a precisão sobe.
>
> A linha do tempo mostra o ritmo do estado a cada 12 dias: a colheita do milho em julho, a soja começando em outubro, a floresta caindo no fim da seca.
>
> Nossa ideia é simples: dar memória ao território.

### De onde vem cada número

| Frase | Valor | Onde está |
|---|---|---|
| 412 passagens | 412 prévias NISAR GCOV, 18 jun a 30 out 2026 | `meta.json` → nisar |
| 62 ha em Candeias do Jamari, INPE também viu | evento do topo da lista "O INPE também viu"; o DETER registrou degradação no mesmo lugar | `events.json` |
| uma em cada quatro | 11 de 46 manchas coincidem com alertas DETER | `meta.json` → floresta |
| colheita em julho, soja em outubro | colunas da linha do tempo de lavoura | site |

**Antes de falar, confira o evento exato:** abra a lista, clique no primeiro cartão "O INPE também viu" e leia em voz alta o município e os hectares que aparecem.

## Roteiro de demonstração (60 a 90 s)

| Tempo | Ação | Fala |
|---|---|---|
| 0 a 10 s | Site aberto em "Rondônia inteira". Apontar os dois números à esquerda. | "Desde junho: tantos hectares de floresta, tantos mil de lavoura." |
| 10 a 30 s | Clicar no primeiro cartão "O INPE também viu". | Ler a frase e mostrar o gráfico: "a linha laranja cai, a tracejada não". |
| 30 a 45 s | Clicar em "Ver passar o tempo". | "Cada coluna é uma volta de 12 dias do NISAR." |
| 45 a 60 s | Escolher Vilhena no filtro de município. | "Aqui é lavoura: o radar mostra a colheita e o plantio." |
| 60 a 75 s | Marcar "Mostrar Terras Indígenas…". | "Dentro delas, só aparece o que o INPE confirmou." |
| 75 a 90 s | Aba Fontes, seção de conferência. | "Este é o nosso acerto, sem maquiagem." |

## Perguntas prováveis

**O radar vê desmatamento debaixo da nuvem?** Sim, essa é a vantagem. Mas a prévia pública tem 180 m por pixel, então derrubadas pequenas escapam. Por isso mostramos o grau de certeza.

**Por que só 586 hectares, se o INPE viu mais?** Porque preferimos mostrar menos e acertar mais. Usamos regras de cautela: a queda tem que durar, a floresta em volta não pode ter mudado junto, e áreas protegidas exigem confirmação. E 38% do estado ficou sem dado bom de floresta nessas prévias.

**O que é "plantio" no radar?** O eco subiu: planta crescendo, solo preparado ou solo molhado. O site avisa isso.

**Funciona fora de Rondônia?** Sim. O pipeline recebe uma caixa de coordenadas e faz tudo sozinho para qualquer lugar que o NISAR cubra.

## Checklist

- [ ] `npm run preview` aberto no notebook como plano B.
- [ ] Zoom do navegador em 100%, tela cheia.
- [ ] Ninguém diz "desmatamento ilegal" nem "detectamos crime". Dizemos "a floresta pode ter sido derrubada".
