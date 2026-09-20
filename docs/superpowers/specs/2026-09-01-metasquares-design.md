# MetaSquares — diseño (16.º juego)

Fecha: 2026-09-01
Estado: aprobado
Slug: `metasquares`
Ficha de backlog: `abstract-games-by-category/01-2-players/44-metasquares.md`

## Resumen

Juego de 2 jugadores en retícula 7×7. Por turnos alternos cada jugador marca una
celda vacía con su símbolo. Cuando cuatro celdas del mismo jugador forman las
esquinas de un cuadrado perfecto (de cualquier tamaño y cualquier inclinación),
ese cuadrado se completa, se dibuja sobre el tablero y suma **1 punto**. **Gana el
primero en llegar a 5 puntos.** Si el tablero se llena antes, gana quien tenga más
puntos; si hay igualdad, es empate.

Es el primer juego del sitio con **victoria por objetivo de puntos acumulados**
(no por última jugada ni por línea). Introduce detección geométrica de cuadrados.

## Decisiones de diseño (tomadas en brainstorming)

- **Tablero 7×7** (49 celdas). No 8×8: ergonomía táctil, coherente con Gomoku 9×9
  y Estampida 8×8.
- **Objetivo: 5 puntos.**
- **Solo puntuación simple:** 1 punto por cuadrado, sin importar el tamaño. El modo
  "avanzado por área" de la ficha (usa números `lado × lado`) **no se implementa**
  — contradice la regla del proyecto "sin números" y es YAGNI.
- **Se permite empate** (como Estampida, Puntos y Cajas): resultado natural si el
  tablero se llena con marcador igualado.
- **Turno siempre alterno.** Completar cuadrado(s) NO da turno extra.
- **Retroalimentación visual:** los cuadrados completados se trazan sobre el
  tablero con el color del jugador y quedan dibujados el resto de la partida.
  Marcador visible arriba. Anillo en la última ficha colocada. Sin animación
  elaborada.

## Reglas explícitas (para no dejar que la implementación adivine)

1. **Una celda puede ser esquina de muchos cuadrados a la vez**, y los cuadrados
   pueden solaparse y compartir esquinas. Las esquinas NO se "consumen" al
   completar un cuadrado. Esto es MetaSquares correcto y es lo que da profundidad
   al juego.
2. **Un cuadrado lo anota el jugador que posee sus cuatro esquinas, en el momento
   en que se coloca la cuarta.** Esa cuarta esquina siempre la pone el jugador en
   turno (solo su propia colocación puede completar un cuadrado suyo). Por tanto
   `playMove` solo necesita escanear cuadrados del jugador actual.
3. **Una sola jugada puede completar varios cuadrados** → se anotan y suman todos.
4. Un cuadrado ya anotado **nunca se vuelve a contar** en jugadas posteriores.
5. Un `won` puede ocurrir con marcador por debajo de 5 (fin por tablero lleno con
   mayoría). El texto del banner debe cubrir ese caso ("¡Ganó X! 3 – 2").

## Motor — `src/games/metasquares/engine.ts` (puro)

```ts
export type Player = 1 | 2;
export type Cell = number; // índice 0..48, fila*7+col

export interface Square { corners: [Cell, Cell, Cell, Cell]; } // ordenados asc

export interface ClaimedSquare { player: Player; corners: [Cell, Cell, Cell, Cell]; }

export interface GameState {
  board: (Player | null)[];              // longitud 49
  turn: Player;
  scores: { 1: number; 2: number };
  claimed: ClaimedSquare[];              // cuadrados completados, en orden de aparición
  lastMove: Cell | null;
  status:
    | { kind: 'playing' }
    | { kind: 'won'; winner: Player }
    | { kind: 'draw' };
}

export type Move = { cell: Cell };       // este es el TMovimiento remoto

export const TAMANO = 7;
export const OBJETIVO = 5;
export const TODOS_LOS_CUADRADOS: readonly Square[]; // precomputado al importar el módulo

export function crearEstadoInicial(): GameState;
export function movimientosLegales(s: GameState): Cell[];
export function aplicarMovimiento(s: GameState, m: Move): GameState; // puro
```

### Enumeración de `TODOS_LOS_CUADRADOS` (una vez, al importar)

Para cada vector de borde `(dx, dy)` con `dx ≥ 1` y `dy ≥ 0`, y para cada ancla
`(x, y)`, el cuadrado tiene las esquinas:

```
(x, y)
(x + dx,      y + dy)
(x + dx - dy, y + dy + dx)
(x - dy,      y + dx)
```

Se conserva solo si las cuatro esquinas están dentro de `[0, 7) × [0, 7)`.

**Canonicalización obligatoria:** convertir las 4 esquinas a índices de celda,
ordenarlas ascendentemente y usar `tupla.join(',')` como clave en un `Set`.
Construir `TODOS_LOS_CUADRADOS` a partir de las claves deduplicadas. Sin esto,
cada cuadrado inclinado se genera dos veces (desde borde `(1,2)` y desde `(2,1)`)
y se contaría doble → el objetivo de 5 se dispararía antes y de forma asimétrica.

**Aserción de test (la que discrimina, escribir primero):** el número de
cuadrados con las 4 esquinas en una retícula `n×n` es
`Σ_{k=1}^{n-1} k·(n-k)²`. Para `n = 7` da exactamente **196** (verificado por
cómputo). `TODOS_LOS_CUADRADOS.length === 196`.

### `aplicarMovimiento(s, m)`

1. Si `s.status.kind !== 'playing'` o `s.board[m.cell] != null` → lanza (o retorna
   el estado sin cambios; seguir el patrón de los otros motores del repo).
2. Copia inmutable del estado. Coloca `turn` en `board[m.cell]`. `lastMove = m.cell`.
3. Recorre `TODOS_LOS_CUADRADOS`: para cada cuadrado cuyas 4 esquinas sean todas
   del jugador actual y que no esté ya en `claimed` (comparar por conjunto de
   esquinas), lo agrega a `claimed` y suma 1 a `scores[actual]`.
4. Determinar `status`:
   - `scores[actual] >= 5` → `{ kind: 'won', winner: actual }`.
   - si no, y `movimientosLegales` quedaría vacío (tablero lleno):
     - `scores[1] > scores[2]` → `won(1)`
     - `scores[2] > scores[1]` → `won(2)`
     - iguales → `draw`
   - si no → `status` sigue `playing` y `turn` alterna.

Función pura: no muta `s`. `claimed` y `scores` se copian, no se aliasan.

## UI — `src/games/metasquares/Board.astro`

Patrón calcado de Estampida / Triggle.

- SVG con retícula 7×7 de celdas; toque en celda vacía → `jugar({ cell })`.
- Fichas con **color + forma por asiento** (identidad visual de jugadores del
  sitio). Anillo en `lastMove`.
- Cada entrada de `claimed` se dibuja como polígono cerrado de 4 lados con el
  color del jugador (trazo; relleno translúcido opcional), persistente toda la
  partida.
- **Marcador** arriba vía el helper existente (`mostrarTurno` con `puntajes`),
  formato "Tú N – M Rival".
- Banner de fin: "¡Ganó X!" con detalle de marcador, o "Empate" + marcador; botón
  "jugar de nuevo".
- **Gating de turno remoto:** la entrada se gatea por `esMiTurno` en `render()`.
  En el emisor: `emitirRemoto && !esMiTurno(...)` — nunca poner `esMiTurno`
  incondicional dentro de `jugar()` (lección [[remoto-guard-turno-jugar]]).

## Cableado

- `src/content/juegos/metasquares.md` — metadata + instrucciones en español.
- Registrar el juego en `src/pages/juegos/[slug].astro`.
- `abstract-games-by-category/GAME-INDEX.md` — marcar `44-metasquares.md` como ✅.
- `src/lib/gameSession.ts`, `src/lib/types.ts`, `worker/` — **intactos**. `Move`
  es unión de una sola clave; el registro serializa con orden de claves estable;
  la reconexión con checksum FNV-1a funciona sin tocar nada porque ambos lados
  tienen el mismo registro.

## Pruebas (Vitest sobre `engine.ts`)

- **`TODOS_LOS_CUADRADOS.length === 196`** (escribir primero). Todas las esquinas
  en rango `[0, 49)`. Sin claves canónicas duplicadas.
- Cuadrado axis-aligned pequeño (1×1) y grande. Cuadrado **inclinado** explícito,
  p. ej. esquinas `(0,1) (1,3) (3,2) (2,0)` — verificar que está en la lista y que
  se detecta al completarlo.
- Jugada que completa **varios cuadrados a la vez** → `scores` suma todos y
  `claimed` los contiene todos.
- Tras anotar un cuadrado, jugadas posteriores **no lo re-cuentan**.
- Victoria al llegar a 5.
- Fin por tablero lleno: mayoría → `won` con marcador < 5; igualdad → `draw`.
- Rechazo de: celda ocupada, celda fuera de rango, jugar tras `won`/`draw`.
- Pureza: `aplicarMovimiento` no muta el estado de entrada.
- **Fuzz:** N partidas aleatorias completas (p. ej. 500) — sin excepciones; en
  cada estado `scores[p]` == número de entradas de `claimed` con `player === p`;
  el ganador declarado siempre tiene ≥ 5 o mayoría en tablero lleno.

## Ejecución

Subagent-driven-development en worktree propio (rama `metasquares`, base
`origin/main`). ~3 tareas TDD:

1. Motor: tipos + enumeración `TODOS_LOS_CUADRADOS` + `crearEstadoInicial` +
   `movimientosLegales`.
2. `aplicarMovimiento`: colocación, detección/scoring de cuadrados, condiciones de
   fin (objetivo / tablero lleno / empate) + fuzzing.
3. `Board.astro` + `src/content/juegos/metasquares.md` + registro en `[slug].astro`
   + `GAME-INDEX.md`.

Review por tarea + review final whole-branch (opus) + olas de fix. Playtest de
navegador local (chrome-devtools, ~375px). Seguimiento anotado en el PR: playtest
remoto de 2 navegadores contra el Worker (no local, como todos los juegos).

## Fuera de alcance

- Modo de puntuación por área (variante numérica de la ficha).
- Tamaños de tablero alternativos / selector de dificultad.
- Extracción del componente `<TableroJuego>` compartido (backlog separado).
- Reglas de apertura / hándicap.
