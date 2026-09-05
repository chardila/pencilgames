# Bridg-It (Gale) — Diseño

## Contexto

Vigésimo juego del sitio. Bridg-It (David Gale, 1958) es el "Shannon Switching Game"
formulado como juego de conexión sobre dos retículas de puntos entrelazadas: cada
jugador dibuja aristas entre sus propios puntos adyacentes intentando conectar sus
dos bordes opuestos; cada arista posible de un color cruza exactamente una arista
posible del otro color, y trazar una bloquea automáticamente a la cruzada. El
juego nunca empata: exactamente uno de los dos jugadores siempre puede completar
su conexión (dualidad planar), igual que en Hex, que ya está implementado en este
repositorio y sirve de referencia de patrón de motor/tablero.

Fuente: `abstract-games-by-category/01-2-players/11-bridg-it.md`.

## Alcance

- Tablero fijo (sin selector de tamaño): grid roja 6×6, grid azul 5×5.
- Sin empates: se resalda ganador y camino ganador al final, sin lógica de tablero lleno/empate.
- Un solo modo de tablero/estética (puntos entrelazados clásicos, ver Renderizado).
- Sigue el patrón estándar del repo: pase y juega local + soporte remoto genérico ya existente en `[slug].astro`/`TableroJuego`/`ModalJuegoRemoto` (sin cambios especiales de sesión; el motor solo expone estado + `playMove`).

## Modelo de datos

Dos retículas de puntos:

- **Rojo**: grid 6×6, puntos `R(r, c)` con `r, c ∈ [0, 5]`. El Jugador 1 (rojo) conecta
  la fila 0 (borde superior) con la fila 5 (borde inferior).
- **Azul**: grid 5×5, puntos `B(r, c)` con `r, c ∈ [0, 4]`, ubicados geométricamente
  en el centro de cada bloque 2×2 de puntos rojos (offset diagonal de medio paso).
  El Jugador 2 (azul) conecta la columna 0 (borde izquierdo) con la columna 4
  (borde derecho).

Coordenadas de renderizado (unidades de grid CSS, para reproducir el patrón
entrelazado clásico): `R(r,c)` en `(2c, 2r)`, `B(r,c)` en `(2c+1, 2r+1)`.

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
  redH: boolean[][];   // [6][5]  R(r,c)-R(r,c+1)
  redV: boolean[][];   // [5][6]  R(r,c)-R(r+1,c)
  blueH: boolean[][];  // [5][4]  B(r,c)-B(r,c+1)
  blueV: boolean[][];  // [4][5]  B(r,c)-B(r+1,c)
  currentPlayer: Player;
  status: 'playing' | 'won';
  winner: Player | null;
  winningPath: Array<{ r: number; c: number }> | null; // puntos del color ganador
  lastMove: { player: Player; edge: Edge } | null;
}
```

Rangos válidos de índices:

- `redH[r][c]`: `r ∈ [0,5]`, `c ∈ [0,4]`.
- `redV[r][c]`: `r ∈ [0,4]`, `c ∈ [0,5]`.
- `blueH[r][c]`: `r ∈ [0,4]`, `c ∈ [0,3]`.
- `blueV[r][c]`: `r ∈ [0,3]`, `c ∈ [0,4]`.

## Regla de cruce

Cada arista roja cruza como máximo una arista azul, y viceversa:

- `redH(r,c)` [R(r,c)–R(r,c+1)] cruza `blueV(r-1,c)` si `r-1 ∈ [0,3]`.
- `redV(r,c)` [R(r,c)–R(r+1,c)] cruza `blueH(r,c-1)` si `c-1 ∈ [0,3]`.
- `blueH(r,c)` [B(r,c)–B(r,c+1)] cruza `redV(r,c+1)` (inversa de la segunda regla).
- `blueV(r,c)` [B(r,c)–B(r+1,c)] cruza `redH(r+1,c)` (inversa de la primera regla).

(Las dos últimas son la relación inversa de las dos primeras; el motor solo
necesita implementar la comprobación en ambos sentidos al validar una jugada.)

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
  borde opuesto (fila 5 / columna 4). Devuelve la secuencia de puntos del
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
  columna 4), incluyendo caminos que darían un falso positivo si se usara la
  grilla equivocada.
- Camino ganador (`winningPath`) contiene únicamente puntos conectados por
  aristas propias existentes.
- Smoke test de partidas aleatorias (n ~ 1000-5000) verificando que siempre
  termina con exactamente un ganador y sin excepciones (confirma la propiedad
  de "no hay empates").
