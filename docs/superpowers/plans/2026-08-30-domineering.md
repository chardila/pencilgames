# Domineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir Domineering (tablero 8×8, Jugador 1 coloca dominós verticales y Jugador 2 horizontales, pierde quien no puede colocar) como 12º juego del sitio, jugable en local y en modo remoto.

**Architecture:** Motor puro (`src/games/domineering/engine.ts`) sin DOM, testeado con Vitest, más un `Board.astro` que conecta los taps al motor vía `iniciarSesionJuego`. La legalidad de un dominó es derivada (dos casillas vacías adyacentes en la orientación del jugador, acotadas por fila/columna); no se guarda "estado de selección". El fin de partida se detecta comprobando si el rival tiene alguna colocación legal tras cada jugada. Se reutiliza todo el "chrome" compartido (indicador de turno, banner, identidad de jugadores, protocolo remoto) — no se añade Worker ni mensajes nuevos.

**Tech Stack:** Astro 7 (sin framework de UI), TypeScript estricto, Vitest, npm.

**Spec:** `docs/superpowers/specs/2026-08-30-domineering-design.md`

## Global Constraints

- Tablero **8×8** (64 casillas), orden fila-mayor en un array plano. No configurable. `export const TAMANO = 8`.
- **Roles fijos:** Jugador 1 coloca dominós **verticales** (cubren `a` y `a + 8`); Jugador 2 coloca **horizontales** (cubren `a` y `a + 1`, misma fila). `orientacionDe(1) === 'vertical'`, `orientacionDe(2) === 'horizontal'`.
- **Pierde quien no puede colocar:** si tras una jugada el rival no tiene ninguna colocación legal de su orientación → `status: 'won'`, `winner` = quien acaba de jugar, `currentPlayer` **sin alternar**. Sin empate posible.
- Sin puntaje acumulado entre rondas (victoria única por partida).
- Payload del movimiento remoto = `{ a: number, b: number }` con `a`, `b` enteros en `[0, 64)`, `a !== b`. El motor normaliza a `a < b`.
- Motor inmutable: ante entrada inválida `playMove` devuelve el `state` recibido sin mutarlo.
- Identidad de jugador: reutiliza el sistema existente (color + forma por asiento). El añadido específico de Domineering es el **ícono de orientación** (`▌` para el 1, `▬` para el 2) vía la opción `simbolos` de `mostrarTurno`. **No se toca `turnIndicator.ts`.**
- Sin sombreado de casillas muertas ni ninguna ayuda táctica (a diferencia de Obstrucción).
- Solo español en todo el texto visible.
- `engine.ts` no importa nada del DOM ni de Astro.
- Patrón de registro: `import` **estático** del `Board.astro` en `src/pages/juegos/[slug].astro` (nunca `import()` dinámico con el slug como variable — rompe el build de Astro).
- TDD: primero el test que falla, luego el mínimo código para pasarlo. Commits frecuentes.

---

## Preparación (antes de la Task 1)

El plan asume un worktree/branch aislado creado con la skill `superpowers:using-git-worktrees`, basado en **`origin/main`**. Nombre sugerido del worktree: `domineering`. Todos los `git commit` de abajo ocurren en esa rama; la integración final es un PR contra `main`, como los 11 juegos anteriores.

Verifica el punto de partida:

```bash
npm test        # la suite actual debe pasar en verde
```

---

## Task 1: Motor — estado, orientación, dominós legales y colocación

Motor sin detección de fin todavía: define los tipos, la orientación por jugador, enumera los dominós legales que incluyen una casilla, reconstruye los dominós del tablero, valida y aplica una colocación, fija `lastMove` y alterna el turno. Tras esta task, `playMove` siempre deja `status: 'playing'`.

**Files:**
- Create: `src/games/domineering/engine.ts`
- Test: `src/games/domineering/engine.test.ts`

**Interfaces:**
- Consumes: nada (primera task).
- Produces:
  - `type Player = 1 | 2`
  - `type CellValue = Player | null`
  - `type GameStatus = 'playing' | 'won'`
  - `interface Move { a: number; b: number }` (normalizado a `a < b` por el motor)
  - `interface DomineeringState { board: CellValue[]; currentPlayer: Player; status: GameStatus; winner: Player | null; lastMove: Move | null }`
  - `const TAMANO = 8` (export)
  - `function createInitialState(): DomineeringState`
  - `function esJugadaValida(payload: unknown): payload is Move`
  - `function orientacionDe(player: Player): 'vertical' | 'horizontal'` (export)
  - `function dominosLegalesEn(board: CellValue[], player: Player, ancla: number): Move[]` (export)
  - `function dominosEnTablero(board: CellValue[]): Move[]` (export)
  - `function playMove(state: DomineeringState, move: Move): DomineeringState`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/games/domineering/engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  orientacionDe,
  dominosLegalesEn,
  dominosEnTablero,
  playMove,
  TAMANO,
  type CellValue,
  type DomineeringState,
} from './engine';

// Helper: índice fila-mayor en un tablero 8×8.
const idx = (fila: number, col: number) => fila * TAMANO + col;
const tableroVacio = (): CellValue[] => Array<CellValue>(TAMANO * TAMANO).fill(null);

describe('createInitialState', () => {
  it('crea un tablero vacío de 64 casillas, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.board).toHaveLength(64);
    expect(state.board.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.lastMove).toBeNull();
  });
});

describe('orientacionDe', () => {
  it('jugador 1 es vertical, jugador 2 es horizontal', () => {
    expect(orientacionDe(1)).toBe('vertical');
    expect(orientacionDe(2)).toBe('horizontal');
  });
});

describe('esJugadaValida', () => {
  it('acepta objetos con a, b enteros en [0, 64) y distintos', () => {
    expect(esJugadaValida({ a: 0, b: 8 })).toBe(true);
    expect(esJugadaValida({ a: 63, b: 62 })).toBe(true);
  });

  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({ a: 0 })).toBe(false);
    expect(esJugadaValida({ a: 0, b: 0 })).toBe(false);
    expect(esJugadaValida({ a: -1, b: 7 })).toBe(false);
    expect(esJugadaValida({ a: 0, b: 64 })).toBe(false);
    expect(esJugadaValida({ a: 1.5, b: 2 })).toBe(false);
    expect(esJugadaValida({ a: '0', b: '8' })).toBe(false);
  });
});

describe('dominosLegalesEn', () => {
  it('vertical, ancla en el centro con vecinos libres → 2 dominós (arriba y abajo)', () => {
    const board = tableroVacio();
    const a = idx(3, 3);
    expect(dominosLegalesEn(board, 1, a)).toEqual([
      { a: a - TAMANO, b: a },
      { a, b: a + TAMANO },
    ]);
  });

  it('vertical, ancla en la fila 0 → solo el dominó de abajo', () => {
    const board = tableroVacio();
    expect(dominosLegalesEn(board, 1, idx(0, 4))).toEqual([{ a: idx(0, 4), b: idx(1, 4) }]);
  });

  it('vertical, ancla en la fila 7 → solo el dominó de arriba', () => {
    const board = tableroVacio();
    expect(dominosLegalesEn(board, 1, idx(7, 4))).toEqual([{ a: idx(6, 4), b: idx(7, 4) }]);
  });

  it('horizontal, ancla en el centro → 2 dominós (izquierda y derecha)', () => {
    const board = tableroVacio();
    const a = idx(3, 3);
    expect(dominosLegalesEn(board, 2, a)).toEqual([
      { a: a - 1, b: a },
      { a, b: a + 1 },
    ]);
  });

  it('horizontal, ancla en la columna 7 → solo el dominó de la izquierda', () => {
    const board = tableroVacio();
    expect(dominosLegalesEn(board, 2, idx(3, 7))).toEqual([{ a: idx(3, 6), b: idx(3, 7) }]);
  });

  it('excluye el dominó cuyo vecino está ocupado', () => {
    const board = tableroVacio();
    const a = idx(3, 3);
    board[a + TAMANO] = 2; // vecino de abajo ocupado
    expect(dominosLegalesEn(board, 1, a)).toEqual([{ a: a - TAMANO, b: a }]);
  });

  it('ancla ocupada → []', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    expect(dominosLegalesEn(board, 1, idx(3, 3))).toEqual([]);
  });
});

describe('dominosEnTablero', () => {
  it('reconstruye dominós verticales y horizontales sin solaparlos', () => {
    const board = tableroVacio();
    // vertical del jugador 1 en (0,0)-(1,0)
    board[idx(0, 0)] = 1;
    board[idx(1, 0)] = 1;
    // vertical del jugador 1 apilado en (2,0)-(3,0)
    board[idx(2, 0)] = 1;
    board[idx(3, 0)] = 1;
    // horizontal del jugador 2 en (5,2)-(5,3)
    board[idx(5, 2)] = 2;
    board[idx(5, 3)] = 2;
    expect(dominosEnTablero(board)).toEqual([
      { a: idx(0, 0), b: idx(1, 0) },
      { a: idx(2, 0), b: idx(3, 0) },
      { a: idx(5, 2), b: idx(5, 3) },
    ]);
  });

  it('tablero vacío → []', () => {
    expect(dominosEnTablero(tableroVacio())).toEqual([]);
  });
});

describe('playMove — colocación y turno', () => {
  it('el jugador 1 coloca un dominó vertical, marca ambas casillas y pasa el turno', () => {
    const state = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    expect(state.board[idx(0, 0)]).toBe(1);
    expect(state.board[idx(1, 0)]).toBe(1);
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');
    expect(state.lastMove).toEqual({ a: idx(0, 0), b: idx(1, 0) });
  });

  it('normaliza el par (acepta a > b en el payload)', () => {
    const state = playMove(createInitialState(), { a: idx(1, 0), b: idx(0, 0) });
    expect(state.lastMove).toEqual({ a: idx(0, 0), b: idx(1, 0) });
  });

  it('el jugador 2 coloca un dominó horizontal', () => {
    const s1 = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    const s2 = playMove(s1, { a: idx(4, 4), b: idx(4, 5) });
    expect(s2.board[idx(4, 4)]).toBe(2);
    expect(s2.board[idx(4, 5)]).toBe(2);
    expect(s2.currentPlayer).toBe(1);
  });

  it('ignora un dominó con la orientación equivocada para el jugador en turno', () => {
    const state = createInitialState(); // turno del 1 (vertical)
    expect(playMove(state, { a: idx(0, 0), b: idx(0, 1) })).toBe(state); // horizontal
  });

  it('ignora un dominó que se sale del tablero', () => {
    const state = createInitialState();
    expect(playMove(state, { a: idx(7, 0), b: idx(7, 0) + TAMANO })).toBe(state); // vertical fuera por abajo
    const s2 = playMove(state, { a: idx(0, 0), b: idx(1, 0) }); // turno del 2 ahora
    expect(playMove(s2, { a: idx(3, 7), b: idx(3, 7) + 1 })).toBe(s2); // horizontal cruza de fila
  });

  it('ignora un dominó sobre una casilla ocupada', () => {
    const s1 = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    const s2 = playMove(s1, { a: idx(3, 3), b: idx(3, 4) }); // turno del 1 otra vez
    expect(playMove(s2, { a: idx(0, 0), b: idx(1, 0) })).toBe(s2);
  });

  it('ignora payload inválido', () => {
    const state = createInitialState();
    expect(playMove(state, { a: 0, b: 0 } as never)).toBe(state);
    expect(playMove(state, 5 as never)).toBe(state);
  });

  it('no muta el estado de entrada', () => {
    const state = createInitialState();
    const boardRef = state.board;
    playMove(state, { a: idx(0, 0), b: idx(1, 0) });
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/domineering/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Implementar el motor mínimo**

```ts
// src/games/domineering/engine.ts
export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

/** Par de casillas que cubre un dominó. El motor lo normaliza a a < b. */
export interface Move {
  a: number;
  b: number;
}

export interface DomineeringState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: Move | null;
}

export const TAMANO = 8;
const TOTAL = TAMANO * TAMANO;

export function createInitialState(): DomineeringState {
  return {
    board: Array<CellValue>(TOTAL).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

export function orientacionDe(player: Player): 'vertical' | 'horizontal' {
  return player === 1 ? 'vertical' : 'horizontal';
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const { a, b } = payload as Record<string, unknown>;
  return (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    a < TOTAL &&
    b >= 0 &&
    b < TOTAL &&
    a !== b
  );
}

/**
 * Dominós legales de la orientación de `player` que incluyen la casilla
 * `ancla`. Máximo 2 (vertical: arriba/abajo; horizontal: izquierda/derecha).
 * Cada Move normalizado a a < b. Devuelve [] si `ancla` está ocupada o fuera
 * de rango.
 */
export function dominosLegalesEn(
  board: CellValue[],
  player: Player,
  ancla: number,
): Move[] {
  if (ancla < 0 || ancla >= TOTAL || board[ancla] !== null) return [];
  const fila = Math.floor(ancla / TAMANO);
  const col = ancla % TAMANO;
  const candidatos: Move[] = [];
  if (orientacionDe(player) === 'vertical') {
    if (fila > 0) candidatos.push({ a: ancla - TAMANO, b: ancla });
    if (fila < TAMANO - 1) candidatos.push({ a: ancla, b: ancla + TAMANO });
  } else {
    if (col > 0) candidatos.push({ a: ancla - 1, b: ancla });
    if (col < TAMANO - 1) candidatos.push({ a: ancla, b: ancla + 1 });
  }
  return candidatos.filter(m => board[m.a] === null && board[m.b] === null);
}

/**
 * Reconstruye la lista de dominós colocados a partir del tablero. Recorre en
 * orden ascendente y empareja cada casilla no consumida con su compañero
 * "hacia adelante" según la orientación del jugador dueño (abajo si es
 * vertical, derecha si es horizontal). Como los dominós nunca se solapan y
 * la casilla "cabeza" (superior/izquierda) siempre se procesa antes, el
 * emparejamiento es único.
 */
export function dominosEnTablero(board: CellValue[]): Move[] {
  const consumidas = new Set<number>();
  const dominos: Move[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === null || consumidas.has(i)) continue;
    const jugador = board[i];
    const companero = jugador === 1 ? i + TAMANO : i + 1;
    if (companero < TOTAL && board[companero] === jugador && !consumidas.has(companero)) {
      consumidas.add(i);
      consumidas.add(companero);
      dominos.push({ a: i, b: companero });
    }
  }
  return dominos;
}

function esFormaLegal(a: number, b: number, player: Player): boolean {
  if (orientacionDe(player) === 'vertical') {
    return b - a === TAMANO;
  }
  return b - a === 1 && Math.floor(a / TAMANO) === Math.floor(b / TAMANO);
}

export function playMove(state: DomineeringState, move: Move): DomineeringState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(move)) return state;

  const a = Math.min(move.a, move.b);
  const b = Math.max(move.a, move.b);

  if (!esFormaLegal(a, b, state.currentPlayer)) return state;
  if (state.board[a] !== null || state.board[b] !== null) return state;

  const board = [...state.board];
  board[a] = state.currentPlayer;
  board[b] = state.currentPlayer;

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove: { a, b },
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/domineering/engine.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/games/domineering/engine.ts src/games/domineering/engine.test.ts
git commit -m "feat(domineering): motor base — orientación, dominós legales y colocación"
```

---

## Task 2: Motor — detección de fin de partida

Tras colocar un dominó, comprueba si **el rival** tiene alguna colocación legal de su orientación. Si no, la partida termina y gana quien acaba de jugar.

**Files:**
- Modify: `src/games/domineering/engine.ts`
- Test: `src/games/domineering/engine.test.ts` (añadir casos)

**Interfaces:**
- Consumes (de Task 1): `DomineeringState`, `Player`, `CellValue`, `Move`, `createInitialState`, `playMove`, `orientacionDe`, `TAMANO`, `TOTAL` (constante interna del módulo).
- Produces:
  - `function tieneJugadaLegal(board: CellValue[], player: Player): boolean` (export)
  - Mismo API público; `playMove` ahora puede devolver `status: 'won'` con `winner` = jugador que colocó el último dominó y `currentPlayer` **sin alternar**.

- [ ] **Step 1: Escribir los tests que fallan**

Añade este bloque al final de `src/games/domineering/engine.test.ts` (y añade `tieneJugadaLegal` al `import` de arriba):

```ts
import { tieneJugadaLegal } from './engine'; // añadir al import existente

describe('tieneJugadaLegal', () => {
  it('tablero vacío → true para ambos jugadores', () => {
    const board = tableroVacio();
    expect(tieneJugadaLegal(board, 1)).toBe(true);
    expect(tieneJugadaLegal(board, 2)).toBe(true);
  });

  it('detecta ausencia de par vertical libre aunque queden pares horizontales', () => {
    // Ocupamos la fila 3 entera: ninguna casilla vacía tiene un vecino
    // vertical libre que cruce esa fila... construimos algo más directo:
    // llenamos las filas pares (0,2,4,6) enteras. Así toda casilla vacía
    // está en una fila impar y su vecino de arriba/abajo (fila par) está
    // ocupado → sin dominó vertical posible. Pero dentro de cada fila impar
    // quedan pares horizontales.
    const board = tableroVacio();
    for (let fila = 0; fila < TAMANO; fila += 2) {
      for (let col = 0; col < TAMANO; col++) board[idx(fila, col)] = 1;
    }
    expect(tieneJugadaLegal(board, 1)).toBe(false);
    expect(tieneJugadaLegal(board, 2)).toBe(true);
  });
});

describe('playMove — fin de partida', () => {
  it('gana el jugador que coloca el último dominó (rival sin colocación legal)', () => {
    // Tablero donde el jugador 2 (horizontal) NO tiene ningún par horizontal
    // libre, salvo por dos casillas que el jugador 1 va a tapar con un
    // vertical. Construcción: llenamos las columnas impares (1,3,5,7)
    // enteras → cada casilla vacía está en columna par y su vecino derecho
    // (columna impar) está ocupado → el jugador 2 no puede colocar nada.
    // Dejamos además libres (0,0) y (1,0) para que el jugador 1 juegue ahí.
    const board: CellValue[] = tableroVacio();
    for (let col = 1; col < TAMANO; col += 2) {
      for (let fila = 0; fila < TAMANO; fila++) board[idx(fila, col)] = 1;
    }
    // (0,0) y (1,0) ya están vacías (columna 0 es par). El jugador 2 no
    // tiene ningún par horizontal en ninguna parte.
    expect(tieneJugadaLegal(board, 2)).toBe(false);

    const state: DomineeringState = {
      board,
      currentPlayer: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const resultado = playMove(state, { a: idx(0, 0), b: idx(1, 0) });
    expect(resultado.status).toBe('won');
    expect(resultado.winner).toBe(1);
    expect(resultado.currentPlayer).toBe(1); // no alterna al ganar
    expect(resultado.lastMove).toEqual({ a: idx(0, 0), b: idx(1, 0) });
  });

  it('mientras el rival tenga una colocación legal, la partida sigue y el turno alterna', () => {
    const state = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(2);
  });

  it('no permite más jugadas tras ganar', () => {
    const board: CellValue[] = tableroVacio();
    for (let col = 1; col < TAMANO; col += 2) {
      for (let fila = 0; fila < TAMANO; fila++) board[idx(fila, col)] = 1;
    }
    const ganado = playMove(
      { board, currentPlayer: 1, status: 'playing', winner: null, lastMove: null },
      { a: idx(0, 0), b: idx(1, 0) },
    );
    expect(ganado.status).toBe('won');
    expect(playMove(ganado, { a: idx(2, 0), b: idx(3, 0) })).toBe(ganado);
  });

  it('la primera jugada de la partida nunca termina el juego', () => {
    const state = playMove(createInitialState(), { a: idx(3, 3), b: idx(4, 3) });
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/domineering/engine.test.ts`
Expected: FAIL — `tieneJugadaLegal` no existe y los casos de "won" fallan (hoy `playMove` siempre deja `'playing'`).

- [ ] **Step 3: Implementar la detección de fin**

En `src/games/domineering/engine.ts`, añade `tieneJugadaLegal` (antes de `playMove`) y reemplaza el `return` final de `playMove`:

```ts
export function tieneJugadaLegal(board: CellValue[], player: Player): boolean {
  const vertical = orientacionDe(player) === 'vertical';
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] !== null) continue;
    const fila = Math.floor(i / TAMANO);
    const col = i % TAMANO;
    if (vertical) {
      if (fila < TAMANO - 1 && board[i + TAMANO] === null) return true;
    } else {
      if (col < TAMANO - 1 && board[i + 1] === null) return true;
    }
  }
  return false;
}
```

```ts
// dentro de playMove, sustituyendo el return final:
  const siguiente: Player = state.currentPlayer === 1 ? 2 : 1;

  if (!tieneJugadaLegal(board, siguiente)) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      lastMove: { a, b },
    };
  }

  return {
    board,
    currentPlayer: siguiente,
    status: 'playing',
    winner: null,
    lastMove: { a, b },
  };
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/domineering/engine.test.ts`
Expected: PASS (todos, incluidos los de Task 1).

- [ ] **Step 5: Fuzzing de invariantes (verificación adicional, no queda como test permanente si es lento)**

Añade temporalmente este test, córrelo, y si pasa **déjalo** (es rápido: 2000 partidas ≈ <1s):

```ts
import {
  createInitialState as _cis,
  playMove as _pm,
  dominosLegalesEn as _dle,
  tieneJugadaLegal as _tjl,
  TAMANO as _T,
} from './engine';

describe('fuzzing — invariantes sobre partidas aleatorias completas', () => {
  it('2000 partidas: sin solapes, gana quien hizo la última jugada, el perdedor no tenía jugada', () => {
    for (let partida = 0; partida < 2000; partida++) {
      let s = _cis();
      let jugadas = 0;
      while (s.status === 'playing' && jugadas < 64) {
        // enumerar todos los dominós legales del jugador en turno
        const legales: { a: number; b: number }[] = [];
        for (let i = 0; i < _T * _T; i++) {
          for (const m of _dle(s.board, s.currentPlayer, i)) {
            if (m.a === i) legales.push(m); // dedupe: solo desde la cabeza
          }
        }
        expect(legales.length).toBeGreaterThan(0); // si status==='playing' debe haber jugada
        const m = legales[Math.floor(Math.random() * legales.length)];
        const antes = s;
        s = _pm(s, m);
        expect(s).not.toBe(antes); // la jugada elegida era legal
        jugadas++;
      }
      expect(s.status).toBe('won');
      const perdedor = s.winner === 1 ? 2 : 1;
      expect(_tjl(s.board, perdedor)).toBe(false);
      // sin solapes: cada casilla ocupada pertenece a exactamente un color válido
      expect(s.board.every(c => c === null || c === 1 || c === 2)).toBe(true);
    }
  });
});
```

Run: `npx vitest run src/games/domineering/engine.test.ts`
Expected: PASS.

- [ ] **Step 6: Correr toda la suite**

Run: `npm test`
Expected: PASS — sin regresiones en los otros juegos.

- [ ] **Step 7: Commit**

```bash
git add src/games/domineering/engine.ts src/games/domineering/engine.test.ts
git commit -m "feat(domineering): detección de fin — rival sin colocación legal"
```

---

## Task 3: Tablero, contenido y registro del juego

Pinta el tablero 8×8, dibuja los dominós como píldoras que abarcan 2 celdas, implementa el flujo de dos toques (ancla → fantasma), conecta al motor y registra el juego para que aparezca en el índice y sea jugable (local y remoto). Incluye la ficha de contenido y la actualización del backlog.

**Files:**
- Create: `src/games/domineering/Board.astro`
- Create: `src/content/juegos/domineering.md`
- Modify: `src/pages/juegos/[slug].astro` (añadir import + entrada en `BOARDS`)
- Modify: `abstract-games-by-category/GAME-INDEX.md` (marcar ✅)

**Interfaces:**
- Consumes (de Task 1/2): `createInitialState`, `esJugadaValida`, `orientacionDe`, `dominosLegalesEn`, `dominosEnTablero`, `playMove`, `type DomineeringState`, `type Move`, `TAMANO` de `./engine`.
- Consumes (del repo): `iniciarSesionJuego<TMovimiento>` de `../../lib/gameSession` (config: `validarMovimiento`, `onMovimientoRemoto`, `onAplicarReinicio`, `onRender`, `onDesconectar`; devuelve `esMiTurno`, `enviarMovimiento`, `mostrarTurno`, `mostrarFinDeJuego`, `nombres`). `TableroJuego` de `../../components/TableroJuego.astro`. `mostrarTurno` acepta `{ jugador, simbolos?: Record<Player, string> }` (confirmado en `src/lib/gameSession.ts` y `src/games/obstruccion/Board.astro`).
- Produces: `domineering` como slug jugable.

- [ ] **Step 1: Crear la ficha de contenido**

Guardar en `src/content/juegos/domineering.md`:

```markdown
---
title: "Domineering"
description: "Coloca dominós y bloquea al rival: pierde quien no puede colocar."
icono: "🁢"
minJugadores: 2
maxJugadores: 2
---

1. El tablero es de 8×8 casillas.
2. Cada jugador coloca dominós de una sola orientación: el Jugador 1 los coloca **verticales** (dos casillas en columna) y el Jugador 2 los coloca **horizontales** (dos casillas en fila).
3. En tu turno, toca una casilla vacía; si hay más de una posición posible, toca la sombra del dominó que quieres colocar.
4. No puedes colocar sobre casillas ocupadas ni salir del tablero.
5. Pierde el primero que, en su turno, no pueda colocar ningún dominó de su orientación. Gana el otro. Nunca hay empate.
```

> Nota para quien implementa: si `🁢` no renderiza como una ficha de dominó en el índice (algunos sistemas lo muestran como caja vacía), sustitúyelo por `"▦"` o `"⬛"`. Verifícalo en el Step 2.

- [ ] **Step 2: Verificar que el juego aparece en el índice**

Run: `npm run dev` y abrir `http://localhost:4321/`.
Expected: aparece la tarjeta "Domineering" con su ícono. Al entrar, la ruta `/juegos/domineering` carga (mostrará el modal de instrucciones; el tablero aún no pinta nada — falta el `Board.astro`). Detener el dev server.

- [ ] **Step 3: Crear `Board.astro`**

Guardar en `src/games/domineering/Board.astro`:

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';

const TAMANO = 8;
const casillas = Array.from({ length: TAMANO * TAMANO }, (_, i) => i);
---

<TableroJuego class="tablero-domineering">
  <div class="tablero-wrap">
    <div
      id="tablero"
      class="tablero"
      role="grid"
      aria-label="Tablero de Domineering, 8 por 8"
    >
      {casillas.map(i => (
        <button
          type="button"
          class="casilla"
          data-indice={i}
          aria-label={`Fila ${Math.floor(i / TAMANO) + 1}, columna ${(i % TAMANO) + 1}`}
        />
      ))}
    </div>
    <div id="capa-dominos" class="capa-dominos"></div>
  </div>
</TableroJuego>

<style>
  .tablero-wrap {
    position: relative;
    width: min(96vw, 34rem);
    margin: 0 auto;
  }

  .tablero,
  .capa-dominos {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(8, 1fr);
    gap: 0.2rem;
    aspect-ratio: 1;
  }

  .tablero {
    touch-action: manipulation;
  }

  .capa-dominos {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .casilla {
    aspect-ratio: 1;
    background: var(--color-surface);
    border: 2px solid #ddd;
    border-radius: 6px;
    padding: 0;
  }

  .casilla:disabled {
    cursor: default;
  }

  .casilla--ultima {
    box-shadow: inset 0 0 0 3px var(--color-accent);
  }

  .casilla--ancla {
    border-color: var(--color-accent);
  }

  .domino {
    margin: 3px;
    border: none;
    border-radius: 8px;
    padding: 0;
    background: currentColor;
  }

  .domino[data-jugador='1'] {
    color: var(--color-player-1);
  }

  .domino[data-jugador='2'] {
    color: var(--color-player-2);
  }

  .domino--fantasma {
    pointer-events: auto;
    cursor: pointer;
    opacity: 0.35;
  }

  .domino--fantasma:hover,
  .domino--fantasma:focus-visible {
    opacity: 0.6;
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
</style>

<script>
  import {
    createInitialState,
    esJugadaValida,
    dominosLegalesEn,
    dominosEnTablero,
    playMove,
    TAMANO,
    type DomineeringState,
    type Move,
  } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const ORIENTACION_SIMBOLO = { 1: '▌', 2: '▬' } as const;

  const tablero = document.getElementById('tablero')!;
  const capaDominos = document.getElementById('capa-dominos')!;
  const casillas = Array.from(
    tablero.querySelectorAll<HTMLButtonElement>('.casilla'),
  );

  let state: DomineeringState = createInitialState();
  let ancla: number | null = null;
  let fantasmas: Move[] = [];

  const sesion = iniciarSesionJuego<Move>({
    validarMovimiento: esJugadaValida,
    onMovimientoRemoto: move => jugar(move, false),
    onAplicarReinicio: () => {
      state = createInitialState();
      limpiarSeleccion();
      render();
    },
    onRender: render,
    onDesconectar: () => {
      limpiarSeleccion();
      casillas.forEach(c => (c.disabled = true));
      render();
    },
  });

  function limpiarSeleccion(): void {
    ancla = null;
    fantasmas = [];
  }

  function posicionarEnGrid(el: HTMLElement, move: Move): void {
    const fila = Math.floor(move.a / TAMANO) + 1;
    const col = (move.a % TAMANO) + 1;
    const esVertical = move.b - move.a === TAMANO;
    el.style.gridColumn = esVertical ? `${col}` : `${col} / span 2`;
    el.style.gridRow = esVertical ? `${fila} / span 2` : `${fila}`;
  }

  function render(): void {
    const esMiTurno =
      sesion.esMiTurno(state.currentPlayer) && state.status === 'playing';
    const hayAncla = ancla !== null;

    casillas.forEach((casilla, i) => {
      const ocupada = state.board[i] !== null;
      casilla.classList.toggle(
        'casilla--ultima',
        state.lastMove !== null &&
          (state.lastMove.a === i || state.lastMove.b === i),
      );
      casilla.classList.toggle('casilla--ancla', ancla === i);
      // Con un ancla activa solo el propio ancla (para cancelar) sigue activo;
      // el resto de la interacción pasa por los fantasmas.
      casilla.disabled =
        ocupada || !esMiTurno || (hayAncla && ancla !== i);
    });

    capaDominos.replaceChildren();

    for (const domino of dominosEnTablero(state.board)) {
      const jugador = state.board[domino.a]!;
      const el = document.createElement('div');
      el.className = 'domino';
      el.dataset.jugador = String(jugador);
      el.setAttribute('aria-hidden', 'true');
      posicionarEnGrid(el, domino);
      capaDominos.appendChild(el);
    }

    for (const fantasma of fantasmas) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'domino domino--fantasma';
      el.dataset.jugador = String(state.currentPlayer);
      el.setAttribute(
        'aria-label',
        `Colocar dominó en fila ${Math.floor(fantasma.a / TAMANO) + 1}, columna ${(fantasma.a % TAMANO) + 1}`,
      );
      posicionarEnGrid(el, fantasma);
      el.addEventListener('click', () => jugar(fantasma));
      capaDominos.appendChild(el);
    }

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
  }

  function seleccionarAncla(i: number): void {
    if (state.status !== 'playing' || !sesion.esMiTurno(state.currentPlayer)) return;
    if (state.board[i] !== null) return;
    const opciones = dominosLegalesEn(state.board, state.currentPlayer, i);
    if (opciones.length === 0) {
      limpiarSeleccion();
      render();
      return;
    }
    if (opciones.length === 1) {
      jugar(opciones[0]);
      return;
    }
    ancla = i;
    fantasmas = opciones;
    render();
    capaDominos.querySelector<HTMLButtonElement>('.domino--fantasma')?.focus();
  }

  function jugar(move: Move, emitirRemoto = true): void {
    if (state.status !== 'playing' || !sesion.esMiTurno(state.currentPlayer)) return;
    const prev = state;
    state = playMove(state, move);
    if (state === prev) return;
    limpiarSeleccion();
    render();
    if (emitirRemoto) sesion.enviarMovimiento(move);
  }

  casillas.forEach(casilla => {
    casilla.addEventListener('click', () => {
      const i = Number(casilla.dataset.indice);
      if (ancla === i) {
        limpiarSeleccion();
        render();
        return;
      }
      seleccionarAncla(i);
    });
  });

  // Navegación con flechas entre casillas (roving focus).
  tablero.addEventListener('keydown', e => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('casilla')) return;
    const i = Number((target as HTMLButtonElement).dataset.indice);
    const fila = Math.floor(i / TAMANO);
    const col = i % TAMANO;
    let destino: number | null = null;
    if (e.key === 'ArrowUp' && fila > 0) destino = i - TAMANO;
    else if (e.key === 'ArrowDown' && fila < TAMANO - 1) destino = i + TAMANO;
    else if (e.key === 'ArrowLeft' && col > 0) destino = i - 1;
    else if (e.key === 'ArrowRight' && col < TAMANO - 1) destino = i + 1;
    if (destino !== null) {
      e.preventDefault();
      casillas[destino].focus();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ancla !== null) {
      const anclaPrev = ancla;
      limpiarSeleccion();
      render();
      casillas[anclaPrev]?.focus();
    }
  });

  render();
</script>
```

> Nota para quien implementa: `state.board` es un array de `CellValue` (`Player | null`); `dominosEnTablero` y `dominosLegalesEn` reciben ese array directamente. `esJugadaValida` es el type guard de `Move` — se pasa tal cual a `validarMovimiento` (mismo patrón que `esEdgeValido` en `src/games/sim/Board.astro`).

- [ ] **Step 4: Registrar el board en `[slug].astro`**

En `src/pages/juegos/[slug].astro`:

1. Añadir el import junto a los otros (después de `import SimBoard from '../../games/sim/Board.astro';`):

```astro
import DomineeringBoard from '../../games/domineering/Board.astro';
```

2. Añadir la entrada al objeto `BOARDS` (después de `sim: SimBoard,`):

```astro
  domineering: DomineeringBoard,
```

- [ ] **Step 5: Actualizar el backlog**

En `abstract-games-by-category/GAME-INDEX.md`, en la fila `[15-domineering.md](01-2-players/15-domineering.md)`, poner `✅` en la columna Estado (misma forma que las filas ya marcadas).

- [ ] **Step 6: Verificar build y tipos**

Run: `npx astro check`
Expected: sin errores.

Run: `npm run build`
Expected: build limpio; la ruta `/juegos/domineering` aparece en la salida.

- [ ] **Step 7: Playtest manual (local)**

Run: `npm run dev`, abrir `http://localhost:4321/juegos/domineering`, cerrar el modal de instrucciones, elegir modo local.
Verificar:
- El tablero 8×8 cabe sin scroll horizontal en escritorio y en viewport móvil (DevTools, ~375px).
- El indicador de turno muestra el nombre y el ícono de orientación: `▌` para el Jugador 1, `▬` para el Jugador 2.
- Turno del Jugador 1: al tocar una casilla del centro aparecen **dos** sombras verticales (arriba y abajo); tocar una la coloca como píldora vertical del color del asiento 1.
- Al tocar una casilla del borde superior/inferior (una sola posición posible), el dominó se coloca **directo** sin segundo toque.
- Turno del Jugador 2: las sombras son horizontales; la píldora colocada abarca 2 columnas.
- Tocar la casilla-ancla otra vez, o pulsar Escape, cancela la selección.
- La última jugada resalta con el anillo en sus **dos** casillas; el resalte se mueve con cada jugada.
- Cuando el jugador en turno no puede colocar ningún dominó, aparece el banner "🎉 ¡Ganó …!" con el nombre del rival y el detalle "… no puede colocar más dominós".
- "Jugar de nuevo" reinicia el tablero.
- Navegación con Tab + flechas mueve el foco por las casillas; Enter sobre una casilla actúa como el toque.
- Consola sin errores.
Detener el dev server.

- [ ] **Step 8: Correr toda la suite y el check final**

```bash
npm test
npx astro check
npm run build
```
Expected: los tres en verde.

- [ ] **Step 9: Commit**

```bash
git add src/games/domineering/Board.astro src/content/juegos/domineering.md src/pages/juegos/\[slug\].astro abstract-games-by-category/GAME-INDEX.md
git commit -m "feat(domineering): tablero, contenido y registro del juego"
```

---

## Integración final

Tras la Task 3, con `npm test`, `npx astro check` y `npm run build` en verde:

- [ ] Abrir PR de la rama contra `main` (como los 11 juegos anteriores). En el cuerpo del PR, anotar como seguimiento no bloqueante:
  - **Modo remoto no probado en navegador** (el `astro dev` no sirve el Worker de señalización) — hacer playtest de 2 navegadores contra el Worker desplegado, igual que Notakto / Obstrucción / Sim.
  - Menores site-wide ya conocidos: `role="grid"` sin `row`/`gridcell`; `aria-label` de casilla estático que no refleja ocupación; los `div.domino` colocados llevan `aria-hidden` (la ocupación no se anuncia a lectores de pantalla); blancos de tap ~42px a 375px (tradeoff aceptado en el spec).

---

## Self-Review (hecho al escribir el plan)

**Cobertura del spec:**
- Tablero 8×8 fijo, fila-mayor → Global Constraints + `TAMANO = 8` (Task 1) + `domineering.md` (Task 3).
- Roles fijos (J1 vertical / J2 horizontal), `orientacionDe` → Task 1 (`orientacionDe` + tests) + `esFormaLegal` en `playMove`.
- Interacción de dos toques (ancla → fantasma), atajo de 1 opción → coloca directo → Task 3 (`seleccionarAncla`) + Step 7.
- `dominosLegalesEn` (1–2 posiciones que incluyen el ancla, normalizadas) → Task 1 + tests de centro/borde/vecino ocupado/ancla ocupada.
- Sin sombreado de casillas muertas → Task 3 no lo implementa (comentario explícito en `render`).
- Fichas = píldora 1×2 en color de asiento; fantasma mismo color con opacidad baja → Task 3 (`.domino`, `.domino--fantasma`, `posicionarEnGrid`, `dominosEnTablero`).
- Indicador de turno con ícono de orientación vía `simbolos` → Task 3 (`ORIENTACION_SIMBOLO`, `mostrarTurno`). `turnIndicator.ts` sin tocar.
- Fin de partida = rival sin colocación legal; gana quien jugó; sin empate; `currentPlayer` sin alternar → Task 2 (`tieneJugadaLegal` + branch `won` + tests).
- Payload remoto `{ a, b }`, validado por `esJugadaValida`, normalizado a `a < b` → Task 1 (`esJugadaValida`, normalización en `playMove`) + Task 3 (`iniciarSesionJuego<Move>`).
- Motor inmutable, devuelve `state` ante entrada inválida (orientación, fuera de tablero, casilla ocupada, tras `won`, payload inválido) → Task 1 y Task 2 (tests).
- Teclado: flechas mueven foco, Enter actúa, Escape cancela → Task 3 (handlers de `keydown`) + Step 7.
- Contenido, registro estático en `[slug].astro`, backlog `GAME-INDEX.md` ✅ → Task 3 Steps 1, 4, 5.
- Fuzzing de invariantes → Task 2 Step 5.
- Fuera de alcance (Cram, misère, tamaños configurables, marcador, ayudas tácticas, historial/undo, cambios a `<TableroJuego>`) → sin tasks; anotado en el spec.

**Escaneo de placeholders:** sin "TBD"/"TODO"/"handle edge cases". Las dos notas abiertas llevan instrucción concreta: (1) el emoji `icono` con fallback verificable en el Step 2; (2) la firma de `mostrarTurno` con referencia exacta a `obstruccion/Board.astro` y `gameSession.ts`.

**Consistencia de tipos:** `DomineeringState`, `Player`, `CellValue`, `Move`, `GameStatus`, `createInitialState`, `esJugadaValida`, `orientacionDe`, `dominosLegalesEn`, `dominosEnTablero`, `tieneJugadaLegal`, `playMove`, `TAMANO` usados con la misma firma en las 3 tasks. `Move` siempre `{ a, b }` con `a < b` tras el motor. `dominosLegalesEn(board, player, ancla)` y `dominosEnTablero(board)` consumidas en Task 3 con esas firmas. `iniciarSesionJuego<Move>` y su config coinciden con `src/lib/gameSession.ts` y con `src/games/sim/Board.astro`. `status` es `'playing' | 'won'` (sin `'draw'`) en todo el plan.
