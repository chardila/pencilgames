# Bridg-It (Gale) — Diseño

## Contexto

Vigésimo juego del sitio. Bridg-It (David Gale, 1958) es el "Shannon Switching Game"
formulado como juego de conexión sobre dos retículas de puntos entrelazadas: cada
jugador dibuja aristas entre sus propios puntos adyacentes intentando conectar sus
dos bordes opuestos; cada arista posible de un color cruza como máximo una arista
posible del otro color, y trazar una bloquea automáticamente a la cruzada (si
existe — las aristas en el borde propio de cada color no tienen ninguna cruzada
posible). El
juego nunca empata: exactamente uno de los dos jugadores siempre puede completar
su conexión (dualidad planar), igual que en Hex, que ya está implementado en este
repositorio y sirve de referencia de patrón de motor/tablero.

Fuente: `abstract-games-by-category/01-2-players/11-bridg-it.md`.

## Corrección post-implementación (geometría del tablero)

La primera implementación usaba una grilla roja 6×6 anidando una grilla azul
5×5 (36 puntos rojos vs. 25 azules) — un modelo geométrico incorrecto que el
usuario detectó comparando contra el tablero físico real
(`papg.com/images/gale-board.gif`) y contra la descripción de Wikipedia del
juego comercial: "dos retículas rectangulares interladas de 5×6". El tablero
real usa dos retículas del mismo tamaño (30 puntos cada una), transpuestas
entre sí, no una anidada dentro de la otra. El resto de este documento ya
refleja el modelo corregido (rojo 5×6, azul 6×5); ver `## Modelo de datos` y
`## Regla de cruce`.

## Alcance

- Tablero fijo (sin selector de tamaño): grid roja 5 columnas × 6 filas,
  grid azul 6 columnas × 5 filas — 30 puntos cada color.
- Sin empates: se resalda ganador y camino ganador al final, sin lógica de tablero lleno/empate.
- Un solo modo de tablero/estética (puntos entrelazados clásicos, ver Renderizado).
- Sigue el patrón estándar del repo: pase y juega local + soporte remoto genérico ya existente en `[slug].astro`/`TableroJuego`/`ModalJuegoRemoto` (sin cambios especiales de sesión; el motor solo expone estado + `playMove`).

## Modelo de datos

Dos retículas de puntos, del mismo tamaño (30 puntos cada una), transpuestas
entre sí:

- **Rojo**: 5 columnas × 6 filas, puntos `R(r, c)` con `r ∈ [0,5]`, `c ∈ [0,4]`.
  El Jugador 1 (rojo) conecta la fila 0 (borde superior) con la fila 5
  (borde inferior).
- **Azul**: 6 columnas × 5 filas, puntos `B(r, c)` con `r ∈ [0,4]`, `c ∈ [0,5]`.
  El Jugador 2 (azul) conecta la columna 0 (borde izquierdo) con la columna 5
  (borde derecho).

Coordenadas de renderizado (unidades de grid CSS, para reproducir el patrón
entrelazado clásico del tablero físico real): `R(r,c)` en `(col=2c+2,
fila=2r+1)`, `B(r,c)` en `(col=2c+1, fila=2r+2)`. Ambas retículas caben en el
mismo cuadrado de 11×11 líneas de grid.

### Estado (`BridgItState`)

```ts
type Player = 1 | 2; // 1 = rojo, 2 = azul
type EdgeDir = 'h' | 'v';

interface Edge {
  type: EdgeDir;
  row: number;
  col: number;
}

interface BridgItState {
  redH: boolean[][];   // [6][4]  R(r,c)-R(r,c+1)
  redV: boolean[][];   // [5][5]  R(r,c)-R(r+1,c)
  blueH: boolean[][];  // [5][5]  B(r,c)-B(r,c+1)
  blueV: boolean[][];  // [4][6]  B(r,c)-B(r+1,c)
  currentPlayer: Player;
  status: 'playing' | 'won';
  winner: Player | null;
  winningPath: Array<{ r: number; c: number }> | null; // puntos del color ganador
  lastMove: { player: Player; edge: Edge } | null;
}
```

Rangos válidos de índices:

- `redH[r][c]`: `r ∈ [0,5]`, `c ∈ [0,3]`.
- `redV[r][c]`: `r ∈ [0,4]`, `c ∈ [0,4]`.
- `blueH[r][c]`: `r ∈ [0,4]`, `c ∈ [0,4]`.
- `blueV[r][c]`: `r ∈ [0,3]`, `c ∈ [0,5]`.

Total de aristas posibles: 24 (`redH`) + 25 (`redV`) = 49 para rojo; 25
(`blueH`) + 24 (`blueV`) = 49 para azul — simétrico, a diferencia del modelo
anidado original (60 rojas / 40 azules).

## Regla de cruce

Cada arista roja cruza como máximo una arista azul, y viceversa. `redV`/`blueH`
se cruzan siempre, en la misma posición exacta (sin casos de borde); `redH`/`blueV`
se cruzan desplazados en diagonal, con casos de borde donde no hay cruce posible:

- `redH(r,c)` [R(r,c)–R(r,c+1)] cruza `blueV(r-1,c+1)` si `r-1 ∈ [0,3]` (sin
  cruce posible cuando `r=0` o `r=5`, los bordes superior/inferior de rojo).
- `redV(r,c)` [R(r,c)–R(r+1,c)] cruza `blueH(r,c)` directamente (siempre,
  mismos índices).
- `blueH(r,c)` [B(r,c)–B(r,c+1)] cruza `redV(r,c)` directamente (inversa de
  la anterior).
- `blueV(r,c)` [B(r,c)–B(r+1,c)] cruza `redH(r+1,c-1)` si `c-1 ∈ [0,3]` (sin
  cruce posible cuando `c=0` o `c=5`, los bordes izquierdo/derecho de azul).

## Motor (`src/games/bridg-it/engine.ts`)

Sigue el patrón de `src/games/hex/engine.ts`:

- `createInitialState(): BridgItState`
- `esJugadaValida(payload: unknown): payload is Edge` — valida solo la forma
  (`type` es `'h'`/`'v'`, `row`/`col` son enteros no negativos); no conoce el
  jugador activo, así que no valida rango por color.
- `puedeJugar(state, edge): boolean` — con `state.currentPlayer` ya conocido,
  comprueba: (a) la arista está en rango para la grilla de ese jugador
  (rojo o azul, según las tablas de rangos arriba), (b) esa arista propia no
  existe aún, (c) la arista cruzada del color contrario no existe.
- `playMove(state, edge): BridgItState` — si `puedeJugar` falla, retorna `state`
  sin cambios (igual que Hex). Si es válida, marca la arista, corre
  `findWinningPath` para el jugador activo; si conecta, `status: 'won'`; si no,
  pasa el turno.
- `findWinningPath(state, player): Array<{r,c}> | null` — BFS/unión desde todos
  los puntos del borde de inicio del jugador (fila 0 para rojo, columna 0 para
  azul) siguiendo únicamente aristas propias existentes, hasta alcanzar el
  borde opuesto (fila 5 / columna 5). Devuelve la secuencia de puntos del
  camino encontrado, o `null`.

No existe caso de tablero lleno/empate: no se implementa esa rama (documentar
con un comentario, como en Hex).

## Renderizado y interacción (`Board.astro`)

- Grid CSS con doble densidad de filas/columnas frente a Puntos y Cajas: puntos
  rojos en posiciones pares, puntos azules en posiciones impares (offset
  diagonal), reproduciendo el patrón entrelazado clásico del tablero físico.
- Un botón invisible por cada arista potencial de ambos colores; solo las del
  color del jugador en turno son interactivas (las del otro color se muestran
  atenuadas/no-interactivas, mismo tratamiento que en otros juegos del sitio
  para jugadas no disponibles).
- Bordes objetivo resaltados: fila superior/inferior en rojo, columna
  izquierda/derecha en azul.
- Al ganar, resaltar el camino (`winningPath`) igual que en Hex.
- Fichas/indicador de turno reutiliza la identidad visual estándar de
  jugadores del sitio (forma/color por asiento).

## Integración

- `src/games/bridg-it/engine.ts`, `engine.test.ts`, `Board.astro`.
- `src/content/juegos/bridg-it.md` (front-matter `title`, `description`,
  `icono`, `minJugadores: 2`, `maxJugadores: 2`, instrucciones numeradas al
  estilo de `hex.md`).
- Registrar `bridg-it: BridgItBoard` en `src/pages/juegos/[slug].astro`.
- Marcar `11-bridg-it.md` como ✅ y actualizar la fila correspondiente en
  `GAME-INDEX.md`.

## Testing

`engine.test.ts` (mismo nivel de cobertura que Hex/Col):

- Estado inicial correcto (dimensiones de las 4 matrices de aristas).
- Jugada válida coloca la arista y pasa el turno.
- Jugada inválida (fuera de rango, arista propia repetida, arista cruzada por
  el rival) no cambia el estado.
- Bloqueo por cruce en ambas direcciones (roja bloquea azul y viceversa) en
  varios puntos del tablero, incluyendo los bordes donde una de las dos
  aristas cruzadas no existe (no debe lanzar error, simplemente no hay bloqueo).
- Detección de victoria para rojo (fila 0 → fila 5) y para azul (columna 0 →
  columna 5), incluyendo caminos que darían un falso positivo si se usara la
  grilla equivocada.
- Camino ganador (`winningPath`) contiene únicamente puntos conectados por
  aristas propias existentes.
- Smoke test de partidas aleatorias (n ~ 1000-5000) verificando que siempre
  termina con exactamente un ganador y sin excepciones (confirma la propiedad
  de "no hay empates").
