# Conquista — diseño

> **Estado: diseño completo y aprobado en su totalidad por el usuario**
> (sección por sección durante el brainstorming, y luego el documento
> completo de una sola pasada). Listo para `writing-plans`.

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
  "cruce en T" es válido). **Esta es una asunción explícita que el diseño
  entero da por hecha** (secciones 2-4 dependen de ella: `subSegments`,
  la extracción de caras, y el resaltado de destinos legales). Si al
  revisar este documento completo no es la lectura correcta, es un cambio
  de motor, no un ajuste menor — revisarla con cuidado en esta pasada final
  antes de aprobar el documento en conjunto.

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

**Consecuencia de diseño sobre el encadenamiento múltiple:** con fences
primitivas (cortas), una jugada puede reclamar **como máximo 1 región**.
Esto es distinto del clásico "una línea cierra 2 cajas a la vez" de Puntos
y Cajas: ahí es posible porque una caja individual es la única unidad
reclamable. Aquí, si se completan los 4 lados de un cuadro sin que exista
todavía su diagonal, el cuadro **entero** se reclama de inmediato como una
sola región (regla 3 ya lo protege de subdividirse después) — por lo que
el estado "faltan solo el lado compartido entre 2 cuadros adyacentes" nunca
llega a existir: la región más grande que los engloba se reclama primero.
**El único camino real hacia un reclamo múltiple en una sola jugada es una
fence larga** (offset con factor común 2, sección "Fences que pasan por un
punto intermedio" arriba): al añadir sus 2 sub-segmentos al mismo tiempo,
puede completar 2 regiones distintas en una sola jugada. La sección 6
(testing) construye el caso de prueba exactamente así — con una fence
larga, nunca con fences cortas — porque el escenario equivalente con
fences cortas es geométricamente irrealizable dado el resto de las reglas.

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

Como todos los vértices de cualquier región son puntos de la cuadrícula, el
teorema de Pick garantiza que el área de cualquier región (por irregular que
sea su forma) es siempre múltiplo de 0.5 — nunca hace falta más de un
decimal para mostrar ningún puntaje ni total.

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

## 2. Modelo del motor (APROBADO)

### Tipos base

```ts
export interface Point { row: number; col: number; } // 0..5 en cuadrícula 6×6

export type ConquistaPlayer = 1 | 2;

// Un candidato/fence dibujada se identifica por sus dos puntos, siempre en
// orden canónico (a < b comparando primero row, luego col) para que la
// clave de string sea estable sin importar en qué orden se tocaron los
// puntos.
export interface Fence { a: Point; b: Point; }

export interface ConquistaRegion {
  vertices: Point[]; // ciclo de vértices de la cuadrícula, en orden
  owner: ConquistaPlayer;
  area: number;       // vía fórmula del shoelace, ya en valor absoluto
  key: string;         // vértices canonicalizados (ver más abajo), para diff
}

export interface ConquistaState {
  size: number;                          // fijo, 6
  fences: Map<string, ConquistaPlayer>;  // clave = fenceKey(a,b) canónica
  regions: ConquistaRegion[];            // regiones ya reclamadas
  currentPlayer: ConquistaPlayer;
  scores: Record<ConquistaPlayer, number>; // suma de áreas
  status: 'playing' | 'finished';
}
```

`fenceKey(a, b)` = string canónica tipo `"r1,c1-r2,c2"` tras ordenar `a`/`b`.
Igual patrón que "clave por par de puntos ordenado" que ya sugiere el propio
`36-conquista.md` en su sección de implementación.

### Catálogo precomputado (una sola vez, a nivel de módulo)

En vez de generar candidatos dinámicamente en cada jugada, se precomputa una
sola vez, para la cuadrícula fija de 6×6, una lista `ALL_CANDIDATES: Fence[]`
con las 270 fences posibles (las 12 orientaciones de la sección 1, para cada
punto de anclaje donde el destino cae dentro de la cuadrícula).

Para cada candidato se precomputan también, una sola vez:

- **`subSegments`**: para offsets primitivos (mcd de sus componentes = 1:
  ortogonal corta, diagonal 1×1, diagonal tipo caballo) es `[la fence
  misma]`. Para offsets no primitivos (ortogonal larga, diagonal larga;
  mcd = 2) es `[mitad1, mitad2]`, partiendo en el punto medio real de la
  cuadrícula.
- **`collinearGroup`**: el conjunto de candidatos (por `fenceKey`) que
  comparten alguno de sus sub-segmentos — para los tipos primitivos es solo
  `{sí mismo}`; para una fence larga es `{sí misma, mitad1, mitad2}`, y cada
  mitad (que es a su vez un candidato primitivo independiente del catálogo)
  incluye en su propio `collinearGroup` a la(s) fence(s) larga(s) de la(s)
  que forma parte.
- **`crossesWith`**: el conjunto de candidatos (por `fenceKey`) que cruzan
  geométricamente a este candidato en un punto que no es un extremo
  compartido — calculado una sola vez con la prueba estándar de
  intersección de segmentos (orientación/producto cruzado), sobre las 270×270
  parejas posibles (trivial en tiempo de build/módulo, no en cada jugada).

Precomputar estos dos conjuntos por candidato convierte la legalidad en
runtime en simples verificaciones sobre sets ya calculados, sin volver a
hacer geometría en cada jugada.

### Legalidad de una jugada — `esFenceLegal(state, fence)`

1. **No dibujada / no solapada**: ningún miembro de `collinearGroup(fence)`
   está ya en `state.fences`.
2. **No cruza nada dibujado**: ningún miembro de `crossesWith(fence)` está
   ya en `state.fences`.
3. **No atraviesa territorio reclamado**: para cada sub-segmento de
   `subSegments(fence)`, su punto medio no cae estrictamente dentro del
   polígono de ninguna `state.regions[i]` (prueba de punto-en-polígono
   estándar, p. ej. ray casting). Se prueba el punto medio de cada
   sub-segmento por separado (no el punto medio de la fence completa —
   para una fence larga ese punto es el propio punto de paso intermedio,
   que puede caer justo sobre un borde y dar una respuesta degenerada; ver
   sección 1).

`jugarFence(state, fence)` (equivalente a `playLine` en
`puntos-y-cajas/engine.ts`): si la jugada no es legal, devuelve `state` sin
cambios (mismo patrón, importante porque el canal remoto no valida
`payload` antes de reenviarlo). Si es legal:
1. Añade `fence` a `state.fences` con dueño `state.currentPlayer`.
2. Corre la detección de regiones (sección 3) sobre el grafo actualizado.
3. Si se reclamó al menos una región nueva, `currentPlayer` no cambia
   (turno extra, encadenable). Si no, pasa al otro jugador.
4. Recorre las 270 fences del catálogo con `esFenceLegal`; si ninguna pasa,
   `status = 'finished'`.

## 3. Detección de regiones (algoritmo) — APROBADO

**Decisión de diseño clave: recomputar todas las caras delimitadas desde
cero en cada jugada, no actualizar incrementalmente.** La cuadrícula tiene
como máximo 36 vértices y 270 aristas — recalcular el grafo completo en cada
jugada es trivialmente barato en este tamaño, y un algoritmo de
"recalcular todo y comparar contra lo ya reclamado" es mucho más simple de
razonar, implementar y testear correctamente que un recorrido incremental
local (que es donde vive el tipo de bug sutil que un test unitario normal no
detecta — ver el invariante de la sección 1).

**Construcción del grafo:** vértices = puntos de la cuadrícula con al menos
una arista incidente; aristas = cada fence dibujada, **descompuesta en sus
`subSegments`** (así una fence larga aporta 2 aristas al grafo aunque sea 1
sola entrada en `state.fences`). Por la regla de no-cruce (sección 1), dos
aristas del grafo nunca se cruzan fuera de un vértice — el grafo es
plano por construcción, sin necesidad de verificarlo de nuevo aquí.

**Extracción de caras (algoritmo estándar de "rotation system"):**
1. Para cada vértice, ordenar sus aristas incidentes por ángulo.
2. Cada arista dirigida (u→v) pertenece a exactamente un ciclo de cara:
   parado en v, se sigue por la siguiente arista en sentido antihorario
   después de la reversa (v→u) de la arista de llegada; se repite hasta
   estar a punto de repetir la arista dirigida de inicio (u→v). Esto traza
   todos los ciclos de cara del grafo, incluida la cara exterior (no
   acotada).
   **Corrección importante (encontrada durante la revisión de la Task 6,
   no en el diseño original):** la condición de cierre debe comparar la
   **arista dirigida** de inicio, no solo el vértice `u`. Detenerse en
   cuanto el recorrido *vuelve a pisar* el vértice `u` (sin importar por
   cuál arista) es incorrecto: falla en cualquier cara "pellizcada" que
   pasa por un mismo vértice más de una vez antes de cerrarse. Esto es
   alcanzable en este juego precisamente porque un "cruce en T" (tocar una
   región ya reclamada en un solo vértice compartido) es legal por diseño
   — un jugador puede reclamar una región pequeña y, más tarde, dibujar un
   perímetro más grande que la rodea tocándola solo en un vértice
   compartido; la región real que queda entre ambas pasa por ese vértice
   dos veces antes de cerrar. Con la condición de cierre basada solo en el
   vértice, el recorrido se corta prematuramente ahí, produciendo una cara
   equivocada — en la práctica, una región reclamada que se solapa con una
   ya existente y un puntaje incorrecto.
3. Se calcula el área con signo (fórmula del shoelace) de cada ciclo
   trazado. Se descartan los ciclos con área con signo **≥ 0** (la cara
   exterior, o cualquier artefacto degenerado); los ciclos con área con
   signo **estrictamente negativa** son las caras acotadas candidatas
   (`área = -signo`). **No** es válido decidir por "la de mayor área en
   valor absoluto" (una idea considerada y descartada durante el diseño):
   con un grafo desconectado, o con una cara pellizcada como la de arriba,
   puede haber más de una cara exterior-o-artefacto sin que ninguna sea
   necesariamente la de mayor área — el criterio del signo, aplicado
   individualmente a cada ciclo, es el único que funciona en general. Las
   caras acotadas resultantes son ya caras **mínimas** por construcción
   del propio algoritmo (ninguna arista del grafo puede quedar en el
   interior de una cara trazada así), no algo que haya que verificar
   aparte.

**Diff contra lo ya reclamado:** cada cara acotada se canonicaliza (ciclo de
vértices normalizado, p. ej. empezando por el vértice de menor `(row,col)` y
en un sentido fijo) para obtener su `key`. Cualquier cara acotada cuya `key`
no esté ya en `state.regions` es una región **nueva**: se le asigna
`owner = currentPlayer` (el que acaba de jugar) y `area = |shoelace|/2`. Por
el invariante de la sección 1 (nunca queda una cara acotada sin dueño tras
una jugada legal), toda cara "nueva" encontrada así es necesariamente
recién cerrada por esta jugada — no hace falta razonar caso por caso sobre
qué la cerró.

**Nota de rendimiento:** 270 candidatos × 3 reglas de legalidad, más una
recomputación completa de caras (≤36 vértices, ≤270 aristas) en cada
jugada, es trabajo trivial para un juego de tablero en navegador — no hay
preocupación de rendimiento aquí, la complejidad está solo en la corrección
del algoritmo, no en su costo.

**Test de propiedad obligatorio** (ya anotado en sección 1, repetido aquí
porque es el criterio de corrección de esta sección): después de cada
jugada legal, `state.regions` debe cubrir el 100% de las caras acotadas que
la extracción de caras encuentra en ese momento — cero caras acotadas sin
dueño.

## 4. Tablero e interacción (Board.astro) — APROBADO

- **Renderizado: SVG.** `viewBox` fijo (p. ej. `0 0 500 500`), puntos de la
  cuadrícula distribuidos en una malla 6×6 regular dentro de ese espacio.
  Fences dibujadas como `<line>` coloreada por dueño (`--color-player-1/2`,
  igual paleta que el resto del sitio). Regiones reclamadas como
  `<polygon>` (usando `region.vertices`) con relleno semitransparente del
  color del dueño — mismo tratamiento visual que las cajas de Puntos y
  Cajas (`color-mix(in srgb, var(--color-player-N) 25%, transparent)`).
- **Interacción: tocar dos puntos**, no tocar la línea:
  1. Cada uno de los 36 puntos es un objetivo táctil (círculo visible
     pequeño + círculo invisible de ≥44px para el toque, mismo criterio de
     `--tap-target-min` que ya usa el resto del sitio).
  2. Al tocar un punto sin selección previa, ese punto queda marcado como
     **origen** y se calculan sus destinos legales: filtrar
     `ALL_CANDIDATES` anclados en ese punto (en cualquiera de las 2
     direcciones) por `esFenceLegal(state, candidato)`, y **resaltar
     visualmente solo esos puntos de destino** (p. ej. relleno o anillo
     distinto) — expone la regla de legalidad como affordance en vez de
     tener que explicarla.
  3. Tocar uno de los puntos resaltados dibuja esa fence
     (`jugarFence(state, fence)`) y limpia la selección.
  4. Tocar el punto de origen de nuevo cancela la selección (sin jugar).
  5. Tocar cualquier otro punto no resaltado **cambia el origen** a ese
     punto nuevo (recalcula sus propios destinos legales), en vez de
     mostrar un error — más indulgente para tocar en una pantalla pequeña.
  6. Si no hay selección de origen, tocar cualquier punto que no tenga al
     menos un destino legal simplemente no resalta nada (ese punto ya no
     tiene jugadas posibles, p. ej. está totalmente rodeado de fences ya
     dibujadas/territorio reclamado).
- **Gating de turno y remoto**: igual patrón que los otros 3 `Board.astro`
  — si `miAsiento !== null && state.currentPlayer !== miAsiento`, los
  puntos quedan sin interacción (no seleccionables como origen).
- **Marcador/turno/banner de ganador**: debe integrarse con el componente
  compartido `<TableroJuego>` que se extraerá como prerequisito (ver
  "Alcance" al inicio de este documento) — no se duplica el patrón de
  `indicador-turno`/`banner-ganador` de los `Board.astro` actuales dentro de
  este archivo nuevo. La API exacta de integración depende del diseño de
  esa extracción (aún no hecho); este documento solo fija el requisito
  funcional: mostrar de quién es el turno, el marcador de áreas (con un
  decimal, p. ej. "3.5") en vez de conteo entero, y el banner de fin de
  partida comparando los dos totales de área.
- Fuera de alcance para esta primera versión (anotarlo para no
  sobre-construir): previsualización de la línea mientras se elige destino,
  animaciones de reclamo de región, y cualquier ayuda visual más allá del
  resaltado de puntos legales.

## 5. Juego remoto — APROBADO

Reusa el protocolo existente sin cambios de infraestructura (mismo
`ModalJuegoRemoto`, mismo evento `canal-remoto-listo`, mismo modelo de 2
asientos):

- Mensaje de jugada: `{ tipo: 'movimiento', payload: Fence }`, con
  `Fence = { a: Point, b: Point }` (los dos puntos tocados, en cualquier
  orden — `jugarFence` internamente los canonicaliza).
- Cada lado, al recibir el mensaje, llama a `jugarFence(state, payload)`
  — la misma función pura que usa localmente. Como `jugarFence` es
  determinista y ya devuelve el estado sin cambios ante cualquier jugada
  ilegal (sección 2), un `payload` corrupto o de un candidato inexistente
  simplemente no hace nada en vez de desincronizar a los dos jugadores —
  mismo mecanismo de defensa que ya protege a los otros 3 juegos, sin
  necesidad de validación adicional de tipos en el `Board.astro` de
  Conquista.
- Sin cambios en `worker/` ni en el modelo de señalización: esto es
  puramente reusar el mismo canal de datos con un `payload` distinto.
- Fuera de alcance (ya es backlog general del sitio, no específico de
  Conquista): endurecer el cast sin validar de `mensaje.payload` en los
  `Board.astro`.

## 6. Testing — APROBADO

`engine.test.ts` (Vitest, mismo runner que los otros 3 juegos):

- **Catálogo**: `ALL_CANDIDATES.length === 270` para tamaño 6; conteo por
  tipo coincide con la tabla de la sección 1 (60/48/50/80/32).
- **`collinearGroup`**: una fence larga (p. ej. offset (2,2)) tiene grupo de
  tamaño 3 con sus 2 mitades; una fence primitiva sin fence larga que la
  contenga tiene grupo de tamaño 1; una fence primitiva que sí es mitad de
  alguna larga tiene esa larga en su grupo.
- **`crossesWith`**: el caso concreto ya verificado a mano en la sesión
  (offset (1,2) desde un punto vs. offset (2,-1)/(-2,1) desde un punto
  vecino que se cruzan en un punto no entero) debe aparecer en ambos
  `crossesWith`; dos fences que solo comparten un extremo (sin cruzarse) NO
  deben aparecer una en el `crossesWith` de la otra.
- **`esFenceLegal`**: casos independientes para cada una de las 3 reglas
  (ya dibujada/solapada, cruza algo dibujado, atraviesa región reclamada —
  incluyendo el caso de una región no rectangular producida por una
  diagonal tipo caballo).
- **`jugarFence`**: jugada ilegal devuelve el mismo estado (misma
  referencia o al menos deep-equal); reclamar una región mantiene el turno;
  encadenar reclamando 2+ regiones en la misma jugada mantiene el turno
  tantas veces como reclame; no reclamar ninguna pasa el turno. El caso de
  2+ regiones **debe construirse con una fence larga** (nunca con fences
  cortas): como se explica en la sección 1, una fence corta reclama como
  máximo 1 región, porque cualquier región más grande que englobara a 2
  cuadros adyacentes ya se habría reclamado antes de llegar al lado
  compartido.
- **Extracción de caras**: 2-3 grafos pequeños construidos a mano
  (triángulo simple, cuadrado simple, una forma irregular con una diagonal
  tipo caballo) con el resultado esperado de vértices y área conocidos de
  antemano.
- **Test de propiedad** (el invariante de las secciones 1 y 3): generar
  partidas completas jugando movimientos legales aleatorios (filtrando
  candidatos con `esFenceLegal` en cada paso) hasta `status === 'finished'`,
  y en cada jugada verificar que el número de caras acotadas que la
  extracción encuentra coincide exactamente con `state.regions.length`
  (cero caras sin dueño). Repetir con varias semillas para tener cobertura
  razonable de la variedad de formas de región.
- **Fin de partida**: la partida termina únicamente cuando ninguna de las
  270 candidatas pasa `esFenceLegal` — no cuando se alcanza un número fijo
  de regiones o de área (a diferencia del `boxesFilled === totalBoxes` de
  Puntos y Cajas).
- Mismo criterio de cobertura que los otros `engine.test.ts` del repo (sin
  framework de UI, solo lógica pura) — `Board.astro` no lleva tests
  automatizados, se verifica con playtest manual (Chrome DevTools MCP, como
  ya se hizo para el juego remoto) antes de dar la tarea por terminada.

## 7. Archivos a crear/tocar — APROBADO

Mismo patrón de extensibilidad documentado en memoria (`pencilgames-status`)
y usado por los 3 juegos existentes:

- `src/content/juegos/conquista.md` — metadata (`title`, `description`,
  `icono`, `minJugadores: 2`, `maxJugadores: 2`) + instrucciones en
  español para el modal de instrucciones (explicar el juego en términos de
  jugador, no repetir el catálogo técnico de 12 orientaciones — igual de
  nivel de detalle que `puntos-y-cajas.md`).
- `src/games/conquista/engine.ts` — todo lo de las secciones 2-3
  (catálogo, precómputo, legalidad, extracción de caras, `jugarFence`).
- `src/games/conquista/engine.test.ts` — sección 6.
- `src/games/conquista/Board.astro` — sección 4, construido sobre
  `<TableroJuego>` (una vez exista) en vez de duplicar el patrón de
  indicador/banner.
- Registrar `'conquista': ConquistaBoard` en el mapa `BOARDS` de
  `src/pages/juegos/[slug].astro`.

No se toca `src/lib/players.ts`, `turnIndicator.ts`, `winnerBanner.ts`,
`BaseLayout.astro` (colores), ni nada de `worker/` — todo eso se reusa tal
cual (alcance de 2 jugadores ya decidido).

## Próximo paso

Documento aprobado en su totalidad por el usuario, incluida la asunción del
punto medio (sección 1). Siguiente: `superpowers:writing-plans` para el
plan de implementación. **No** incluye la extracción de `<TableroJuego>`
(prerequisito separado, ver "Alcance" al inicio de este documento) — ese
prerequisito debe estar resuelto (o al menos planeado como paso previo)
antes de ejecutar el plan de Conquista.
