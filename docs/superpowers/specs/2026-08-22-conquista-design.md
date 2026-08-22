# Conquista — diseño (EN PROGRESO, sesión interrumpida por límite de contexto)

> **Este documento está incompleto a propósito.** Recoge todo lo acordado en la
> sesión de brainstorming hasta el punto en que se cortó por límite de sesión.
> Antes de seguir: retomar con `superpowers:brainstorming`, leer este archivo
> completo, presentar al usuario un resumen de "esto quedó acordado" y seguir
> desde la sección marcada como **PENDIENTE**. No saltar directo a
> `writing-plans` — la sección de diseño del motor, tablero, remoto y testing
> todavía no están redactadas ni aprobadas.

Fuente de la mecánica base: `abstract-games-by-category/01-2-players/36-conquista.md`.
Ese documento describe la mecánica genérica; **este spec lo reemplaza en todo
punto donde haya conflicto**, porque el usuario amplió y precisó varias reglas
durante el brainstorming (ver sección 1).

## Alcance de esta implementación (decidido)

- **2 jugadores** (no N jugadores). Reusa tal cual `src/lib/players.ts`,
  colores `--color-player-1/2` de `BaseLayout.astro`, `turnIndicator.ts`,
  `winnerBanner.ts` — nada de eso se toca.
- **Incluye juego remoto** (como los otros 3 juegos), reusando el protocolo
  existente (`ModalJuegoRemoto`, `canal-remoto-listo`, mensajes
  `{tipo:'movimiento', payload}` / `{tipo:'reiniciar'}`). Requiere que el
  engine quede puro (estado + jugada → nuevo estado), igual que
  `puntos-y-cajas/engine.ts`.
- **Cuadrícula regular fija, 6×6 puntos** (25 cuadros), sin selector de
  tamaño — igual de fijo que Puntos y Cajas (`SIZE = 4` ahí). Cuadrícula
  irregular (que la spec original menciona como posible) queda **fuera de
  alcance**.
- **Prerequisito de secuencia, NO parte de este spec:** antes de implementar
  Conquista, extraer un componente `<TableroJuego>` compartido (indicador de
  turno + banner de ganador, hoy duplicados en los 3 `Board.astro`
  existentes). El usuario ya eligió explícitamente hacerlo como **su propio
  brainstorming + spec + plan, separado**, antes de retomar la implementación
  de Conquista. Ver `pencilgames-status` en memoria para el estado de esa
  extracción cuando se retome.

## 1. Reglas y catálogo de fences (APROBADO por el usuario, incluida la asunción del punto medio)

La spec original (`36-conquista.md`) dice que las fences legales son los 4
vecinos ortogonales más "las dos diagonales dentro de cualquier bloque 2×2 de
puntos", y que "la diagonal a través de un bloque 2×2 es la fence legal más
larga". **Esa frase quedó ampliada y precisada así, tras varias rondas de
aclaración con el usuario:**

### Catálogo completo: 12 orientaciones

Cualquier offset `(Δfila, Δcolumna)` con ambas componentes en el rango
`[-2, 2]`, excluyendo `(0,0)`, tomando una sola representación canónica por
línea (evitando contar cada línea dos veces en sentidos opuestos):

| Tipo | Offsets | Cantidad en cuadrícula 6×6 |
|---|---|---|
| Ortogonal corta | (0,1), (1,0) | 60 |
| Ortogonal larga | (0,2), (2,0) | 48 |
| Diagonal 1×1 (un cuadro) | (1,1), (1,-1) | 50 |
| Diagonal tipo "caballo" (1×2 / 2×1) | (1,2), (1,-2), (2,1), (2,-1) | 80 |
| Diagonal larga (2×2, bloque completo) | (2,2), (2,-2) | 32 |
| **Total** | **12 orientaciones** | **270** |

Confirmado explícitamente por el usuario como catálogo **completo y
definitivo** (última pregunta de la sesión, respuesta "Sí, ya es completo y
definitivo").

### Fences que pasan por un punto intermedio de la cuadrícula

Cualquier offset cuyas dos componentes comparten un factor común de 2 —es
decir, ortogonal larga `(0,±2)`/`(±2,0)` y diagonal larga `(±2,±2)`— pasa
exactamente por el punto medio de su propio trazo, que **sí es un punto real
de la cuadrícula**. Regla acordada para estos casos:

- Se dibujan como **una sola fence, en un solo turno** (no como dos jugadas).
- Si cualquiera de sus dos mitades ya está dibujada por separado, la fence
  larga deja de estar disponible (se solaparía — colineal, no cruce).
- Si se dibuja la fence larga primero, sus dos mitades quedan automáticamente
  "ocupadas" (no se pueden volver a dibujar por separado después).
- El punto medio sigue siendo un punto normal de la cuadrícula: **otras
  fences pueden terminar ahí sin que cuente como cruce prohibido** (un
  "cruce en T" es válido). **Esta es una asunción explícita, no una regla que
  el usuario haya verificado línea por línea** — confirmar de nuevo en la
  revisión final del spec antes de dar la implementación por buena, porque si
  es incorrecta implica rediseñar el motor, no un ajuste menor.

Todos los demás offsets del catálogo (ortogonal corta, diagonal 1×1, diagonal
tipo caballo) son primitivos (`gcd` de sus componentes = 1): nunca pasan por
ningún otro punto de la cuadrícula.

### Reglas de legalidad de una fence candidata

Se evalúan sobre las 270 posiciones posibles del catálogo:

1. **No dibujada / no solapada**: la fence no está ya dibujada, ni se solapa
   de forma colineal con una fence ya dibujada (caso de las fences largas de
   arriba).
2. **No cruza ninguna fence dibujada**: cruce geométrico general en cualquier
   punto que no sea un extremo compartido — aplica entre cualquier
   combinación de tipos (ortogonal, diagonal corta, diagonal larga, etc.),
   no solo diagonal-contra-diagonal.
3. **No atraviesa una región ya reclamada**: el interior de la fence
   candidata no puede pasar por el interior de ninguna región ya reclamada
   por ningún jugador, sea cual sea la forma de esa región (triángulo,
   cuadrado, o una forma más irregular resultante de fences largas). **Regla
   general, sin excepciones** — confirmado explícitamente por el usuario.

Cuando ninguna de las 270 posiciones pasa las tres reglas, la partida
termina. Una jugada ilegal no debe cambiar el estado (mismo patrón que
`playLine` en `puntos-y-cajas/engine.ts`, que devuelve el estado sin cambios
si la jugada no es válida) — esto importa más aún en este juego porque el
canal remoto pasa `payload` sin validar tipos; que una jugada inválida sea un
no-op evita que un payload corrupto desincronice a los dos jugadores.

**Simplificación clave para el motor (por qué la regla 2 no es un problema de
geometría computacional):** como la regla 2 prohíbe que dos fences se crucen
fuera de un punto de la cuadrícula, **todo punto de intersección entre
fences dibujadas es, por construcción, un punto de la cuadrícula.** Por lo
tanto:
- La aritmética de intersección de segmentos (cálculo con coordenadas
  flotantes) **solo hace falta para la regla 2** (validar una jugada nueva).
- La detección de regiones (que corre después de cada jugada válida) se
  construye **enteramente sobre vértices de la cuadrícula**, sin ninguna
  aritmética de intersección — es un grafo planar cuyos vértices son
  exactamente los puntos de la cuadrícula.
- Para construir ese grafo correctamente, cada fence larga dibujada (offset
  con factor común 2) se debe **partir en el punto intermedio** al construirlo
  como arista del grafo (aunque se haya dibujado y se posea como una sola
  fence/turno). Es decir: para legalidad/dibujo/puntaje, una fence larga es
  una unidad; para el grafo de detección de regiones, se representa como sus
  dos mitades.

**Test de "región ya reclamada" (regla 3), cómo implementarlo barato:** dado
que la fence candidata ya pasó la regla 2 (no cruza nada), su interior queda
completamente dentro o completamente fuera de cada región ya reclamada — así
que basta con **una sola prueba de punto-en-polígono por región reclamada**,
usando como punto de prueba el **punto medio de cada sub-segmento** de la
fence candidata (no el punto medio de la fence completa — para una fence
larga, ese punto medio de la fence completa es el propio punto de paso
intermedio, que puede caer justo sobre un borde y dar una respuesta
degenerada; hay que probar los sub-segmentos por separado).

### Puntaje

**Área total**, no número de regiones (confirmado explícitamente): un
cuadrado completo vale 1, cada triángulo (mitad de un cuadro) vale 0.5. El
área total reclamada **puede terminar sumando menos que el área completa del
tablero** — puede quedar territorio permanentemente sin poder reclamarse,
por las reglas de no-cruce/no-resubdivisión. El ganador se decide comparando
los dos totales entre sí, **nunca contra un total fijo esperado** (a
diferencia de `puntos-y-cajas/engine.ts:135-138`, que compara
`boxesFilled === totalBoxes`; aquí esa comparación no aplica).

### Invariante a validar con un test de propiedad (no un test unitario suelto)

> **Después de cada jugada legal, no debe haber ninguna región delimitada
> (bounded face) sin dueño.**

Se cumple porque toda región recién delimitada se reclama de inmediato, lo
cual a su vez implica que una fence nueva nunca puede "partir" una región ya
existente (no hay región sin reclamar que partir, y las reclamadas no se
pueden volver a subdividir por la regla 3). Si el recorrido de caras (face
traversal) del motor alguna vez pasa por alto una región, este invariante lo
detecta — un test que solo cuenta "¿reclamé la cantidad correcta en esta
jugada?" no lo detectaría.

## 2. Modelo del motor — PENDIENTE

No redactado todavía. Debe cubrir, como mínimo (del hilo de la sesión, sin
desarrollar aún):
- Representación de fences dibujadas (lista/set de segmentos con dos puntos
  de la cuadrícula + dueño), incluyendo cómo se guardan las fences largas
  (como una unidad) vs. cómo se parten para el grafo de detección de
  regiones (ver sección 1).
- Construcción del grafo planar (vértices = puntos de la cuadrícula, aristas
  = fences ya partidas en sus sub-segmentos mínimos).
- Algoritmo de recorrido de caras (face traversal) para detectar regiones
  nuevas tras cada jugada — pendiente de decidir la técnica exacta
  (ordenamiento angular de aristas incidentes en cada vértice es la
  candidata natural, discutida pero no cerrada en detalle de implementación).
- Encadenamiento de turno extra al reclamar región(es), igual mecánica que
  Puntos y Cajas pero con posibilidad de reclamar más de una región de
  distinta forma en una sola jugada.
- Tipos TypeScript (`ConquistaState`, tipo de fence, tipo de región, etc.).

## 3. Detección de regiones (algoritmo) — PENDIENTE

Ver notas ya capturadas en la sección 1 (invariante, prueba de
punto-en-polígono para la regla 3, partición de fences largas). Falta
desarrollar el algoritmo de recorrido de caras en sí y sus casos de prueba.

## 4. Tablero e interacción (Board.astro) — PENDIENTE parcialmente decidido

- **Renderizado: SVG**, no el patrón de grid-de-botones-CSS de Puntos y
  Cajas (ese patrón no puede expresar diagonales). Fences como `<line>`
  (trazo delgado visible + trazo ancho invisible como área de toque),
  regiones reclamadas como `<polygon>`/`<path>` rellenos. **Aprobado.**
- **Modo de interacción: tocar dos puntos** (tocar el punto de origen, luego
  el punto de destino), no tocar la línea directamente. Decidido porque con
  270 fences candidatas en un tablero de ~416px de ancho, los objetivos
  táctiles por línea quedarían inviables (muchas líneas casi superpuestas
  saliendo del mismo punto). **Aprobado.** Sugerencia de UX capturada en la
  sesión (no aprobada aún explícitamente, pero recomendada): tras tocar el
  primer punto, resaltar solo los segundos puntos que resultarían en una
  fence legal — expone la regla de legalidad como affordance visual.
- Falta: diseño detallado del layout SVG (viewBox, tamaño de punto/línea,
  cómo se resaltan puntos legales tras el primer toque, cómo se muestra el
  jugador actual/marcador, banner de ganador).

## 5. Juego remoto — PENDIENTE

No redactado. Debe confirmar que basta con el protocolo existente (un
mensaje `movimiento` por fence con el `payload` siendo el offset/par de
puntos elegido, el motor puro recalculando turno/encadenamiento en ambos
lados) — discutido como "casi gratis" pero no escrito formalmente.

## 6. Testing — PENDIENTE

No redactado. Debe incluir al menos: el invariante de la sección 1 como test
de propiedad, casos unitarios para cada tipo de fence larga (partición y
solapamiento), casos de la regla 3 (interior atravesando región reclamada,
de forma simple y de forma irregular), y verificación de que el conteo de
270 fences en 6×6 es exacto.

## 7. Archivos a crear/tocar (borrador, no aprobado)

Patrón ya documentado en memoria (`pencilgames-status`): `src/content/juegos/conquista.md`
(metadata+instrucciones) + `src/games/conquista/{engine.ts,Board.astro}` +
registrar en `src/pages/juegos/[slug].astro`. Pendiente de ajustar una vez
exista `<TableroJuego>` (ver "Alcance" arriba).

## Siguiente paso al retomar

1. Presentar al usuario un resumen de esta sección 1 (ya aprobada) para
   refrescar contexto.
2. Confirmar de nuevo la asunción del punto medio como "cruce en T válido"
   (marcada arriba como pendiente de reconfirmar).
3. Redactar y aprobar, en orden, las secciones 2-6 (una por una, con
   aprobación explícita de cada una antes de seguir, igual que se hizo con
   la sección 1).
4. Autorevisión del spec completo (placeholders, consistencia, ambigüedad,
   alcance).
5. Pedir al usuario que revise el spec ya completo.
6. Solo entonces invocar `writing-plans`.
