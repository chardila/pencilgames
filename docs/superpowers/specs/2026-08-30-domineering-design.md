# Domineering — Diseño (12º juego)

Fecha: 2026-08-30
Estado: aprobado en brainstorming, pendiente de plan de implementación.

## Resumen

Domineering es un juego de bloqueo por turnos para 2 jugadores sobre una
rejilla rectangular. Cada jugador coloca **dominós de una única orientación
fija**: el Jugador 1 coloca dominós **verticales** (cubren dos casillas
adyacentes en columna), el Jugador 2 coloca dominós **horizontales** (cubren
dos casillas adyacentes en fila). En cada turno debes colocar un dominó sobre
dos casillas vacías. **Pierde quien no puede colocar** ningún dominó de su
orientación en su turno; gana el otro. No hay empate (siempre llega un turno
en que alguien no puede mover).

Encaja en el patrón de juegos ya existente (Obstrucción, Sim): motor puro en
`engine.ts` con `Player = 1 | 2`, `Board.astro` con `iniciarSesionJuego`,
ficha de contenido en `src/content/juegos/`, y registro en
`src/pages/juegos/[slug].astro`.

Slug: `domineering`. Título visible: **"Domineering"**.

## Decisiones tomadas en el brainstorming

1. **Tablero 8×8 fijo.** Orientado a tablet (modo pasar-y-jugar). En móvil
   chico (375px) las casillas quedan ~40px — tradeoff aceptado, igual que
   Gomoku 9×9 y Obstrucción.
2. **Roles fijos:** Jugador 1 = vertical, Jugador 2 = horizontal.
3. **Interacción de dos toques (toca-ancla + toca-confirma).** El primer
   toque sobre una casilla vacía muestra como fantasma las 1–2 posiciones
   legales de dominó que incluyen esa casilla. El segundo toque sobre un
   fantasma coloca el dominó. Tocar fuera, volver a tocar el ancla, o Escape
   cancela. Refinamiento: si el ancla solo admite **una** posición legal, se
   coloca directamente sin segundo toque.
4. **Sin sombreado de casillas muertas.** Domineering es un juego de cálculo;
   dar pistas de dónde ya no se puede jugar lo trivializa. (A diferencia de
   Obstrucción, que sí sombrea.)
5. **Fichas = píldora 1×2** en el color/forma del asiento que la colocó. El
   fantasma de previsualización, mismo color con opacidad baja.
6. **Indicador de turno con ícono de orientación** (▌ vertical / ▬
   horizontal) además del nombre, vía la opción `simbolos` de
   `mostrarTurno`.
7. **Fin de partida:** tras cada jugada se comprueba si el **siguiente**
   jugador tiene al menos una colocación legal de su orientación. Si no, la
   partida termina y gana quien acaba de jugar. Banner "🎉 ¡Ganó X!" +
   detalle "Y no puede colocar más dominós".
8. **Teclado:** cursor con flechas, Enter selecciona el ancla (muestra
   fantasmas), flechas mueven entre fantasmas y Enter confirma, Escape
   cancela.
9. **Modo remoto:** el payload del movimiento es un par de índices
   `{ a: number, b: number }` (las dos casillas del dominó). El motor valida
   adyacencia según la orientación del jugador y que ambas estén vacías.

## Modelo del tablero

- Rejilla 8×8. `TAMANO = 8`, `TOTAL = 64`.
- Índice de casilla `i` en `[0, 64)`. `fila = Math.floor(i / 8)`,
  `col = i % 8`.
- `board: CellValue[]` de longitud 64, cada entrada `Player | null`.
- Un dominó **vertical** en ancla `i` (parte superior) cubre `i` e
  `i + 8`; requiere `fila < 7`.
- Un dominó **horizontal** en ancla `i` (parte izquierda) cubre `i` e
  `i + 1`; requiere `col < 7`.
- Orientación del jugador: `orientacion(player) = player === 1 ? 'vertical'
  : 'horizontal'`.

## Motor: `src/games/domineering/engine.ts`

### Tipos

```ts
export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

/** Par de casillas que cubre un dominó. Se normaliza a a < b. */
export interface Move {
  a: number;
  b: number;
}

export interface DomineeringState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  /** Última jugada colocada, para el resalte de anillo. */
  lastMove: Move | null;
}

export const TAMANO = 8;
```

### API pública

```ts
export function createInitialState(): DomineeringState
```
Tablero vacío, `currentPlayer: 1`, `status: 'playing'`, `winner: null`,
`lastMove: null`.

```ts
export function esJugadaValida(payload: unknown): payload is Move
```
Type guard para el payload remoto: objeto con `a`, `b` enteros en `[0, 64)`,
`a !== b`. **No** valida reglas del juego (adyacencia, ocupación, turno) —
eso lo hace `playMove`. Sigue el mismo contrato que `esJugadaValida` /
`esEdgeValido` de Obstrucción y Sim.

```ts
export function orientacionDe(player: Player): 'vertical' | 'horizontal'
```
`player === 1 ? 'vertical' : 'horizontal'`. Exportada para que `Board.astro`
calcule fantasmas sin duplicar la regla.

```ts
export function dominosLegalesEn(
  board: CellValue[],
  player: Player,
  ancla: number
): Move[]
```
Devuelve los dominós legales de la orientación de `player` que **incluyen**
la casilla `ancla` (esté como parte superior/izquierda o inferior/derecha).
Cada `Move` normalizado a `a < b`. Máximo 2 resultados (vertical: arriba y
abajo; horizontal: izquierda y derecha). Se usa para los fantasmas del
primer toque. Si `board[ancla] !== null`, devuelve `[]`.

```ts
export function tieneJugadaLegal(board: CellValue[], player: Player): boolean
```
`true` si existe al menos un par de casillas vacías adyacentes en la
orientación de `player`. Recorre las 64 casillas y para cada una comprueba el
vecino en su orientación.

```ts
export function playMove(state: DomineeringState, move: Move): DomineeringState
```
Reglas:
1. Si `state.status !== 'playing'` → devuelve `state` sin cambios.
2. Si `!esJugadaValida(move)` → devuelve `state`.
3. Normaliza `a = min`, `b = max`.
4. Comprueba que `{a, b}` sea un dominó legal de la orientación del
   `currentPlayer`:
   - vertical: `b - a === TAMANO` y `a` y `b` en la misma columna
     (siempre cierto si `b - a === 8`) y `Math.floor(a / 8) < 7`.
   - horizontal: `b - a === 1` y `Math.floor(a / 8) === Math.floor(b / 8)`
     (misma fila) y `a % 8 < 7`.
   - Si no cumple → devuelve `state` sin cambios.
5. Comprueba que `board[a] === null && board[b] === null`. Si no → devuelve
   `state`.
6. Aplica: copia del tablero con `board[a] = board[b] = currentPlayer`.
7. Calcula `siguiente = currentPlayer === 1 ? 2 : 1`.
8. Si `!tieneJugadaLegal(nuevoBoard, siguiente)` →
   `{ status: 'won', winner: currentPlayer, currentPlayer, lastMove: {a, b}, board }`.
   (El ganador es quien acaba de jugar; `currentPlayer` se deja en el
   ganador, igual que Obstrucción.)
9. Si no → `{ status: 'playing', winner: null, currentPlayer: siguiente,
   lastMove: {a, b}, board }`.

`playMove` es puro y no lanza; entradas inválidas devuelven el estado tal
cual (mismo contrato que el resto de motores).

### Notas de diseño del motor

- No hay estado de "selección de ancla" en el motor. El flujo de dos toques
  vive por completo en `Board.astro`; el motor solo recibe el `Move` final.
- No se guarda historial de movimientos (no hace falta para ninguna regla ni
  para la UI; `lastMove` basta para el anillo).
- Empate imposible: `tieneJugadaLegal` se vuelve `false` para alguien antes
  de llenar el tablero, así que siempre hay ganador.

## Tests del motor: `src/games/domineering/engine.test.ts`

Cobertura mínima:

1. `createInitialState`: tablero de 64 `null`, jugador 1, estado playing.
2. `orientacionDe`: 1 → vertical, 2 → horizontal.
3. `esJugadaValida`: acepta `{a:0,b:8}`; rechaza no-objeto, `a` no entero,
   fuera de rango, `a === b`, falta de campo.
4. `dominosLegalesEn`:
   - vertical, ancla en el centro con vecinos libres → 2 dominós
     (`{ancla-8, ancla}` y `{ancla, ancla+8}`).
   - vertical, ancla en la fila 0 → solo el de abajo.
   - vertical, ancla en la fila 7 → solo el de arriba.
   - horizontal análogo en columnas 0 y 7.
   - ancla ocupada → `[]`.
   - vecino ocupado → se excluye ese dominó.
5. `tieneJugadaLegal`:
   - tablero vacío → `true` para ambos.
   - tablero saturado para el vertical (cada columna con una casilla
     ocupada de forma que no queden dos verticales libres) pero con huecos
     horizontales → `false` para 1, `true` para 2.
6. `playMove` feliz: vertical válido de J1 coloca en `a` y `b`, pasa turno a
   J2, `lastMove` correcto.
7. `playMove` rechaza: dominó horizontal cuando es turno de J1 (orientación
   equivocada); dominó que sale del tablero (ancla en col 7 horizontal, fila
   7 vertical); casilla ocupada; jugada tras `status: 'won'`; payload
   inválido.
8. `playMove` victoria: construir un tablero donde tras la jugada de J1 el
   J2 no tiene ningún par horizontal libre → `status: 'won'`,
   `winner: 1`.
9. Partida completa corta jugada a mano hasta un ganador; aserción de
   `winner` y de que el perdedor efectivamente no tenía jugada.

Verificación adicional recomendada en la ejecución (no test unitario):
**fuzzing** de N partidas aleatorias completas comprobando invariantes
(nunca dos dominós solapados, el ganador siempre es quien hizo la última
jugada, el perdedor nunca tenía jugada legal, status coherente) — igual que
se hizo con Gomoku.

## Board: `src/games/domineering/Board.astro`

### Markup

Reusa `<TableroJuego>` como los demás. Rejilla de 64 `<button class="casilla">`
dentro de `<div id="tablero" class="tablero" role="grid" aria-label="Tablero
de Domineering, 8 por 8">`. Cada botón con `data-indice`, `aria-label="Fila F,
columna C"`.

Capa de fichas: en vez de pintar glifo por casilla como Obstrucción, se
dibuja el dominó como una **píldora** que abarca 2 celdas. Opciones de
implementación (a decidir en el plan, preferencia por la primera):
- **A)** Un `<div class="domino">` posicionado en absoluto sobre el grid,
  con `grid-column` / `grid-row` que abarca 2 celdas (`span 2`). El
  contenedor `.tablero` es `position: relative` y una capa
  `.capa-dominos` encima con el mismo grid.
- **B)** Pintar las dos casillas con `data-valor` y `data-domino-parte`
  (`inicio` / `fin`) y unir visualmente con `border-radius` selectivo y sin
  gap entre esas dos. Más frágil con el `gap` del grid.

Fantasma de previsualización: un `.domino--fantasma` por cada `Move` que
devuelve `dominosLegalesEn`, con `data-move-a` / `data-move-b`, opacidad
~0.35, en el color del jugador actual, `pointer-events` activo para poder
tocarlo.

### Lógica (`<script>`)

Estado local:
```ts
let state: DomineeringState = createInitialState();
let ancla: number | null = null;          // casilla del primer toque
let fantasmas: Move[] = [];                // dominósLegalesEn(board, jugador, ancla)
```

Símbolos de orientación:
```ts
const ORIENTACION_SIMBOLO = { 1: '▌', 2: '▬' } as const;
```

`iniciarSesionJuego<Move>`:
- `validarMovimiento: esJugadaValida`
- `onMovimientoRemoto: move => jugar(move, false)`
- `onAplicarReinicio`: reset de `state`, `ancla = null`, `fantasmas = []`,
  `render()`
- `onRender: render`
- `onDesconectar`: deshabilitar casillas, limpiar ancla/fantasmas

`render()`:
- Pinta los dominós colocados recorriendo `state.board` (agrupando pares del
  mismo jugador adyacentes; o más simple: al aplicar cada jugada se registra
  en una lista `dominosColocados: Move[]` local reconstruida desde el
  tablero — decisión menor para el plan).
- Aplica `casilla--ultima` (anillo) a las dos casillas de `state.lastMove`.
- Deshabilita casillas cuando: `state.status !== 'playing'`, no es mi turno,
  o (si no hay ancla activa) la casilla está ocupada. Con ancla activa, solo
  los fantasmas son interactuables.
- Turno / fin:
  ```ts
  if (state.status === 'playing') {
    sesion.mostrarTurno({
      jugador: state.currentPlayer,
      simbolos: { 1: ORIENTACION_SIMBOLO[1], 2: ORIENTACION_SIMBOLO[2] },
    });
  } else {
    const perdedor = state.winner === 1 ? 2 : 1;
    sesion.mostrarFinDeJuego({
      titulo: `🎉 ¡Ganó ${sesion.nombres[state.winner!]}!`,
      detalle: `${sesion.nombres[perdedor]} no puede colocar más dominós`,
    });
  }
  ```

Interacción táctil:
- Click en casilla vacía sin ancla → `ancla = i`;
  `fantasmas = dominosLegalesEn(state.board, state.currentPlayer, i)`.
  - Si `fantasmas.length === 0` → no hacer nada (ancla queda `null`), la
    casilla no admite ningún dominó de esa orientación.
  - Si `fantasmas.length === 1` → **colocar directamente** (no exigir
    segundo toque cuando no hay ambigüedad). Decisión de UX: acelera el
    juego sin perder claridad. (Alternativa: siempre pedir confirmación —
    a decidir en el plan; preferencia por colocar directo con 1 opción.)
  - Si `2` → `render()` para mostrar ambos fantasmas.
- Click en un fantasma → `jugar({a, b})`.
- Click en el ancla de nuevo, o en cualquier zona fuera de un fantasma, o
  Escape → `ancla = null; fantasmas = []; render()`.

`jugar(move, emitirRemoto = true)`:
```ts
const prev = state;
state = playMove(state, move);
if (state === prev) return;
ancla = null;
fantasmas = [];
render();
if (emitirRemoto) sesion.enviarMovimiento(move);
```

Teclado:
- Cursor `foco` con `tabindex` en las casillas (como Sim usa en los nodos) o
  gestión de `focus()` manual. Flechas mueven el foco por la rejilla.
- Enter sobre casilla sin ancla → misma lógica que el click (fija ancla /
  coloca si hay 1 opción).
- Con ancla y 2 fantasmas: Enter alterna/confirma. Implementación concreta a
  detallar en el plan; mínimo aceptable: Tab/flechas mueven el foco a los
  botones-fantasma y Enter confirma.
- Escape cancela ancla.

## Contenido: `src/content/juegos/domineering.md`

```md
---
title: "Domineering"
description: "Coloca dominós y bloquea al rival: pierde quien no puede colocar."
icono: "🁢"
minJugadores: 2
maxJugadores: 2
---

1. El tablero es de 8×8 casillas.
2. Cada jugador coloca dominós de una sola orientación: el Jugador 1 los
   coloca **verticales** (dos casillas en columna) y el Jugador 2 los coloca
   **horizontales** (dos casillas en fila).
3. En tu turno, toca una casilla vacía y luego confirma la posición del
   dominó sobre dos casillas vacías.
4. No puedes colocar sobre casillas ocupadas ni salir del tablero.
5. Pierde el primero que, en su turno, no pueda colocar ningún dominó de su
   orientación. Gana el otro. Nunca hay empate.
```

(El emoji `icono` queda por confirmar en la implementación — buscar uno de
dominó/rejilla que renderice bien; alternativas: `⬛`, `🀫`.)

## Registro: `src/pages/juegos/[slug].astro`

- `import DomineeringBoard from '../../games/domineering/Board.astro';`
- Añadir `domineering: DomineeringBoard,` a `BOARDS`.

## Identidad de jugador

Reusa el sistema existente (color + forma por asiento, `--color-player-1` /
`--color-player-2`, `●` / `▲` en el indicador de turno). El **añadido
específico de Domineering** es el ícono de orientación vía `simbolos` en
`mostrarTurno`, que el `turnIndicator` ya sabe renderizar como
`"Nombre (▌)"`. No se toca `turnIndicator.ts`.

## Fuera de alcance (YAGNI)

- Tableros de otros tamaños o rectangulares configurables.
- Variante Cram (ambos jugadores, ambas orientaciones) — es otro juego, otra
  ficha de backlog (`01-cram.md`).
- Variante misère ("gana quien no puede mover").
- Sombreado de casillas muertas / conteo de jugadas restantes / cualquier
  ayuda táctica.
- Historial de movimientos, deshacer.
- Marcador entre partidas (victoria única, como Obstrucción / Gomoku).
- Extracción de un `<TableroJuego>` más rico o de un helper de rejilla
  compartido — backlog separado.

## Seguimiento (para el cuerpo del PR)

- Playtest de modo remoto en 2 navegadores contra el Worker desplegado (no se
  puede en local), igual que Notakto / Obstrucción / Sim.
- Menores site-wide ya conocidos: `role="grid"` sin `row`/`gridcell`;
  `aria-label` de casilla estático que no refleja ocupación; blancos de tap
  ~40px a 375px (tradeoff aceptado aquí).
