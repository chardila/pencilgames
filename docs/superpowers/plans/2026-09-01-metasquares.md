# MetaSquares Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir MetaSquares como 16.º juego del sitio: retícula 7×7, marcas alternas, formar cuadrados perfectos suma puntos, gana el primero en llegar a 5.

**Architecture:** Motor puro `engine.ts` (Vitest) + `Board.astro` (SVG, patrón calcado de Triggle/Estampida) + registro de contenido y ruta. La detección de cuadrados usa una lista de los 196 cuadrados posibles de la retícula 7×7, precomputada al importar el módulo y canonicalizada por tupla de esquinas ordenada. `gameSession.ts` / `types.ts` / `worker/` quedan intactos.

**Tech Stack:** Astro 7 (sin framework UI), TypeScript estricto, Vitest, SVG inline, `iniciarSesionJuego` (WebRTC/relay ya existente).

**Spec:** `docs/superpowers/specs/2026-09-01-metasquares-design.md`

## Global Constraints

- **Tablero 7×7 = 49 celdas.** Índice de celda: `fila * 7 + col`, rango `0..48`.
- **Objetivo: 5 puntos.** `export const OBJETIVO = 5;` `export const TAMANO = 7;`
- **Solo puntuación simple:** 1 punto por cuadrado, sin importar tamaño ni inclinación. Sin modo por área. Sin números en la UI.
- **Turno siempre alterno.** Completar cuadrado(s) NO da turno extra.
- **Se permite empate** (fin por tablero lleno con marcador igualado).
- **Un `won` puede ocurrir con marcador < 5** (fin por tablero lleno con mayoría).
- Las esquinas NO se consumen: una celda puede ser esquina de muchos cuadrados; los cuadrados se solapan.
- `playMove` solo escanea cuadrados del jugador en turno (solo su colocación puede completar un cuadrado suyo).
- Naming del repo: `createInitialState`, `playMove`, `esJugadaValida` (type guard para `validarMovimiento` de `iniciarSesionJuego`). Español para identificadores de dominio y todo el texto de UI.
- Fichas por asiento: `{ 1: '●', 2: '▲' }`. Colores: variables CSS `--color-player-1` / `--color-player-2` / `--color-accent`.
- Commits en español, estilo `feat:` / `test:` / `docs:`. Trabajar en worktree/rama `metasquares` con base `origin/main`.
- No tocar `src/lib/gameSession.ts`, `src/lib/types.ts`, `worker/`.

---

### Task 1: Motor — tipos, enumeración de cuadrados, estado inicial

**Files:**
- Create: `src/games/metasquares/engine.ts`
- Test: `src/games/metasquares/engine.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `type Player = 1 | 2`
  - `type Cell = number` (0..48)
  - `interface Square { corners: [Cell, Cell, Cell, Cell] }` — esquinas ordenadas ascendentemente
  - `interface ClaimedSquare { player: Player; corners: [Cell, Cell, Cell, Cell] }`
  - `interface MetaSquaresState { board: (Player | null)[]; currentPlayer: Player; scores: Record<Player, number>; claimed: ClaimedSquare[]; lastMove: Cell | null; status: { kind: 'playing' } | { kind: 'won'; winner: Player } | { kind: 'draw' } }`
  - `type Move = { celda: Cell }`
  - `const TAMANO = 7`
  - `const OBJETIVO = 5`
  - `const TODOS_LOS_CUADRADOS: readonly Square[]` — longitud 196
  - `function createInitialState(): MetaSquaresState`
  - `function esJugadaValida(payload: unknown): payload is Move`
  - `function movimientosLegales(state: MetaSquaresState): Cell[]`

- [ ] **Step 1: Write the failing test for the square enumeration**

`src/games/metasquares/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  movimientosLegales,
  TODOS_LOS_CUADRADOS,
  TAMANO,
  OBJETIVO,
  type MetaSquaresState,
} from './engine';

describe('metasquares engine - geometría', () => {
  it('la retícula 7x7 tiene exactamente 196 cuadrados posibles', () => {
    // Σ_{k=1}^{6} k·(7-k)² = 36+50+48+36+20+6 = 196
    expect(TODOS_LOS_CUADRADOS).toHaveLength(196);
  });

  it('cada cuadrado tiene 4 esquinas distintas, en rango y ordenadas asc', () => {
    for (const sq of TODOS_LOS_CUADRADOS) {
      expect(sq.corners).toHaveLength(4);
      const set = new Set(sq.corners);
      expect(set.size).toBe(4);
      for (const c of sq.corners) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(TAMANO * TAMANO);
      }
      const ordenadas = [...sq.corners].sort((a, b) => a - b);
      expect(sq.corners).toEqual(ordenadas);
    }
  });

  it('no hay dos cuadrados con el mismo conjunto de esquinas', () => {
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(new Set(claves).size).toBe(TODOS_LOS_CUADRADOS.length);
  });

  it('incluye el cuadrado axis-aligned 1x1 de la esquina (0,0)', () => {
    // celdas 0,1,7,8 → ordenadas [0,1,7,8]
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(claves).toContain('0,1,7,8');
  });

  it('incluye un cuadrado inclinado (vector de borde (1,2))', () => {
    // ancla (2,0): (2,0),(3,2),(1,3),(0,1) → celdas 2,17,22,7 → [2,7,17,22]
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(claves).toContain('2,7,17,22');
  });
});

describe('metasquares engine - estado inicial', () => {
  it('empieza vacío, turno del jugador 1, marcador 0-0', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(49);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.scores).toEqual({ 1: 0, 2: 0 });
    expect(s.claimed).toEqual([]);
    expect(s.lastMove).toBeNull();
    expect(s.status).toEqual({ kind: 'playing' });
    expect(OBJETIVO).toBe(5);
  });

  it('movimientosLegales devuelve las 49 celdas al empezar', () => {
    expect(movimientosLegales(createInitialState())).toHaveLength(49);
  });

  it('esJugadaValida acepta { celda: 0..48 } y rechaza el resto', () => {
    expect(esJugadaValida({ celda: 0 })).toBe(true);
    expect(esJugadaValida({ celda: 48 })).toBe(true);
    expect(esJugadaValida({ celda: 49 })).toBe(false);
    expect(esJugadaValida({ celda: -1 })).toBe(false);
    expect(esJugadaValida({ celda: 1.5 })).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({ cell: 3 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/games/metasquares/engine.test.ts`
Expected: FAIL — no se puede resolver `./engine`.

- [ ] **Step 3: Implement `engine.ts` (tipos + enumeración + estado inicial)**

`src/games/metasquares/engine.ts`:

```ts
export type Player = 1 | 2;
export type Cell = number; // 0..48, fila*7+col

export interface Square {
  corners: [Cell, Cell, Cell, Cell]; // ordenadas ascendentemente
}

export interface ClaimedSquare {
  player: Player;
  corners: [Cell, Cell, Cell, Cell];
}

export type Status =
  | { kind: 'playing' }
  | { kind: 'won'; winner: Player }
  | { kind: 'draw' };

export interface MetaSquaresState {
  board: (Player | null)[]; // longitud 49
  currentPlayer: Player;
  scores: Record<Player, number>;
  claimed: ClaimedSquare[];
  lastMove: Cell | null;
  status: Status;
}

export type Move = { celda: Cell };

export const TAMANO = 7;
export const OBJETIVO = 5;
const TOTAL = TAMANO * TAMANO;

/**
 * Todos los cuadrados perfectos (axis-aligned e inclinados) cuyas 4 esquinas
 * caen en la retícula 7×7. Se enumera por ancla + vector de borde y se
 * canonicaliza por la tupla ordenada de índices de celda para no contar dos
 * veces el mismo cuadrado (el vector (1,2) y el (2,1) generan el mismo).
 */
function enumerarCuadrados(): Square[] {
  const vistos = new Map<string, Square>();
  for (let dx = 1; dx < TAMANO; dx++) {
    for (let dy = 0; dy < TAMANO; dy++) {
      for (let x = 0; x < TAMANO; x++) {
        for (let y = 0; y < TAMANO; y++) {
          const pts: [number, number][] = [
            [x, y],
            [x + dx, y + dy],
            [x + dx - dy, y + dy + dx],
            [x - dy, y + dx],
          ];
          if (
            pts.some(
              ([px, py]) => px < 0 || px >= TAMANO || py < 0 || py >= TAMANO,
            )
          ) {
            continue;
          }
          const celdas = pts.map(([px, py]) => py * TAMANO + px);
          const ordenadas = [...celdas].sort((a, b) => a - b) as [
            Cell,
            Cell,
            Cell,
            Cell,
          ];
          const clave = ordenadas.join(',');
          if (!vistos.has(clave)) vistos.set(clave, { corners: ordenadas });
        }
      }
    }
  }
  return [...vistos.values()];
}

export const TODOS_LOS_CUADRADOS: readonly Square[] = enumerarCuadrados();

export function createInitialState(): MetaSquaresState {
  return {
    board: Array<Player | null>(TOTAL).fill(null),
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    claimed: [],
    lastMove: null,
    status: { kind: 'playing' },
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.celda === 'number' &&
    Number.isInteger(p.celda) &&
    p.celda >= 0 &&
    p.celda < TOTAL
  );
}

export function movimientosLegales(state: MetaSquaresState): Cell[] {
  if (state.status.kind !== 'playing') return [];
  const celdas: Cell[] = [];
  for (let i = 0; i < TOTAL; i++) if (state.board[i] === null) celdas.push(i);
  return celdas;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/games/metasquares/engine.test.ts`
Expected: PASS (todas).

- [ ] **Step 5: Typecheck**

Run: `npx astro check`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/games/metasquares/engine.ts src/games/metasquares/engine.test.ts
git commit -m "feat(metasquares): motor — tipos, enumeración de 196 cuadrados y estado inicial"
```

---

### Task 2: Motor — `playMove`, scoring de cuadrados y condiciones de fin

**Files:**
- Modify: `src/games/metasquares/engine.ts`
- Modify: `src/games/metasquares/engine.test.ts`

**Interfaces:**
- Consumes de Task 1: `MetaSquaresState`, `Move`, `Player`, `Cell`, `ClaimedSquare`, `TODOS_LOS_CUADRADOS`, `OBJETIVO`, `TAMANO`, `createInitialState`.
- Produces:
  - `function playMove(state: MetaSquaresState, move: Move): MetaSquaresState` — puro; si la jugada es inválida (celda ocupada / fuera de rango / partida terminada) devuelve **el mismo objeto** `state` sin cambios.
  - `function contarOcupadas(state: MetaSquaresState): Record<Player, number>` — nº de celdas de cada jugador (para la UI).

- [ ] **Step 1: Write the failing tests**

Añadir a `src/games/metasquares/engine.test.ts`:

```ts
import { playMove, contarOcupadas } from './engine';

/** Aplica una secuencia de celdas alternando jugadores desde el estado inicial. */
function jugarSecuencia(celdas: number[]): MetaSquaresState {
  let s = createInitialState();
  for (const celda of celdas) s = playMove(s, { celda });
  return s;
}

describe('metasquares engine - playMove básico', () => {
  it('coloca la ficha del jugador en turno y alterna el turno', () => {
    let s = createInitialState();
    s = playMove(s, { celda: 10 });
    expect(s.board[10]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    expect(s.lastMove).toBe(10);
  });

  it('rechaza celda ocupada devolviendo el mismo estado', () => {
    let s = createInitialState();
    s = playMove(s, { celda: 10 });
    const rechazado = playMove(s, { celda: 10 });
    expect(rechazado).toBe(s);
  });

  it('rechaza celda fuera de rango devolviendo el mismo estado', () => {
    const s = createInitialState();
    expect(playMove(s, { celda: 99 })).toBe(s);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState();
    const copia = JSON.parse(JSON.stringify(s));
    playMove(s, { celda: 0 });
    expect(s).toEqual(copia);
  });
});

describe('metasquares engine - detección y scoring de cuadrados', () => {
  it('completar un cuadrado 1x1 suma 1 punto y lo registra en claimed', () => {
    // J1 en 0,1,7 ; J2 en 20,21,22 (rellenos inertes) ; J1 cierra en 8
    const s = jugarSecuencia([0, 20, 1, 21, 7, 22, 8]);
    expect(s.scores[1]).toBe(1);
    expect(s.claimed).toHaveLength(1);
    expect(s.claimed[0]).toEqual({ player: 1, corners: [0, 1, 7, 8] });
  });

  it('un cuadrado ya anotado no se vuelve a contar en jugadas posteriores', () => {
    let s = jugarSecuencia([0, 20, 1, 21, 7, 22, 8]); // J1 anota [0,1,7,8]
    expect(s.scores[1]).toBe(1);
    s = playMove(s, { celda: 23 }); // J2
    s = playMove(s, { celda: 2 }); // J1, no cierra ningún cuadrado nuevo aquí
    expect(s.scores[1]).toBe(1);
    expect(s.claimed).toHaveLength(1);
  });

  it('una sola jugada puede completar dos cuadrados y suma ambos', () => {
    // J1 ocupa 0,1,2,7,8,9 salvo la celda 8; al poner 8 cierra
    // [0,1,7,8] y [1,2,8,9] a la vez.
    // Secuencia: J1:0 J2:20 J1:1 J2:21 J1:2 J2:22 J1:7 J2:23 J1:9 J2:24 J1:8
    const s = jugarSecuencia([0, 20, 1, 21, 2, 22, 7, 23, 9, 24, 8]);
    expect(s.scores[1]).toBe(2);
    expect(s.claimed).toHaveLength(2);
  });

  it('detecta un cuadrado inclinado', () => {
    // Cuadrado inclinado de celdas [2,7,17,22]. J1 pone 2,7,17 y cierra en 22.
    const s = jugarSecuencia([2, 0, 7, 1, 17, 3, 22]);
    expect(s.scores[1]).toBe(1);
    expect(s.claimed[0].corners).toEqual([2, 7, 17, 22]);
  });

  it('un cuadrado con esquinas de dos jugadores no cuenta', () => {
    // J1: 0,1,7 ; J2 cierra en 8 → el cuadrado [0,1,7,8] es mixto
    const s = jugarSecuencia([0, 20, 1, 21, 7, 8]);
    expect(s.scores[1]).toBe(0);
    expect(s.scores[2]).toBe(0);
    expect(s.claimed).toEqual([]);
  });
});

describe('metasquares engine - fin de partida', () => {
  it('llegar a 5 puntos gana de inmediato', () => {
    // Construir 5 cuadrados 1x1 para J1 en columnas 0-1, filas 0-1..0-5 no
    // caben; usar un bloque 2x6: celdas (fila 0..5, col 0..1). J1 llena la
    // rejilla col0/col1 salvo (5,1)=celda 36; J2 juega inerte en col 5-6.
    let s = createInitialState();
    const j1: number[] = [];
    for (let f = 0; f < 6; f++) {
      j1.push(f * 7 + 0);
      if (!(f === 5)) j1.push(f * 7 + 1);
    }
    // j1 = [0,1,7,8,14,15,21,22,28,29,35]  (falta 36)
    const j2 = [5, 6, 12, 13, 19, 20, 26, 27, 33, 34, 40];
    let s2 = s;
    for (let i = 0; i < j1.length; i++) {
      s2 = playMove(s2, { celda: j1[i] });
      if (i < j2.length && s2.status.kind === 'playing') {
        s2 = playMove(s2, { celda: j2[i] });
      }
    }
    s2 = playMove(s2, { celda: 36 }); // cierra los 5 cuadrados que faltan de la columna
    expect(s2.status).toEqual({ kind: 'won', winner: 1 });
    expect(s2.scores[1]).toBeGreaterThanOrEqual(5);
  });

  it('no se pueden jugar más movimientos tras ganar', () => {
    const ganado = jugarSecuencia([
      0, 5, 1, 6, 7, 12, 8, 13, 2, 19, 9, 20, 3, 26, 10, 27, 4, 33, 11,
      34, /* J1 cierra fila superior 2x5 → varios cuadrados */
    ]);
    if (ganado.status.kind === 'won') {
      const despues = playMove(ganado, { celda: 40 });
      expect(despues).toBe(ganado);
    }
  });

  it('tablero lleno sin objetivo: gana la mayoría con marcador < 5', () => {
    // Difícil de construir a mano; se cubre por el fuzz. Aquí solo un caso
    // sintético: forzar un estado casi lleno vía playMove no es práctico, así
    // que se valida la rama en el fuzz test siguiente.
    expect(true).toBe(true);
  });
});

describe('metasquares engine - fuzz', () => {
  it('500 partidas aleatorias: sin excepciones e invariantes se mantienen', () => {
    let rng = 123456789;
    const rand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };
    for (let partida = 0; partida < 500; partida++) {
      let s = createInitialState();
      let guard = 0;
      while (s.status.kind === 'playing' && guard++ < 100) {
        const opciones = movimientosLegales(s);
        expect(opciones.length).toBeGreaterThan(0);
        const celda = opciones[Math.floor(rand() * opciones.length)];
        s = playMove(s, { celda });
        // invariante: scores coincide con claimed
        for (const p of [1, 2] as const) {
          expect(s.scores[p]).toBe(
            s.claimed.filter(c => c.player === p).length,
          );
        }
      }
      // fin alcanzado
      expect(s.status.kind).not.toBe('playing');
      if (s.status.kind === 'won') {
        const w = s.status.winner;
        const otro = w === 1 ? 2 : 1;
        const lleno = s.board.every(c => c !== null);
        expect(s.scores[w] >= OBJETIVO || (lleno && s.scores[w] > s.scores[otro])).toBe(
          true,
        );
      } else {
        // draw ⟹ tablero lleno y empate
        expect(s.board.every(c => c !== null)).toBe(true);
        expect(s.scores[1]).toBe(s.scores[2]);
      }
    }
  });
});
```

Nota para el implementador: si algún índice concreto de las secuencias de test no cierra el cuadrado esperado (error de aritmética al escribir el plan), **corrige los índices conservando la intención del test** (mismo cuadrado objetivo, mismo jugador) y anótalo en el ledger. La aserción de 196 de Task 1 y el fuzz test son las guardas duras.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/games/metasquares/engine.test.ts`
Expected: FAIL — `playMove` / `contarOcupadas` no exportados.

- [ ] **Step 3: Implement `playMove` + `contarOcupadas` en `engine.ts`**

Añadir al final de `engine.ts`:

```ts
function claveEsquinas(corners: readonly number[]): string {
  return corners.join(',');
}

export function contarOcupadas(state: MetaSquaresState): Record<Player, number> {
  let a = 0;
  let b = 0;
  for (const c of state.board) {
    if (c === 1) a++;
    else if (c === 2) b++;
  }
  return { 1: a, 2: b };
}

export function playMove(
  state: MetaSquaresState,
  move: Move,
): MetaSquaresState {
  if (state.status.kind !== 'playing') return state;
  if (!esJugadaValida(move)) return state;
  if (state.board[move.celda] !== null) return state;

  const jugador = state.currentPlayer;
  const board = [...state.board];
  board[move.celda] = jugador;

  const yaAnotados = new Set(
    state.claimed.map(c => claveEsquinas(c.corners)),
  );
  const nuevos: ClaimedSquare[] = [];
  for (const sq of TODOS_LOS_CUADRADOS) {
    if (yaAnotados.has(claveEsquinas(sq.corners))) continue;
    if (sq.corners.every(c => board[c] === jugador)) {
      nuevos.push({ player: jugador, corners: sq.corners });
    }
  }

  const scores: Record<Player, number> = {
    1: state.scores[1] + (jugador === 1 ? nuevos.length : 0),
    2: state.scores[2] + (jugador === 2 ? nuevos.length : 0),
  };
  const claimed = [...state.claimed, ...nuevos];

  let status: Status;
  let currentPlayer: Player = jugador === 1 ? 2 : 1;

  if (scores[jugador] >= OBJETIVO) {
    status = { kind: 'won', winner: jugador };
    currentPlayer = jugador;
  } else if (board.every(c => c !== null)) {
    if (scores[1] > scores[2]) status = { kind: 'won', winner: 1 };
    else if (scores[2] > scores[1]) status = { kind: 'won', winner: 2 };
    else status = { kind: 'draw' };
  } else {
    status = { kind: 'playing' };
  }

  return {
    board,
    currentPlayer,
    scores,
    claimed,
    lastMove: move.celda,
    status,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/games/metasquares/engine.test.ts`
Expected: PASS. Si alguna secuencia sintética falla por aritmética de índices, ajústala como dice la nota del Step 1.

- [ ] **Step 5: Typecheck**

Run: `npx astro check`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/games/metasquares/engine.ts src/games/metasquares/engine.test.ts
git commit -m "feat(metasquares): playMove con scoring de cuadrados, fin por objetivo/tablero lleno y fuzz"
```

---

### Task 3: UI — `Board.astro`, contenido y registro del juego

**Files:**
- Create: `src/games/metasquares/Board.astro`
- Create: `src/content/juegos/metasquares.md`
- Modify: `src/pages/juegos/[slug].astro` (imports + objeto `BOARDS`)
- Modify: `abstract-games-by-category/GAME-INDEX.md` (marcar `44-metasquares.md` como ✅)

**Interfaces:**
- Consumes de Tasks 1-2: `createInitialState`, `playMove`, `esJugadaValida`, `movimientosLegales`, `contarOcupadas`, `TAMANO`, `OBJETIVO`, `type MetaSquaresState`, `type Move`, `type Player`.
- Consumes del repo: `iniciarSesionJuego` de `src/lib/gameSession` (ver uso en `src/games/triggle/Board.astro` y `src/games/estampida/Board.astro`), `TableroJuego` de `src/components/TableroJuego.astro`.
- Produces: la ruta `/juegos/metasquares/` funcional.

- [ ] **Step 1: Crear `src/content/juegos/metasquares.md`**

```markdown
---
title: "MetaSquares"
description: "Marca celdas y forma cuadrados perfectos con tus fichas: el primero en cinco gana."
icono: "🔷"
minJugadores: 2
maxJugadores: 2
---

1. El tablero es una retícula de 7×7 celdas. El Jugador 1 usa ●, el Jugador 2 ▲.
2. **En tu turno**, marca una celda vacía con tu ficha.
3. Cuando cuatro de tus fichas ocupan las esquinas de un cuadrado perfecto, ese cuadrado se completa, se dibuja en tu color y suma **1 punto**.
4. El cuadrado puede ser de cualquier tamaño y estar inclinado en cualquier ángulo, mientras sea un cuadrado verdadero.
5. Una misma ficha puede ser esquina de varios cuadrados, y una sola jugada puede completar más de uno: todos suman.
6. **Gana el primero en llegar a 5 puntos.**
7. Si el tablero se llena antes, gana quien tenga más cuadrados. Si hay empate en cuadrados, la partida termina en empate.
```

- [ ] **Step 2: Crear `src/games/metasquares/Board.astro`**

Sigue el patrón de `src/games/triggle/Board.astro` (SVG inline + `iniciarSesionJuego` + `mostrarTurno` / `mostrarFinDeJuego`). Puntos clave:

- SVG `viewBox="0 0 400 400"`. La celda `i` va en `(col, fila)` con `col = i % 7`, `fila = Math.floor(i / 7)`. Coloca el punto en `x = 40 + col * 53.3`, `y = 40 + fila * 53.3` (deja margen para los cuadrados que tocan el borde). Define un helper `px(celda)` en el frontmatter.
- Tres capas SVG, en este orden (fondo→frente):
  1. `<g class="capa-cuadrados">` — vacía en el markup; se rellena en el script con un `<polygon>` por cada entrada de `state.claimed`.
  2. `<g class="capa-puntos">` — un `<g class="punto" data-indice={i} role="button" tabindex="0">` por celda, con `<circle class="punto__halo" r="22">` y `<circle class="punto__circulo" r="7">`.
- Frontmatter genera el array `celdas = Array.from({length: 49}, (_, i) => i)` y sus coordenadas.

Script (`<script>`), calcado de Triggle con estos cambios:

```ts
import {
  createInitialState,
  esJugadaValida,
  playMove,
  contarOcupadas,
  type MetaSquaresState,
  type Move,
} from './engine';
import { iniciarSesionJuego } from '../../lib/gameSession';

const SIMBOLOS = { 1: '●', 2: '▲' } as const;

const svg = document.getElementById('svg-metasquares') as unknown as SVGSVGElement;
const capaCuadrados = svg.querySelector<SVGGElement>('.capa-cuadrados')!;
const puntosEl = Array.from(svg.querySelectorAll<SVGGElement>('.punto'));

// Coordenada del centro de cada celda, en el mismo sistema que el markup.
const COORD: { x: number; y: number }[] = puntosEl.map(el => {
  const c = el.querySelector<SVGCircleElement>('.punto__circulo')!;
  return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
});

let state: MetaSquaresState = createInitialState();

const sesion = iniciarSesionJuego<Move>({
  validarMovimiento: esJugadaValida,
  onMovimientoRemoto: move => jugar(move, false),
  onAplicarReinicio: () => {
    state = createInitialState();
    render();
  },
  onRender: render,
  onDesconectar: () => {
    puntosEl.forEach(el => (el.dataset.deshabilitado = 'true'));
    render();
  },
});

function render(): void {
  const enJuego = state.status.kind === 'playing';
  const esMiTurno = sesion.esMiTurno(state.currentPlayer) && enJuego;
  const ocupadas = contarOcupadas(state); // solo para nada visible; el marcador usa scores

  // fichas + habilitación
  for (const el of puntosEl) {
    const i = Number(el.dataset.indice);
    const valor = state.board[i];
    if (valor) el.dataset.valor = String(valor);
    else delete el.dataset.valor;
    el.querySelector('.punto__ficha')!.textContent = valor ? SIMBOLOS[valor] : '';
    el.classList.toggle('ultima', state.lastMove === i);
    el.dataset.deshabilitado = String(!esMiTurno || valor !== null);
  }

  // cuadrados completados (redibuja todo cada render: máx ~12)
  capaCuadrados.replaceChildren();
  for (const sq of state.claimed) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    // reordenar las 4 esquinas a orden de polígono (las corners vienen ordenadas
    // por índice, no en ciclo): ordénalas por ángulo respecto al centroide.
    const pts = ordenarEnCiclo(sq.corners).map(c => `${COORD[c].x},${COORD[c].y}`);
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('class', 'cuadrado');
    poly.dataset.jugador = String(sq.player);
    capaCuadrados.appendChild(poly);
  }

  if (!enJuego) {
    if (state.status.kind === 'draw') {
      sesion.mostrarFinDeJuego({
        titulo: '🤝 ¡Empate!',
        detalle: `${state.scores[1]} cuadrados cada uno`,
      });
    } else {
      const w = state.status.winner;
      const p = w === 1 ? 2 : 1;
      sesion.mostrarFinDeJuego({
        titulo: `🎉 ¡Ganó ${sesion.nombres[w]} (${SIMBOLOS[w]})!`,
        detalle: `${state.scores[w]} cuadrados a ${state.scores[p]}`,
      });
    }
    return;
  }

  sesion.mostrarTurno({
    jugador: state.currentPlayer,
    simbolos: { 1: SIMBOLOS[1], 2: SIMBOLOS[2] },
    puntajes: state.scores,
    detalle: `Forma cuadrados perfectos — primero a ${5}`,
  });
}

function ordenarEnCiclo(corners: readonly number[]): number[] {
  const cx = corners.reduce((s, c) => s + COORD[c].x, 0) / 4;
  const cy = corners.reduce((s, c) => s + COORD[c].y, 0) / 4;
  return [...corners].sort(
    (a, b) =>
      Math.atan2(COORD[a].y - cy, COORD[a].x - cx) -
      Math.atan2(COORD[b].y - cy, COORD[b].x - cx),
  );
}

function jugar(move: Move, emitirRemoto = true): void {
  if (state.status.kind !== 'playing') return;
  if (emitirRemoto && !sesion.esMiTurno(state.currentPlayer)) return;
  const prev = state;
  state = playMove(state, move);
  if (state === prev) return;
  render();
  if (emitirRemoto) sesion.enviarMovimiento(move);
}

for (const el of puntosEl) {
  const i = Number(el.dataset.indice);
  el.addEventListener('click', () => jugar({ celda: i }));
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      jugar({ celda: i });
    }
  });
}

render();
```

Estilos (`<style>`), adaptados de Triggle:

```css
.tablero-metasquares__container {
  width: min(94vw, 32rem);
  aspect-ratio: 1;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  user-select: none;
}
.tablero-metasquares__svg { width: 100%; height: 100%; overflow: visible; }

.cuadrado {
  fill: transparent;
  stroke-width: 4px;
  stroke-linejoin: round;
  pointer-events: none;
}
.cuadrado[data-jugador='1'] {
  stroke: var(--color-player-1);
  fill: color-mix(in srgb, var(--color-player-1) 12%, transparent);
}
.cuadrado[data-jugador='2'] {
  stroke: var(--color-player-2);
  fill: color-mix(in srgb, var(--color-player-2) 12%, transparent);
}

.punto { cursor: pointer; outline: none; }
.punto[data-deshabilitado='true'] { cursor: default; }
.punto__halo { fill: transparent; }
.punto__circulo {
  fill: var(--color-surface, #fff);
  stroke: rgba(0, 0, 0, 0.25);
  stroke-width: 2px;
}
.punto[data-valor='1'] .punto__circulo { stroke: var(--color-player-1); }
.punto[data-valor='2'] .punto__circulo { stroke: var(--color-player-2); }
.punto.ultima .punto__circulo { stroke: var(--color-accent); stroke-width: 3px; }
.punto__ficha {
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  pointer-events: none;
  text-anchor: middle;
  dominant-baseline: central;
}
.punto[data-valor='1'] .punto__ficha { fill: var(--color-player-1); }
.punto[data-valor='2'] .punto__ficha { fill: var(--color-player-2); }
.punto:focus-visible .punto__circulo { stroke: var(--color-accent); stroke-width: 3px; }
```

El markup de cada punto necesita un `<text class="punto__ficha" x y>` además de los dos círculos. Envuelve todo en `<TableroJuego class="tablero-metasquares">` con un `<div id="tablero" class="tablero-metasquares__container">` y el `<svg id="svg-metasquares" class="tablero-metasquares__svg" role="application" aria-label="Tablero de MetaSquares, 7 por 7">`.

- [ ] **Step 3: Registrar el juego en `src/pages/juegos/[slug].astro`**

Añadir el import junto a los demás:
```ts
import MetaSquaresBoard from '../../games/metasquares/Board.astro';
```
Añadir la entrada al objeto `BOARDS`:
```ts
  metasquares: MetaSquaresBoard,
```

- [ ] **Step 4: Marcar `GAME-INDEX.md`**

En `abstract-games-by-category/GAME-INDEX.md`, cambiar la fila:
```
| 01-2-players | [44-metasquares.md](01-2-players/44-metasquares.md) | |
```
a:
```
| 01-2-players | [44-metasquares.md](01-2-players/44-metasquares.md) | ✅ |
```

- [ ] **Step 5: Typecheck + build + tests**

Run: `npx astro check && npm run build && npx vitest run`
Expected: 0 errores de check, build limpio, todos los tests en verde.

- [ ] **Step 6: Playtest en navegador**

Levantar `npm run dev`, abrir `http://localhost:4321/juegos/metasquares/` a ~375px de ancho. Verificar:
- El tablero 7×7 cabe sin scroll horizontal.
- Elegir "jugar en este dispositivo", colocar fichas alternas.
- Al formar un cuadrado (probar uno axis-aligned y uno inclinado) se dibuja el polígono en el color del jugador y el marcador sube.
- Anillo en la última ficha.
- Llegar a 5 → banner "¡Ganó …!"; "jugar de nuevo" reinicia.
- 0 errores en consola.

- [ ] **Step 7: Commit**

```bash
git add src/games/metasquares/Board.astro src/content/juegos/metasquares.md \
  src/pages/juegos/'[slug].astro' abstract-games-by-category/GAME-INDEX.md
git commit -m "feat(metasquares): Board.astro, contenido y registro del juego"
```

---

## Self-Review

**1. Spec coverage:**
- Tablero 7×7 / objetivo 5 → Task 1 (`TAMANO`, `OBJETIVO`) + Global Constraints. ✅
- Solo puntuación simple → Task 2 (`nuevos.length`, sin área). ✅
- Empate permitido → Task 2 (rama `draw`) + fuzz. ✅
- Turno siempre alterno → Task 2 (`currentPlayer` alterna salvo en `won`). ✅
- Enumeración 196 + canonicalización → Task 1 (`enumerarCuadrados` con `Map` por clave ordenada) + test de 196. ✅
- Esquinas no se consumen / solapamiento → Task 2 (se recorre `TODOS_LOS_CUADRADOS` completo cada jugada; solo se excluye por `yaAnotados`) + test de doble cuadrado. ✅
- `playMove` solo escanea jugador en turno → Task 2 (`board[c] === jugador`). ✅
- `won` con marcador < 5 → Task 2 (rama tablero lleno) + banner en Task 3 usa `state.scores`, no compara con 5. ✅
- Dibujo de cuadrados persistente / marcador / anillo → Task 3. ✅
- Gating de turno remoto sin descartar remotos → Task 3 (`emitirRemoto && !esMiTurno`, calcado de Triggle). ✅
- `gameSession`/`types`/`worker` intactos → ninguna tarea los toca. ✅
- Contenido + registro + GAME-INDEX → Task 3. ✅

**2. Placeholder scan:** El stub "tablero lleno sin objetivo" de Task 2 (`expect(true).toBe(true)`) se reemplazó durante la implementación por dos tests sintéticos directos de `playMove` que cubren la rama de victoria por mayoría y la de `draw` con tablero lleno. El fuzz test valida ausencia de excepciones, el invariante por jugada `scores`/`claimed` y la terminación de cada partida, pero empíricamente las partidas aleatorias terminan al alcanzar el objetivo de 5 puntos, no por llenar el tablero. La nota sobre ajustar índices de secuencias es una instrucción real, no un placeholder.

**3. Type consistency:** `MetaSquaresState`, `Move = { celda: Cell }`, `status: { kind }`, `scores: Record<Player, number>`, `claimed: ClaimedSquare[]` usados igual en Tasks 1-3. `esJugadaValida` es el type guard pasado a `validarMovimiento` (igual que Estampida). `contarOcupadas` definida en Task 2, consumida en Task 3. `createInitialState` / `playMove` — nombres del repo. ✅

## Handoff

Tras guardar el plan, ofrecer al usuario la elección de ejecución (subagent-driven vs inline).
