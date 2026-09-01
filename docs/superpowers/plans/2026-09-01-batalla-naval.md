# Batalla Naval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir Batalla Naval (tablero 8×8, flota de 4 barcos 4/3/3/2 colocada al azar, disparos por turnos alternos a las aguas del rival; gana quien hunde toda la flota rival primero) como 15.º juego del sitio, jugable en local (pasar-y-jugar) y en modo remoto.

**Architecture:** Motor puro (`src/games/battleship/engine.ts`) sin DOM, testeado con Vitest, más un `Board.astro` que conecta los taps al motor vía `iniciarSesionJuego`. El estado lleva una `fase` (`colocacion` → `disparos` → `finished`); el movimiento es una unión discriminada `{tipo:'flota',barcos} | {tipo:'disparo',celda}` y un único `playMove` despacha según la fase. **Estado compartido, secreto solo en UI**: ambos clientes tienen las dos flotas en `state`; el Board nunca dibuja la flota rival. La única fuente de aleatoriedad (`generarFlotaAleatoria`) se llama solo al pulsar "Barajar" y su salida viaja **explícita en el payload** — nunca se re-sortea en el receptor. Se reutiliza todo el "chrome" compartido (indicador de turno, banner, identidad de jugadores, protocolo remoto) — no se añade Worker ni mensajes nuevos, ni se toca `gameSession.ts` / `types.ts`.

**Tech Stack:** Astro 7 (sin framework de UI), TypeScript estricto, Vitest, npm.

**Spec:** `docs/superpowers/specs/2026-09-01-batalla-naval-design.md`

## Global Constraints

- Tablero **8×8** (64 casillas), orden fila-mayor en arrays planos. No configurable. `export const TAMANO = 8`.
- Flota fija: **`export const FLOTA = [4, 3, 3, 2] as const`** (4 barcos, 12 celdas). No configurable.
- Fichas por asiento: Jugador 1 = `●`, Jugador 2 = `▲` (vía la opción `simbolos` de `mostrarTurno`). **No se toca `turnIndicator.ts`.**
- **Fase `colocacion`:** solo colocación aleatoria. J1 confirma su flota, luego J2. Al quedar **ambas** flotas puestas, la fase pasa a `disparos` con el turno en el Jugador 1. Los barcos **pueden tocarse** (sin regla de no-adyacencia). Sin colocación manual.
- **Fase `disparos`:** el jugador en turno dispara a una casilla de las aguas del rival que **no** haya disparado antes. Resultado `'agua'` / `'tocado'` / `'hundido'` (este último cuando cae la última celda de un barco: todas sus celdas se re-marcan a `'hundido'`). **El turno siempre alterna**, aciertes o falles. Sin "tocado → disparas otra vez", sin `repiteTurno`.
- **Ganador:** el jugador que hunde el último barco rival. **No hay empate** — `winner` nunca es `null` en `finished`.
- **"Jugar de nuevo"** reinicia a `fase: 'colocacion'`, ambas flotas `null`, turno del Jugador 1, y el Board vuelve al interstitial de "Empezar" de J1.
- Payload del movimiento remoto = la unión `Move`. `esJugadaValida` valida la forma: para `disparo` que `celda` sea entera en `[0, 64)`; para `flota` delega en `esColocacionValida` (4 barcos, longitudes = permutación de `FLOTA`, cada barco recto/contiguo/en rango, sin celdas repetidas ni entre barcos).
- Motor inmutable: ante entrada inválida para la fase actual (o ilegal contra el estado), `playMove` devuelve **el mismo objeto** `state` que recibió (referencia igual, para que el Board detecte el rechazo y no lo emita ni renderice).
- **Secreto solo-UI:** el Board **nunca** pinta la flota del rival en el DOM. En la fase `disparos` tampoco pinta la flota propia — solo la cuadrícula de tiros propios + un contador "N de 4 a flote" + una línea de texto del disparo entrante. La flota propia solo se ve durante `colocacion`.
- **Determinismo remoto:** `generarFlotaAleatoria` (usa `Math.random`) se llama **solo** en el handler del botón "Barajar", nunca dentro de `playMove` ni en `onMovimientoRemoto`. La flota elegida viaja en `{tipo:'flota', barcos}` y el receptor la aplica tal cual. `playMove` es puro y determinista.
- Sin variantes: no 10×10, no flota de 5 barcos, no regla "cañonero" (barcos no se tocan), no "tocado repite turno", no >2 jugadores, sin colocación manual, sin mini-grid de la flota propia con daño durante los disparos, sin pantalla intermedia entre turnos de disparo, sin anti-trampa criptográfico.
- Solo español en todo el texto visible.
- `engine.ts` no importa nada del DOM ni de Astro.
- Patrón de registro: `import` **estático** del `Board.astro` en `src/pages/juegos/[slug].astro` (nunca `import()` dinámico con el slug como variable — rompe el build de Astro). Slug: `battleship`.
- TDD: primero el test que falla, luego el mínimo código para pasarlo. Commits frecuentes.

---

## Preparación (antes de la Task 1)

El plan asume un worktree/branch aislado creado con la skill `superpowers:using-git-worktrees`, basado en **`origin/main`**. Nombre sugerido del worktree: `battleship`. Todos los `git commit` de abajo ocurren en esa rama; la integración final es un PR contra `main`, como los 14 juegos anteriores.

Verifica el punto de partida:

```bash
npm test        # la suite actual debe pasar en verde
```

---

## Task 1: Motor — tipos, estado inicial, validación de colocación, generación aleatoria y conteo

Define los tipos, el estado inicial en fase `colocacion`, el validador de colocación de flota, el type guard del payload remoto, el generador de flota aleatoria y el contador de barcos a flote. **No** incluye `playMove` todavía.

**Files:**
- Create: `src/games/battleship/engine.ts`
- Test: `src/games/battleship/engine.test.ts`

**Interfaces:**
- Consumes: nada (primera task).
- Produces:
  - `type Player = 1 | 2`
  - `type Fase = 'colocacion' | 'disparos' | 'finished'`
  - `type Resultado = 'agua' | 'tocado' | 'hundido'`
  - `type Move = { tipo: 'flota'; barcos: number[][] } | { tipo: 'disparo'; celda: number }`
  - `interface BattleshipState { fase: Fase; currentPlayer: Player; flotas: Record<Player, number[][] | null>; disparos: Record<Player, (Resultado | null)[]>; winner: Player | null; ultimoDisparo: { por: Player; celda: number; resultado: Resultado } | null }`
  - `const TAMANO = 8` (export)
  - `const FLOTA = [4, 3, 3, 2] as const` (export)
  - `function createInitialState(): BattleshipState`
  - `function esColocacionValida(barcos: unknown): boolean`
  - `function esJugadaValida(payload: unknown): payload is Move`
  - `function generarFlotaAleatoria(): number[][]` — impura (usa `Math.random`)
  - `function barcosAFlote(state: BattleshipState, player: Player): number`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/games/battleship/engine.test.ts
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esColocacionValida,
  esJugadaValida,
  generarFlotaAleatoria,
  barcosAFlote,
  TAMANO,
  FLOTA,
  type BattleshipState,
  type Player,
} from './engine';

// Helpers compartidos por todas las tasks.
const idx = (fila: number, col: number) => fila * TAMANO + col;

// Barco horizontal de longitud `long` empezando en (fila, col).
const horiz = (fila: number, col: number, long: number): number[] =>
  Array.from({ length: long }, (_, k) => idx(fila, col + k));
// Barco vertical de longitud `long` empezando en (fila, col).
const vert = (fila: number, col: number, long: number): number[] =>
  Array.from({ length: long }, (_, k) => idx(fila + k, col));

// Flota válida de referencia: 4/3/3/2 en filas separadas, sin tocarse.
const FLOTA_OK = (): number[][] => [
  horiz(0, 0, 4),
  horiz(2, 0, 3),
  horiz(4, 0, 3),
  horiz(6, 0, 2),
];

describe('createInitialState', () => {
  it('arranca en fase colocacion, turno del jugador 1, ambas flotas null', () => {
    const s = createInitialState();
    expect(s.fase).toBe('colocacion');
    expect(s.currentPlayer).toBe(1);
    expect(s.flotas).toEqual({ 1: null, 2: null });
    expect(s.disparos[1]).toHaveLength(64);
    expect(s.disparos[2]).toHaveLength(64);
    expect(s.disparos[1].every(x => x === null)).toBe(true);
    expect(s.disparos[2].every(x => x === null)).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.ultimoDisparo).toBeNull();
  });

  it('TAMANO es 8 y FLOTA es [4,3,3,2]', () => {
    expect(TAMANO).toBe(8);
    expect([...FLOTA]).toEqual([4, 3, 3, 2]);
  });

  it('cada createInitialState devuelve arrays de disparos independientes', () => {
    const a = createInitialState();
    const b = createInitialState();
    a.disparos[1][0] = 'agua';
    expect(b.disparos[1][0]).toBeNull();
  });
});

describe('esColocacionValida', () => {
  it('acepta una flota 4/3/3/2 bien formada', () => {
    expect(esColocacionValida(FLOTA_OK())).toBe(true);
  });

  it('acepta barcos que se tocan (de lado y en diagonal)', () => {
    expect(
      esColocacionValida([
        horiz(0, 0, 4),
        horiz(1, 0, 3), // pegado por debajo al primero
        vert(2, 3, 3), // toca al segundo en diagonal
        horiz(5, 0, 2),
      ]),
    ).toBe(true);
  });

  it('acepta barcos verticales', () => {
    expect(
      esColocacionValida([vert(0, 0, 4), vert(0, 2, 3), vert(0, 4, 3), vert(0, 6, 2)]),
    ).toBe(true);
  });

  it('rechaza un número de barcos distinto de 4', () => {
    expect(esColocacionValida([horiz(0, 0, 4), horiz(2, 0, 3), horiz(4, 0, 3)])).toBe(false);
    expect(
      esColocacionValida([...FLOTA_OK(), horiz(7, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un multiconjunto de longitudes que no es {4,3,3,2}', () => {
    expect(
      esColocacionValida([horiz(0, 0, 4), horiz(2, 0, 4), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
    expect(
      esColocacionValida([horiz(0, 0, 3), horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un barco diagonal', () => {
    expect(
      esColocacionValida([[idx(0, 0), idx(1, 1), idx(2, 2), idx(3, 3)], horiz(5, 0, 3), horiz(6, 0, 3), horiz(7, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un barco no contiguo', () => {
    expect(
      esColocacionValida([[idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 4)], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un índice fuera de rango', () => {
    expect(
      esColocacionValida([[61, 62, 63, 64], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
    expect(
      esColocacionValida([[-1, 0, 1, 2], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza envolvimiento de borde (fila 0 col 6..fila 1 col 1)', () => {
    // idx(0,6),idx(0,7),idx(1,0),idx(1,1) son "consecutivos" como enteros pero cruzan de fila.
    expect(
      esColocacionValida([[idx(0, 6), idx(0, 7), idx(1, 0), idx(1, 1)], horiz(3, 0, 3), horiz(5, 0, 3), horiz(7, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza celdas repetidas dentro de un barco', () => {
    expect(
      esColocacionValida([[idx(0, 0), idx(0, 1), idx(0, 1), idx(0, 2)], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza dos barcos que se solapan', () => {
    expect(
      esColocacionValida([horiz(0, 0, 4), horiz(0, 2, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza entradas que no son arrays', () => {
    expect(esColocacionValida(null)).toBe(false);
    expect(esColocacionValida('flota')).toBe(false);
    expect(esColocacionValida({})).toBe(false);
    expect(esColocacionValida([1, 2, 3, 4])).toBe(false);
    expect(esColocacionValida([horiz(0, 0, 4), horiz(2, 0, 3), horiz(4, 0, 3), 'x'])).toBe(false);
  });
});

describe('esJugadaValida', () => {
  it('acepta disparo con celda entera en [0, 64)', () => {
    expect(esJugadaValida({ tipo: 'disparo', celda: 0 })).toBe(true);
    expect(esJugadaValida({ tipo: 'disparo', celda: 63 })).toBe(true);
  });

  it('acepta flota con una colocación válida', () => {
    expect(esJugadaValida({ tipo: 'flota', barcos: FLOTA_OK() })).toBe(true);
  });

  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo' })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: -1 })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: 64 })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: 1.5 })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: '3' })).toBe(false);
    expect(esJugadaValida({ tipo: 'flota' })).toBe(false);
    expect(esJugadaValida({ tipo: 'flota', barcos: [] })).toBe(false);
    expect(esJugadaValida({ tipo: 'otro', celda: 3 })).toBe(false);
  });
});

describe('generarFlotaAleatoria', () => {
  it('genera 200 flotas y todas pasan esColocacionValida', () => {
    for (let i = 0; i < 200; i++) {
      const flota = generarFlotaAleatoria();
      expect(esColocacionValida(flota)).toBe(true);
    }
  });

  it('las longitudes de los 4 barcos son exactamente 4,3,3,2 (en algún orden)', () => {
    const flota = generarFlotaAleatoria();
    expect(flota.map(b => b.length).sort((a, b) => b - a)).toEqual([4, 3, 3, 2]);
  });
});

describe('barcosAFlote', () => {
  it('con la flota sin colocar devuelve el total de barcos (4)', () => {
    expect(barcosAFlote(createInitialState(), 1)).toBe(FLOTA.length);
  });

  it('cuenta los barcos del jugador con al menos una celda sin tocar', () => {
    // J1 tiene FLOTA_OK; el rival (J2) le ha disparado y hundido el barco de 2.
    const s: BattleshipState = {
      ...createInitialState(),
      flotas: { 1: FLOTA_OK(), 2: null },
    };
    const barco2 = horiz(6, 0, 2); // último barco de FLOTA_OK
    s.disparos[2][barco2[0]] = 'hundido';
    s.disparos[2][barco2[1]] = 'hundido';
    expect(barcosAFlote(s, 1)).toBe(3);
  });

  it('un barco solo tocado parcialmente sigue a flote', () => {
    const s: BattleshipState = {
      ...createInitialState(),
      flotas: { 1: FLOTA_OK(), 2: null },
    };
    s.disparos[2][idx(0, 0)] = 'tocado'; // una celda del barco de 4
    expect(barcosAFlote(s, 1)).toBe(4);
  });

  it('cuenta por jugador de forma independiente', () => {
    const s: BattleshipState = {
      ...createInitialState(),
      flotas: { 1: FLOTA_OK(), 2: FLOTA_OK() },
    };
    for (const c of horiz(0, 0, 4)) s.disparos[1][c] = 'hundido'; // J1 hunde el de 4 de J2
    expect(barcosAFlote(s, 2)).toBe(3);
    expect(barcosAFlote(s, 1)).toBe(4);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/battleship/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 3: Implementar el motor mínimo**

```ts
// src/games/battleship/engine.ts
export type Player = 1 | 2;
export type Fase = 'colocacion' | 'disparos' | 'finished';
export type Resultado = 'agua' | 'tocado' | 'hundido';

export type Move =
  | { tipo: 'flota'; barcos: number[][] }
  | { tipo: 'disparo'; celda: number };

export interface BattleshipState {
  fase: Fase;
  currentPlayer: Player;
  flotas: Record<Player, number[][] | null>;
  disparos: Record<Player, (Resultado | null)[]>;
  winner: Player | null;
  ultimoDisparo: { por: Player; celda: number; resultado: Resultado } | null;
}

export const TAMANO = 8;
export const FLOTA = [4, 3, 3, 2] as const;
const TOTAL = TAMANO * TAMANO;

export function createInitialState(): BattleshipState {
  return {
    fase: 'colocacion',
    currentPlayer: 1,
    flotas: { 1: null, 2: null },
    disparos: {
      1: Array<Resultado | null>(TOTAL).fill(null),
      2: Array<Resultado | null>(TOTAL).fill(null),
    },
    winner: null,
    ultimoDisparo: null,
  };
}

const esEnteroEnRango = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < TOTAL;

/**
 * ¿Los índices `s` (ya ordenados asc.) forman un barco recto y contiguo dentro
 * del tablero? Horizontal = misma fila e índices consecutivos; vertical = misma
 * columna e índices separados por `TAMANO`. La condición de "misma fila/columna"
 * descarta el envolvimiento de borde.
 */
function esBarcoRecto(s: number[]): boolean {
  const n = s.length;
  if (n < 2) return false; // FLOTA no tiene barcos de longitud < 2
  const filaBase = Math.floor(s[0] / TAMANO);
  const horizontal = s.every(
    (c, k) => Math.floor(c / TAMANO) === filaBase && c === s[0] + k,
  );
  const colBase = s[0] % TAMANO;
  const vertical = s.every(
    (c, k) => c % TAMANO === colBase && c === s[0] + k * TAMANO,
  );
  return horizontal || vertical;
}

export function esColocacionValida(barcos: unknown): boolean {
  if (!Array.isArray(barcos) || barcos.length !== FLOTA.length) return false;

  const ocupadas = new Set<number>();
  const longitudes: number[] = [];

  for (const barco of barcos) {
    if (!Array.isArray(barco) || !barco.every(esEnteroEnRango)) return false;
    const s = [...barco].sort((a, b) => a - b);
    if (new Set(s).size !== s.length) return false; // celdas repetidas dentro del barco
    if (!esBarcoRecto(s)) return false;
    for (const c of s) {
      if (ocupadas.has(c)) return false; // solape entre barcos
      ocupadas.add(c);
    }
    longitudes.push(s.length);
  }

  const esperadas = [...FLOTA].sort((a, b) => a - b);
  return longitudes.sort((a, b) => a - b).every((l, i) => l === esperadas[i]);
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (p.tipo === 'disparo') return esEnteroEnRango(p.celda);
  if (p.tipo === 'flota') return esColocacionValida(p.barcos);
  return false;
}

/**
 * Reparte una flota 4/3/3/2 al azar: barcos rectos, dentro del tablero, sin
 * solaparse (tocarse permitido). IMPURA: usa `Math.random`. Solo debe llamarse
 * desde el handler del botón "Barajar" — su salida viaja en el payload
 * `{tipo:'flota', barcos}` y nunca se re-genera en el receptor.
 */
export function generarFlotaAleatoria(): number[][] {
  for (;;) {
    const ocupadas = new Set<number>();
    const barcos: number[][] = [];
    let completo = true;

    for (const long of FLOTA) {
      let elegido: number[] | null = null;
      for (let intento = 0; intento < 200 && elegido === null; intento++) {
        const horizontal = Math.random() < 0.5;
        const filas = horizontal ? TAMANO : TAMANO - long + 1;
        const cols = horizontal ? TAMANO - long + 1 : TAMANO;
        const fila = Math.floor(Math.random() * filas);
        const col = Math.floor(Math.random() * cols);
        const celdas = Array.from({ length: long }, (_, k) =>
          horizontal ? fila * TAMANO + col + k : (fila + k) * TAMANO + col,
        );
        if (celdas.some(c => ocupadas.has(c))) continue;
        elegido = celdas;
      }
      if (elegido === null) {
        completo = false;
        break;
      }
      elegido.forEach(c => ocupadas.add(c));
      barcos.push(elegido);
    }

    if (completo) return barcos;
  }
}

export function barcosAFlote(state: BattleshipState, player: Player): number {
  const flota = state.flotas[player];
  if (flota === null) return FLOTA.length;
  const rival: Player = player === 1 ? 2 : 1;
  const tirosDelRival = state.disparos[rival]; // disparos del rival sobre `player`
  return flota.filter(barco => barco.some(c => tirosDelRival[c] === null)).length;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/battleship/engine.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/games/battleship/engine.ts src/games/battleship/engine.test.ts
git commit -m "feat(battleship): motor base — tipos, estado, validación de flota y generación aleatoria"
```

---

## Task 2: Motor — `playMove` fase `colocacion` y transición a `disparos`

Añade `playMove`: en fase `colocacion` fija la flota del jugador en turno (normalizada a orden ascendente por barco) y alterna; al quedar ambas flotas puestas pasa a `disparos` con el turno del Jugador 1. La rama `disparos` se completa en la Task 3.

**Files:**
- Modify: `src/games/battleship/engine.ts`
- Test: `src/games/battleship/engine.test.ts` (añadir casos)

**Interfaces:**
- Consumes (de Task 1): `BattleshipState`, `Player`, `Move`, `createInitialState`, `esJugadaValida`, `esColocacionValida`, `FLOTA`, `TOTAL` (constante interna del módulo).
- Produces:
  - `function playMove(state: BattleshipState, move: Move): BattleshipState` — en esta task procesa `move.tipo === 'flota'` en fase `colocacion` y la transición. Ante cualquier otra entrada para la fase actual, devuelve el mismo `state`.

- [ ] **Step 1: Escribir los tests que fallan**

Fusiona `playMove` en el `import` de valores y añade este bloque al final de `engine.test.ts`:

```ts
import { playMove } from './engine'; // fusiónalo con el import existente

// Aplica la colocación de ambas flotas y devuelve el estado (fase 'disparos').
function colocarAmbas(flota1: number[][], flota2: number[][]): BattleshipState {
  let s = createInitialState();
  s = playMove(s, { tipo: 'flota', barcos: flota1 });
  s = playMove(s, { tipo: 'flota', barcos: flota2 });
  return s;
}

describe('playMove — fase colocacion', () => {
  it('fija la flota del jugador en turno y alterna a J2, sigue en colocacion', () => {
    const s = playMove(createInitialState(), { tipo: 'flota', barcos: FLOTA_OK() });
    expect(s.flotas[1]).not.toBeNull();
    expect(s.flotas[2]).toBeNull();
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('colocacion');
  });

  it('normaliza cada barco a orden ascendente de índices', () => {
    const desordenada = [
      [idx(0, 3), idx(0, 0), idx(0, 2), idx(0, 1)], // barco de 4, al revés
      horiz(2, 0, 3),
      horiz(4, 0, 3),
      horiz(6, 0, 2),
    ];
    const s = playMove(createInitialState(), { tipo: 'flota', barcos: desordenada });
    expect(s.flotas[1]![0]).toEqual([idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3)]);
  });

  it('al quedar ambas flotas puestas pasa a disparos con turno de J1', () => {
    const s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    expect(s.fase).toBe('disparos');
    expect(s.currentPlayer).toBe(1);
    expect(s.flotas[1]).not.toBeNull();
    expect(s.flotas[2]).not.toBeNull();
  });

  it('rechaza un disparo durante la colocacion (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'disparo', celda: 0 })).toBe(s);
  });

  it('rechaza una flota inválida (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'flota', barcos: [1, 2, 3, 4] } as never)).toBe(s);
    expect(playMove(s, { tipo: 'flota', barcos: [horiz(0, 0, 4), horiz(0, 2, 3), horiz(4, 0, 3), horiz(6, 0, 2)] })).toBe(s);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState();
    playMove(s, { tipo: 'flota', barcos: FLOTA_OK() });
    expect(s.flotas).toEqual({ 1: null, 2: null });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/battleship/engine.test.ts`
Expected: FAIL — `playMove` no existe.

- [ ] **Step 3: Implementar `playMove` (colocacion)**

Añade al final de `src/games/battleship/engine.ts`:

```ts
export function playMove(state: BattleshipState, move: Move): BattleshipState {
  if (state.fase === 'finished') return state;
  if (!esJugadaValida(move)) return state;

  if (state.fase === 'colocacion') {
    if (move.tipo !== 'flota') return state;
    // esJugadaValida ya validó la colocación; normalizamos cada barco.
    const barcos = move.barcos.map(barco => [...barco].sort((a, b) => a - b));
    const yo = state.currentPlayer;
    const flotas: Record<Player, number[][] | null> = {
      1: yo === 1 ? barcos : state.flotas[1],
      2: yo === 2 ? barcos : state.flotas[2],
    };

    if (flotas[1] !== null && flotas[2] !== null) {
      return { ...state, flotas, fase: 'disparos', currentPlayer: 1 };
    }
    return { ...state, flotas, currentPlayer: yo === 1 ? 2 : 1 };
  }

  // state.fase === 'disparos' — se completa en la Task 3.
  return state;
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/battleship/engine.test.ts`
Expected: PASS (todos, incluidos los de Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/games/battleship/engine.ts src/games/battleship/engine.test.ts
git commit -m "feat(battleship): playMove fase colocacion y transición a disparos"
```

---

## Task 3: Motor — fase `disparos` (agua/tocado/hundido), fin de partida y fuzzing

Completa la rama `disparos` de `playMove`: resuelve el disparo contra la flota rival, detecta barco hundido y flota completa, actualiza `ultimoDisparo` y alterna el turno. Añade un test de fuzzing sobre partidas completas.

**Files:**
- Modify: `src/games/battleship/engine.ts`
- Test: `src/games/battleship/engine.test.ts` (añadir casos)

**Interfaces:**
- Consumes (de Task 1/2): todo lo anterior más `barcosAFlote`, `generarFlotaAleatoria`.
- Produces: `playMove` procesa `move.tipo === 'disparo'` en fase `disparos`. API público sin cambios de firma.

- [ ] **Step 1: Escribir los tests que fallan**

Añade al final de `engine.test.ts`:

```ts
describe('playMove — fase disparos', () => {
  it('disparo a agua: marca agua, guarda ultimoDisparo y pasa el turno', () => {
    // J2 tiene FLOTA_OK (filas 0,2,4,6 desde la col 0). La fila 1 es todo agua.
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s = playMove(s0, { tipo: 'disparo', celda: idx(1, 0) });
    expect(s.disparos[1][idx(1, 0)]).toBe('agua');
    expect(s.ultimoDisparo).toEqual({ por: 1, celda: idx(1, 0), resultado: 'agua' });
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('disparos');
  });

  it('disparo que toca sin hundir: marca tocado', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s = playMove(s0, { tipo: 'disparo', celda: idx(0, 0) }); // 1.ª celda del barco de 4
    expect(s.disparos[1][idx(0, 0)]).toBe('tocado');
    expect(s.ultimoDisparo!.resultado).toBe('tocado');
  });

  it('al caer la última celda de un barco lo marca hundido en todas sus celdas', () => {
    let s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    // El barco de 2 de J2 está en idx(6,0), idx(6,1). J1 dispara a ambos (J2 tira a agua en medio).
    s = playMove(s, { tipo: 'disparo', celda: idx(6, 0) }); // J1 tocado
    s = playMove(s, { tipo: 'disparo', celda: idx(1, 7) }); // J2 agua
    s = playMove(s, { tipo: 'disparo', celda: idx(6, 1) }); // J1 hunde
    expect(s.disparos[1][idx(6, 0)]).toBe('hundido');
    expect(s.disparos[1][idx(6, 1)]).toBe('hundido');
    expect(s.ultimoDisparo).toEqual({ por: 1, celda: idx(6, 1), resultado: 'hundido' });
    expect(s.fase).toBe('disparos'); // aún quedan 3 barcos
  });

  it('rechaza disparar dos veces a la misma celda (misma referencia)', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s1 = playMove(s0, { tipo: 'disparo', celda: idx(1, 0) }); // J1 dispara
    const s2 = playMove(s1, { tipo: 'disparo', celda: idx(2, 2) }); // J2 dispara
    expect(playMove(s2, { tipo: 'disparo', celda: idx(1, 0) })).toBe(s2); // J1 repite celda
  });

  it('rechaza una colocacion durante la fase disparos (misma referencia)', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    expect(playMove(s0, { tipo: 'flota', barcos: FLOTA_OK() })).toBe(s0);
  });

  it('el turno alterna aunque el disparo sea un acierto', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s = playMove(s0, { tipo: 'disparo', celda: idx(0, 0) }); // tocado
    expect(s.currentPlayer).toBe(2);
  });

  it('hundir el último barco rival termina la partida y fija el ganador', () => {
    // J1 hunde toda la flota de J2 (12 celdas de FLOTA_OK) intercalando disparos de J2 a agua.
    let s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const celdasRival = FLOTA_OK().flat(); // 12 celdas de la flota de J2
    const aguaJ2 = [idx(1, 0), idx(1, 1), idx(1, 2), idx(1, 3), idx(1, 4), idx(1, 5), idx(1, 6), idx(1, 7), idx(3, 0), idx(3, 1), idx(3, 2)];
    for (let k = 0; k < celdasRival.length; k++) {
      s = playMove(s, { tipo: 'disparo', celda: celdasRival[k] }); // J1
      if (s.fase === 'finished') break;
      s = playMove(s, { tipo: 'disparo', celda: aguaJ2[k] }); // J2
    }
    expect(s.fase).toBe('finished');
    expect(s.winner).toBe(1);
    expect(barcosAFlote(s, 2)).toBe(0);
  });

  it('no permite más disparos tras terminar (misma referencia)', () => {
    let s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const celdasRival = FLOTA_OK().flat();
    const aguaJ2 = [idx(1, 0), idx(1, 1), idx(1, 2), idx(1, 3), idx(1, 4), idx(1, 5), idx(1, 6), idx(1, 7), idx(3, 0), idx(3, 1), idx(3, 2)];
    for (let k = 0; k < celdasRival.length; k++) {
      s = playMove(s, { tipo: 'disparo', celda: celdasRival[k] });
      if (s.fase === 'finished') break;
      s = playMove(s, { tipo: 'disparo', celda: aguaJ2[k] });
    }
    expect(playMove(s, { tipo: 'disparo', celda: idx(7, 7) })).toBe(s);
  });

  it('determinismo remoto: dos instancias con la misma secuencia de Move convergen', () => {
    const f1 = generarFlotaAleatoria();
    const f2 = generarFlotaAleatoria();
    const jugadas: Move[] = [
      { tipo: 'flota', barcos: f1 },
      { tipo: 'flota', barcos: f2 },
      { tipo: 'disparo', celda: 0 },
      { tipo: 'disparo', celda: 63 },
      { tipo: 'disparo', celda: 12 },
      { tipo: 'disparo', celda: 40 },
    ];
    const correr = () => jugadas.reduce((s, m) => playMove(s, m), createInitialState());
    expect(correr()).toEqual(correr());
  });
});

describe('fuzzing — partidas aleatorias completas', () => {
  it('300 partidas: siempre termina en finished con un ganador y 0 barcos rivales a flote', () => {
    for (let partida = 0; partida < 300; partida++) {
      let s = createInitialState();
      s = playMove(s, { tipo: 'flota', barcos: generarFlotaAleatoria() });
      s = playMove(s, { tipo: 'flota', barcos: generarFlotaAleatoria() });
      expect(s.fase).toBe('disparos');

      const pendientes: Record<Player, number[]> = {
        1: Array.from({ length: 64 }, (_, i) => i),
        2: Array.from({ length: 64 }, (_, i) => i),
      };

      let iteraciones = 0;
      while (s.fase === 'disparos') {
        expect(iteraciones++).toBeLessThan(200);
        const yo = s.currentPlayer;
        const cola = pendientes[yo];
        const pos = Math.floor(Math.random() * cola.length);
        const celda = cola.splice(pos, 1)[0];
        const aFloteAntes = barcosAFlote(s, yo === 1 ? 2 : 1);
        s = playMove(s, { tipo: 'disparo', celda });
        const rival: Player = yo === 1 ? 2 : 1;
        expect(barcosAFlote(s, rival)).toBeLessThanOrEqual(aFloteAntes);
      }

      expect(s.fase).toBe('finished');
      expect(s.winner === 1 || s.winner === 2).toBe(true);
      expect(barcosAFlote(s, s.winner === 1 ? 2 : 1)).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/games/battleship/engine.test.ts`
Expected: FAIL — hoy la rama `disparos` de `playMove` devuelve `state` sin aplicar nada.

- [ ] **Step 3: Completar la rama `disparos` de `playMove`**

En `src/games/battleship/engine.ts`, reemplaza la última parte de `playMove`
(el comentario `// state.fase === 'disparos' — se completa en la Task 3.` y su `return state;`) por:

```ts
  // state.fase === 'disparos'
  if (move.tipo !== 'disparo') return state;

  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  if (state.disparos[yo][move.celda] !== null) return state; // ya disparada

  const flotaRival = state.flotas[rival]!; // no null en fase disparos
  const barcoImpactado = flotaRival.find(barco => barco.includes(move.celda));

  const misDisparos = [...state.disparos[yo]];
  let resultado: Resultado;
  if (barcoImpactado === undefined) {
    misDisparos[move.celda] = 'agua';
    resultado = 'agua';
  } else {
    misDisparos[move.celda] = 'tocado';
    const hundido = barcoImpactado.every(
      c => misDisparos[c] === 'tocado' || misDisparos[c] === 'hundido',
    );
    if (hundido) {
      for (const c of barcoImpactado) misDisparos[c] = 'hundido';
      resultado = 'hundido';
    } else {
      resultado = 'tocado';
    }
  }

  const disparos: Record<Player, (Resultado | null)[]> = {
    1: yo === 1 ? misDisparos : state.disparos[1],
    2: yo === 2 ? misDisparos : state.disparos[2],
  };
  const ultimoDisparo = { por: yo, celda: move.celda, resultado };

  const flotaRivalHundida = flotaRival.every(barco =>
    barco.every(c => misDisparos[c] === 'hundido'),
  );
  if (flotaRivalHundida) {
    return { ...state, disparos, ultimoDisparo, fase: 'finished', winner: yo };
  }
  return { ...state, disparos, ultimoDisparo, currentPlayer: rival };
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/games/battleship/engine.test.ts`
Expected: PASS (todos). El fuzzing tarda <1 s.

- [ ] **Step 5: Correr toda la suite**

Run: `npm test`
Expected: PASS — sin regresiones en los otros juegos.

- [ ] **Step 6: Commit**

```bash
git add src/games/battleship/engine.ts src/games/battleship/engine.test.ts
git commit -m "feat(battleship): fase disparos — agua/tocado/hundido, fin de partida y fuzzing"
```

---

## Task 4: Tablero, contenido y registro del juego

Pinta el tablero 8×8 con etiquetas de coordenadas, el interstitial de "Empezar", los controles de colocación (Barajar / Confirmar) y la línea del disparo entrante; conecta todo al motor vía `iniciarSesionJuego` respetando el secreto de la flota; y registra el juego para que aparezca en el índice y sea jugable (local y remoto).

**Files:**
- Create: `src/games/battleship/Board.astro`
- Create: `src/content/juegos/battleship.md`
- Modify: `src/pages/juegos/[slug].astro` (añadir import + entrada en `BOARDS`)
- Modify: `abstract-games-by-category/GAME-INDEX.md` (marcar ✅ la fila `37-battleship.md`)

**Interfaces:**
- Consumes (de Task 1/2/3): `createInitialState`, `esJugadaValida`, `generarFlotaAleatoria`, `barcosAFlote`, `playMove`, `FLOTA`, `TAMANO`, `type BattleshipState`, `type Move`, `type Player` de `./engine`.
- Consumes (del repo): `iniciarSesionJuego<TMovimiento>` de `../../lib/gameSession` (config: `validarMovimiento`, `onMovimientoRemoto`, `onAplicarReinicio`, `onRender`, `onDesconectar`; devuelve `esMiTurno(jugadorActual)`, `miAsiento` (`Player | null`, `null` en pasar-y-jugar), `enviarMovimiento`, `mostrarTurno`, `mostrarFinDeJuego`, `nombres`). `TableroJuego` de `../../components/TableroJuego.astro`. `mostrarTurno` acepta `{ jugador, simbolos?: Record<Player,string>, puntajes?: Record<Player, number|string>, detalle?: string }` (confirmado en `src/lib/gameSession.ts:29-36`). `mostrarFinDeJuego` acepta `{ titulo: string, detalle?: string }` (confirmado en `src/lib/winnerBanner.ts:1-4` y `src/games/domineering/Board.astro:217`).
- Produces: `battleship` como slug jugable.

- [ ] **Step 1: Crear la ficha de contenido**

Guardar en `src/content/juegos/battleship.md`:

```markdown
---
title: "Batalla naval"
description: "Coloca tu flota, dispara a las aguas del rival y húndele todos los barcos antes de que él hunda los tuyos."
icono: "🚢"
minJugadores: 2
maxJugadores: 2
---

1. El tablero es de 8×8 casillas. Cada jugador tiene una flota de 4 barcos: uno de 4 casillas, dos de 3 y uno de 2.
2. **Preparación:** pulsa **Barajar** hasta que te guste cómo queda tu flota y luego **Confirmar flota**. Los barcos se colocan rectos (en fila o en columna) y pueden quedar pegados entre sí. Primero coloca el Jugador 1 y después el Jugador 2.
3. Durante la preparación solo ves tu propia flota. Después de confirmarla, ya no se muestra: cada quien juega de memoria.
4. **En tu turno**, toca una casilla de las aguas del rival que no hayas disparado todavía.
5. El disparo es **agua** si no hay barco, **tocado** si aciertas, y **hundido** cuando derribas la última casilla de un barco.
6. Aciertes o falles, el turno pasa al otro jugador.
7. No puedes disparar dos veces a la misma casilla.
8. Gana quien hunde toda la flota del rival primero.
```

> Nota para quien implementa: si `🚢` no renderiza bien en el índice, prueba `"⚓"`. Verifícalo en el Step 2.

- [ ] **Step 2: Verificar que el juego aparece en el índice**

Run: `npm run dev` y abrir `http://localhost:4321/`.
Expected: aparece la tarjeta "Batalla naval" con su ícono. Al entrar, la ruta `/juegos/battleship` carga (modal de instrucciones; el tablero aún no pinta nada — falta el `Board.astro`). Detener el dev server.

- [ ] **Step 3: Crear `Board.astro`**

Guardar en `src/games/battleship/Board.astro`:

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';

const TAMANO = 8;
const casillas = Array.from({ length: TAMANO * TAMANO }, (_, i) => i);
const letras = Array.from({ length: TAMANO }, (_, i) => String.fromCharCode(65 + i));
const numeros = Array.from({ length: TAMANO }, (_, i) => i + 1);
---

<TableroJuego class="tablero-battleship">
  <div id="interstitial" class="interstitial">
    <p id="interstitial-texto" class="interstitial__texto"></p>
    <button type="button" id="empezar" class="boton-primario">Empezar</button>
  </div>

  <p id="espera" class="mensaje-espera" hidden>
    Esperando a que el rival coloque su flota…
  </p>

  <div id="zona-tablero" class="zona-tablero">
    <div class="grid-wrap">
      <div class="etiquetas etiquetas--col">
        {letras.map(l => <span>{l}</span>)}
      </div>
      <div class="etiquetas etiquetas--fila">
        {numeros.map(n => <span>{n}</span>)}
      </div>
      <div
        id="tablero"
        class="tablero"
        role="grid"
        aria-label="Aguas del rival, 8 por 8"
      >
        {casillas.map(i => (
          <button
            type="button"
            class="casilla"
            data-indice={i}
            aria-label={`Casilla ${letras[i % TAMANO]}${Math.floor(i / TAMANO) + 1}`}
          />
        ))}
      </div>
    </div>

    <div id="controles-colocacion" class="controles-colocacion" hidden>
      <button type="button" id="barajar" class="boton-secundario">Barajar</button>
      <button type="button" id="confirmar" class="boton-primario">Confirmar flota</button>
    </div>

    <p id="resumen-flota" class="resumen-flota" hidden></p>
    <p id="mensaje-disparo" class="mensaje-disparo" hidden></p>
  </div>
</TableroJuego>

<style>
  .interstitial {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem 1rem;
    text-align: center;
  }

  .interstitial[hidden] {
    display: none;
  }

  .interstitial__texto {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0;
  }

  .mensaje-espera {
    text-align: center;
    font-style: italic;
    padding: 2rem 1rem;
  }

  .zona-tablero[hidden] {
    display: none;
  }

  .grid-wrap {
    display: grid;
    grid-template-columns: 1.4rem 1fr;
    grid-template-rows: 1.4rem 1fr;
    width: min(92vw, 30rem);
    margin: 0 auto;
    gap: 0.2rem;
  }

  .etiquetas {
    display: grid;
    font-size: 0.75rem;
    color: var(--color-text-muted, #666);
  }

  .etiquetas span {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .etiquetas--col {
    grid-column: 2;
    grid-row: 1;
    grid-template-columns: repeat(8, 1fr);
  }

  .etiquetas--fila {
    grid-column: 1;
    grid-row: 2;
    grid-template-rows: repeat(8, 1fr);
  }

  .tablero {
    grid-column: 2;
    grid-row: 2;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    aspect-ratio: 1;
    gap: 0.2rem;
    touch-action: manipulation;
  }

  .casilla {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(0.9rem, 5vw, 1.6rem);
    font-weight: 700;
    line-height: 1;
    background: var(--color-surface);
    border: 2px solid #ddd;
    border-radius: 6px;
    padding: 0;
  }

  .casilla[data-estado='barco'] {
    background: var(--color-player-1);
    color: transparent;
  }

  .casilla[data-estado='agua'] {
    color: var(--color-text-muted, #888);
  }

  .casilla[data-estado='tocado'],
  .casilla[data-estado='hundido'] {
    color: var(--color-player-2);
  }

  .casilla[data-estado='hundido'] {
    box-shadow: inset 0 0 0 3px var(--color-accent);
  }

  .controles-colocacion {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    margin: 1rem auto 0;
  }

  .controles-colocacion[hidden] {
    display: none;
  }

  .resumen-flota,
  .mensaje-disparo {
    text-align: center;
    margin: 0.75rem auto 0;
  }

  .resumen-flota[hidden],
  .mensaje-disparo[hidden] {
    display: none;
  }

  .boton-primario,
  .boton-secundario {
    min-width: var(--tap-target-min);
    min-height: var(--tap-target-min);
    padding: 0.5rem 1.25rem;
    font-size: 1rem;
    font-weight: 700;
    border-radius: 8px;
    border: 2px solid var(--color-accent);
  }

  .boton-secundario {
    background: var(--color-surface);
    color: inherit;
  }

  .boton-primario {
    background: var(--color-accent);
    color: #fff;
  }
</style>

<script>
  import {
    createInitialState,
    esJugadaValida,
    generarFlotaAleatoria,
    barcosAFlote,
    playMove,
    FLOTA,
    type BattleshipState,
    type Move,
    type Player,
  } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const FICHAS = { 1: '●', 2: '▲' } as const;
  const TOTAL_BARCOS = FLOTA.length;
  const TAMANO = 8;

  const coord = (i: number) =>
    `${String.fromCharCode(65 + (i % TAMANO))}${Math.floor(i / TAMANO) + 1}`;
  const textoResultado = (r: 'agua' | 'tocado' | 'hundido') =>
    r === 'agua' ? 'agua' : r === 'tocado' ? 'tocado' : '¡hundido!';
  const glifoEstado = (r: 'agua' | 'tocado' | 'hundido' | null) =>
    r === 'agua' ? '·' : r === 'tocado' ? '✳' : r === 'hundido' ? '✖' : '';

  const interstitial = document.getElementById('interstitial')!;
  const interstitialTexto = document.getElementById('interstitial-texto')!;
  const empezarBtn = document.getElementById('empezar') as HTMLButtonElement;
  const espera = document.getElementById('espera')!;
  const zonaTablero = document.getElementById('zona-tablero')!;
  const controlesColocacion = document.getElementById('controles-colocacion')!;
  const barajarBtn = document.getElementById('barajar') as HTMLButtonElement;
  const confirmarBtn = document.getElementById('confirmar') as HTMLButtonElement;
  const resumenFlota = document.getElementById('resumen-flota')!;
  const mensajeDisparo = document.getElementById('mensaje-disparo')!;
  const tablero = document.getElementById('tablero')!;
  const casillasEl = Array.from(
    tablero.querySelectorAll<HTMLButtonElement>('.casilla'),
  );

  let state: BattleshipState = createInitialState();
  let flotaPrevia: number[][] = generarFlotaAleatoria();
  // Baja tras pulsar "Empezar"; el nuevo colocador la sube de nuevo.
  let listoParaColocar = false;

  const sesion = iniciarSesionJuego<Move>({
    validarMovimiento: esJugadaValida,
    onMovimientoRemoto: move => jugar(move, false),
    onAplicarReinicio: () => {
      state = createInitialState();
      flotaPrevia = generarFlotaAleatoria();
      listoParaColocar = false;
      render();
    },
    onRender: render,
    onDesconectar: () => {
      casillasEl.forEach(c => (c.disabled = true));
      [empezarBtn, barajarBtn, confirmarBtn].forEach(b => (b.disabled = true));
    },
  });

  function jugar(move: Move, emitirRemoto = true): void {
    const prev = state;
    state = playMove(state, move);
    if (state === prev) return; // rechazado → no renderiza ni emite
    // Si durante la colocación cambió el jugador que coloca, el nuevo debe
    // pasar por el interstitial "Empezar".
    if (
      prev.fase === 'colocacion' &&
      state.fase === 'colocacion' &&
      prev.currentPlayer !== state.currentPlayer
    ) {
      listoParaColocar = false;
      // CRÍTICO para el secreto: sin esto, el nuevo colocador vería (y podría
      // confirmar) la flota que el anterior acaba de fijar. Inocuo en remoto —
      // el preview local nunca entró al estado; el payload sigue siendo lo que
      // envía "Confirmar flota".
      flotaPrevia = generarFlotaAleatoria();
    }
    render();
    if (emitirRemoto) sesion.enviarMovimiento(move);
  }

  function render(): void {
    const asiento = sesion.miAsiento; // Player | null
    const vista: Player = asiento ?? state.currentPlayer; // perspectiva a mostrar
    const esMiTurno = sesion.esMiTurno(state.currentPlayer);
    const enColocacion = state.fase === 'colocacion';
    const enDisparos = state.fase === 'disparos';
    // La cuadrícula de tiros y el resumen siguen visibles al terminar la
    // partida (como en todos los juegos del repo el tablero final no se borra).
    const mostrarTiros = enDisparos || state.fase === 'finished';
    const enInterstitial = enColocacion && esMiTurno && !listoParaColocar;
    const mostrarPreview = enColocacion && esMiTurno && listoParaColocar;

    interstitial.hidden = !enInterstitial;
    if (enInterstitial) {
      interstitialTexto.textContent = `Jugador ${state.currentPlayer} (${FICHAS[state.currentPlayer]}): coloca tu flota`;
    }
    espera.hidden = !(enColocacion && !esMiTurno);
    zonaTablero.hidden = enInterstitial || (enColocacion && !esMiTurno);
    controlesColocacion.hidden = !mostrarPreview;

    const celdasPreview = new Set<number>(mostrarPreview ? flotaPrevia.flat() : []);

    casillasEl.forEach((casilla, i) => {
      if (mostrarTiros) {
        const r = state.disparos[vista][i];
        casilla.textContent = glifoEstado(r);
        casilla.dataset.estado = r ?? '';
        casilla.disabled = r !== null || !esMiTurno || state.fase === 'finished';
      } else if (mostrarPreview) {
        casilla.textContent = '';
        casilla.dataset.estado = celdasPreview.has(i) ? 'barco' : '';
        casilla.disabled = true;
      } else {
        casilla.textContent = '';
        casilla.dataset.estado = '';
        casilla.disabled = true;
      }
    });

    resumenFlota.hidden = !mostrarTiros;
    mensajeDisparo.hidden = !mostrarTiros;
    if (mostrarTiros) {
      resumenFlota.textContent = `Tu flota: ${barcosAFlote(state, vista)} de ${TOTAL_BARCOS} a flote`;
      const ud = state.ultimoDisparo;
      mensajeDisparo.textContent =
        ud && ud.por !== vista
          ? `Te dispararon en ${coord(ud.celda)} — ${textoResultado(ud.resultado)}`
          : '';
    }

    if (state.fase === 'finished') {
      const g = state.winner as Player;
      sesion.mostrarFinDeJuego({
        titulo: `🎉 ¡Ganó ${sesion.nombres[g]} (${FICHAS[g]})!`,
        detalle: 'Hundió toda la flota rival',
      });
      return;
    }

    sesion.mostrarTurno({
      jugador: state.currentPlayer,
      simbolos: { 1: FICHAS[1], 2: FICHAS[2] },
      puntajes: { 1: barcosAFlote(state, 1), 2: barcosAFlote(state, 2) },
      detalle: enColocacion ? 'Coloca tu flota' : 'Elige dónde disparar',
    });
  }

  empezarBtn.addEventListener('click', () => {
    listoParaColocar = true;
    render();
  });

  barajarBtn.addEventListener('click', () => {
    flotaPrevia = generarFlotaAleatoria();
    render();
  });

  confirmarBtn.addEventListener('click', () => {
    jugar({ tipo: 'flota', barcos: flotaPrevia });
  });

  casillasEl.forEach(casilla => {
    casilla.addEventListener('click', () => {
      if (state.fase !== 'disparos') return;
      jugar({ tipo: 'disparo', celda: Number(casilla.dataset.indice) });
    });
  });

  render();
</script>
```

> Nota para quien implementa: el guard de turno vive **solo** en `render()` (deshabilitando casillas y botones). No metas `esMiTurno` dentro de `jugar()`: los movimientos remotos llegan cuando el `currentPlayer` local aún apunta al emisor y un guard incondicional los descartaría en silencio (lección `remoto-guard-turno-jugar`). `playMove` es la autoridad y es idempotente ante entradas inválidas. El secreto de la flota es una propiedad de `render()`: en fase `disparos` se pinta `state.disparos[vista]` (tiros propios), nunca `state.flotas`.

- [ ] **Step 4: Registrar el board en `[slug].astro`**

En `src/pages/juegos/[slug].astro`:

1. Añadir el import junto a los otros (después de `import TriggleBoard from '../../games/triggle/Board.astro';`):

```astro
import BattleshipBoard from '../../games/battleship/Board.astro';
```

2. Añadir la entrada al objeto `BOARDS` (después de `triggle: TriggleBoard,`):

```astro
  battleship: BattleshipBoard,
```

- [ ] **Step 5: Actualizar el backlog**

En `abstract-games-by-category/GAME-INDEX.md`, en la fila
`| 01-2-players | [37-battleship.md](01-2-players/37-battleship.md) | |`,
poner `✅` en la última columna: `| ... | ✅ |` (misma forma que las filas ya marcadas). **No** se edita la ficha `37-battleship.md`.

- [ ] **Step 6: Verificar build y tipos**

Run: `npx astro check`
Expected: sin errores.

Run: `npm run build`
Expected: build limpio; la ruta `/juegos/battleship` aparece en la salida.

- [ ] **Step 7: Playtest manual (local)**

Run: `npm run dev`, abrir `http://localhost:4321/juegos/battleship`, cerrar el modal de instrucciones, elegir modo local. Con DevTools a ~375 px de ancho, verificar:
- El `grid-wrap` (etiquetas A–H / 1–8 + tablero 8×8) cabe sin scroll horizontal en escritorio y en móvil.
- **Colocación J1:** aparece el interstitial "Jugador 1 (●): coloca tu flota" con "Empezar". Al tocar "Empezar" se ve el tablero con 12 celdas sombreadas (la flota) y los botones "Barajar" / "Confirmar flota". "Barajar" cambia la disposición. "Confirmar flota" pasa al interstitial "Jugador 2 (▲)…".
- **Colocación J2:** al tocar "Empezar", la flota que ve J2 es **distinta** de la que J1 acababa de confirmar (compara mentalmente las 12 celdas sombreadas antes y después del cambio de jugador — nunca deben coincidir). Al confirmar, el tablero se limpia y el indicador de turno pasa a "Elige dónde disparar", turno del Jugador 1.
- **Disparos:** tocar una casilla la marca `·` (agua) o `✳` (tocado); al derribar el último trozo de un barco sus celdas pasan a `✖` con anillo. El turno alterna en cada disparo. Bajo el tablero: "Tu flota: N de 4 a flote" y, tras el primer disparo del rival, "Te dispararon en X — …". Una casilla ya disparada no responde.
- El marcador del indicador de turno muestra los barcos a flote de cada jugador (`4` / `4` al empezar).
- Al hundir el último barco rival: banner "🎉 ¡Ganó …!" con "Hundió toda la flota rival". La cuadrícula de tiros y el "N de 4 a flote" **siguen visibles** detrás del banner (no se borran); ninguna casilla responde al toque.
- "Jugar de nuevo" vuelve al interstitial de J1.
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
git add src/games/battleship/Board.astro src/content/juegos/battleship.md src/pages/juegos/\[slug\].astro abstract-games-by-category/GAME-INDEX.md
git commit -m "feat(battleship): tablero, contenido y registro del juego"
```

---

## Integración final

Tras la Task 4, con `npm test`, `npx astro check` y `npm run build` en verde:

- [ ] Abrir PR de la rama contra `main` (como los 14 juegos anteriores). En el cuerpo del PR, anotar como seguimiento no bloqueante:
  - **Modo remoto no probado en navegador** (el `astro dev` no sirve el Worker de señalización) — hacer playtest de 2 navegadores contra el Worker desplegado, igual que Notakto / Obstrucción / Sim / Domineering / Estampida. Verificar en especial: (a) la flota aleatoria de cada lado se respeta (no se re-sortea en el receptor); (b) el interstitial "Esperando a que el rival coloque su flota" aparece en el lado que no está colocando; (c) la reconexión (`sync-hola` con checksum FNV-1a) no dispara falso desync — ambos lados tienen el mismo registro.
  - **Secreto solo-UI:** en modo remoto la flota del rival está en memoria JS del navegador (no en el DOM). Aceptado en el brainstorming; sin esquema de commitment.
  - Menores site-wide ya conocidos: `role="grid"` sin `row`/`gridcell`; `aria-label` de casilla estático que no refleja el resultado del disparo; blancos de tap ~41 px a 375 px en el tablero (tradeoff aceptado en el spec).
  - Posible pulido posterior: mostrar la flota propia con su daño como mini-grid durante los disparos (es seguro porque `render()` siempre pinta la perspectiva de `vista`); colocación manual de barcos (toque + rotar).

---

## Self-Review (hecho al escribir el plan)

**Cobertura del spec:**
- Estado compartido, secreto solo-UI, sin anti-trampa → Global Constraints + nota en Task 4 Step 3 (`render()` pinta `disparos[vista]`, nunca `flotas`).
- Tablero 8×8, flota 4/3/3/2, fila-mayor → Global Constraints + `TAMANO`/`FLOTA` (Task 1) + `battleship.md` (Task 4).
- Tipos `Player/Fase/Resultado/Move/BattleshipState` → Task 1 (definidos y probados vía `createInitialState`).
- `esColocacionValida` (4 barcos, longitudes = permutación de FLOTA, recto/contiguo/en rango, sin envolvimiento, sin repetidas ni solapes, tocarse permitido) → Task 1 + 13 casos de test.
- `esJugadaValida` (forma; `disparo.celda` en rango; `flota` → `esColocacionValida`) → Task 1 + tests de aceptación/rechazo.
- `generarFlotaAleatoria` impura, solo desde "Barajar", salida en el payload → Task 1 (impl + tests de 200 flotas válidas) + Global Constraints + Task 4 (handler `barajarBtn`, nunca en `playMove`/`onMovimientoRemoto`).
- `barcosAFlote` por jugador → Task 1 + tests (a flote total sin flota, parcial sigue a flote, hundido baja, independiente por jugador).
- Fase `colocacion`: solo `flota`, normaliza a orden asc., alterna J1→J2, transición a `disparos` con turno J1 → Task 2 (`playMove` + `colocarAmbas` + tests).
- Motor inmutable, misma referencia ante entrada inválida (disparo en colocación, flota inválida, colocación en disparos, celda repetida, jugada tras finished) → Task 2 y Task 3 tests.
- Fase `disparos`: agua/tocado/hundido (re-marca todas las celdas del barco), rechazo de celda ya disparada, turno **siempre** alterna, `ultimoDisparo` con `por`/`celda`/`resultado` → Task 3 + tests.
- Fin: `winner` = quien hunde el último barco; `fase: 'finished'`; **sin empate** (`winner` nunca null en finished) → Task 3 test "hundir el último barco rival" + fuzzing (`s.winner === 1 || s.winner === 2`).
- Determinismo remoto → Task 3 test dedicado (`correr()` dos veces, `toEqual`) + fuzzing.
- Board: interstitial "Empezar" por colocador; Barajar/Confirmar; grid 8×8 con etiquetas A–H/1–8; en `disparos` solo `disparos[vista]` + "N de 4 a flote" + línea de disparo entrante; nunca dibuja la flota rival ni la propia en `disparos` → Task 4 Step 3.
- `mostrarTurno` con `simbolos` + `puntajes` (barcos a flote) + `detalle`; `mostrarFinDeJuego` con `titulo`/`detalle` → Task 4 Step 3.
- Interstitial "esperando" para el lado que no coloca en remoto (`esMiTurno` false en `colocacion`) → Task 4 Step 3 (`espera.hidden`).
- "Jugar de nuevo" reinicia a `colocacion` + interstitial J1 → Task 4 (`onAplicarReinicio`) + Step 7.
- Al cambiar el colocador se regenera `flotaPrevia` (si no, el 2.º colocador vería/confirmaría la flota del 1.º — rompe el secreto) → Task 4 Step 3, bloque de `jugar()` + assertion en Step 7.
- El tablero final no se borra al ganar (`mostrarTiros = disparos || finished`) → Task 4 Step 3 + Step 7.
- Contenido, registro estático en `[slug].astro`, backlog `GAME-INDEX.md` fila 37 ✅ (ficha no se toca) → Task 4 Steps 1, 4, 5.
- Fuera de alcance (10×10, flota de 5, "cañonero", "tocado repite", >2 jugadores, colocación manual, mini-grid de flota propia, pantalla intermedia entre disparos, anti-trampa cripto, `<TableroJuego>` compartido) → sin tasks; anotado en el spec y en Integración final.

**Escaneo de placeholders:** sin "TBD"/"TODO"/"handle edge cases". La única nota abierta (emoji `icono`) lleva fallback verificable en el Step 2 de la Task 4. Todos los pasos de código llevan el código completo.

**Consistencia de tipos:** `BattleshipState`, `Player`, `Fase`, `Resultado`, `Move`, `createInitialState`, `esColocacionValida`, `esJugadaValida`, `generarFlotaAleatoria`, `barcosAFlote`, `playMove`, `esBarcoRecto` (interno), `TAMANO`, `FLOTA`, `TOTAL` (interno) usados con la misma firma en las 4 tasks. `Move` siempre la unión `{tipo:'flota',barcos:number[][]} | {tipo:'disparo',celda:number}`. `flotas: Record<Player, number[][] | null>` y `disparos: Record<Player, (Resultado|null)[]>` idénticos en motor y Board. `ultimoDisparo` siempre `{ por: Player; celda: number; resultado: Resultado } | null`. El Board usa `state.disparos[vista]` y `state.winner as Player` (nunca null en `finished`). `barcosAFlote` y `mostrarTurno.puntajes` ambos `Record<Player, number>`.
