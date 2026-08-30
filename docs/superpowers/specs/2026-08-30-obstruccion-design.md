# Obstrucción (8º juego) — diseño

Fecha: 2026-08-30
Estado: aprobado

## Resumen

Obstrucción como octavo juego del sitio. Dos jugadores alternan colocando una
ficha en un tablero 6×6. Al colocar, esa ficha **bloquea las 8 casillas
vecinas** (ortogonales y diagonales) para ambos jugadores. Una casilla solo
es jugable si está vacía y sus 8 vecinas están vacías. **Gana quien coloca la
última ficha** — es decir, el jugador que se queda sin jugada legal en su
turno pierde. No hay empate posible.

Encaja en el patrón ya establecido por los 7 juegos anteriores: motor puro
(`engine.ts`) + `Board.astro` + ficha de contenido + registro en
`[slug].astro`. Reutiliza `iniciarSesionJuego`, el indicador de turno
compartido, el banner de fin de juego y la identidad visual de jugadores. No
introduce Worker ni protocolo remoto nuevo.

## Decisiones de diseño

### Reglas (fijadas en este spec)

- **Tablero 6×6** (36 casillas), no configurable. Es el tamaño recomendado
  en `41-obstruction.md`. Con la regla de "8 vecinas bloqueadas", caben unas
  5–8 jugadas por partida → partidas muy cortas, buen fit para jugar con
  niños y para alternar quién empieza entre rondas.
- **Framing en positivo**: las instrucciones dicen "gana quien coloca la
  última ficha". Internamente el motor modela la regla misère equivalente:
  el jugador cuyo turno empieza sin ninguna casilla legal pierde, y el rival
  (que colocó la última ficha) gana.
- **Sin empate.** Siempre hay una última jugada; el tablero nunca queda en un
  estado sin ganador.
- **Victoria única por partida** (sin puntaje acumulado entre rondas). El
  indicador de turno no lleva `puntajes`, igual que Tres en Raya, Gomoku y
  Notakto.
- **Identidad visual**: asiento 1 = `●` en `var(--color-player-1)` (naranja);
  asiento 2 = `▲` en `var(--color-player-2)` (azul). Consistente con la
  identidad visual de jugadores ya fusionada. Ambos jugadores colocan su
  propia ficha en su propio color (a diferencia de las reglas clásicas con
  `X`/`O`, donde la marca solo sirve para distinguir de quién es cada
  jugada).

### Detección de fin: el rival se queda sin jugada legal

No hay líneas ganadoras ni conteo de rachas. Tras colocar una ficha, el
motor comprueba si **el otro jugador** tiene al menos una casilla legal:

- `casillaLegal(board, i)` = `board[i] === null` **y** cada una de las 8
  vecinas de `i` (acotadas por fila y columna, no solo por índice) es `null`.
- Si ninguna de las 36 casillas es legal → `status: 'won'`,
  `winner: currentPlayer` (el que acaba de jugar), `currentPlayer` **sin
  alternar**.
- Si hay al menos una casilla legal → se alterna `currentPlayer`,
  `status: 'playing'`.

La legalidad es **derivada** del contenido del tablero; no se guarda ningún
array de "casillas muertas" en el estado. `Board.astro` recalcula el
sombreado en cada `render()` con la misma función `casillaLegal`.

**Acotado de borde (riesgo principal).** El tablero es un array plano de 36;
mirar la "vecina de la derecha" desde la columna 5 saltaría a la fila
siguiente. `casillaLegal` deriva `fila = Math.floor(i / 6)` y `col = i % 6`,
y para cada uno de los 8 desplazamientos `(df, dc)` valida
`0 ≤ fila+df < 6` **y** `0 ≤ col+dc < 6` antes de mirar esa vecina. Cubierto
con tests explícitos para esquinas y bordes.

### Tamaño de celdas: fluido, sin overflow horizontal

- Contenedor del tablero: `width: min(92vw, 30rem)` (mismo enfoque que
  `gomoku/Board.astro` con `34rem` y `conquista/Board.astro` con `32rem`;
  6×6 necesita menos ancho que 9×9).
- Grid `grid-template-columns: repeat(6, 1fr)`, celdas con `aspect-ratio: 1`.
- **Sin** `min-width` / `min-height` fijos en la casilla.
- Resultado: ~4.5rem por celda en tableta, degradando sin scroll horizontal
  en móvil chico (~375px).

### Casillas muertas: la novedad visual

Una casilla vacía pero bloqueada (`board[i] === null` y `!casillaLegal(i)`)
se pinta con la clase `.casilla--muerta` (sombreado tenue, p. ej.
`background: rgba(0,0,0,0.08)` y sin borde marcado) y va `disabled`. Esto es
lo que hace el juego legible: **lo que está vacío y no sombreado es
jugable**. No se añade un resaltado extra de "jugadas legales" — el
sombreado de las muertas ya comunica el complemento.

### Marca de la última jugada

`lastMove: number | null` en el estado, resaltada con un anillo interior
(`box-shadow: inset 0 0 0 3px var(--color-accent)`), visualmente distinta del
sombreado de casilla muerta. Sobre todo en modo remoto, sin esto no se
encuentra la jugada del rival.

## Componentes

### `src/games/obstruccion/engine.ts` (motor puro, sin DOM)

```ts
export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

export interface ObstruccionState {
  board: CellValue[];        // 36 casillas, orden fila-mayor
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: number | null;
}

export const TAMANO = 6;

export function createInitialState(): ObstruccionState;
export function esJugadaValida(payload: unknown): payload is number;
export function casillaLegal(board: CellValue[], index: number): boolean;
export function playMove(state: ObstruccionState, index: number): ObstruccionState;
```

Constante del módulo: `TAMANO = 6` (`TOTAL = 36`).

- `casillaLegal(board, index)`: exportada (la usa `Board.astro` para el
  sombreado). `true` si `board[index] === null` y las 8 vecinas válidas de
  `index` son todas `null`. Los 8 desplazamientos:
  `[-1,-1] [-1,0] [-1,1] [0,-1] [0,1] [1,-1] [1,0] [1,1]` en `(df, dc)`,
  cada uno acotado por `0 ≤ fila+df < 6` y `0 ≤ col+dc < 6`.
- `esJugadaValida`: `true` si el payload es un entero en `[0, 35]`. Se usa
  para validar movimientos remotos (contrato de `iniciarSesionJuego`).
- `playMove` (inmutable; ante entrada inválida devuelve el `state` recibido
  sin cambios, igual que los otros motores):
  1. Si `status !== 'playing'` → devuelve `state`.
  2. Si `index` fuera de `[0, 35]` o `!casillaLegal(state.board, index)` →
     devuelve `state` (cubre casilla ocupada y casilla bloqueada).
  3. Copia `board`, coloca `currentPlayer` en `index`, fija
     `lastMove = index`.
  4. Calcula `hayJugadaParaRival` = alguna de las 36 casillas cumple
     `casillaLegal(board, j)`.
  5. Si **no** hay jugada para el rival → `status: 'won'`,
     `winner: currentPlayer`, `currentPlayer` sin cambiar.
  6. Si la hay → alterna `currentPlayer`, `status: 'playing'`,
     `winner: null`.

### `src/games/obstruccion/Board.astro`

Calca la estructura de `gomoku/Board.astro` (ya usa `Player = 1 | 2`, sin
capa de mapeo glifo→asiento).

- **Markup**: `<TableroJuego>` envolviendo `<div id="tablero" role="grid"
  aria-label="Tablero de Obstrucción, 6 por 6">` con 36
  `<button type="button" class="casilla" data-indice={i}>` con `aria-label`
  por casilla (`Fila N, columna M`).
- **Fichas**: `data-valor="1" | "2"` + CSS a `var(--color-player-1)` /
  `var(--color-player-2)`. `const FICHAS = { 1: '●', 2: '▲' } as const`.
- **Estilos de casilla**:
  - `.casilla--muerta` (sombreado tenue) para cada casilla vacía con
    `!casillaLegal`.
  - `.casilla--ultima` (anillo interior) para `state.lastMove`.
- **Sesión**: `iniciarSesionJuego<number>({...})` idéntico a Gomoku. El
  payload del movimiento es el índice (`number`). `onDesconectar` deshabilita
  todas las casillas. `onAplicarReinicio` →
  `state = createInitialState(); render()`.
- **`render()`**:
  - `jugadorDelTurno = state.currentPlayer` (ya es `1 | 2`).
  - Por casilla `i`:
    - Pinta `FICHAS[valor]` y `data-valor` si `board[i] !== null`, si no los
      limpia.
    - `const muerta = valor === null && !casillaLegal(state.board, i)`.
    - `classList.toggle('casilla--muerta', muerta)`.
    - `classList.toggle('casilla--ultima', state.lastMove === i)`.
    - `disabled = valor !== null || muerta || state.status !== 'playing' ||
      !esMiTurno`.
  - Si `status === 'playing'`:
    `sesion.mostrarTurno({ jugador: jugadorDelTurno, simbolos: { 1: FICHAS[1],
    2: FICHAS[2] } })` (misma forma que `gomoku/Board.astro`).
  - Si `status === 'won'`:
    `sesion.mostrarFinDeJuego({ titulo: `🎉 ¡Ganó ${sesion.nombres[state.winner!]}
    (${FICHAS[state.winner!]})!` })`.
- **`jugar(indice, emitirRemoto = true)`**: `state = playMove(state, indice)`,
  `render()`, y si `emitirRemoto` → `sesion.enviarMovimiento(indice)`.
- Listener `click` por casilla → `jugar(Number(casilla.dataset.indice))`.

### `src/content/juegos/obstruccion.md`

Frontmatter:

```yaml
title: "Obstrucción"
description: "Bloquea el tablero: gana quien coloca la última ficha antes de que no quepan más."
icono: "🚧"
minJugadores: 2
maxJugadores: 2
```

Cuerpo (instrucciones):

1. El tablero es de 6×6 casillas.
2. Por turnos, cada jugador coloca una ficha en cualquier casilla libre. El
   jugador 1 pone `●`, el jugador 2 pone `▲`.
3. Al colocar una ficha, las 8 casillas que la rodean quedan **bloqueadas**
   para ambos jugadores (se ven sombreadas). Ya no se puede jugar ahí.
4. Solo puedes colocar en una casilla vacía cuyas 8 vecinas también estén
   vacías.
5. **Gana quien coloca la última ficha**: si en tu turno no queda ninguna
   casilla donde puedas jugar, pierdes.

### `src/pages/juegos/[slug].astro`

- `import ObstruccionBoard from '../../games/obstruccion/Board.astro';`
  (import estático — nada de `import()` dinámico con el slug).
- Entrada `obstruccion: ObstruccionBoard` en el objeto `BOARDS`.

No se toca el índice (`src/pages/index.astro`) ni componentes compartidos —
las tarjetas se generan desde el content collection.

### Backlog

- `abstract-games-by-category/GAME-INDEX.md`: marcar `41-obstruction.md` como
  ✅.
- `abstract-games-by-category/01-2-players/41-obstruction.md`: ya especifica
  6×6 y la regla completa; no requiere cambios de contenido (opcional: una
  nota de que la implementación usa fichas por asiento en vez de `X`/`O`).

## Flujo de datos

Idéntico al de Gomoku (payload = índice `number`):

- **Local**: `click` en casilla → `jugar(indice)` → `playMove` → `render`.
- **Remoto**: `jugar(indice)` local → `render` →
  `sesion.enviarMovimiento(indice)`. En el otro extremo,
  `onMovimientoRemoto(indice)` → `jugar(indice, false)` (aplica sin
  reenviar). `esJugadaValida` filtra payloads corruptos antes de aplicarlos.
- **Reinicio** ("jugar de nuevo"): `onAplicarReinicio` →
  `state = createInitialState(); render()`.
- **Desconexión**: `onDesconectar` deshabilita el tablero.

## Manejo de errores / casos límite

- Movimiento sobre casilla ocupada, bloqueada, fuera de rango, o tras `won`:
  `playMove` devuelve el estado sin cambios; la UI ya deshabilita esas
  casillas, esto es defensa para la ruta remota.
- Derivación de vecinas que se sale del tablero: acotada por fila y columna
  en cada uno de los 8 desplazamientos.
- Primera jugada de la partida: todas las casillas están vacías, así que
  `casillaLegal` es `true` para las 36; siempre hay jugada de apertura.
- `localStorage` no disponible para nombres: ya lo maneja `getPlayerNames()`.

## Pruebas (`src/games/obstruccion/engine.test.ts`, TDD — primero los tests)

- Estado inicial: 36 casillas `null`, `currentPlayer: 1`, `status: 'playing'`,
  `winner: null`, `lastMove: null`.
- `esJugadaValida`: acepta `0` y `35`; rechaza `-1`, `36`, `3.5`, `'2'`,
  `null`, `{}`.
- `casillaLegal` en tablero vacío: `true` para las 36 casillas.
- Jugada válida coloca la ficha del jugador actual, fija `lastMove` y alterna
  el turno.
- Tras colocar en el centro, `casillaLegal` es `false` para esa casilla y
  para sus 8 vecinas.
- Bloqueo en **esquina** (índice 0): solo se bloquean las 3 vecinas reales
  (1, 6, 7); no hay envolvimiento a la fila anterior ni a la columna
  opuesta.
- Bloqueo en **borde** (p. ej. índice 3, fila 0): se bloquean las 5 vecinas
  reales; ninguna en una fila fuera del tablero.
- Jugada sobre casilla ocupada → estado sin cambios.
- Jugada sobre casilla bloqueada (vecina de una ficha) → estado sin cambios.
- Jugada fuera de rango (`-1`, `36`) → estado sin cambios.
- Jugada tras `status: 'won'` → estado sin cambios.
- **Victoria**: construir un tablero donde, tras la jugada del jugador 1, no
  quede ninguna casilla legal → `status: 'won'`, `winner: 1`,
  `currentPlayer` sigue siendo `1`.
- Mientras quede al menos una casilla legal tras la jugada → `status:
  'playing'` y el turno alterna.
- No-envolvimiento de borde en la detección de fin (una ficha en un borde no
  "bloquea" casillas del borde opuesto).
- Inmutabilidad: `playMove` no muta el `state` de entrada ni su `board`.

## Trabajo fuera de alcance

- Tableros no cuadrados o tamaño configurable (`6×5`, `7×6`, `8×7`, `8×8`) —
  la variante mencionada en `41-obstruction.md`.
- Puntaje acumulado entre rondas / marcador.
- Resaltado explícito de jugadas legales (el sombreado de casillas muertas ya
  cubre la necesidad).
- IA / oponente por computadora.
- Extracción o cambios del componente `<TableroJuego>` compartido.

## Integración / entrega

- Rama/worktree nuevo desde `main` (basado en `origin/main`, **no** en el
  `main` local desincronizado — ver [[pencilgames-status]]); PR contra `main`
  como los 7 juegos anteriores.
- Ejecución del plan de implementación: subagent-driven (un subagente por
  tarea, revisión entre tareas), consistente con Notakto, Conquista y
  Gomoku.
- `npm test` (raíz) y `astro check` + `npm run build` limpios antes de abrir
  el PR.
- Seguimiento no bloqueante (en el cuerpo del PR): playtest de modo remoto en
  2 navegadores contra el Worker desplegado (no se puede local — `astro dev`
  no sirve el Worker de señalización), igual que se hizo con Notakto y
  Gomoku.
