# 07 — Portada: metadatos, filtros y últimos jugados

**Prioridad:** media · **Depende de:** —

## Problema

La portada son 21 tarjetas en orden alfabético con un buscador de texto. Eso
funciona para quien ya sabe cómo se llama lo que busca. Un niño no busca
"Domineering": busca *el de los dominós*, *uno rapidito* o *uno de dibujar*.

Además, a 21 juegos y creciendo, el orden alfabético deja los mejores candidatos
escondidos a mitad de la lista.

## Objetivo

Que un niño encuentre un juego apropiado en menos de diez segundos sin saber
leer bien y sin conocer los nombres.

## Requisitos

**R1 — Metadatos por juego.** Añadir a la definición de cada juego tres campos:

- `duracion`: `rapido` (< 5 min) · `medio` (5–15) · `largo` (> 15)
- `edad`: edad mínima sugerida (`5`, `7`, `9`)
- `tipo`: `conectar` · `bloquear` · `capturar` · `dibujar` · `adivinar`

Rellenar los 21. Que salga de una única fuente de datos, no repetido en el HTML.

**R2 — Mostrarlos en la tarjeta.** Dos o tres etiquetas pequeñas bajo la
descripción, con icono además de texto para quien aún no lee con soltura
(un reloj para la duración, por ejemplo).

**R3 — Filtros.** Encima de la rejilla, una fila de filtros tocables por
duración y por tipo. Botones grandes (≥ 48 px), multiselección, con un
`Todos` para limpiar. No un `<select>`: con el dedo, los desplegables nativos
son peores.

**R4 — Últimos jugados.** Una primera fila `Seguir jugando` con los 3–4 últimos
juegos abiertos, leída de `pencilgames:recientes`. Es lo que más se va a usar.

**R5 — Buscador después.** El buscador se queda, pero baja de jerarquía: los
filtros y los recientes van primero.

**R6 — Estado vacío.** Si un filtro no devuelve nada, un mensaje amable con un
botón para limpiar los filtros, no una rejilla vacía.

**R7 — Sin regresiones.** La rejilla sigue siendo navegable con teclado y los
enlaces siguen siendo `<a href>` reales, para que la PWA y el historial
funcionen igual.

## Criterios de aceptación

- [ ] Cada tarjeta muestra duración, edad y tipo.
- [ ] Filtrar por `rapido` deja solo los juegos marcados como tales.
- [ ] La fila `Seguir jugando` aparece tras jugar y refleja el orden real.
- [ ] En 600 px de ancho, los filtros no provocan scroll horizontal y se pueden
      tocar sin fallar.
- [ ] Sin juegos recientes, la fila no aparece (no un hueco vacío).

## Fuera de alcance

Favoritos. Perfiles por niño. Buscador difuso o por sinónimos.
