# Gomoku (6º juego) — diseño

Fecha: 2026-08-30
Estado: aprobado

## Resumen

Gomoku ("cinco en línea") como sexto juego del sitio. Dos jugadores alternan
colocando una ficha en un tablero 9×9; gana quien alinee **cinco o más**
fichas consecutivas en fila, columna o diagonal. Si el tablero se llena sin
línea, es empate.

Encaja en el patrón ya establecido por los otros 5 juegos: motor puro
(`engine.ts`) + `Board.astro` + ficha de contenido + registro en
`[slug].astro`. Reutiliza `iniciarSesionJuego`, el indicador de turno
compartido, el banner de fin de juego y la identidad visual de jugadores. No
introduce Worker ni protocolo remoto nuevo.

## Decisiones de diseño

### Reglas (fijadas en este spec; el backlog `27-gomoku.md` las dejaba abiertas)

- **Tablero 9×9** (81 casillas), no el 15×15 clásico. El sitio es
  pasar-y-jugar en tableta/móvil con blancos de tap cómodos; 15×15 obliga a
  celdas por debajo del mínimo táctil o a scroll/zoom. 9×9 da partidas
  cortas, buen fit para jugar con niños, y es una variante reconocida
  (mini-gomoku).
- **Cinco o más** ("freestyle"): gana una racha de 5; si al seguir jugando
  una jugada la extiende a 6+, también cuenta. Es lo más simple de
  implementar y de explicar. Sin regla de "exactamente cinco" / overline.
- **Sin reglas de apertura / compensación de ventaja del primer jugador.**
  Turnos alternos simples. Para juego casual en familia es suficiente; 9×9
  hace las partidas cortas y se puede alternar quién empieza entre rondas.
- **Victoria única por partida** (no hay puntaje acumulado entre rondas). El
  indicador de turno no lleva `marcador`, igual que Tres en Raya.

### Detección de victoria: escaneo direccional desde la última ficha

No se usa una tabla de líneas ganadoras (el patrón de `tres-en-raya` y
`notakto`, con 8 líneas para 3×3; en 9×9 con 5-en-línea serían ~170
entradas). En su lugar, desde la casilla recién colocada se cuenta la racha
contigua del jugador hacia atrás y adelante en cada uno de los 4 ejes:

- `[1, 0]`  vertical
- `[0, 1]`  horizontal
- `[1, 1]`  diagonal ↘
- `[1, -1]` diagonal ↗

Gana si alguna racha tiene longitud ≥ 5. El motor devuelve **todos** los
índices de esa racha en `winningLine` (largo variable ≥ 5) para que
`Board.astro` los resalte sin asumir un tamaño fijo. Esto hace que "cinco o
más" salga gratis: si una jugada une dos grupos, la racha resultante ya
viene con 6+.

**Acotado de borde (riesgo principal).** El tablero es un array plano de 81;
caminar `+1` en horizontal desde la columna 8 saltaría a la fila siguiente.
Cada paso del escaneo valida `0 ≤ fila < 9` **y** `0 ≤ col < 9`, no solo
`0 ≤ índice < 81`. Cubierto con tests explícitos (ver sección de pruebas).

### Tamaño de celdas: fluido, sin overflow horizontal

- Contenedor del tablero: `width: min(92vw, 34rem)` (mismo enfoque que
  `conquista/Board.astro`, que usa `min(92vw, 32rem)`).
- Grid `grid-template-columns: repeat(9, 1fr)`, celdas con `aspect-ratio: 1`.
- **Sin** `min-width` / `min-height` fijos en la casilla (copiar los 44px de
  Notakto × 9 columnas desbordaría un móvil de ~375px).
- Resultado: ~3.4rem por celda en tableta, degradando a ~2.3rem en móvil
  chico sin scroll horizontal.

### Marca de la última jugada

`lastMove: number | null` en el estado, resaltada con un anillo interior
(`box-shadow: inset 0 0 0 3px …`), visualmente distinta del resaltado de
línea ganadora. En 9×9 con fichas pequeñas —y sobre todo en modo remoto— sin
esto no se encuentra la jugada del rival.

## Componentes

### `src/games/gomoku/engine.ts` (motor puro, sin DOM)

```ts
export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won' | 'draw';

export interface GomokuState {
  board: CellValue[];            // 81 casillas, orden fila-mayor
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningLine: number[] | null;  // índices de la racha ganadora (≥ 5)
  lastMove: number | null;
}

export function createInitialState(): GomokuState;
export function esJugadaValida(payload: unknown): payload is number;
export function playMove(state: GomokuState, index: number): GomokuState;
```

Constantes del módulo: `TAMANO = 9`, `PARA_GANAR = 5`.

- `esJugadaValida`: `true` si el payload es un entero en `[0, 80]`. Se usa
  para validar movimientos remotos (contrato de `iniciarSesionJuego`).
- `playMove` (inmutable; ante entrada inválida devuelve el `state` recibido
  sin cambios, igual que los otros motores):
  1. Si `status !== 'playing'` → devuelve `state`.
  2. Si `index` fuera de `[0, 80]` o la casilla está ocupada → devuelve
     `state`.
  3. Copia `board`, coloca `currentPlayer` en `index`, fija `lastMove = index`.
  4. Escaneo direccional desde `index`. Si hay racha ≥ 5 →
     `status: 'won'`, `winner: currentPlayer`, `winningLine: <índices>`,
     `currentPlayer` sin cambiar.
  5. Si no y `board` está lleno → `status: 'draw'`, `winner: null`,
     `winningLine: null`.
  6. Si no → alterna `currentPlayer`, `status: 'playing'`.

### `src/games/gomoku/Board.astro`

Calca la estructura de `notakto/Board.astro` (ya usa `Player = 1 | 2`, sin
capa de mapeo glifo→asiento).

- **Markup**: `<TableroJuego>` envolviendo `<div id="tablero" role="grid">`
  con 81 `<button type="button" class="casilla" data-indice={i}>` con
  `aria-label` por casilla.
- **Fichas**: asiento 1 = `●` en `var(--color-player-1)` (naranja); asiento
  2 = `▲` en `var(--color-player-2)` (azul). Vía `data-valor="1" | "2"` +
  CSS. Consistente con la identidad visual de jugadores ya fusionada
  (asiento 1 naranja `●`, asiento 2 azul `▲`).
- **Estilos de casilla**:
  - `.casilla--ganadora` para cada índice de `state.winningLine`.
  - `.casilla--ultima` (anillo interior) para `state.lastMove`.
- **Sesión**: `iniciarSesionJuego<number>({...})` idéntico a Tres en Raya. El
  payload del movimiento es el índice (`number`). `onDesconectar` deshabilita
  todas las casillas.
- **`render()`**:
  - `jugadorDelTurno = state.currentPlayer` (ya es `1 | 2`).
  - Por casilla: pinta la ficha, aplica clases, y
    `disabled = valor !== null || state.status !== 'playing' || !esMiTurno`.
  - Si `status === 'playing'`:
    `sesion.mostrarTurno({ jugador, etiqueta })` con la etiqueta ya
    formateada (`"<nombre> (●)"`), como en `tres-en-raya/Board.astro`.
  - Si no: `sesion.mostrarFinDeJuego({ titulo })` con
    `🎉 ¡Ganó <nombre> (<ficha>)!` (`won`) o `🤝 ¡Empate!` (`draw`).
- **`jugar(indice, emitirRemoto = true)`**: `state = playMove(state, indice)`,
  `render()`, y si `emitirRemoto` → `sesion.enviarMovimiento(indice)`.
- Listener `click` por casilla → `jugar(Number(casilla.dataset.indice))`.

### `src/content/juegos/gomoku.md`

Frontmatter:

```yaml
title: "Gomoku"
description: "Alinea cinco o más fichas en un tablero de 9×9 antes que tu rival."
icono: "⚫"
minJugadores: 2
maxJugadores: 2
```

Cuerpo (instrucciones):

1. El tablero es de 9×9 casillas.
2. Por turnos, cada jugador coloca una ficha en cualquier casilla vacía.
   El jugador 1 pone `●`, el jugador 2 pone `▲`.
3. Gana quien alinee **cinco o más** fichas propias consecutivas en una fila,
   una columna o una diagonal.
4. Si el tablero se llena y nadie alineó cinco, la partida es empate.

### `src/pages/juegos/[slug].astro`

- `import GomokuBoard from '../../games/gomoku/Board.astro';` (import
  estático — nada de `import()` dinámico con el slug).
- Entrada `gomoku: GomokuBoard` en el objeto `BOARDS`.

No se toca el índice (`src/pages/index.astro`) ni componentes compartidos —
se generan desde el content collection.

### Backlog

- `abstract-games-by-category/01-2-players/27-gomoku.md`: actualizar de
  15×15 a 9×9 y fijar la regla "cinco o más" (hoy dice "elige una y
  exponla").
- `abstract-games-by-category/GAME-INDEX.md`: marcar `27-gomoku.md` como ✅.

## Flujo de datos

Idéntico al de Tres en Raya (payload = índice `number`):

- **Local**: `click` en casilla → `jugar(indice)` → `playMove` → `render`.
- **Remoto**: `jugar(indice)` local → `render` → `sesion.enviarMovimiento(indice)`.
  En el otro extremo, `onMovimientoRemoto(indice)` → `jugar(indice, false)`
  (aplica sin reenviar). `esJugadaValida` filtra payloads corruptos antes de
  aplicarlos.
- **Reinicio** ("jugar de nuevo"): `onAplicarReinicio` →
  `state = createInitialState(); render()`.
- **Desconexión**: `onDesconectar` deshabilita el tablero.

## Manejo de errores / casos límite

- Movimiento sobre casilla ocupada, fuera de rango, o tras `won`/`draw`:
  `playMove` devuelve el estado sin cambios; la UI ya deshabilita esas
  casillas, esto es defensa para la ruta remota.
- Escaneo que se sale del tablero: acotado por fila y columna en cada paso.
- `localStorage` no disponible para nombres: ya lo maneja `getPlayerNames()`.

## Pruebas (`src/games/gomoku/engine.test.ts`, TDD — primero los tests)

- Estado inicial: 81 casillas `null`, `currentPlayer: 1`, `status: 'playing'`,
  `lastMove: null`.
- `esJugadaValida`: acepta `0` y `80`; rechaza `-1`, `81`, `3.5`, `'2'`,
  `null`, `{}`.
- Jugada válida coloca la ficha del jugador actual y alterna el turno.
- Jugada sobre casilla ocupada → estado sin cambios.
- Jugada fuera de rango → estado sin cambios.
- Jugada tras `won` o `draw` → estado sin cambios.
- `lastMove` se actualiza en cada jugada válida.
- Victoria **horizontal** de 5.
- Victoria **vertical** de 5.
- Victoria **diagonal ↘** de 5.
- Victoria **diagonal ↗** de 5.
- Victoria de **6 en línea** (cinco o más): `winningLine.length === 6`.
- Victoria por unión de dos grupos (`XX_XX` + jugada central) → racha de 5.
- `winningLine` contiene exactamente los índices de la racha.
- **No-envolvimiento de borde** (fila 0 fin + fila 1 inicio) → no victoria.
- Diagonal que se sale del tablero → no cuenta.
- Victoria cuya racha **termina exactamente en el borde** → sí cuenta.
- Empate por tablero lleno → `status: 'draw'`, `winner: null`.
- Inmutabilidad: `playMove` no muta el `state` de entrada ni su `board`.

## Trabajo fuera de alcance

- Modo 15×15 o tamaño configurable.
- Regla "exactamente cinco" / manejo de overline.
- Reglas de apertura (swap, swap2, pastel).
- Puntaje acumulado entre rondas / marcador.
- Extracción del componente `<TableroJuego>` compartido (ya existe
  `src/components/TableroJuego.astro`; la nota del memo sobre "extraer antes
  del 4º juego" está obsoleta).

## Integración / entrega

- Rama/worktree nuevo desde `main`; PR contra `main` como los 5 juegos
  anteriores.
- Ejecución del plan de implementación: subagent-driven (un subagente por
  tarea, revisión entre tareas), consistente con Notakto y Conquista.
- `npm test` (raíz) y `astro check` + `npm run build` limpios antes de
  abrir el PR.
