# Juego Y — Diseño

Fecha: 2026-09-05
Estado: aprobado, pendiente de plan de implementación

## Resumen

Y es un juego de conexión para 2 jugadores, cercano a Hex, sobre un tablero
triangular de celdas hexagonales. Cada jugador coloca por turnos una ficha de su
color en cualquier celda vacía. Gana quien primero forme **una cadena conectada
que toque los tres lados del triángulo**. No existen empates (teorema de Y: un
tablero lleno siempre tiene exactamente un ganador).

Será el 23.º juego de la colección. Categoría del backlog: `01-2-players`
(`abstract-games-by-category/01-2-players/26-y.md`).

## Decisiones de producto

| Tema | Decisión |
|---|---|
| Slug / id de contenido | `juego-y` |
| Título en UI | "Juego Y" |
| Ruta | `/juegos/juego-y` |
| Icono | `🔺` |
| Tamaños de tablero | N ∈ {7, 9, 11} (longitud del lado), default 9 |
| Resaltado de victoria | Se marca el **componente conectado completo** del ganador; sin capa de polilínea |
| Regla del pastel (swap) | No se implementa (YAGNI) |
| Modo misère | No |
| Primer jugador | Jugador 1 siempre empieza (como Hex) |

## Geometría del tablero (indexado triangular compacto)

El tablero **no** es N×N. Longitud de lado N ⇒ `N(N+1)/2` celdas.

- Fila `r` va de `0` (ápice) a `N-1` (base); contiene celdas `c` en `0..r`.
- `cellCount(N) = N * (N + 1) / 2` → N=7: 28, N=9: 45, N=11: 66.
- `indexOf(r, c) = r * (r + 1) / 2 + c`
- `coordsOf(index)`: `r = floor((sqrt(8 * index + 1) - 1) / 2)`, `c = index - r * (r + 1) / 2`.
  La conversión debe validarse como biyección sobre `[0, cellCount)` en los tests
  (no confiar solo en la fórmula de raíz).

### Vecindad (6 direcciones)

Vecinos de `(r, c)`, cada uno aceptado solo si `0 <= r' <= N-1` y `0 <= c' <= r'`:

```
(r,     c - 1)   (r,     c + 1)
(r - 1, c - 1)   (r - 1, c)
(r + 1, c)       (r + 1, c + 1)
```

Chequeo de grado (tests explícitos):

| Celda | Grado esperado |
|---|---|
| Ápice `(0,0)` | 2 |
| Esquina inferior izquierda `(N-1, 0)` | 4 |
| Esquina inferior derecha `(N-1, N-1)` | 4 |
| Punto medio de cualquier lado (no esquina) | 4 |
| Celda interior | 6 |

`getNeighbors` debe ser recíproco: `b ∈ N(a) ⟺ a ∈ N(b)`.

### Lados (metas para AMBOS jugadores)

A diferencia de Hex (cada jugador tiene su par de bordes), en Y los tres lados son
meta para los dos jugadores:

- Lado izquierdo: `c === 0`
- Lado derecho: `c === r`
- Lado inferior: `r === N - 1`

Las esquinas pertenecen a dos lados y es correcto (el ápice `(0,0)` cumple
`c===0` y `c===r`).

## Motor — `src/games/y/engine.ts`

### Tipos

```ts
export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';
export type BoardSize = 7 | 9 | 11;

export interface YState {
  size: BoardSize;               // N = longitud del lado
  board: CellValue[];            // longitud N(N+1)/2, indexado triangular
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningCells: number[] | null; // componente conectado ganador completo
  lastMove: number | null;
}
```

### API pública

```ts
createInitialState(size: BoardSize = 9): YState
esJugadaValida(payload: unknown, size: BoardSize): payload is number
getNeighbors(index: number, size: BoardSize): number[]
playMove(state: YState, index: number): YState
```

Funciones auxiliares internas (exportadas si los tests las necesitan):
`cellCount`, `indexOf`, `coordsOf`.

### `esJugadaValida`

`true` solo si `payload` es entero y `0 <= payload < cellCount(size)`.
Rechaza no-números, no-enteros, negativos, `NaN`, strings.

### `playMove(state, index)`

1. Si `state.status !== 'playing'` → devuelve `state` sin cambios.
2. Si `!esJugadaValida(index, state.size)` → devuelve `state` sin cambios.
3. Si `state.board[index] !== null` → devuelve `state` sin cambios.
4. Copia `board`, coloca `state.currentPlayer` en `index`.
5. **BFS flood-fill desde `index` únicamente**, recorriendo solo celdas del
   mismo jugador. Durante el recorrido acumula qué lados toca **ese** componente
   (`tocaIzq`, `tocaDer`, `tocaInf`).
6. Si los tres lados quedan tocados → nuevo estado con `status: 'won'`,
   `winner: currentPlayer`, `winningCells` = lista de celdas del componente,
   `lastMove: index`. **No se alterna** `currentPlayer`.
7. Si no → nuevo estado con `currentPlayer` alternado y `lastMove: index`.

Solo se evalúa el componente de la ficha recién colocada: no es posible ganar en
la jugada del rival, y cualquier conexión de tres lados preexistente ya habría
terminado la partida.

### Invariantes

- Nunca hay empate: un tablero lleno tiene exactamente un ganador.
- `winningCells` es no vacío ⟺ `status === 'won'`.
- El estado es inmutable: `playMove` nunca muta `state` ni `state.board`.

## Board — `src/games/y/Board.astro`

Se copia **la estructura del `<script>` de `src/games/hex/Board.astro`** (wiring de
sesión ya probado en producción). Solo cambia la geometría de render.

### Wiring de sesión (idéntico a Hex)

- `iniciarSesionJuego<number>({ validarMovimiento, onMovimientoRemoto,
  onAplicarReinicio, onRender: render, onDesconectar })`.
- `onRender: render` es obligatorio para la reconexión remota (si falta, el
  tablero queda clickeable fuera de turno).
- `jugar(indice, emitirRemoto = true)`: el guard de turno es
  `if (emitirRemoto && !sesion.esMiTurno(state.currentPlayer)) return;`
  — **nunca** incondicional dentro de `jugar()` (descarta movimientos remotos en
  silencio).
- `onAplicarReinicio`: reconstruye estado con `currentSize`, rearma el SVG,
  `render()`.
- `onDesconectar`: desactiva `pointer-events` de las celdas y deshabilita los
  botones de tamaño.

### Controles

Selector de tamaño con tres botones (`role="radiogroup"`): 7×7, 9×9 (default
activo), 11×11. Deshabilitado cuando `hayJugadas || sesion.miAsiento !== null`.

### Render SVG (geometría nueva)

- Hexágonos "pointy-top" (como Hex): `R`, `W = Math.sqrt(3) * R`.
- Centro de `(r, c)`: fila `r` desplazada media celda a la izquierda por nivel
  para formar el triángulo equilátero con el ápice arriba y la base abajo:
  - `cx = MARGIN + (c - r / 2) * W + offsetX`
  - `cy = MARGIN + r * (1.5 * R) + R`
  - `offsetX` centra el triángulo en el `viewBox`.
- `viewBox` calculado desde el bounding box real de la fila base (`r = N-1`).
- Cada celda es un `<g>` con `<polygon>` + `<text>` para el glifo, `tabindex="0"`,
  `role="button"`, `aria-label` "Fila X, celda Y". Listeners `click` y `keydown`
  (Enter / Space) → `jugar(i)`.

### Bandas de borde

Tres polilíneas **neutras** (un único color, p. ej. token gris/borde), NO
`hex-borde-j1/j2` (en Y los tres lados son de ambos jugadores):

- Lado izquierdo: vértices exteriores de las celdas `c === 0`.
- Lado derecho: vértices exteriores de las celdas `c === r`.
- Lado inferior: vértices exteriores de las celdas `r === N - 1`.

### `render()`

- Por celda: `data-jugador` según `state.board[i]`; glifo `●` (J1) / `▲` (J2).
- `.y-celda--ultima` en `state.lastMove`.
- `.y-celda--ganadora` en **todas** las celdas de `state.winningCells` (mismo
  glow/pulso que Hex). Sin capa de polilínea de victoria.
- `pointer-events` / `aria-disabled` según celda vacía + turno propio + partida en
  curso.
- `sesion.mostrarTurno({ jugador, simbolos: { 1: '●', 2: '▲' } })` mientras
  `playing`.
- `sesion.mostrarFinDeJuego({ titulo: '🎉 ¡Ganó <nombre> (<símbolo>)!', detalle:
  'Conectó los tres lados' })` al ganar.

### CSS

Clases `y-*` espejo de las `hex-*`, con los mismos tokens
(`--color-player-1/2`, `--color-accent`, `--color-surface`). Reusar el
`@keyframes` de pulso.

## Tests — `src/games/y/engine.test.ts`

Vitest, estilo de `src/games/hex/engine.test.ts`.

### Geometría

- `cellCount(7|9|11)` = 28 / 45 / 66.
- Grados de vecindad por tamaño según la tabla de arriba.
- `getNeighbors` recíproco.
- `indexOf` / `coordsOf` biyectivos sobre `[0, cellCount)` para cada N.

### Lógica de jugada

- `playMove` devuelve el mismo `state` (sin cambios) ante: celda ocupada, índice
  fuera de rango, partida terminada.
- Alterna `currentPlayer` y setea `lastMove` tras jugada válida.
- No muta el estado de entrada.
- `esJugadaValida` acota contra `cellCount(size)`; rechaza no-enteros, negativos,
  strings, `NaN`.

### Victoria

- Cadena mínima de J1 (N=7) que toca los tres lados → `won`, `winner: 1`,
  `winningCells` contiene toda la cadena.
- **Regresión de componentes disjuntos**: J1 con un grupo que toca {izq, inf} y
  otro grupo separado que toca {der} → NO hay victoria.
- Colocar la ficha que cerraría la Y del rival no le da la victoria a quien mueve.
- Una sola ficha en el ápice no gana (toca izq + der, no inf).

### Propiedad aleatoria (prueba fuerte, estilo Snakes)

Para cada N ∈ {7, 9, 11}, ~5.000 iteraciones:

- Barajar todos los índices; colocar fichas alternando J1/J2 con `playMove` real
  hasta llenar el tablero o hasta el primer `won`.
- Asserts:
  - La partida nunca queda en `playing` con el tablero lleno.
  - `winner` coincide con un flood-fill de verificación independiente.
  - Nunca ambos jugadores conectan los tres lados.

## Archivos

Nuevos:

1. `src/games/y/engine.ts`
2. `src/games/y/engine.test.ts`
3. `src/games/y/Board.astro`
4. `src/content/juegos/juego-y.md` — frontmatter según el schema de la colección
   (`title`, `description`, `icono`, `minJugadores: 2`, `maxJugadores: 2`).

Modificados:

5. `src/pages/juegos/[slug].astro` — `import YBoard from '../../games/y/Board.astro'`
   y entrada `'juego-y': YBoard` en `BOARDS`. La clave **debe** ser igual al
   nombre del archivo `.md` (es el id de contenido).
6. `abstract-games-by-category/GAME-INDEX.md` — marcar `26-y.md` como ✅.
7. `abstract-games-by-category/01-2-players/26-y.md` — **corregir la geometría**:
   el doc actual dice "5×5 o 7×7" (incorrecto, el tablero no es N×N) y describe
   una detección de victoria por BFS sembrado desde todos los nodos de un lado
   (bug de componentes disjuntos). Actualizar a: indexado triangular, tamaños
   7/9/11, victoria por componente desde la ficha colocada.

La home (`src/pages/index.astro`) lista automáticamente desde la colección: no se
toca.

## Fuera de alcance

- Regla del pastel / swap.
- Modo misère.
- IA / oponente automático.
- Tamaños distintos de 7/9/11.
- Renderizado de la figura de tres ramas de la victoria (se resalta el
  componente completo).
