# Estampida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir Estampida (tablero 8×8, cada jugador coloca 5 fichas y luego, por turnos, elige una dirección cardinal para duplicar de golpe todas sus fichas con vecina vacía; gana quien ocupa más casillas) como 13.º juego del sitio, jugable en local y en modo remoto.

**Architecture:** Motor puro (`src/games/estampida/engine.ts`) sin DOM, testeado con Vitest, más un `Board.astro` que conecta los taps al motor vía `iniciarSesionJuego`. El estado lleva una `fase` (`setup` → `playing` → `finished`); el movimiento es una unión discriminada `{tipo:'colocar',celda} | {tipo:'estampida',dir}` y un único `playMove` despacha según la fase. Las copias de un turno se calculan desde un snapshot único del tablero (sin encadenar). Se reutiliza todo el "chrome" compartido (indicador de turno con `puntajes`/`detalle`/`simbolos`, banner, identidad de jugadores, protocolo remoto) — no se añade Worker ni mensajes nuevos.

**Tech Stack:** Astro 7 (sin framework de UI), TypeScript estricto, Vitest, npm.

**Spec:** `docs/superpowers/specs/2026-08-31-estampida-design.md`

## Global Constraints

- Tablero **8×8** (64 casillas), orden fila-mayor en un array plano. No configurable. `export const TAMANO = 8`.
- **5 fichas por jugador** en la fase de preparación. `export const FICHAS_POR_JUGADOR = 5`.
- Fichas por asiento: Jugador 1 = `●`, Jugador 2 = `▲` (vía la opción `simbolos` de `mostrarTurno`). **No se toca `turnIndicator.ts`.**
- **Fase `setup`:** colocación alternada de a una ficha en cualquier casilla vacía, empezando el Jugador 1. Al llegar **ambos** a 5, la fase pasa a `playing` con el turno en el Jugador 1.
- **Fase `playing`:** el jugador elige una `Direccion` (`'arriba' | 'abajo' | 'izquierda' | 'derecha'`). Cada ficha propia con la casilla contigua en esa dirección **vacía en el snapshot previo al turno** recibe una copia. Todas las copias se colocan a la vez; una casilla llenada este turno no genera más copias este turno. Sin envolvimiento de borde; cualquier casilla ocupada (propia o del rival) bloquea.
- **Fin de turno:** el turno pasa al rival, **salvo** que el rival no tenga ningún movimiento posible en ninguna de las 4 direcciones — entonces se le salta y repite el jugador actual. Si el tablero está lleno (o, defensivamente, ninguno de los dos puede mover) → `fase: 'finished'`.
- **Ganador:** jugador con más casillas ocupadas; `winner: null` si empatan. Primer juego del sitio con empate posible — `mostrarFinDeJuego` acepta un `titulo` arbitrario, no hay que tocar `gameSession`/`winnerBanner`.
- **"Jugar de nuevo"** reinicia a `fase: 'setup'`, tablero vacío, turno del Jugador 1.
- Payload del movimiento remoto = la unión `Move`. `esJugadaValida` valida la forma (`tipo`, `celda` entera en `[0,64)`, `dir` en las 4 válidas), no la legalidad contra el estado.
- Motor inmutable: ante entrada inválida para la fase actual, `playMove` devuelve **el mismo objeto** `state` que recibió (referencia igual, para que el Board detecte el rechazo y no lo emita).
- Sin variantes: no 10×10, no 8 fichas, no misère, no >2 jugadores, sin restricciones de colocación en el setup, sin animación de deslizamiento, sin indicador de la dirección del último turno.
- Solo español en todo el texto visible.
- `engine.ts` no importa nada del DOM ni de Astro.
- Patrón de registro: `import` **estático** del `Board.astro` en `src/pages/juegos/[slug].astro` (nunca `import()` dinámico con el slug como variable — rompe el build de Astro).
- TDD: primero el test que falla, luego el mínimo código para pasarlo. Commits frecuentes.

---

## Preparación (antes de la Task 1)

El plan asume un worktree/branch aislado creado con la skill `superpowers:using-git-worktrees`, basado en **`origin/main`**. Nombre sugerido del worktree: `estampida`. Todos los `git commit` de abajo ocurren en esa rama; la integración final es un PR contra `main`, como los 12 juegos anteriores.

Verifica el punto de partida:

```bash
npm test        # la suite actual debe pasar en verde
```

---

## Task 1: Motor — tipos, estado inicial, validación y geometría de copias

Define los tipos, el estado inicial en fase `setup`, el type guard del payload remoto y las tres funciones puras de geometría/conteo que la fase de juego y el Board necesitan: qué casillas se copian en una dirección, si un jugador tiene algún movimiento, y el conteo de casillas por jugador. **No** incluye `playMove` todavía.

**Files:**
- Create: `src/games/estampida/engine.ts`
- Test: `src/games/estampida/engine.test.ts`

**Interfaces:**
- Consumes: nada (primera task).
- Produces:
  - `type Player = 1 | 2`
  - `type Cell = Player | null`
  - `type Direccion = 'arriba' | 'abajo' | 'izquierda' | 'derecha'`
  - `type Fase = 'setup' | 'playing' | 'finished'`
  - `type Move = { tipo: 'colocar'; celda: number } | { tipo: 'estampida'; dir: Direccion }`
  - `interface EstampidaState { board: Cell[]; fase: Fase; currentPlayer: Player; colocadas: Record<Player, number>; winner: Player | null; ultimasCopias: number[]; ultimaDireccion: Direccion | null }`
  - `const TAMANO = 8` (export)
  - `const FICHAS_POR_JUGADOR = 5` (export)
  - `function createInitialState(): EstampidaState`
  - `function esJugadaValida(payload: unknown): payload is Move`
  - `function celdasQueCopian(board: Cell[], player: Player, dir: Direccion): number[]`
  - `function hayMovimientoPosible(board: Cell[], player: Player): boolean`
  - `function contar(board: Cell[]): Record<Player, number>`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/games/estampida/engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  celdasQueCopian,
  hayMovimientoPosible,
  contar,
  TAMANO,
  FICHAS_POR_JUGADOR,
  type Cell,
  type Direccion,
} from './engine';

// Helpers compartidos por todas las tasks.
const idx = (fila: number, col: number) => fila * TAMANO + col;
const tableroVacio = (): Cell[] => Array<Cell>(TAMANO * TAMANO).fill(null);

describe('createInitialState', () => {
  it('crea un tablero vacío de 64 casillas en fase setup, turno del jugador 1', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(64);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.fase).toBe('setup');
    expect(s.currentPlayer).toBe(1);
    expect(s.colocadas).toEqual({ 1: 0, 2: 0 });
    expect(s.winner).toBeNull();
    expect(s.ultimasCopias).toEqual([]);
    expect(s.ultimaDireccion).toBeNull();
  });

  it('FICHAS_POR_JUGADOR es 5 y TAMANO es 8', () => {
    expect(FICHAS_POR_JUGADOR).toBe(5);
    expect(TAMANO).toBe(8);
  });
});

describe('esJugadaValida', () => {
  it('acepta colocar con celda entera en [0, 64)', () => {
    expect(esJugadaValida({ tipo: 'colocar', celda: 0 })).toBe(true);
    expect(esJugadaValida({ tipo: 'colocar', celda: 63 })).toBe(true);
  });

  it('acepta estampida con cualquiera de las 4 direcciones', () => {
    for (const dir of ['arriba', 'abajo', 'izquierda', 'derecha']) {
      expect(esJugadaValida({ tipo: 'estampida', dir })).toBe(true);
    }
  });

  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar' })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: -1 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: 64 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: 1.5 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: '3' })).toBe(false);
    expect(esJugadaValida({ tipo: 'estampida' })).toBe(false);
    expect(esJugadaValida({ tipo: 'estampida', dir: 'diagonal' })).toBe(false);
    expect(esJugadaValida({ tipo: 'otro', celda: 3 })).toBe(false);
  });
});

describe('celdasQueCopian', () => {
  it('una ficha con la casilla derecha libre → esa casilla', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 1)]);
  });

  it('no hay envolvimiento de borde: ficha en la columna 7, dirección derecha → []', () => {
    const board = tableroVacio();
    board[idx(0, 7)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([]);
  });

  it('no hay envolvimiento de borde: ficha en la columna 0, dirección izquierda → []', () => {
    const board = tableroVacio();
    board[idx(3, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'izquierda')).toEqual([]);
  });

  it('una casilla ocupada por el rival bloquea la copia', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(0, 1)] = 2;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([]);
  });

  it('una casilla ocupada propia bloquea, pero la ficha de más allá sí copia (snapshot)', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(0, 1)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 2)]);
  });

  it('varias fichas copian simultáneamente en una dirección', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(2, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 1), idx(2, 1)]);
  });

  it('solo considera las fichas del jugador indicado', () => {
    const board = tableroVacio();
    board[idx(4, 4)] = 2;
    expect(celdasQueCopian(board, 1, 'abajo')).toEqual([]);
    expect(celdasQueCopian(board, 2, 'abajo')).toEqual([idx(5, 4)]);
  });
});

describe('hayMovimientoPosible', () => {
  it('una ficha suelta en el centro → true', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    expect(hayMovimientoPosible(board, 1)).toBe(true);
  });

  it('sin fichas del jugador → false', () => {
    expect(hayMovimientoPosible(tableroVacio(), 1)).toBe(false);
  });

  it('una ficha con las 4 casillas contiguas ocupadas → false', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    board[idx(2, 3)] = 2;
    board[idx(4, 3)] = 2;
    board[idx(3, 2)] = 2;
    board[idx(3, 4)] = 2;
    expect(hayMovimientoPosible(board, 1)).toBe(false);
  });
});

describe('contar', () => {
  it('cuenta las casillas de cada jugador', () => {
    const board = tableroVacio();
    board[0] = 1;
    board[1] = 1;
    board[2] = 2;
    expect(contar(board)).toEqual({ 1: 2, 2: 1 });
  });

  it('tablero vacío → { 1: 0, 2: 0 }', () => {
    expect(contar(tableroVacio())).toEqual({ 1: 0, 2: 0 });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/estampida/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Implementar el motor mínimo**

```ts
// src/games/estampida/engine.ts
export type Player = 1 | 2;
export type Cell = Player | null;
export type Direccion = 'arriba' | 'abajo' | 'izquierda' | 'derecha';
export type Fase = 'setup' | 'playing' | 'finished';

export type Move =
  | { tipo: 'colocar'; celda: number }
  | { tipo: 'estampida'; dir: Direccion };

export interface EstampidaState {
  board: Cell[];
  fase: Fase;
  currentPlayer: Player;
  colocadas: Record<Player, number>;
  winner: Player | null;
  ultimasCopias: number[];
  ultimaDireccion: Direccion | null;
}

export const TAMANO = 8;
export const FICHAS_POR_JUGADOR = 5;
const TOTAL = TAMANO * TAMANO;

const DIRECCIONES: Direccion[] = ['arriba', 'abajo', 'izquierda', 'derecha'];

export function createInitialState(): EstampidaState {
  return {
    board: Array<Cell>(TOTAL).fill(null),
    fase: 'setup',
    currentPlayer: 1,
    colocadas: { 1: 0, 2: 0 },
    winner: null,
    ultimasCopias: [],
    ultimaDireccion: null,
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (p.tipo === 'colocar') {
    return (
      typeof p.celda === 'number' &&
      Number.isInteger(p.celda) &&
      p.celda >= 0 &&
      p.celda < TOTAL
    );
  }
  if (p.tipo === 'estampida') {
    return (
      typeof p.dir === 'string' &&
      (DIRECCIONES as string[]).includes(p.dir)
    );
  }
  return false;
}

/**
 * Índice de la casilla contigua a `celda` en la dirección `dir`, o `null` si
 * `celda` está en el borde correspondiente (sin envolvimiento).
 */
function destinoEnDireccion(celda: number, dir: Direccion): number | null {
  const fila = Math.floor(celda / TAMANO);
  const col = celda % TAMANO;
  if (dir === 'arriba') return fila > 0 ? celda - TAMANO : null;
  if (dir === 'abajo') return fila < TAMANO - 1 ? celda + TAMANO : null;
  if (dir === 'izquierda') return col > 0 ? celda - 1 : null;
  return col < TAMANO - 1 ? celda + 1 : null; // 'derecha'
}

/**
 * Casillas destino que recibirían una copia de `player` si estampidara en
 * `dir`, calculadas desde un snapshot único de `board`: cada ficha de
 * `player` cuya casilla contigua en `dir` esté dentro del tablero y vacía.
 * En orden ascendente de índice de fuente.
 */
export function celdasQueCopian(
  board: Cell[],
  player: Player,
  dir: Direccion,
): number[] {
  const objetivos: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] !== player) continue;
    const destino = destinoEnDireccion(i, dir);
    if (destino !== null && board[destino] === null) objetivos.push(destino);
  }
  return objetivos;
}

export function hayMovimientoPosible(board: Cell[], player: Player): boolean {
  return DIRECCIONES.some(
    dir => celdasQueCopian(board, player, dir).length > 0,
  );
}

export function contar(board: Cell[]): Record<Player, number> {
  let unos = 0;
  let doses = 0;
  for (const c of board) {
    if (c === 1) unos++;
    else if (c === 2) doses++;
  }
  return { 1: unos, 2: doses };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/estampida/engine.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/games/estampida/engine.ts src/games/estampida/engine.test.ts
git commit -m "feat(estampida): motor base — tipos, estado, validación y geometría de copias"
```

---

## Task 2: Motor — `playMove` fase `setup` y transición a `playing`

Añade `playMove`: en fase `setup` coloca la ficha del jugador en turno, incrementa su contador y alterna; al completar 5+5 pasa a `playing` con el turno del Jugador 1. Introduce el helper interno `cerrarTurno`, que decide turno o fin y ya se reutilizará en la Task 3.

**Files:**
- Modify: `src/games/estampida/engine.ts`
- Test: `src/games/estampida/engine.test.ts` (añadir casos)

**Interfaces:**
- Consumes (de Task 1): `EstampidaState`, `Player`, `Cell`, `Direccion`, `Move`, `createInitialState`, `esJugadaValida`, `hayMovimientoPosible`, `contar`, `TAMANO`, `FICHAS_POR_JUGADOR`, `TOTAL`/`DIRECCIONES` (constantes internas del módulo).
- Produces:
  - `function playMove(state: EstampidaState, move: Move): EstampidaState` — en esta task solo procesa `move.tipo === 'colocar'` y la transición. Ante cualquier otra entrada para la fase actual, devuelve el mismo `state`.
  - Helper interno (no exportado) `cerrarTurno(board, colocadas, ultimasCopias, ultimaDireccion, candidatoTurno): EstampidaState`.

- [ ] **Step 1: Escribir los tests que fallan**

Añade `playMove` al `import` de valores y `EstampidaState` al `import` de tipos, y este bloque al final de `engine.test.ts`:

```ts
import { playMove, type EstampidaState } from './engine'; // fusiónalo con el import existente

// Coloca 5 fichas de cada jugador (alternando J1, J2) en las casillas dadas
// y devuelve el estado resultante (fase 'playing').
function correrSetup(celdas1: number[], celdas2: number[]): EstampidaState {
  let s = createInitialState();
  for (let k = 0; k < FICHAS_POR_JUGADOR; k++) {
    s = playMove(s, { tipo: 'colocar', celda: celdas1[k] });
    s = playMove(s, { tipo: 'colocar', celda: celdas2[k] });
  }
  return s;
}

describe('playMove — fase setup', () => {
  it('coloca la ficha del jugador en turno, incrementa su contador y alterna', () => {
    const s = playMove(createInitialState(), { tipo: 'colocar', celda: idx(2, 3) });
    expect(s.board[idx(2, 3)]).toBe(1);
    expect(s.colocadas).toEqual({ 1: 1, 2: 0 });
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('setup');
    expect(s.ultimasCopias).toEqual([idx(2, 3)]);
    expect(s.ultimaDireccion).toBeNull();
  });

  it('rechaza colocar sobre una casilla ocupada (misma referencia)', () => {
    const s1 = playMove(createInitialState(), { tipo: 'colocar', celda: 10 });
    expect(playMove(s1, { tipo: 'colocar', celda: 10 })).toBe(s1);
  });

  it('rechaza una estampida durante el setup (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'estampida', dir: 'arriba' })).toBe(s);
  });

  it('rechaza payload inválido (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'colocar', celda: 99 } as never)).toBe(s);
    expect(playMove(s, 5 as never)).toBe(s);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState();
    const boardRef = s.board;
    playMove(s, { tipo: 'colocar', celda: 0 });
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(s.colocadas).toEqual({ 1: 0, 2: 0 });
  });

  it('al completar 5+5 pasa a fase playing con el turno del jugador 1', () => {
    const s = correrSetup(
      [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4)],
      [idx(7, 0), idx(7, 1), idx(7, 2), idx(7, 3), idx(7, 4)],
    );
    expect(s.fase).toBe('playing');
    expect(s.currentPlayer).toBe(1);
    expect(s.colocadas).toEqual({ 1: 5, 2: 5 });
    expect(contar(s.board)).toEqual({ 1: 5, 2: 5 });
    // la última colocación (5.ª de J2) queda resaltada
    expect(s.ultimasCopias).toEqual([idx(7, 4)]);
  });

  it('la 9.ª colocación (J1) todavía es fase setup', () => {
    let s = createInitialState();
    const c1 = [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4)];
    const c2 = [idx(7, 0), idx(7, 1), idx(7, 2), idx(7, 3)];
    for (let k = 0; k < 4; k++) {
      s = playMove(s, { tipo: 'colocar', celda: c1[k] });
      s = playMove(s, { tipo: 'colocar', celda: c2[k] });
    }
    s = playMove(s, { tipo: 'colocar', celda: c1[4] }); // 9.ª ficha, J1
    expect(s.fase).toBe('setup');
    expect(s.currentPlayer).toBe(2);
    expect(s.colocadas).toEqual({ 1: 5, 2: 4 });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/estampida/engine.test.ts`
Expected: FAIL — `playMove` no existe.

- [ ] **Step 3: Implementar `playMove` (setup) y `cerrarTurno`**

Añade al final de `src/games/estampida/engine.ts`:

```ts
/**
 * Decide el estado tras aplicar una jugada (o al arrancar la fase 'playing').
 * `candidatoTurno` es a quién le tocaría normalmente. Reglas:
 * - tablero lleno (o, defensivamente, ninguno puede mover) → 'finished' con
 *   `winner` por conteo de casillas (`null` si empatan);
 * - si `candidatoTurno` no puede mover pero el otro sí → se le salta;
 * - en otro caso → 'playing' con `currentPlayer = candidatoTurno`.
 */
function cerrarTurno(
  board: Cell[],
  colocadas: Record<Player, number>,
  ultimasCopias: number[],
  ultimaDireccion: Direccion | null,
  candidatoTurno: Player,
): EstampidaState {
  const otro: Player = candidatoTurno === 1 ? 2 : 1;
  const lleno = board.every(c => c !== null);
  const candidatoPuede = hayMovimientoPosible(board, candidatoTurno);
  const otroPuede = hayMovimientoPosible(board, otro);

  if (lleno || (!candidatoPuede && !otroPuede)) {
    const c = contar(board);
    const winner: Player | null = c[1] === c[2] ? null : c[1] > c[2] ? 1 : 2;
    return {
      board,
      fase: 'finished',
      currentPlayer: candidatoTurno,
      colocadas,
      winner,
      ultimasCopias,
      ultimaDireccion,
    };
  }

  return {
    board,
    fase: 'playing',
    currentPlayer: candidatoPuede ? candidatoTurno : otro,
    colocadas,
    winner: null,
    ultimasCopias,
    ultimaDireccion,
  };
}

export function playMove(state: EstampidaState, move: Move): EstampidaState {
  if (state.fase === 'finished') return state;
  if (!esJugadaValida(move)) return state;

  if (state.fase === 'setup') {
    if (move.tipo !== 'colocar') return state;
    if (state.board[move.celda] !== null) return state;

    const board = [...state.board];
    board[move.celda] = state.currentPlayer;
    const colocadas: Record<Player, number> = {
      1: state.colocadas[1] + (state.currentPlayer === 1 ? 1 : 0),
      2: state.colocadas[2] + (state.currentPlayer === 2 ? 1 : 0),
    };

    const completo =
      colocadas[1] >= FICHAS_POR_JUGADOR && colocadas[2] >= FICHAS_POR_JUGADOR;

    if (completo) {
      // Arranca 'playing'; el Jugador 1 mueve primero (regla de salto en
      // cerrarTurno cubre el caso degenerado de que ya no pudiera).
      return cerrarTurno(board, colocadas, [move.celda], null, 1);
    }

    return {
      board,
      fase: 'setup',
      currentPlayer: state.currentPlayer === 1 ? 2 : 1,
      colocadas,
      winner: null,
      ultimasCopias: [move.celda],
      ultimaDireccion: null,
    };
  }

  // state.fase === 'playing' — se completa en la Task 3.
  return state;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/estampida/engine.test.ts`
Expected: PASS (todos, incluidos los de Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/games/estampida/engine.ts src/games/estampida/engine.test.ts
git commit -m "feat(estampida): playMove fase setup y transición a playing"
```

---

## Task 3: Motor — fase `playing` (estampida), salto de jugador atascado, fin y fuzzing

Completa la rama `playing` de `playMove`: aplica la estampida desde un snapshot único, guarda `ultimasCopias`/`ultimaDireccion`, y llama a `cerrarTurno` con el rival como candidato. Añade un test de fuzzing sobre partidas completas.

**Files:**
- Modify: `src/games/estampida/engine.ts`
- Test: `src/games/estampida/engine.test.ts` (añadir casos)

**Interfaces:**
- Consumes (de Task 1/2): todo lo anterior más `cerrarTurno`, `celdasQueCopian`.
- Produces: `playMove` procesa `move.tipo === 'estampida'` en fase `playing`. API público sin cambios de firma.

- [ ] **Step 1: Escribir los tests que fallan**

Añade al final de `engine.test.ts`:

```ts
// Construye un estado en fase 'playing' con el tablero dado.
function estadoJuego(board: Cell[], currentPlayer: Player): EstampidaState {
  return {
    board,
    fase: 'playing',
    currentPlayer,
    colocadas: { 1: FICHAS_POR_JUGADOR, 2: FICHAS_POR_JUGADOR },
    winner: null,
    ultimasCopias: [],
    ultimaDireccion: null,
  };
}

describe('playMove — fase playing (estampida)', () => {
  it('duplica cada ficha con vecina vacía en la dirección elegida y pasa el turno', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    board[idx(5, 1)] = 1;
    board[idx(0, 0)] = 2; // el rival tiene movimiento (abajo/derecha)
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(s.board[idx(3, 4)]).toBe(1);
    expect(s.board[idx(5, 2)]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('playing');
    expect(s.ultimasCopias.sort((a, b) => a - b)).toEqual([idx(3, 4), idx(5, 2)]);
    expect(s.ultimaDireccion).toBe('derecha');
  });

  it('sin encadenar: una casilla llenada este turno no genera más copias', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(4, 4)] = 2;
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(s.board[idx(0, 1)]).toBe(1);
    expect(s.board[idx(0, 2)]).toBeNull();
    expect(s.ultimasCopias).toEqual([idx(0, 1)]);
  });

  it('rechaza una colocación durante la fase playing (misma referencia)', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    const s = estadoJuego(board, 1);
    expect(playMove(s, { tipo: 'colocar', celda: 5 })).toBe(s);
  });

  it('una dirección sin copias no cambia el tablero pero cede el turno', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1; // columna 0: 'izquierda' no copia nada
    board[idx(7, 7)] = 2; // el rival puede mover (arriba/izquierda)
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'izquierda' });
    expect(s.ultimasCopias).toEqual([]);
    expect(s.board[idx(0, 0)]).toBe(1);
    expect(contar(s.board)).toEqual({ 1: 1, 2: 1 });
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('playing');
  });

  it('salta al rival que no tiene ningún movimiento posible', () => {
    const board = tableroVacio();
    // Jugador 2 amurallado: su única ficha tiene las 4 vecinas ocupadas por J1.
    board[idx(3, 3)] = 2;
    board[idx(2, 3)] = 1;
    board[idx(4, 3)] = 1;
    board[idx(3, 2)] = 1;
    board[idx(3, 4)] = 1;
    // Jugador 1 además tiene una ficha libre para mover.
    board[idx(7, 0)] = 1;
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'arriba' });
    expect(s.board[idx(6, 0)]).toBe(1); // copió
    expect(s.currentPlayer).toBe(1);    // el rival (2) está atascado → se le salta
    expect(s.fase).toBe('playing');
  });

  it('termina con tablero lleno y gana quien tiene más casillas', () => {
    // Tablero lleno de 1 salvo dos casillas que J1 va a rellenar de golpe.
    const board = tableroVacio().map(() => 1 as Cell);
    board[idx(0, 1)] = null;
    board[idx(0, 3)] = null;
    board[idx(0, 0)] = 1; // ficha fuente para (0,1)
    board[idx(0, 2)] = 1; // ficha fuente para (0,3)
    board[idx(7, 7)] = 2; // una sola casilla de J2
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(s.board.every(c => c !== null)).toBe(true);
    expect(s.fase).toBe('finished');
    expect(s.winner).toBe(1);
  });

  it('termina en empate cuando ambos tienen la misma cantidad de casillas', () => {
    // Tablero ajedrezado (32–32); vaciamos una casilla de J1 y su vecina de
    // arriba —también de J1— la rellena estampidando 'arriba' → vuelve a 32–32.
    const board = tableroVacio();
    for (let i = 0; i < 64; i++) board[i] = i % 2 === 0 ? 1 : 2; // par → J1
    board[idx(0, 2)] = null;            // idx 2 (par) era de J1 → J1 baja a 31
    // idx(1,2) = 10 (par) es de J1: su copia 'arriba' cae en idx(0,2).
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'arriba' });
    expect(s.board.every(c => c !== null)).toBe(true);
    expect(s.fase).toBe('finished');
    expect(contar(s.board)).toEqual({ 1: 32, 2: 32 });
    expect(s.winner).toBeNull();
  });

  it('no permite más jugadas tras terminar (misma referencia)', () => {
    const board = tableroVacio().map(() => 1 as Cell);
    board[idx(0, 1)] = null;
    board[idx(0, 0)] = 1;
    const ganado = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(ganado.fase).toBe('finished');
    expect(playMove(ganado, { tipo: 'estampida', dir: 'abajo' })).toBe(ganado);
  });
});

describe('fuzzing — partidas aleatorias completas', () => {
  it('500 partidas: siempre termina con tablero lleno y ganador coherente', () => {
    for (let partida = 0; partida < 500; partida++) {
      let s = createInitialState();

      while (s.fase === 'setup') {
        const vacias: number[] = [];
        s.board.forEach((c, i) => {
          if (c === null) vacias.push(i);
        });
        const celda = vacias[Math.floor(Math.random() * vacias.length)];
        s = playMove(s, { tipo: 'colocar', celda });
      }

      let iteraciones = 0;
      while (s.fase === 'playing') {
        expect(iteraciones++).toBeLessThan(200);
        const vivas = (
          ['arriba', 'abajo', 'izquierda', 'derecha'] as Direccion[]
        ).filter(d => celdasQueCopian(s.board, s.currentPlayer, d).length > 0);
        // Mientras queden casillas vacías, el jugador en turno nunca está atascado.
        expect(vivas.length).toBeGreaterThan(0);
        const dir = vivas[Math.floor(Math.random() * vivas.length)];
        const antes = contar(s.board);
        s = playMove(s, { tipo: 'estampida', dir });
        const despues = contar(s.board);
        expect(despues[1]).toBeGreaterThanOrEqual(antes[1]);
        expect(despues[2]).toBeGreaterThanOrEqual(antes[2]);
      }

      expect(s.fase).toBe('finished');
      expect(s.board.every(c => c !== null)).toBe(true);
      const fin = contar(s.board);
      expect(fin[1] + fin[2]).toBe(64);
      if (fin[1] === fin[2]) expect(s.winner).toBeNull();
      else expect(s.winner).toBe(fin[1] > fin[2] ? 1 : 2);
    }
  });
});
```

> Nota para quien implementa: `celdasQueCopian` ya está en el `import` de la Task 1; añade `type Player` al `import` para el parámetro de `estadoJuego`.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/estampida/engine.test.ts`
Expected: FAIL — hoy la rama `playing` de `playMove` devuelve `state` sin aplicar nada.

- [ ] **Step 3: Completar la rama `playing` de `playMove`**

En `src/games/estampida/engine.ts`, reemplaza la última línea de `playMove`
(`// state.fase === 'playing' — se completa en la Task 3.` y su `return state;`) por:

```ts
  // state.fase === 'playing'
  if (move.tipo !== 'estampida') return state;

  const objetivos = celdasQueCopian(state.board, state.currentPlayer, move.dir);
  const board = [...state.board];
  for (const t of objetivos) board[t] = state.currentPlayer;

  const rival: Player = state.currentPlayer === 1 ? 2 : 1;
  return cerrarTurno(board, state.colocadas, objetivos, move.dir, rival);
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/estampida/engine.test.ts`
Expected: PASS (todos). El fuzzing tarda <1 s.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS — sin regresiones en los otros juegos.

- [ ] **Step 6: Commit**

```bash
git add src/games/estampida/engine.ts src/games/estampida/engine.test.ts
git commit -m "feat(estampida): fase playing — estampida, salto de atascado, fin y fuzzing"
```

---

## Task 4: Tablero, contenido y registro del juego

Pinta el tablero 8×8 y la fila de 4 flechas, conecta los taps al motor vía `iniciarSesionJuego`, muestra el marcador y el progreso del setup en el indicador de turno, y registra el juego para que aparezca en el índice y sea jugable (local y remoto). Incluye la ficha de contenido y la actualización del backlog.

**Files:**
- Create: `src/games/estampida/Board.astro`
- Create: `src/content/juegos/estampida.md`
- Modify: `src/pages/juegos/[slug].astro` (añadir import + entrada en `BOARDS`)
- Modify: `abstract-games-by-category/GAME-INDEX.md` (marcar ✅)

**Interfaces:**
- Consumes (de Task 1/2/3): `createInitialState`, `esJugadaValida`, `celdasQueCopian`, `contar`, `playMove`, `FICHAS_POR_JUGADOR`, `type EstampidaState`, `type Move`, `type Direccion` de `./engine`.
- Consumes (del repo): `iniciarSesionJuego<TMovimiento>` de `../../lib/gameSession` (config: `validarMovimiento`, `onMovimientoRemoto`, `onAplicarReinicio`, `onRender`, `onDesconectar`; devuelve `esMiTurno`, `enviarMovimiento`, `mostrarTurno`, `mostrarFinDeJuego`, `nombres`). `TableroJuego` de `../../components/TableroJuego.astro`. `mostrarTurno` acepta `{ jugador, simbolos?: Record<Player, string>, puntajes?: Record<Player, number | string>, detalle?: string }` (confirmado en `src/lib/gameSession.ts:29` y en `src/games/sos/Board.astro:286`). `mostrarFinDeJuego` acepta `{ titulo: string, detalle?: string }` (confirmado en `src/games/domineering/Board.astro:216`).
- Produces: `estampida` como slug jugable.

- [ ] **Step 1: Crear la ficha de contenido**

Guardar en `src/content/juegos/estampida.md`:

```markdown
---
title: "Estampida"
description: "Elige una dirección y todas tus fichas se multiplican: gana quien ocupa más casillas."
icono: "🐾"
minJugadores: 2
maxJugadores: 2
---

1. El tablero es de 8×8 casillas.
2. **Preparación:** por turnos, cada jugador coloca 5 fichas propias en cualquier casilla vacía (el Jugador 1 usa ●, el Jugador 2 ▲).
3. **En tu turno**, elige una dirección: arriba, abajo, izquierda o derecha. Cada una de tus fichas que tenga una casilla vacía justo al lado en esa dirección se duplica: aparece una copia tuya en esa casilla.
4. Todas las copias de un turno se calculan a la vez, desde el tablero tal como estaba al empezar tu turno. Una casilla recién ocupada no genera más copias ese mismo turno.
5. Una ficha no puede copiarse fuera del tablero ni sobre una casilla ocupada (tuya o del rival).
6. Las flechas sin ninguna copia posible aparecen desactivadas. Si un jugador no puede avanzar, se salta su turno.
7. La partida termina cuando el tablero se llena. Gana quien tenga más casillas ocupadas; puede haber empate.
```

> Nota para quien implementa: si `🐾` no renderiza en el índice, sustitúyelo por `"🐃"` o `"⧉"`. Verifícalo en el Step 2.

- [ ] **Step 2: Verificar que el juego aparece en el índice**

Run: `npm run dev` y abrir `http://localhost:4321/`.
Expected: aparece la tarjeta "Estampida" con su ícono. Al entrar, la ruta `/juegos/estampida` carga (modal de instrucciones; el tablero aún no pinta nada — falta el `Board.astro`). Detener el dev server.

- [ ] **Step 3: Crear `Board.astro`**

Guardar en `src/games/estampida/Board.astro`:

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';

const TAMANO = 8;
const casillas = Array.from({ length: TAMANO * TAMANO }, (_, i) => i);
const FLECHAS = [
  { dir: 'arriba', glifo: '↑', etiqueta: 'Duplicar hacia arriba' },
  { dir: 'izquierda', glifo: '←', etiqueta: 'Duplicar hacia la izquierda' },
  { dir: 'derecha', glifo: '→', etiqueta: 'Duplicar hacia la derecha' },
  { dir: 'abajo', glifo: '↓', etiqueta: 'Duplicar hacia abajo' },
] as const;
---

<TableroJuego class="tablero-estampida">
  <div
    id="tablero"
    class="tablero"
    role="grid"
    aria-label="Tablero de Estampida, 8 por 8"
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
  <div id="controles-direccion" class="controles-direccion" hidden>
    {FLECHAS.map(({ dir, glifo, etiqueta }) => (
      <button type="button" class="flecha" data-dir={dir} aria-label={etiqueta}>
        {glifo}
      </button>
    ))}
  </div>
</TableroJuego>

<style>
  .tablero {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    width: min(92vw, 30rem);
    aspect-ratio: 1;
    gap: 0.2rem;
    margin: 0 auto;
    touch-action: manipulation;
  }

  .casilla {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(0.9rem, 5vw, 1.8rem);
    font-weight: 700;
    line-height: 1;
    background: var(--color-surface);
    border: 2px solid #ddd;
    border-radius: 6px;
    padding: 0;
  }

  .casilla[data-valor='1'] {
    color: var(--color-player-1);
  }

  .casilla[data-valor='2'] {
    color: var(--color-player-2);
  }

  .casilla--ultima {
    box-shadow: inset 0 0 0 3px var(--color-accent);
  }

  .controles-direccion {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    margin: 1rem auto 0;
  }

  .flecha {
    min-width: var(--tap-target-min);
    min-height: var(--tap-target-min);
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
    background: var(--color-surface);
    border: 2px solid var(--color-accent);
    border-radius: 8px;
    color: inherit;
  }

  .flecha:disabled {
    opacity: 0.35;
    border-color: #ddd;
    cursor: default;
  }
</style>

<script>
  import {
    createInitialState,
    esJugadaValida,
    celdasQueCopian,
    contar,
    playMove,
    FICHAS_POR_JUGADOR,
    type EstampidaState,
    type Move,
    type Direccion,
  } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const FICHAS = { 1: '●', 2: '▲' } as const;

  const tablero = document.getElementById('tablero')!;
  const controles = document.getElementById('controles-direccion')!;
  const casillas = Array.from(
    tablero.querySelectorAll<HTMLButtonElement>('.casilla'),
  );
  const flechas = Array.from(
    controles.querySelectorAll<HTMLButtonElement>('.flecha'),
  );

  let state: EstampidaState = createInitialState();

  const sesion = iniciarSesionJuego<Move>({
    validarMovimiento: esJugadaValida,
    onMovimientoRemoto: move => jugar(move, false),
    onAplicarReinicio: () => {
      state = createInitialState();
      render();
    },
    onRender: render,
    onDesconectar: () => {
      casillas.forEach(c => (c.disabled = true));
      flechas.forEach(f => (f.disabled = true));
    },
  });

  function render(): void {
    const esMiTurno = sesion.esMiTurno(state.currentPlayer);
    const enSetup = state.fase === 'setup';
    const enJuego = state.fase === 'playing';
    const puntajes = contar(state.board);

    casillas.forEach((casilla, i) => {
      const valor = state.board[i];
      casilla.textContent = valor ? FICHAS[valor] : '';
      if (valor) casilla.dataset.valor = String(valor);
      else delete casilla.dataset.valor;
      casilla.classList.toggle(
        'casilla--ultima',
        state.ultimasCopias.includes(i),
      );
      casilla.disabled = valor !== null || !enSetup || !esMiTurno;
    });

    controles.hidden = !enJuego;
    flechas.forEach(flecha => {
      const dir = flecha.dataset.dir as Direccion;
      const viva =
        enJuego &&
        celdasQueCopian(state.board, state.currentPlayer, dir).length > 0;
      flecha.disabled = !viva || !esMiTurno;
    });

    if (state.fase === 'finished') {
      if (state.winner === null) {
        sesion.mostrarFinDeJuego({
          titulo: '🤝 ¡Empate!',
          detalle: `${puntajes[1]} casillas cada uno`,
        });
      } else {
        const perdedor = state.winner === 1 ? 2 : 1;
        sesion.mostrarFinDeJuego({
          titulo: `🎉 ¡Ganó ${sesion.nombres[state.winner]} (${FICHAS[state.winner]})!`,
          detalle: `${puntajes[state.winner]} casillas a ${puntajes[perdedor]}`,
        });
      }
      return;
    }

    sesion.mostrarTurno({
      jugador: state.currentPlayer,
      simbolos: { 1: FICHAS[1], 2: FICHAS[2] },
      puntajes,
      detalle: enSetup
        ? `Coloca tus fichas (${state.colocadas[state.currentPlayer]}/${FICHAS_POR_JUGADOR})`
        : 'Elige una dirección',
    });
  }

  function jugar(move: Move, emitirRemoto = true): void {
    const prev = state;
    state = playMove(state, move);
    if (state === prev) return; // rechazado → no renderiza ni emite
    render();
    if (emitirRemoto) sesion.enviarMovimiento(move);
  }

  casillas.forEach(casilla => {
    casilla.addEventListener('click', () => {
      jugar({ tipo: 'colocar', celda: Number(casilla.dataset.indice) });
    });
  });

  flechas.forEach(flecha => {
    flecha.addEventListener('click', () => {
      jugar({ tipo: 'estampida', dir: flecha.dataset.dir as Direccion });
    });
  });

  render();
</script>
```

> Nota para quien implementa: el guard de turno vive **solo** en `render()` (deshabilitando casillas y flechas). No metas `esMiTurno` dentro de `jugar()`: los movimientos remotos llegan con el `currentPlayer` local aún en el emisor y un guard incondicional los descartaría en silencio (lección `remoto-guard-turno-jugar`). `playMove` es la autoridad y es idempotente ante entradas inválidas.

- [ ] **Step 4: Registrar el board en `[slug].astro`**

En `src/pages/juegos/[slug].astro`:

1. Añadir el import junto a los otros (después de `import DomineeringBoard from '../../games/domineering/Board.astro';`):

```astro
import EstampidaBoard from '../../games/estampida/Board.astro';
```

2. Añadir la entrada al objeto `BOARDS` (después de `domineering: DomineeringBoard,`):

```astro
  estampida: EstampidaBoard,
```

- [ ] **Step 5: Actualizar el backlog**

En `abstract-games-by-category/GAME-INDEX.md`, en la fila `[38-estampida.md](01-2-players/38-estampida.md)`, poner `✅` en la columna Estado (misma forma que las filas ya marcadas).

- [ ] **Step 6: Verificar build y tipos**

Run: `npx astro check`
Expected: sin errores.

Run: `npm run build`
Expected: build limpio; la ruta `/juegos/estampida` aparece en la salida.

- [ ] **Step 7: Playtest manual (local)**

Run: `npm run dev`, abrir `http://localhost:4321/juegos/estampida`, cerrar el modal de instrucciones, elegir modo local. Con DevTools a ~375 px de ancho, verificar:
- El tablero 8×8 cabe sin scroll horizontal en escritorio y en móvil.
- **Setup:** el indicador de turno muestra el nombre, la ficha del asiento y "Coloca tus fichas (N/5)"; el marcador arranca en 0–0 y sube con cada colocación. Tocar una casilla vacía coloca la ficha del jugador en turno; se alterna J1/J2. La fila de flechas está oculta.
- Tras la 10.ª ficha aparece la fila de 4 flechas y el detalle pasa a "Elige una dirección", turno del Jugador 1.
- **Estampida:** tocar una flecha "viva" duplica todas las fichas correspondientes de golpe; las copias quedan resaltadas con el anillo; el marcador sube; el turno pasa al rival.
- Las flechas que no producirían ninguna copia aparecen atenuadas y no responden al toque.
- La partida termina al llenarse el tablero: banner "🎉 ¡Ganó …!" con "X casillas a Y", o "🤝 ¡Empate!" con "N casillas cada uno".
- "Jugar de nuevo" vuelve a la fase de setup con el tablero vacío.
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
git add src/games/estampida/Board.astro src/content/juegos/estampida.md src/pages/juegos/\[slug\].astro abstract-games-by-category/GAME-INDEX.md
git commit -m "feat(estampida): tablero, contenido y registro del juego"
```

---

## Integración final

Tras la Task 4, con `npm test`, `npx astro check` y `npm run build` en verde:

- [ ] Abrir PR de la rama contra `main` (como los 12 juegos anteriores). En el cuerpo del PR, anotar como seguimiento no bloqueante:
  - **Modo remoto no probado en navegador** (el `astro dev` no sirve el Worker de señalización) — hacer playtest de 2 navegadores contra el Worker desplegado, igual que Notakto / Obstrucción / Sim / Domineering.
  - Menores site-wide ya conocidos: `role="grid"` sin `row`/`gridcell`; `aria-label` de casilla estático que no refleja ocupación; blancos de tap ~41 px a 375 px en el tablero (tradeoff aceptado en el spec; las 4 flechas usan `var(--tap-target-min)`).
  - Posible pulido posterior: disposición de las flechas en cruz (D-pad) en vez de fila; navegación por teclado en la retícula (Domineering la tiene, Obstrucción no — inconsistente en el repo).

---

## Self-Review (hecho al escribir el plan)

**Cobertura del spec:**
- Tablero 8×8, 5 fichas, fila-mayor → Global Constraints + `TAMANO`/`FICHAS_POR_JUGADOR` (Task 1) + `estampida.md` (Task 4).
- Tipos `Player/Cell/Direccion/Fase/Move/EstampidaState` → Task 1 (definidos y probados vía `createInitialState`).
- `esJugadaValida` (forma de la unión, `celda` en rango, `dir` válida) → Task 1 + tests de aceptación/rechazo.
- `celdasQueCopian` (snapshot único, sin envolvimiento, obstáculos) → Task 1 + tests de borde/obstáculo propio y rival/múltiple.
- `hayMovimientoPosible`, `contar` → Task 1 + tests.
- Fase setup: colocación alternada, cualquier casilla vacía, J1 empieza, transición a `playing` en 5+5 con turno J1 → Task 2 (`playMove` setup + `correrSetup` + tests, incl. "9.ª ficha sigue en setup").
- Motor inmutable, misma referencia ante entrada inválida (estampida en setup, casilla ocupada, payload inválido, colocar en playing, jugada tras finished) → Task 2 y Task 3 tests.
- Fase playing: estampida desde snapshot, todas las copias a la vez, sin encadenar, `ultimasCopias`/`ultimaDireccion` → Task 3 + tests ("duplica y pasa turno", "sin encadenar").
- Dirección sin copias: no cambia el tablero, cede el turno → Task 3 test dedicado.
- Salto de jugador atascado → Task 3 test "salta al rival amurallado".
- Fin por tablero lleno; ganador por conteo; empate → `winner: null` → Task 3 tests + `cerrarTurno` (Task 2).
- Nota del spec: "ambos atascados" es defensivo/inalcanzable en juego legal; el fuzzing (Task 3) afirma `vivas.length > 0` mientras haya vacías y `fase` termina en `finished` con tablero lleno.
- Payload remoto = `Move`; `iniciarSesionJuego<Move>`; guard de turno solo en `render()` → Task 4 (`Board.astro` + nota `remoto-guard-turno-jugar`).
- Board: grid 8×8 + 4 flechas ocultas hasta `playing`; realce de `ultimasCopias`; `mostrarTurno` con `puntajes` + `detalle` (setup: "N/5"; playing: "Elige una dirección"); banner de victoria y de empate → Task 4 Step 3.
- "Jugar de nuevo" reinicia a setup → Task 4 (`onAplicarReinicio` → `createInitialState`) + Step 7.
- Contenido, registro estático en `[slug].astro`, backlog `GAME-INDEX.md` ✅ → Task 4 Steps 1, 4, 5.
- Fuera de alcance (10×10, 8 fichas, misère, >2 jugadores, restricciones de setup, animación, indicador de dirección, `<TableroJuego>` compartido) → sin tasks; anotado en el spec y en Integración final.

**Escaneo de placeholders:** sin "TBD"/"TODO"/"handle edge cases". Las dos notas abiertas llevan instrucción concreta: (1) el emoji `icono` con fallback verificable en el Step 2 de la Task 4; (2) la firma de `mostrarTurno`/`mostrarFinDeJuego` con referencia exacta a archivo:línea.

**Consistencia de tipos:** `EstampidaState`, `Player`, `Cell`, `Direccion`, `Fase`, `Move`, `createInitialState`, `esJugadaValida`, `celdasQueCopian`, `hayMovimientoPosible`, `contar`, `playMove`, `cerrarTurno` (interno), `TAMANO`, `FICHAS_POR_JUGADOR` usados con la misma firma en las 4 tasks. `Move` siempre la unión `{tipo:'colocar',celda} | {tipo:'estampida',dir}`. `contar` y `mostrarTurno.puntajes` ambos `Record<Player, number>`. `fase` es `'setup' | 'playing' | 'finished'` (sin `status` aparte) en todo el plan. `ultimasCopias: number[]` (lista, no índice único) — el Board usa `.includes(i)`.
```
