# Obstrucción Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir Obstrucción (tablero 6×6, colocar bloquea las 8 vecinas, gana quien coloca la última ficha) como octavo juego del sitio, jugable en local y en modo remoto.

**Architecture:** Motor puro (`src/games/obstruccion/engine.ts`) sin DOM, testeado con Vitest, más un `Board.astro` que conecta los taps al motor vía `iniciarSesionJuego`. La legalidad de una casilla es derivada (vacía + 8 vecinas vacías, acotadas por fila/columna); no se guarda estado de "casillas muertas". El fin de partida se detecta comprobando si el rival tiene alguna casilla legal tras cada jugada. Se reutiliza todo el "chrome" compartido (indicador de turno, banner, identidad de jugadores, protocolo remoto) — no se añade Worker ni mensajes nuevos.

**Tech Stack:** Astro 7 (sin framework de UI), TypeScript estricto, Vitest, npm.

**Spec:** `docs/superpowers/specs/2026-08-30-obstruccion-design.md`

## Global Constraints

- Tablero **6×6** (36 casillas), orden fila-mayor en un array plano. No configurable.
- Casilla legal = vacía **y** sus 8 vecinas (ortogonales + diagonales, acotadas por `0 ≤ fila < 6` y `0 ≤ col < 6`) están todas vacías.
- **Gana quien coloca la última ficha**: si tras una jugada el rival no tiene ninguna casilla legal → `status: 'won'`, `winner` = quien acaba de jugar. Sin empate posible.
- Sin puntaje acumulado entre rondas (victoria única por partida).
- Celdas de las fichas tipadas como asiento (`Player = 1 | 2`), sin capa de mapeo glifo→asiento. Asiento 1 = `●` en `var(--color-player-1)`; asiento 2 = `▲` en `var(--color-player-2)`.
- Payload del movimiento remoto = índice `number` en `[0, 35]`.
- Motor inmutable: ante entrada inválida `playMove` devuelve el `state` recibido sin mutarlo.
- Solo español en todo el texto visible.
- `engine.ts` no importa nada del DOM ni de Astro.
- Patrón de registro: `import` **estático** del `Board.astro` en `src/pages/juegos/[slug].astro` (nunca `import()` dinámico con el slug como variable — rompe el build de Astro).
- TDD: primero el test que falla, luego el mínimo código para pasarlo. Commits frecuentes.

---

## Preparación (antes de la Task 1)

El plan asume un worktree/branch aislado creado con la skill `superpowers:using-git-worktrees`, basado en **`origin/main`** (no en el `main` local, que está desincronizado — ver el memo del proyecto). Nombre sugerido del worktree: `obstruccion`. Todos los `git commit` de abajo ocurren en esa rama; la integración final es un PR contra `main`, como los 7 juegos anteriores.

Verifica el punto de partida:

```bash
npm test        # la suite actual debe pasar en verde
```

---

## Task 1: Motor — estado, legalidad de casilla y colocación

Motor sin detección de fin todavía: valida la legalidad de la casilla (vacía + 8 vecinas vacías), coloca la ficha, fija `lastMove` y alterna el turno. Tras esta task, `playMove` siempre deja `status: 'playing'`.

**Files:**
- Create: `src/games/obstruccion/engine.ts`
- Test: `src/games/obstruccion/engine.test.ts`

**Interfaces:**
- Consumes: nada (primera task).
- Produces:
  - `type Player = 1 | 2`
  - `type CellValue = Player | null`
  - `type GameStatus = 'playing' | 'won'`
  - `interface ObstruccionState { board: CellValue[]; currentPlayer: Player; status: GameStatus; winner: Player | null; lastMove: number | null }`
  - `const TAMANO = 6` (export)
  - `function createInitialState(): ObstruccionState`
  - `function esJugadaValida(payload: unknown): payload is number`
  - `function casillaLegal(board: CellValue[], index: number): boolean` (export)
  - `function playMove(state: ObstruccionState, index: number): ObstruccionState`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/games/obstruccion/engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  casillaLegal,
  playMove,
  TAMANO,
} from './engine';

// Helper: índice fila-mayor en un tablero 6×6.
const idx = (fila: number, col: number) => fila * TAMANO + col;

describe('createInitialState', () => {
  it('crea un tablero vacío de 36 casillas, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.board).toHaveLength(TAMANO * TAMANO);
    expect(state.board.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros dentro de [0, 35]', () => {
    expect(esJugadaValida(0)).toBe(true);
    expect(esJugadaValida(35)).toBe(true);
    expect(esJugadaValida(18)).toBe(true);
  });

  it('rechaza fuera de rango, no enteros y no números', () => {
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(36)).toBe(false);
    expect(esJugadaValida(3.5)).toBe(false);
    expect(esJugadaValida('2')).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
  });
});

describe('casillaLegal', () => {
  it('en tablero vacío todas las 36 casillas son legales', () => {
    const board = Array(36).fill(null);
    for (let i = 0; i < 36; i++) {
      expect(casillaLegal(board, i)).toBe(true);
    }
  });

  it('una ficha en el centro bloquea esa casilla y sus 8 vecinas', () => {
    const board = Array(36).fill(null);
    const centro = idx(2, 2);
    board[centro] = 1;
    const bloqueadas = [
      centro,
      idx(1, 1), idx(1, 2), idx(1, 3),
      idx(2, 1),            idx(2, 3),
      idx(3, 1), idx(3, 2), idx(3, 3),
    ];
    for (const b of bloqueadas) {
      expect(casillaLegal(board, b)).toBe(false);
    }
    // una casilla a distancia 2 sigue libre
    expect(casillaLegal(board, idx(0, 2))).toBe(true);
    expect(casillaLegal(board, idx(4, 4))).toBe(true);
  });

  it('ficha en la esquina 0 solo bloquea sus 3 vecinas reales (sin envolvimiento)', () => {
    const board = Array(36).fill(null);
    board[0] = 1;
    // vecinas reales de (0,0): (0,1)=1, (1,0)=6, (1,1)=7
    expect(casillaLegal(board, 1)).toBe(false);
    expect(casillaLegal(board, 6)).toBe(false);
    expect(casillaLegal(board, 7)).toBe(false);
    // NO se bloquea la última columna de la fila 0 ni la última fila
    expect(casillaLegal(board, idx(0, 5))).toBe(true);
    expect(casillaLegal(board, idx(5, 0))).toBe(true);
    expect(casillaLegal(board, idx(5, 5))).toBe(true);
  });

  it('ficha en un borde superior (0,3) bloquea 5 vecinas, ninguna fuera del tablero', () => {
    const board = Array(36).fill(null);
    board[idx(0, 3)] = 2;
    const bloqueadas = [
      idx(0, 2), idx(0, 4),
      idx(1, 2), idx(1, 3), idx(1, 4),
    ];
    for (const b of bloqueadas) {
      expect(casillaLegal(board, b)).toBe(false);
    }
    expect(casillaLegal(board, idx(0, 1))).toBe(true);
    expect(casillaLegal(board, idx(2, 3))).toBe(true);
  });

  it('una casilla ocupada nunca es legal', () => {
    const board = Array(36).fill(null);
    board[10] = 1;
    expect(casillaLegal(board, 10)).toBe(false);
  });
});

describe('playMove — colocación y turno', () => {
  it('coloca la ficha del jugador actual, fija lastMove y pasa el turno', () => {
    const state = playMove(createInitialState(), 0);
    expect(state.board[0]).toBe(1);
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');
    expect(state.lastMove).toBe(0);

    // (0,0) bloquea 0,1,6,7 → el jugador 2 juega en una casilla legal lejana
    const state2 = playMove(state, idx(3, 3));
    expect(state2.board[idx(3, 3)]).toBe(2);
    expect(state2.currentPlayer).toBe(1);
    expect(state2.lastMove).toBe(idx(3, 3));
  });

  it('ignora jugada sobre casilla ocupada', () => {
    const state = playMove(createInitialState(), 0);
    expect(playMove(state, 0)).toBe(state);
  });

  it('ignora jugada sobre casilla bloqueada (vecina de una ficha)', () => {
    const state = playMove(createInitialState(), idx(2, 2)); // jugador 1 al centro
    // (2,3) es vecina → bloqueada
    expect(playMove(state, idx(2, 3))).toBe(state);
  });

  it('ignora jugada fuera de rango', () => {
    const state = createInitialState();
    expect(playMove(state, -1)).toBe(state);
    expect(playMove(state, 36)).toBe(state);
    expect(playMove(state, 2.5)).toBe(state);
  });

  it('no muta el estado de entrada', () => {
    const state = createInitialState();
    const boardRef = state.board;
    playMove(state, 18);
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/obstruccion/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Implementar el motor mínimo**

```ts
// src/games/obstruccion/engine.ts
export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

export interface ObstruccionState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: number | null;
}

export const TAMANO = 6;
const TOTAL = TAMANO * TAMANO;

// Los 8 desplazamientos ortogonales + diagonales, en (df, dc).
const VECINDAD: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

export function createInitialState(): ObstruccionState {
  return {
    board: Array<CellValue>(TOTAL).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

export function esJugadaValida(payload: unknown): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < TOTAL
  );
}

export function casillaLegal(board: CellValue[], index: number): boolean {
  if (board[index] !== null) return false;
  const fila = Math.floor(index / TAMANO);
  const col = index % TAMANO;
  for (const [df, dc] of VECINDAD) {
    const f = fila + df;
    const c = col + dc;
    if (f < 0 || f >= TAMANO || c < 0 || c >= TAMANO) continue;
    if (board[f * TAMANO + c] !== null) return false;
  }
  return true;
}

export function playMove(state: ObstruccionState, index: number): ObstruccionState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (!casillaLegal(state.board, index)) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove: index,
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/obstruccion/engine.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/games/obstruccion/engine.ts src/games/obstruccion/engine.test.ts
git commit -m "feat(obstruccion): motor base — legalidad de casilla y colocación"
```

---

## Task 2: Motor — detección de fin de partida

Tras colocar una ficha, comprueba si **el rival** tiene alguna casilla legal. Si no, la partida termina y gana quien acaba de jugar.

**Files:**
- Modify: `src/games/obstruccion/engine.ts`
- Test: `src/games/obstruccion/engine.test.ts` (añadir casos)

**Interfaces:**
- Consumes (de Task 1): `ObstruccionState`, `Player`, `CellValue`, `createInitialState`, `playMove`, `casillaLegal`, `esJugadaValida`, `TAMANO`, `TOTAL` (constante interna del módulo).
- Produces: mismo API público; `playMove` ahora puede devolver `status: 'won'` con `winner` = jugador que colocó la última ficha y `currentPlayer` **sin alternar**.

- [ ] **Step 1: Escribir los tests que fallan**

Añade este bloque al final de `src/games/obstruccion/engine.test.ts`:

```ts
// Helper: aplica una lista de índices alternando jugadores desde el estado
// inicial (asume que cada jugada es legal en su momento).
function jugarSecuencia(indices: number[]) {
  return indices.reduce((s, i) => playMove(s, i), createInitialState());
}

describe('playMove — fin de partida', () => {
  it('gana el jugador que coloca la última ficha (rival sin jugada legal)', () => {
    // Construimos un board donde solo queda UNA casilla legal (la 35) y es el
    // turno del jugador 1. Al jugarla, el jugador 2 se queda sin nada → gana 1.
    const board: CellValue[] = Array(36).fill(null);
    // Ocupamos casillas de forma que toda casilla vacía salvo la 35 tenga al
    // menos una vecina ocupada. La forma más simple: llenar todo menos la 35
    // y su situación (35 = esquina (5,5); sus vecinas son 28,34,29... ver abajo).
    // Vecinas de (5,5): (4,4)=28, (4,5)=29, (5,4)=34.
    // Para que 35 sea legal, 28/29/34 deben estar vacías; para que NINGUNA otra
    // casilla vacía sea legal, cada una debe tener una vecina ocupada.
    // Dejamos vacías: 28,29,34,35. Ocupamos el resto (con cualquier color;
    // el color de las fichas previas no afecta la legalidad).
    for (let i = 0; i < 36; i++) {
      if (![28, 29, 34, 35].includes(i)) board[i] = 1;
    }
    // Ahora: casillaLegal(28)? vecinas incluyen 21,22,23,27,29,33,34,35.
    // 21,22,23,27,33 están ocupadas → 28 NO es legal. Igual 29 y 34.
    // 35: vecinas 28,29,34 → todas vacías → 35 SÍ es legal.
    expect(casillaLegal(board, 35)).toBe(true);
    expect(casillaLegal(board, 28)).toBe(false);
    expect(casillaLegal(board, 29)).toBe(false);
    expect(casillaLegal(board, 34)).toBe(false);

    const state: ObstruccionState = {
      board,
      currentPlayer: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const resultado = playMove(state, 35);
    expect(resultado.status).toBe('won');
    expect(resultado.winner).toBe(1);
    expect(resultado.currentPlayer).toBe(1); // no alterna al ganar
    expect(resultado.lastMove).toBe(35);
  });

  it('mientras quede una casilla legal para el rival, la partida sigue y el turno alterna', () => {
    const state = jugarSecuencia([0]); // jugador 1 en la esquina; quedan muchas legales
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(2);
  });

  it('no permite más jugadas tras ganar', () => {
    const board: CellValue[] = Array(36).fill(null);
    for (let i = 0; i < 36; i++) {
      if (![28, 29, 34, 35].includes(i)) board[i] = 1;
    }
    const ganado = playMove(
      { board, currentPlayer: 1, status: 'playing', winner: null, lastMove: null },
      35,
    );
    expect(ganado.status).toBe('won');
    // intentar jugar 28 (que además está bloqueada) no cambia nada
    expect(playMove(ganado, 28)).toBe(ganado);
  });

  it('la primera jugada de la partida nunca termina el juego', () => {
    const state = playMove(createInitialState(), 18);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/obstruccion/engine.test.ts`
Expected: FAIL — los casos de "won" fallan (hoy `playMove` siempre deja `'playing'`).

- [ ] **Step 3: Implementar la detección de fin**

Reemplaza el cuerpo de `playMove` en `src/games/obstruccion/engine.ts` (añade `hayCasillaLegal`):

```ts
function hayCasillaLegal(board: CellValue[]): boolean {
  for (let i = 0; i < TOTAL; i++) {
    if (casillaLegal(board, i)) return true;
  }
  return false;
}

export function playMove(state: ObstruccionState, index: number): ObstruccionState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (!casillaLegal(state.board, index)) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  if (!hayCasillaLegal(board)) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      lastMove: index,
    };
  }

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove: index,
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/obstruccion/engine.test.ts`
Expected: PASS (todos, incluidos los de Task 1).

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS — sin regresiones en los otros juegos.

- [ ] **Step 6: Commit**

```bash
git add src/games/obstruccion/engine.ts src/games/obstruccion/engine.test.ts
git commit -m "feat(obstruccion): detección de fin — rival sin jugada legal"
```

---

## Task 3: Tablero, contenido y registro del juego

Pinta el tablero, sombrea las casillas muertas, conecta los taps al motor y registra el juego para que aparezca en el índice y sea jugable (local y remoto). Incluye la ficha de contenido y la actualización del backlog.

**Files:**
- Create: `src/games/obstruccion/Board.astro`
- Create: `src/content/juegos/obstruccion.md`
- Modify: `src/pages/juegos/[slug].astro` (añadir import + entrada en `BOARDS`)
- Modify: `abstract-games-by-category/GAME-INDEX.md` (marcar ✅)

**Interfaces:**
- Consumes (de Task 2): `createInitialState`, `esJugadaValida`, `casillaLegal`, `playMove`, `type ObstruccionState` de `./engine`.
- Consumes (del repo): `iniciarSesionJuego<TMovimiento>` de `../../lib/gameSession` (config: `validarMovimiento`, `onMovimientoRemoto`, `onAplicarReinicio`, `onRender`, `onDesconectar`; devuelve `esMiTurno`, `enviarMovimiento`, `mostrarTurno`, `mostrarFinDeJuego`, `nombres`). `TableroJuego` de `../../components/TableroJuego.astro`.
- Produces: `obstruccion` como slug jugable.

- [ ] **Step 1: Crear la ficha de contenido**

Guardar en `src/content/juegos/obstruccion.md`:

```markdown
---
title: "Obstrucción"
description: "Bloquea el tablero: gana quien coloca la última ficha antes de que no quepan más."
icono: "🚧"
minJugadores: 2
maxJugadores: 2
---

1. El tablero es de 6×6 casillas.
2. Por turnos, cada jugador coloca una ficha en cualquier casilla libre. El jugador 1 pone ●, el jugador 2 pone ▲.
3. Al colocar una ficha, las 8 casillas que la rodean quedan bloqueadas para ambos jugadores (se ven sombreadas). Ya no se puede jugar ahí.
4. Solo puedes colocar en una casilla vacía cuyas 8 vecinas también estén vacías.
5. Gana quien coloca la última ficha: si en tu turno no queda ninguna casilla donde puedas jugar, pierdes.
```

- [ ] **Step 2: Verificar que el juego aparece en el índice**

Run: `npm run dev` y abrir `http://localhost:4321/`.
Expected: aparece la tarjeta "Obstrucción" con el ícono 🚧. Al entrar, la ruta `/juegos/obstruccion` carga (mostrará el modal de instrucciones; el tablero aún no pinta nada — falta el `Board.astro`). Detener el dev server.

- [ ] **Step 3: Crear `Board.astro`**

Guardar en `src/games/obstruccion/Board.astro`:

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';

const TAMANO = 6;
const casillas = Array.from({ length: TAMANO * TAMANO }, (_, i) => i);
---

<TableroJuego class="tablero-obstruccion">
  <div id="tablero" class="tablero" role="grid" aria-label="Tablero de Obstrucción, 6 por 6">
    {casillas.map(i => (
      <button
        type="button"
        class="casilla"
        data-indice={i}
        aria-label={`Fila ${Math.floor(i / TAMANO) + 1}, columna ${(i % TAMANO) + 1}`}
      />
    ))}
  </div>
</TableroJuego>

<style>
  .tablero {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    width: min(92vw, 30rem);
    aspect-ratio: 1;
    gap: 0.25rem;
    margin: 0 auto;
    touch-action: manipulation;
  }

  .casilla {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(1.2rem, 7vw, 2.4rem);
    font-weight: 700;
    line-height: 1;
    background: var(--color-surface);
    border: 2px solid #ddd;
    border-radius: 8px;
    padding: 0;
  }

  .casilla[data-valor='1'] {
    color: var(--color-player-1);
  }

  .casilla[data-valor='2'] {
    color: var(--color-player-2);
  }

  .casilla--muerta {
    background: rgba(0, 0, 0, 0.08);
    border-color: transparent;
  }

  .casilla--ultima {
    box-shadow: inset 0 0 0 3px var(--color-accent);
  }
</style>

<script>
  import {
    createInitialState,
    esJugadaValida,
    casillaLegal,
    playMove,
    type ObstruccionState,
  } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const FICHAS = { 1: '●', 2: '▲' } as const;

  const tablero = document.getElementById('tablero')!;
  const casillas = Array.from(
    tablero.querySelectorAll<HTMLButtonElement>('.casilla')
  );

  let state: ObstruccionState = createInitialState();

  const sesion = iniciarSesionJuego<number>({
    validarMovimiento: esJugadaValida,
    onMovimientoRemoto: indice => jugar(indice, false),
    onAplicarReinicio: () => {
      state = createInitialState();
      render();
    },
    onRender: render,
    onDesconectar: () => {
      casillas.forEach(casilla => (casilla.disabled = true));
    },
  });

  function render(): void {
    const jugadorDelTurno = state.currentPlayer;
    const esMiTurno = sesion.esMiTurno(jugadorDelTurno);

    casillas.forEach((casilla, i) => {
      const valor = state.board[i];
      casilla.textContent = valor ? FICHAS[valor] : '';
      if (valor) {
        casilla.dataset.valor = String(valor);
      } else {
        delete casilla.dataset.valor;
      }
      const muerta = valor === null && !casillaLegal(state.board, i);
      casilla.classList.toggle('casilla--muerta', muerta);
      casilla.classList.toggle('casilla--ultima', state.lastMove === i);
      casilla.disabled =
        valor !== null || muerta || state.status !== 'playing' || !esMiTurno;
    });

    if (state.status === 'playing') {
      sesion.mostrarTurno({
        jugador: jugadorDelTurno,
        simbolos: { 1: FICHAS[1], 2: FICHAS[2] },
      });
    } else {
      sesion.mostrarFinDeJuego({
        titulo: `🎉 ¡Ganó ${sesion.nombres[state.winner!]} (${FICHAS[state.winner!]})!`,
      });
    }
  }

  function jugar(indice: number, emitirRemoto = true): void {
    state = playMove(state, indice);
    render();
    if (emitirRemoto) {
      sesion.enviarMovimiento(indice);
    }
  }

  casillas.forEach(casilla => {
    casilla.addEventListener('click', () => {
      jugar(Number(casilla.dataset.indice));
    });
  });

  render();
</script>
```

> Nota para quien implementa: confirma la firma real de `mostrarTurno` en `src/games/gomoku/Board.astro` (debe ser `{ jugador, simbolos: { 1, 2 } }`). Si en el repo actual difiere, cópiala exactamente de `gomoku/Board.astro`, que es el juego más reciente con `Player = 1 | 2`.

- [ ] **Step 4: Registrar el board en `[slug].astro`**

En `src/pages/juegos/[slug].astro`:

1. Añadir el import junto a los otros (después de la última línea `import …Board from …`):

```astro
import ObstruccionBoard from '../../games/obstruccion/Board.astro';
```

2. Añadir la entrada al objeto `BOARDS` (una línea más, respetando el estilo existente):

```astro
  obstruccion: ObstruccionBoard,
```

- [ ] **Step 5: Actualizar el backlog**

En `abstract-games-by-category/GAME-INDEX.md`, en la fila `[41-obstruction.md](01-2-players/41-obstruction.md)`, poner `✅` en la columna Estado (misma forma que las filas ya marcadas, p. ej. `notakto`).

- [ ] **Step 6: Verificar build y tipos**

Run: `npx astro check`
Expected: sin errores.

Run: `npm run build`
Expected: build limpio; la ruta `/juegos/obstruccion` aparece en la salida.

- [ ] **Step 7: Playtest manual (local)**

Run: `npm run dev`, abrir `http://localhost:4321/juegos/obstruccion`, cerrar el modal de instrucciones, elegir modo local.
Verificar:
- El tablero 6×6 cabe sin scroll horizontal en ancho de escritorio y en un viewport móvil (DevTools, ~375px).
- Alternan ● (naranja) y ▲ (azul). El indicador de turno muestra el nombre y la ficha del jugador en turno.
- Al colocar una ficha, sus 8 vecinas quedan sombreadas y deshabilitadas de inmediato.
- La última jugada se resalta con el anillo; el resalte se mueve con cada jugada.
- Cuando el jugador en turno se queda sin casillas legales, aparece el banner "¡Ganó …!" con el nombre del rival (el que colocó la última ficha).
- "Jugar de nuevo" reinicia el tablero.
Detener el dev server.

- [ ] **Step 8: Commit**

```bash
git add src/games/obstruccion/Board.astro src/content/juegos/obstruccion.md src/pages/juegos/\[slug\].astro abstract-games-by-category/GAME-INDEX.md
git commit -m "feat(obstruccion): tablero, contenido y registro del juego"
```

---

## Integración final

Tras la Task 3, con `npm test`, `npx astro check` y `npm run build` en verde:

- [ ] Abrir PR de la rama contra `main` (como los 7 juegos anteriores). En el cuerpo del PR, anotar como seguimiento no bloqueante: **modo remoto no probado en navegador** (el `astro dev` no sirve el Worker de señalización) — hacer playtest de 2 navegadores contra el Worker desplegado, igual que se hizo con Notakto y Gomoku.

---

## Self-Review (hecho al escribir el plan)

**Cobertura del spec:**
- Tablero 6×6 fijo / fila-mayor → Global Constraints + `TAMANO = 6` (Task 1) + `obstruccion.md` (Task 3).
- `casillaLegal` = vacía + 8 vecinas vacías, acotada por fila/col → Task 1 (`casillaLegal` + `VECINDAD` + tests de centro, esquina, borde).
- Gana quien coloca la última ficha (misère), sin empate, `currentPlayer` sin alternar al ganar → Task 2 (`hayCasillaLegal` + tests de "won").
- `esJugadaValida` entero en `[0, 35]` para el contrato remoto → Task 1.
- `playMove` inmutable, devuelve `state` ante entrada inválida (ocupada / bloqueada / fuera de rango / tras `won`) → Task 1 y Task 2 (tests).
- `lastMove` en el estado + anillo `.casilla--ultima` → Task 1 (campo) + Task 2 (se mantiene en ambas ramas) + Task 3 (CSS).
- Casillas muertas sombreadas + `disabled`, sin resaltado extra de jugadas legales → Task 3 (`.casilla--muerta`, `muerta` en `render`).
- Fichas tipadas como asiento (● naranja / ▲ azul), sin mapeo → Task 1 (`CellValue = Player | null`) + Task 3 (`FICHAS`, `data-valor`).
- Sizing fluido `min(92vw, 30rem)` sin overflow → Task 3 (`Board.astro` CSS) + Step 7 (verificación móvil).
- Flujo local/remoto/reinicio/desconexión = patrón de Gomoku (payload índice `number`) → Task 3 (`iniciarSesionJuego<number>`).
- Contenido, registro estático en `[slug].astro`, backlog `GAME-INDEX.md` ✅ → Task 3 Steps 1, 4, 5.
- Fuera de alcance (tableros no cuadrados / tamaño configurable, marcador, resaltado de jugadas legales, IA, cambios a `<TableroJuego>`) → sin tasks; anotado en el spec.

**Escaneo de placeholders:** sin "TBD"/"TODO"/"handle edge cases". La única nota abierta (firma de `mostrarTurno`) lleva instrucción concreta: copiarla de `gomoku/Board.astro`.

**Consistencia de tipos:** `ObstruccionState`, `Player`, `CellValue`, `GameStatus`, `createInitialState`, `esJugadaValida`, `casillaLegal`, `playMove`, `TAMANO`, `TOTAL` usados con la misma firma en las 3 tasks. `casillaLegal(board, index): boolean` exportada en Task 1 y consumida en Task 2 (`hayCasillaLegal`) y Task 3 (`render`). `iniciarSesionJuego<number>` y su config coinciden con `src/lib/gameSession.ts` y con `gomoku/Board.astro`. `status` es `'playing' | 'won'` (sin `'draw'`) en todo el plan.
