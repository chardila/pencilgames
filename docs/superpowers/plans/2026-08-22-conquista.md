# Conquista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir "Conquista" (4º juego del sitio) — un juego de territorio en el que dos jugadores trazan fences (ortogonales y diagonales de varias longitudes) sobre una cuadrícula de puntos para cerrar y reclamar regiones.

**Architecture:** Motor puro (`engine.ts`) con un catálogo de 270 fences precomputado a nivel de módulo (con conjuntos de solapamiento y cruce precalculados por candidato), legalidad de jugada evaluada contra esos conjuntos, y detección de regiones por recomputación completa de caras (algoritmo de "rotation system") tras cada jugada — nunca actualización incremental. Tablero en SVG con interacción de "tocar dos puntos" en vez de tocar líneas directamente.

**Tech Stack:** Astro 7 (sin framework de UI), TypeScript estricto, Vitest, SVG nativo. Mismo patrón de extensibilidad que los 3 juegos existentes (`src/content/juegos/<slug>.md` + `src/games/<slug>/{engine.ts,Board.astro}` + registro en `src/pages/juegos/[slug].astro`).

## Global Constraints

- **Spec de referencia**: `docs/superpowers/specs/2026-08-22-conquista-design.md` (aprobado en su totalidad). En cualquier conflicto entre este plan y el spec, el spec manda.
- **2 jugadores únicamente** — no tocar `src/lib/players.ts`, `turnIndicator.ts`, `winnerBanner.ts`, ni los colores `--color-player-1/2` de `BaseLayout.astro`.
- **Cuadrícula fija 6×6 puntos**, sin selector de tamaño.
- **Motor puro**: `jugarFence(state, fence)` es una función estado+jugada→nuevo estado, sin efectos secundarios, para que el juego remoto funcione sin cambios de protocolo. Jugada ilegal devuelve el mismo estado sin cambios (nunca lanza excepción).
- **Sin aritmética de intersección de segmentos en la detección de regiones** — esa aritmética vive únicamente en la precomputación de `crossesWith` (una vez, a nivel de módulo). La detección de regiones opera solo sobre vértices de la cuadrícula.
- **Puntaje por área total** (no por número de regiones), mostrado con un decimal.
- **TypeScript estricto**, sin `any`. Todo el texto de cara al usuario (contenido, aria-labels) en español, igual que el resto del sitio.
- **Sin dependencias nuevas** — todo con lo que ya trae Astro/Vitest/DOM/SVG nativos.
- **`<TableroJuego>` compartido NO existe todavía** (es un prerequisito de extracción, proyecto separado, sin iniciar). Este plan construye `Board.astro` usando el mismo patrón ya existente y funcionando en los otros 3 juegos (`turnIndicator.ts` + `winnerBanner.ts` directamente) — **no** inventa ni referencia una API de `<TableroJuego>` que aún no existe. Cuando ese componente exista, migrar este archivo será un trabajo de seguimiento separado, fuera de este plan.
- **Sin tests automatizados para `Board.astro`** (igual que los otros 3 juegos) — se verifica con `npm run build`, `astro check`, y un playtest manual (Chrome DevTools MCP) al final.

## Mapa de archivos

- `src/games/conquista/engine.ts` — **crear**. Todo el motor: tipos, catálogo, legalidad, grafo, extracción de caras, `jugarFence`. Un solo archivo, igual que `puntos-y-cajas/engine.ts` — no se introducen módulos internos adicionales (`grid.ts`, `legality.ts`, etc.) porque el spec (sección 7, aprobada) fija exactamente esta lista de archivos.
- `src/games/conquista/engine.test.ts` — **crear**. Tests de Vitest para todo lo anterior.
- `src/games/conquista/Board.astro` — **crear**. SVG + interacción de tocar-dos-puntos + integración con `turnIndicator.ts`/`winnerBanner.ts`/canal remoto.
- `src/content/juegos/conquista.md` — **crear**. Metadata + instrucciones para el modal.
- `src/pages/juegos/[slug].astro` — **modificar**. Importar `ConquistaBoard` y registrarlo en el mapa `BOARDS`.

---

### Task 1: Tipos base y catálogo de fences

**Files:**
- Create: `src/games/conquista/engine.ts`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Produces: `Point { row: number; col: number }`, `ConquistaPlayer = 1 | 2`, `Fence { a: Point; b: Point }`, `GRID_SIZE = 6`, `fenceKey(a: Point, b: Point): string`, `interface FenceInfo { fence: Fence; key: string; subSegments: Fence[]; collinearGroup: Set<string>; crossesWith: Set<string> }` (los últimos 2 campos se declaran aquí, vacíos, y los pueblan las Tasks 2 y 3 respectivamente — ver el bloque de código del Step 3 de esta misma tarea, que es la fuente de verdad si este resumen y el código llegaran a no coincidir), `ALL_CANDIDATES: FenceInfo[]`, `CANDIDATES_BY_KEY: Map<string, FenceInfo>`.

- [ ] **Step 1: Escribir el test de conteo del catálogo**

```ts
// src/games/conquista/engine.test.ts
import { describe, expect, test } from 'vitest';
import { ALL_CANDIDATES, GRID_SIZE, fenceKey } from './engine';

describe('catálogo de fences', () => {
  test('tiene exactamente 270 candidatos en la cuadrícula 6×6', () => {
    expect(GRID_SIZE).toBe(6);
    expect(ALL_CANDIDATES.length).toBe(270);
  });

  test('el conteo por tipo de offset coincide con la tabla del spec', () => {
    // Ortogonal corta: (0,1) + (1,0)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 0 && dc === 1) || (dr === 1 && dc === 0);
      }).length
    ).toBe(60);

    // Ortogonal larga: (0,2) + (2,0)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 0 && dc === 2) || (dr === 2 && dc === 0);
      }).length
    ).toBe(48);

    // Diagonal 1×1: (1,1) + (1,-1)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return dr === 1 && dc === 1;
      }).length
    ).toBe(50);

    // Diagonal "caballo": (1,2),(1,-2),(2,1),(2,-1)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
      }).length
    ).toBe(80);

    // Diagonal larga 2×2: (2,2) + (2,-2)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return dr === 2 && dc === 2;
      }).length
    ).toBe(32);
  });

  test('fenceKey es estable sin importar el orden de los puntos', () => {
    const a = { row: 1, col: 2 };
    const b = { row: 0, col: 0 };
    expect(fenceKey(a, b)).toBe(fenceKey(b, a));
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'` (el archivo aún no existe).

- [ ] **Step 3: Implementar el catálogo**

```ts
// src/games/conquista/engine.ts

export interface Point {
  row: number;
  col: number;
}

export type ConquistaPlayer = 1 | 2;

export interface Fence {
  a: Point;
  b: Point;
}

export const GRID_SIZE = 6;

function comparePoints(a: Point, b: Point): number {
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function pointKey(p: Point): string {
  return `${p.row},${p.col}`;
}

export function fenceKey(a: Point, b: Point): string {
  const [p, q] = comparePoints(a, b) <= 0 ? [a, b] : [b, a];
  return `${pointKey(p)}-${pointKey(q)}`;
}

function canonicalFence(a: Point, b: Point): Fence {
  return comparePoints(a, b) <= 0 ? { a, b } : { a: b, b: a };
}

function inBounds(p: Point): boolean {
  return p.row >= 0 && p.row < GRID_SIZE && p.col >= 0 && p.col < GRID_SIZE;
}

function gcd(x: number, y: number): number {
  let a = Math.abs(x);
  let b = Math.abs(y);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

// Las 12 orientaciones canónicas del catálogo (sección 1 del spec): una sola
// dirección por línea (dr > 0, o dr === 0 && dc > 0) para no contar cada
// línea dos veces en sentidos opuestos.
const OFFSETS: Array<{ dr: number; dc: number }> = [
  { dr: 0, dc: 1 },
  { dr: 0, dc: 2 },
  { dr: 1, dc: 0 },
  { dr: 2, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 2 },
  { dr: 1, dc: -2 },
  { dr: 2, dc: 1 },
  { dr: 2, dc: -1 },
  { dr: 2, dc: 2 },
  { dr: 2, dc: -2 },
];

export interface FenceInfo {
  fence: Fence;
  key: string;
  subSegments: Fence[];
  collinearGroup: Set<string>;
  crossesWith: Set<string>;
}

function computeSubSegments(fence: Fence): Fence[] {
  const dr = fence.b.row - fence.a.row;
  const dc = fence.b.col - fence.a.col;
  if (gcd(dr, dc) === 1) return [fence];
  // Solo (0,±2), (±2,0) y (±2,±2) tienen mcd = 2 en este catálogo — pasan
  // exactamente por su propio punto medio (sección 1 del spec).
  const mid: Point = { row: fence.a.row + dr / 2, col: fence.a.col + dc / 2 };
  return [canonicalFence(fence.a, mid), canonicalFence(mid, fence.b)];
}

function buildCatalog(): FenceInfo[] {
  const result: FenceInfo[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const a: Point = { row, col };
      for (const { dr, dc } of OFFSETS) {
        const b: Point = { row: row + dr, col: col + dc };
        if (!inBounds(b)) continue;
        const fence = canonicalFence(a, b);
        const key = fenceKey(fence.a, fence.b);
        const subSegments = computeSubSegments(fence);
        result.push({ fence, key, subSegments, collinearGroup: new Set(), crossesWith: new Set() });
      }
    }
  }
  return result;
}

export const ALL_CANDIDATES: FenceInfo[] = buildCatalog();
export const CANDIDATES_BY_KEY: Map<string, FenceInfo> = new Map(
  ALL_CANDIDATES.map(info => [info.key, info])
);
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts
git commit -m "feat(conquista): catálogo de 270 fences precomputado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `collinearGroup` (solapamiento de fences largas)

**Files:**
- Modify: `src/games/conquista/engine.ts`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Consumes: `ALL_CANDIDATES`, `FenceInfo` (Task 1).
- Produces: `attachCollinearGroups()` (llamada internamente al construir el catálogo — ya no una función exportada, pobla `info.collinearGroup` de cada `FenceInfo` en `ALL_CANDIDATES`).

- [ ] **Step 1: Escribir los tests**

```ts
// añadir a src/games/conquista/engine.test.ts
import { ALL_CANDIDATES, CANDIDATES_BY_KEY, fenceKey } from './engine';

describe('collinearGroup', () => {
  test('una fence larga (2,2) tiene grupo de tamaño 3 con sus 2 mitades', () => {
    const a = { row: 0, col: 0 };
    const b = { row: 2, col: 2 };
    const mid = { row: 1, col: 1 };
    const larga = CANDIDATES_BY_KEY.get(fenceKey(a, b))!;
    expect(larga.collinearGroup.size).toBe(3);
    expect(larga.collinearGroup.has(fenceKey(a, mid))).toBe(true);
    expect(larga.collinearGroup.has(fenceKey(mid, b))).toBe(true);
  });

  test('una fence primitiva sin fence larga que la contenga tiene grupo de tamaño 1', () => {
    // Diagonal "caballo" (1,2): no es mitad de ninguna fence más larga del catálogo.
    const info = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    expect(info.collinearGroup).toEqual(new Set([info.key]));
  });

  test('una mitad de fence larga incluye esa fence larga en su propio grupo', () => {
    const mitad = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    const larga = fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 });
    expect(mitad.collinearGroup.has(larga)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL — `collinearGroup` de todos los candidatos está vacío (`Set` sin poblar).

- [ ] **Step 3: Implementar `attachCollinearGroups` y llamarla al construir el catálogo**

```ts
// añadir a src/games/conquista/engine.ts, después de buildCatalog()

// Corrección encontrada por el test de propiedad (Task 8), no en el diseño
// original: dos fences LARGAS distintas pueden compartir la misma mitad
// entre sí (p. ej., en 6×6, (0,5)-(2,5) y (1,5)-(3,5) comparten el
// sub-segmento (1,5)-(2,5)) — una regla que solo conecta "larga ↔ sus
// propias mitades" y "primitiva ↔ larga(s) que la contienen" nunca conecta
// esas dos fences largas entre sí, dejando pasar un solapamiento real como
// legal. La regla correcta es una sola, sin casos especiales: el grupo de
// cualquier candidato es la unión de TODOS los candidatos (primitivos o
// largos) que tocan cualquiera de sus propios sub-segmentos.
function attachCollinearGroups(candidates: FenceInfo[]): void {
  const touchers = new Map<string, string[]>();
  for (const c of candidates) {
    for (const sub of c.subSegments) {
      const subKey = fenceKey(sub.a, sub.b);
      const list = touchers.get(subKey) ?? [];
      list.push(c.key);
      touchers.set(subKey, list);
    }
  }

  for (const c of candidates) {
    const group = c.collinearGroup;
    group.add(c.key);
    for (const sub of c.subSegments) {
      const subKey = fenceKey(sub.a, sub.b);
      group.add(subKey);
      for (const other of touchers.get(subKey) ?? []) {
        group.add(other);
      }
    }
  }
}
```

Y cambiar la construcción de `ALL_CANDIDATES` para llamarla:

```ts
export const ALL_CANDIDATES: FenceInfo[] = buildCatalog();
attachCollinearGroups(ALL_CANDIDATES);
export const CANDIDATES_BY_KEY: Map<string, FenceInfo> = new Map(
  ALL_CANDIDATES.map(info => [info.key, info])
);
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS (6 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts
git commit -m "feat(conquista): collinearGroup para detectar solapamiento de fences largas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `crossesWith` (cruce geométrico entre fences)

**Files:**
- Modify: `src/games/conquista/engine.ts`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Consumes: `ALL_CANDIDATES`, `FenceInfo` (Tasks 1-2).
- Produces: `attachCrossesWith()` (interna, pobla `info.crossesWith` de cada `FenceInfo`).

- [ ] **Step 1: Escribir los tests**

```ts
// añadir a src/games/conquista/engine.test.ts
describe('crossesWith', () => {
  test('dos diagonales tipo caballo que se cruzan en un punto no entero se detectan mutuamente', () => {
    // A(0,0)->F(1,2) [offset (1,2)] cruza a G(2,0)->B(0,1) [offset (-2,1)]
    // en el punto (0.4, 0.8), verificado a mano en la sesión de brainstorming.
    const af = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    const gb = CANDIDATES_BY_KEY.get(fenceKey({ row: 2, col: 0 }, { row: 0, col: 1 }))!;
    expect(af.crossesWith.has(gb.key)).toBe(true);
    expect(gb.crossesWith.has(af.key)).toBe(true);
  });

  test('dos fences que solo comparten un extremo (cruce en T) no se marcan como cruce', () => {
    // La diagonal larga A(0,0)->I(2,2) pasa por E(1,1); la ortogonal E->H(2,1)
    // comparte el punto E pero no debe contar como cruce (T-junction válida).
    const larga = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    const enT = CANDIDATES_BY_KEY.get(fenceKey({ row: 1, col: 1 }, { row: 2, col: 1 }))!;
    expect(larga.crossesWith.has(enT.key)).toBe(false);
    expect(enT.crossesWith.has(larga.key)).toBe(false);
  });

  test('una fence larga y su propia mitad no se marcan como cruce (eso lo cubre collinearGroup)', () => {
    const larga = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    const mitad = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    expect(larga.crossesWith.has(mitad.key)).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL — `crossesWith` de todos los candidatos está vacío.

- [ ] **Step 3: Implementar la prueba de cruce e `attachCrossesWith`**

```ts
// añadir a src/games/conquista/engine.ts

function samePoint(p: Point, q: Point): boolean {
  return p.row === q.row && p.col === q.col;
}

function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.col - p.col) * (r.row - p.row) - (q.row - p.row) * (r.col - p.col);
  if (val === 0) return 0;
  return val > 0 ? 1 : -1;
}

// ¿Se cruzan f1 y f2 en un punto ESTRICTAMENTE interior a ambos segmentos?
// Esta es la prueba estándar de "intersección propia" (CLRS): exige que
// las 4 orientaciones sean no-nulas antes de comparar signos. Cualquier
// toque en un extremo compartido, o en el punto de paso intermedio de una
// fence larga (que es un extremo real de la OTRA fence, aunque no lo sea
// de esta), produce al menos una orientación = 0 y por tanto NUNCA cuenta
// como cruce — es un empalme en T válido (sección 1 del spec). No hace
// falta ningún caso especial de colinealidad: el solapamiento colineal
// genuino entre dos candidatos del catálogo solo ocurre entre una fence
// larga y sus propias mitades, y eso ya lo cubre `collinearGroup`
// (Task 2) — nunca entre dos fences primitivas distintas de este catálogo.
function properlyCrosses(f1: Fence, f2: Fence): boolean {
  const o1 = orientation(f1.a, f1.b, f2.a);
  const o2 = orientation(f1.a, f1.b, f2.b);
  const o3 = orientation(f2.a, f2.b, f1.a);
  const o4 = orientation(f2.a, f2.b, f1.b);

  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function attachCrossesWith(candidates: FenceInfo[]): void {
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (properlyCrosses(candidates[i].fence, candidates[j].fence)) {
        candidates[i].crossesWith.add(candidates[j].key);
        candidates[j].crossesWith.add(candidates[i].key);
      }
    }
  }
}
```

Y llamarla junto a `attachCollinearGroups`:

```ts
export const ALL_CANDIDATES: FenceInfo[] = buildCatalog();
attachCollinearGroups(ALL_CANDIDATES);
attachCrossesWith(ALL_CANDIDATES);
export const CANDIDATES_BY_KEY: Map<string, FenceInfo> = new Map(
  ALL_CANDIDATES.map(info => [info.key, info])
);
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS (9 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts
git commit -m "feat(conquista): crossesWith, prueba de cruce geométrico entre fences

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `ConquistaState`, punto-en-polígono y `esFenceLegal`

**Files:**
- Modify: `src/games/conquista/engine.ts`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Consumes: `ALL_CANDIDATES`, `CANDIDATES_BY_KEY`, `FenceInfo`, `fenceKey` (Tasks 1-3).
- Produces: `ConquistaRegion { vertices: Point[]; owner: ConquistaPlayer; area: number; key: string }`, `ConquistaState { size: number; fences: Map<string, ConquistaPlayer>; regions: ConquistaRegion[]; currentPlayer: ConquistaPlayer; scores: Record<ConquistaPlayer, number>; status: 'playing' | 'finished' }`, `esFenceLegal(state: ConquistaState, info: FenceInfo): boolean`.

- [ ] **Step 1: Escribir los tests**

```ts
// añadir a src/games/conquista/engine.test.ts
import type { ConquistaState, ConquistaRegion } from './engine';
import { esFenceLegal } from './engine';

function estadoVacio(): ConquistaState {
  return {
    size: 6,
    fences: new Map(),
    regions: [],
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
  };
}

describe('esFenceLegal', () => {
  test('una fence nunca dibujada es legal en un tablero vacío', () => {
    const info = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }))!;
    expect(esFenceLegal(estadoVacio(), info)).toBe(true);
  });

  test('regla 1: una fence ya dibujada no es legal', () => {
    const info = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }))!;
    const state = estadoVacio();
    state.fences.set(info.key, 1);
    expect(esFenceLegal(state, info)).toBe(false);
  });

  test('regla 1: una fence larga no es legal si una de sus mitades ya está dibujada', () => {
    const larga = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    const mitad = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    const state = estadoVacio();
    state.fences.set(mitad.key, 1);
    expect(esFenceLegal(state, larga)).toBe(false);
  });

  test('regla 2: una fence no es legal si cruza otra ya dibujada', () => {
    const af = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    const gb = CANDIDATES_BY_KEY.get(fenceKey({ row: 2, col: 0 }, { row: 0, col: 1 }))!;
    const state = estadoVacio();
    state.fences.set(af.key, 1);
    expect(esFenceLegal(state, gb)).toBe(false);
  });

  test('regla 3: una fence no es legal si su interior atraviesa una región ya reclamada', () => {
    // Región reclamada: el cuadro completo (0,0)-(0,1)-(1,1)-(1,0), área 1
    // (equivalente a lo que pasaría si sus 4 lados ya se hubieran cerrado).
    const region: ConquistaRegion = {
      vertices: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 0 },
      ],
      owner: 1,
      area: 1,
      key: 'x',
    };
    const state = { ...estadoVacio(), regions: [region] };
    // La diagonal (0,0)-(1,1) NO es uno de los 4 lados del cuadro — su
    // punto medio (0.5, 0.5) cae estrictamente dentro del cuadro ya
    // reclamado ("diagonal tardía", sección 1 del spec).
    const diagonalTardia = CANDIDATES_BY_KEY.get(
      fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 })
    )!;
    expect(esFenceLegal(state, diagonalTardia)).toBe(false);
  });

  test('regla 3 no bloquea una fence fuera de la región reclamada', () => {
    const region: ConquistaRegion = {
      vertices: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 0 },
      ],
      owner: 1,
      area: 1,
      key: 'x',
    };
    const state = { ...estadoVacio(), regions: [region] };
    const lejos = CANDIDATES_BY_KEY.get(fenceKey({ row: 4, col: 4 }, { row: 4, col: 5 }))!;
    expect(esFenceLegal(state, lejos)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL — `esFenceLegal` no existe todavía.

- [ ] **Step 3: Implementar los tipos de estado, punto-en-polígono y `esFenceLegal`**

```ts
// añadir a src/games/conquista/engine.ts

export interface ConquistaRegion {
  vertices: Point[];
  owner: ConquistaPlayer;
  area: number;
  key: string;
}

export interface ConquistaState {
  size: number;
  fences: Map<string, ConquistaPlayer>;
  regions: ConquistaRegion[];
  currentPlayer: ConquistaPlayer;
  scores: Record<ConquistaPlayer, number>;
  status: 'playing' | 'finished';
}

function segmentMidpoint(f: Fence): Point {
  return { row: (f.a.row + f.b.row) / 2, col: (f.a.col + f.b.col) / 2 };
}

// Ray casting estándar, tratando row/col como y/x.
function pointInPolygon(point: Point, vertices: Point[]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    const cruza =
      vi.col > point.col !== vj.col > point.col &&
      point.row < ((vj.row - vi.row) * (point.col - vi.col)) / (vj.col - vi.col) + vi.row;
    if (cruza) inside = !inside;
  }
  return inside;
}

export function esFenceLegal(state: ConquistaState, info: FenceInfo): boolean {
  for (const k of info.collinearGroup) {
    if (state.fences.has(k)) return false;
  }
  for (const k of info.crossesWith) {
    if (state.fences.has(k)) return false;
  }
  for (const sub of info.subSegments) {
    const mid = segmentMidpoint(sub);
    for (const region of state.regions) {
      if (pointInPolygon(mid, region.vertices)) return false;
    }
  }
  return true;
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS (15 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts
git commit -m "feat(conquista): ConquistaState y esFenceLegal (3 reglas de legalidad)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Grafo planar (`buildGraph`)

**Files:**
- Modify: `src/games/conquista/engine.ts`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Consumes: `CANDIDATES_BY_KEY`, `ConquistaState['fences']` (Tasks 1, 4).
- Produces: `interface Graph { neighbors: Map<string, Point[]> }`, `buildGraph(fences: Map<string, ConquistaPlayer>): Graph` (internas, no exportadas fuera del módulo salvo para el propio archivo de test vía export).

- [ ] **Step 1: Escribir el test**

```ts
// añadir a src/games/conquista/engine.test.ts
import { buildGraph } from './engine';

describe('buildGraph', () => {
  test('una fence larga aporta 2 aristas al grafo (sus 2 mitades), no 1', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }), 1],
    ]);
    const graph = buildGraph(fences);
    const vecinosDeOrigen = graph.neighbors.get('0,0') ?? [];
    const vecinosDeCentro = graph.neighbors.get('1,1') ?? [];
    expect(vecinosDeOrigen).toEqual([{ row: 1, col: 1 }]);
    // El punto medio queda con 2 vecinos: el origen y el destino.
    expect(vecinosDeCentro.length).toBe(2);
  });

  test('los vecinos de un vértice quedan ordenados por ángulo', () => {
    // En el punto B(0,1) del rectángulo 2x1 dividido (ver spec sección 3),
    // los vecinos C(0°), E(90°), A(180°) deben quedar en ese orden ascendente.
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1], // A-B
      [fenceKey({ row: 0, col: 1 }, { row: 0, col: 2 }), 1], // B-C
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 1 }), 1], // B-E
    ]);
    const graph = buildGraph(fences);
    const vecinosDeB = graph.neighbors.get('0,1')!;
    expect(vecinosDeB).toEqual([
      { row: 0, col: 2 }, // C
      { row: 1, col: 1 }, // E
      { row: 0, col: 0 }, // A
    ]);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL — `buildGraph` no existe todavía.

- [ ] **Step 3: Implementar `buildGraph`**

```ts
// añadir a src/games/conquista/engine.ts

export interface Graph {
  neighbors: Map<string, Point[]>;
}

export function buildGraph(fences: Map<string, ConquistaPlayer>): Graph {
  const adjacency = new Map<string, Point[]>();

  function addEdge(p: Point, q: Point): void {
    const key = pointKey(p);
    const list = adjacency.get(key) ?? [];
    list.push(q);
    adjacency.set(key, list);
  }

  for (const key of fences.keys()) {
    const info = CANDIDATES_BY_KEY.get(key);
    if (!info) continue;
    for (const sub of info.subSegments) {
      addEdge(sub.a, sub.b);
      addEdge(sub.b, sub.a);
    }
  }

  for (const [key, list] of adjacency) {
    const [row, col] = key.split(',').map(Number);
    list.sort(
      (p, q) =>
        Math.atan2(p.row - row, p.col - col) - Math.atan2(q.row - row, q.col - col)
    );
  }

  return { neighbors: adjacency };
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS (17 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts
git commit -m "feat(conquista): buildGraph, grafo planar a partir de las fences dibujadas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Extracción de caras (rotation system)

**Files:**
- Modify: `src/games/conquista/engine.ts`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Consumes: `Graph`, `buildGraph` (Task 5).
- Produces: `signedArea(vertices: Point[]): number`, `extractBoundedFaces(fences: Map<string, ConquistaPlayer>): Array<{ vertices: Point[]; area: number }>`.

**Nota de implementación (por qué el signo importa, no la magnitud):** para un cuadro aislado, la cara interior y la cara exterior tienen exactamente la misma área en valor absoluto — solo se distinguen por el signo del área con el algoritmo del shoelace. Verificado a mano en el spec con un rectángulo 2×1 dividido en 2 cuadros: la cara reclamable (p. ej. el cuadro derecho, ciclo B→E→F→C) da área con signo **negativa**; la cara exterior/no reclamable da área con signo **positiva**. Se descartan las caras con área ≥ 0.

- [ ] **Step 1: Escribir los tests**

```ts
// añadir a src/games/conquista/engine.test.ts
import { extractBoundedFaces } from './engine';

describe('extractBoundedFaces', () => {
  test('un solo cuadro (4 lados) produce exactamente 1 cara acotada de área 1', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1],
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 1 }), 1],
      [fenceKey({ row: 1, col: 1 }, { row: 1, col: 0 }), 1],
      [fenceKey({ row: 1, col: 0 }, { row: 0, col: 0 }), 1],
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(1);
    expect(caras[0].area).toBe(1);
    expect(caras[0].vertices.length).toBe(4);
  });

  test('un triángulo (2 lados + 1 diagonal de un cuadro) produce 1 cara de área 0.5', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1],
      [fenceKey({ row: 0, col: 0 }, { row: 1, col: 0 }), 1],
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 0 }), 1], // diagonal
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(1);
    expect(caras[0].area).toBe(0.5);
  });

  test('un rectángulo 2×1 dividido por el medio produce 2 caras de área 1 cada una', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1], // A-B
      [fenceKey({ row: 0, col: 1 }, { row: 0, col: 2 }), 1], // B-C
      [fenceKey({ row: 1, col: 0 }, { row: 1, col: 1 }), 1], // D-E
      [fenceKey({ row: 1, col: 1 }, { row: 1, col: 2 }), 1], // E-F
      [fenceKey({ row: 0, col: 0 }, { row: 1, col: 0 }), 1], // A-D
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 1 }), 1], // B-E
      [fenceKey({ row: 0, col: 2 }, { row: 1, col: 2 }), 1], // C-F
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(2);
    expect(caras[0].area).toBe(1);
    expect(caras[1].area).toBe(1);
  });

  test('una región formada con una diagonal tipo caballo se detecta con su área correcta', () => {
    // Triángulo A(0,0)-B(0,1)-F(1,2) usando la diagonal caballo A-F.
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1], // A-B
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 2 }), 1], // B-F, diagonal 1x1 normal (offset 1,1)
      [fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }), 1], // A-F (diagonal caballo)
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(1);
    // Área del triángulo (0,0),(0,1),(1,2) por la fórmula del shoelace = 0.5.
    expect(caras[0].area).toBe(0.5);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL — `extractBoundedFaces` no existe todavía.

- [ ] **Step 3: Implementar `traceFace`, `signedArea` y `extractBoundedFaces`**

```ts
// añadir a src/games/conquista/engine.ts

const MAX_FACE_STEPS = 600; // cota generosa: bien por encima de 2 × 270 aristas dirigidas.

function traceFace(graph: Graph, startU: Point, startV: Point, visited: Set<string>): Point[] {
  const cycle: Point[] = [startU];
  let prev = startU;
  let curr = startV;
  visited.add(`${pointKey(startU)}->${pointKey(startV)}`);

  for (let i = 0; i < MAX_FACE_STEPS; i++) {
    const neighbors = graph.neighbors.get(pointKey(curr)) ?? [];
    const idx = neighbors.findIndex(p => samePoint(p, prev));
    const next = neighbors[(idx + 1) % neighbors.length];

    // Cierre correcto: comparar la ARISTA DIRIGIDA que se va a tomar contra
    // la de inicio, no solo el vértice `curr`. Detenerse en cuanto se
    // vuelve a pisar `startU` (sin importar la arista) es un error: falla
    // en cualquier cara "pellizcada" que pasa por el mismo vértice más de
    // una vez antes de cerrarse — alcanzable en este juego porque un
    // "cruce en T" contra una región ya reclamada es legal por diseño (ver
    // spec, sección 3, "Corrección importante").
    if (samePoint(curr, startU) && samePoint(next, startV)) return cycle;

    cycle.push(curr);
    visited.add(`${pointKey(curr)}->${pointKey(next)}`);
    prev = curr;
    curr = next;
  }
  throw new Error('traceFace: el ciclo no cerró — el grafo no debería llegar a este estado');
}

export function signedArea(vertices: Point[]): number {
  let sum = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p = vertices[i];
    const q = vertices[(i + 1) % n];
    sum += p.col * q.row - q.col * p.row;
  }
  return sum / 2;
}

export function extractBoundedFaces(
  fences: Map<string, ConquistaPlayer>
): Array<{ vertices: Point[]; area: number }> {
  const graph = buildGraph(fences);
  const visited = new Set<string>();
  const result: Array<{ vertices: Point[]; area: number }> = [];

  for (const [key, neighbors] of graph.neighbors) {
    const [row, col] = key.split(',').map(Number);
    const u: Point = { row, col };
    for (const v of neighbors) {
      const dKey = `${key}->${pointKey(v)}`;
      if (visited.has(dKey)) continue;
      const cycle = traceFace(graph, u, v, visited);
      const signed = signedArea(cycle);
      if (signed < 0) {
        result.push({ vertices: cycle, area: -signed });
      }
      // signed >= 0: cara exterior (o degenerada) — se descarta, ver la
      // nota de implementación arriba de esta tarea.
    }
  }
  return result;
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS (21 tests en total). Si alguno de los 4 casos falla con un área con signo opuesto al esperado, es la señal de que la convención `(idx + 1) % neighbors.length` quedó invertida para este entorno — cambiar a `(idx - 1 + neighbors.length) % neighbors.length` y volver a correr; no debería hacer falta tocar nada más.

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts
git commit -m "feat(conquista): extracción de caras acotadas (rotation system)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Canonicalización de regiones, `createInitialState` y `jugarFence`

**Files:**
- Modify: `src/games/conquista/engine.ts`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Consumes: `esFenceLegal`, `extractBoundedFaces`, `ConquistaState`, `ConquistaRegion`, `CANDIDATES_BY_KEY`, `ALL_CANDIDATES`, `fenceKey` (Tasks 1-6).
- Produces: `createInitialState(): ConquistaState`, `jugarFence(state: ConquistaState, fence: Fence): ConquistaState`.

- [ ] **Step 1: Escribir los tests**

```ts
// añadir a src/games/conquista/engine.test.ts
import { createInitialState, jugarFence } from './engine';

describe('jugarFence', () => {
  test('createInitialState arranca sin fences, sin regiones, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.fences.size).toBe(0);
    expect(state.regions.length).toBe(0);
    expect(state.currentPlayer).toBe(1);
    expect(state.scores).toEqual({ 1: 0, 2: 0 });
    expect(state.status).toBe('playing');
  });

  test('una jugada ilegal (fence ya dibujada) devuelve el mismo estado', () => {
    let state = createInitialState();
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 1 } });
    const estadoTrasPrimera = state;
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 1 } });
    expect(state).toEqual(estadoTrasPrimera);
  });

  test('cerrar un triángulo reclama la región y mantiene el turno del mismo jugador', () => {
    let state = createInitialState();
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 1 } }); // A-B, no cierra, pasa a 2
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 1, col: 0 } }); // A-D, no cierra, pasa a 2
    state = { ...state, currentPlayer: 1 };
    // La diagonal B-D cierra el triángulo A-B-D (lados A-B, A-D, B-D).
    state = jugarFence(state, { a: { row: 0, col: 1 }, b: { row: 1, col: 0 } });
    expect(state.regions.length).toBe(1);
    expect(state.scores[1]).toBe(0.5);
    expect(state.currentPlayer).toBe(1); // mantiene el turno por haber reclamado
  });

  test('cerrar 2 regiones con una sola fence larga mantiene el turno por ambas', () => {
    // IMPORTANTE: este caso solo es alcanzable con una fence LARGA (que
    // añade 2 sub-segmentos al grafo en una sola jugada). Con fences
    // cortas, un reclamo múltiple en 1 sola jugada es geométricamente
    // irrealizable en Conquista: si ya están los 4 lados de un cuadro sin
    // su diagonal, el cuadro se reclama entero de inmediato (antes de
    // llegar a "solo falta el lado compartido con el cuadro vecino"), y la
    // regla 3 impide subdividirlo después. No "simplificar" este test a
    // fences cortas — ver spec sección 1, "Consecuencia de diseño sobre el
    // encadenamiento múltiple".
    //
    // Se arman 2 triángulos que comparten el punto B(0,1), cada uno a falta
    // de exactamente un lado: A-B-D (falta A-B) y B-C-E (falta B-C). La
    // fence larga ortogonal A(0,0)-C(0,2) — que se descompone en A-B y B-C
    // (sección 1 del spec) — cierra ambos triángulos con una sola jugada.
    let state = createInitialState();
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 1, col: 0 } }); // A-D
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 1 }, b: { row: 1, col: 0 } }); // diagonal B-D
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 1 }, b: { row: 1, col: 1 } }); // B-E
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 2 }, b: { row: 1, col: 1 } }); // diagonal C-E
    state = { ...state, currentPlayer: 1 };
    expect(state.regions.length).toBe(0); // nada cerrado todavía

    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 2 } }); // fence larga A-C

    expect(state.regions.length).toBe(2); // triángulo A-B-D y triángulo B-C-E
    expect(state.scores[1]).toBe(1); // 0.5 + 0.5
    expect(state.currentPlayer).toBe(1); // encadenó turno por las 2 regiones
  });

  test('el estado pasa a finished cuando ninguna fence del catálogo es legal', () => {
    // No se construye a mano (270 candidatos): se juega una partida completa
    // con movimientos legales hasta que termine, y se confirma el estado.
    let state = createInitialState();
    let seguridad = 0;
    while (state.status === 'playing' && seguridad < 500) {
      const legal = ALL_CANDIDATES.find(c => esFenceLegal(state, c));
      if (!legal) break;
      state = jugarFence(state, legal.fence);
      seguridad++;
    }
    const quedaAlguna = ALL_CANDIDATES.some(c => esFenceLegal(state, c));
    expect(quedaAlguna).toBe(false);
    expect(state.status).toBe('finished');
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL — `createInitialState`/`jugarFence` no existen todavía.

- [ ] **Step 3: Implementar `createInitialState`, la canonicalización de regiones y `jugarFence`**

```ts
// añadir a src/games/conquista/engine.ts

export function createInitialState(): ConquistaState {
  return {
    size: GRID_SIZE,
    fences: new Map(),
    regions: [],
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
  };
}

function canonicalizeCycle(vertices: Point[]): Point[] {
  let minIdx = 0;
  for (let i = 1; i < vertices.length; i++) {
    if (comparePoints(vertices[i], vertices[minIdx]) < 0) minIdx = i;
  }
  return [...vertices.slice(minIdx), ...vertices.slice(0, minIdx)];
}

function regionKey(vertices: Point[]): string {
  return canonicalizeCycle(vertices).map(pointKey).join('|');
}

// Corrección encontrada en la revisión final de todo el branch, no en el
// diseño original: el área de una cara nueva puede necesitar descontar
// regiones ya reclamadas que queden encerradas como hueco DESCONECTADO
// dentro de ella (un anillo sin ningún vértice compartido con una región
// interior ya reclamada) — la extracción de caras opera por componente
// conexo del grafo, así que esa región interior es invisible para el
// recorrido de caras del anillo. Ver spec sección 3, "Corrección
// importante". El descriptor: una región ya reclamada queda encerrada si
// al menos uno de sus propios vértices cae ESTRICTAMENTE dentro del
// polígono de la cara nueva (no sobre su borde) — esto no resta nada en
// el caso de una cara pellizcada (los vértices de la región interior ya
// son parte del propio ciclo de la cara nueva, están sobre su borde).
function areaNetaDeHuecos(
  cara: { vertices: Point[]; area: number },
  regionesExistentes: ConquistaRegion[]
): number {
  let area = cara.area;
  for (const region of regionesExistentes) {
    const quedaEncerrada = region.vertices.some(v => pointInPolygon(v, cara.vertices));
    if (quedaEncerrada) {
      area -= region.area;
    }
  }
  return area;
}

export function jugarFence(state: ConquistaState, fence: Fence): ConquistaState {
  if (state.status !== 'playing') return state;

  const info = CANDIDATES_BY_KEY.get(fenceKey(fence.a, fence.b));
  if (!info) return state;
  if (!esFenceLegal(state, info)) return state;

  const fences = new Map(state.fences);
  fences.set(info.key, state.currentPlayer);

  const found = extractBoundedFaces(fences);
  const existingKeys = new Set(state.regions.map(r => r.key));
  const regions = [...state.regions];
  const scores = { ...state.scores };
  let claimedCount = 0;

  for (const face of found) {
    const key = regionKey(face.vertices);
    if (existingKeys.has(key)) continue;
    const areaNeta = areaNetaDeHuecos(face, state.regions);
    regions.push({
      vertices: canonicalizeCycle(face.vertices),
      owner: state.currentPlayer,
      area: areaNeta,
      key,
    });
    scores[state.currentPlayer] += areaNeta;
    claimedCount++;
  }

  const currentPlayer =
    claimedCount > 0 ? state.currentPlayer : state.currentPlayer === 1 ? 2 : 1;

  const nextState: ConquistaState = {
    ...state,
    fences,
    regions,
    scores,
    currentPlayer,
    status: 'playing',
  };

  const quedaAlguna = ALL_CANDIDATES.some(c => esFenceLegal(nextState, c));
  nextState.status = quedaAlguna ? 'playing' : 'finished';

  return nextState;
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS (26 tests en total).

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts
git commit -m "feat(conquista): jugarFence — orquesta legalidad, reclamo de regiones y turno

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Test de propiedad (invariante de regiones sin dueño)

**Files:**
- Modify: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Consumes: `createInitialState`, `jugarFence`, `esFenceLegal`, `extractBoundedFaces`, `ALL_CANDIDATES` (Tasks 1-7). No añade código nuevo a `engine.ts`.

- [ ] **Step 1: Escribir el test de propiedad**

```ts
// añadir a src/games/conquista/engine.test.ts

// PRNG determinista (mulberry32) para que las partidas aleatorias del test
// sean reproducibles entre corridas.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('invariante: cero caras acotadas sin dueño', () => {
  test('se cumple en cada jugada de 5 partidas completas aleatorias', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = mulberry32(seed);
      let state = createInitialState();

      while (state.status === 'playing') {
        const legales = ALL_CANDIDATES.filter(c => esFenceLegal(state, c));
        if (legales.length === 0) break;
        const elegido = legales[Math.floor(rng() * legales.length)];
        state = jugarFence(state, elegido.fence);

        const carasAcotadas = extractBoundedFaces(state.fences);
        expect(carasAcotadas.length).toBe(state.regions.length);

        const areaTotal = state.regions.reduce((sum, r) => sum + r.area, 0);
        const puntajeTotal = state.scores[1] + state.scores[2];
        expect(puntajeTotal).toBeCloseTo(areaTotal, 10);
      }

      expect(state.status).toBe('finished');
    }
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS. Si falla, es una señal real de un bug en la extracción de caras o en `jugarFence` (no del test) — depurar con `systematic-debugging` antes de tocar nada más, no ajustar el test para que pase.

- [ ] **Step 3: Correr la suite completa del repo para confirmar que nada más se rompió**

Run: `npx vitest run`
Expected: PASS — todos los tests del repo (los 3 juegos existentes + `worker/` si aplica + Conquista).

- [ ] **Step 4: Commit**

```bash
git add src/games/conquista/engine.test.ts
git commit -m "test(conquista): invariante de propiedad sobre partidas aleatorias completas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: `Board.astro` — tablero SVG e interacción de tocar-dos-puntos

**Files:**
- Create: `src/games/conquista/Board.astro`

**Interfaces:**
- Consumes: `createInitialState`, `jugarFence`, `esFenceLegal`, `ALL_CANDIDATES`, `GRID_SIZE`, `type ConquistaState`, `type Point`, `type Fence` (de `./engine`); `renderTurnIndicator`, `ocultarTurnIndicator` (de `../../lib/turnIndicator`); `showWinnerBanner`, `hideWinnerBanner` (de `../../lib/winnerBanner`); `getPlayerNames` (de `../../lib/players`); `type MoveChannel`, `type MensajeJuego` (de `../../lib/remoto/types`).
- Produces: el componente `Board.astro` que registrará la Task 10 en `[slug].astro`.

- [ ] **Step 1: Crear `Board.astro` con el layout SVG, los estilos y el script de interacción**

```astro
---
import { GRID_SIZE } from './engine';

const STEP = 80;
const MARGIN = 50;
const VIEW_SIZE = MARGIN * 2 + STEP * (GRID_SIZE - 1);
---

<div class="tablero-conquista">
  <div id="indicador-turno" class="indicador-turno" data-jugador="1"></div>
  <svg
    id="tablero-svg"
    class="tablero-svg"
    viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
    role="img"
    aria-label="Tablero de Conquista"
  >
    <g id="capa-regiones"></g>
    <g id="capa-fences"></g>
    <g id="capa-puntos">
      {Array.from({ length: GRID_SIZE }).map((_, row) =>
        Array.from({ length: GRID_SIZE }).map((_, col) => (
          <g class="punto-grupo" data-row={row} data-col={col} data-interactivo="true">
            <circle class="punto-toque" cx={MARGIN + col * STEP} cy={MARGIN + row * STEP} r="22" />
            <circle class="punto-visible" cx={MARGIN + col * STEP} cy={MARGIN + row * STEP} r="6" />
          </g>
        ))
      )}
    </g>
  </svg>
  <div id="banner-ganador" class="banner-ganador" hidden></div>
</div>

<style>
  .tablero-conquista {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: var(--spacing);
  }

  .tablero-svg {
    width: min(92vw, 26rem);
    aspect-ratio: 1;
    touch-action: manipulation;
  }

  .punto-toque {
    fill: transparent;
    cursor: pointer;
  }

  .punto-visible {
    fill: var(--color-text);
    pointer-events: none;
  }

  .punto-grupo[data-origen='true'] .punto-visible,
  .punto-grupo[data-destino-legal='true'] .punto-visible {
    fill: #f5a623;
  }

  .punto-grupo[data-interactivo='false'] .punto-toque {
    cursor: default;
    pointer-events: none;
  }

  .fence-linea {
    stroke-width: 5;
    stroke-linecap: round;
  }

  .fence-linea[data-jugador='1'] {
    stroke: var(--color-player-1);
  }

  .fence-linea[data-jugador='2'] {
    stroke: var(--color-player-2);
  }

  .region-poligono[data-jugador='1'] {
    fill: color-mix(in srgb, var(--color-player-1) 25%, transparent);
  }

  .region-poligono[data-jugador='2'] {
    fill: color-mix(in srgb, var(--color-player-2) 25%, transparent);
  }

  .indicador-turno {
    font-size: 1.1rem;
    font-weight: 700;
    min-height: 2rem;
    text-align: center;
  }

  .indicador-turno :global(.indicador-turno__jugador[data-jugador='1']) {
    color: var(--color-player-1);
    font-weight: 700;
  }

  .indicador-turno :global(.indicador-turno__jugador[data-jugador='2']) {
    color: var(--color-player-2);
    font-weight: 700;
  }

  .banner-ganador {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 15;
  }

  .banner-ganador[hidden] {
    display: none;
  }

  .banner-ganador :global(.banner-ganador__contenido) {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    text-align: center;
  }
</style>

<script>
  import {
    createInitialState,
    jugarFence,
    esFenceLegal,
    ALL_CANDIDATES,
    type ConquistaState,
    type Point,
    type Fence,
  } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';
  import { getPlayerNames } from '../../lib/players';
  import type { MoveChannel, MensajeJuego } from '../../lib/remoto/types';

  const STEP = 80;
  const MARGIN = 50;

  const svgEl = document.getElementById('tablero-svg')!;
  const capaRegiones = document.getElementById('capa-regiones')!;
  const capaFences = document.getElementById('capa-fences')!;
  const gruposPunto = Array.from(svgEl.querySelectorAll<SVGGElement>('.punto-grupo'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;
  const nombres = getPlayerNames();

  let state: ConquistaState = createInitialState();
  let canal: MoveChannel | null = null;
  let miAsiento: 1 | 2 | null = null;
  let origen: Point | null = null;

  function svgNS(tag: string): SVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  function toXY(p: Point): { x: number; y: number } {
    return { x: MARGIN + p.col * STEP, y: MARGIN + p.row * STEP };
  }

  function puntoDe(row: number, col: number): SVGGElement {
    return gruposPunto.find(g => Number(g.dataset.row) === row && Number(g.dataset.col) === col)!;
  }

  function limpiarSeleccion(): void {
    origen = null;
    for (const g of gruposPunto) {
      delete g.dataset.origen;
      delete g.dataset.destinoLegal;
    }
  }

  function destinosLegalesDesde(p: Point): Fence[] {
    return ALL_CANDIDATES.filter(info => {
      const tocaAP =
        (info.fence.a.row === p.row && info.fence.a.col === p.col) ||
        (info.fence.b.row === p.row && info.fence.b.col === p.col);
      return tocaAP && esFenceLegal(state, info);
    }).map(info => info.fence);
  }

  function otroPunto(fence: Fence, p: Point): Point {
    return fence.a.row === p.row && fence.a.col === p.col ? fence.b : fence.a;
  }

  function seleccionarOrigen(p: Point): void {
    limpiarSeleccion();
    const destinos = destinosLegalesDesde(p);
    if (destinos.length === 0) return;
    origen = p;
    puntoDe(p.row, p.col).dataset.origen = 'true';
    for (const fence of destinos) {
      const destino = otroPunto(fence, p);
      puntoDe(destino.row, destino.col).dataset.destinoLegal = 'true';
    }
  }

  function alTocarPunto(p: Point): void {
    const noEsMiTurno = miAsiento !== null && state.currentPlayer !== miAsiento;
    if (noEsMiTurno || state.status !== 'playing') return;

    if (origen === null) {
      seleccionarOrigen(p);
      return;
    }
    if (origen.row === p.row && origen.col === p.col) {
      limpiarSeleccion();
      return;
    }
    if (puntoDe(p.row, p.col).dataset.destinoLegal !== 'true') {
      seleccionarOrigen(p);
      return;
    }

    const fence: Fence = { a: origen, b: p };
    limpiarSeleccion();
    jugar(fence);
    canal?.enviar({ tipo: 'movimiento', payload: fence });
  }

  function jugar(fence: Fence): void {
    state = jugarFence(state, fence);
    render();
  }

  function render(): void {
    capaFences.innerHTML = '';
    for (const [key, jugador] of state.fences) {
      const info = ALL_CANDIDATES.find(c => c.key === key);
      if (!info) continue;
      const { x: x1, y: y1 } = toXY(info.fence.a);
      const { x: x2, y: y2 } = toXY(info.fence.b);
      const linea = svgNS('line');
      linea.setAttribute('x1', String(x1));
      linea.setAttribute('y1', String(y1));
      linea.setAttribute('x2', String(x2));
      linea.setAttribute('y2', String(y2));
      linea.setAttribute('class', 'fence-linea');
      linea.setAttribute('data-jugador', String(jugador));
      capaFences.appendChild(linea);
    }

    capaRegiones.innerHTML = '';
    for (const region of state.regions) {
      const puntos = region.vertices.map(v => {
        const { x, y } = toXY(v);
        return `${x},${y}`;
      }).join(' ');
      const poligono = svgNS('polygon');
      poligono.setAttribute('points', puntos);
      poligono.setAttribute('class', 'region-poligono');
      poligono.setAttribute('data-jugador', String(region.owner));
      capaRegiones.appendChild(poligono);
    }

    const noEsMiTurno = miAsiento !== null && state.currentPlayer !== miAsiento;
    for (const g of gruposPunto) {
      g.dataset.interactivo = String(!noEsMiTurno && state.status === 'playing');
    }

    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: nombres[state.currentPlayer],
        marcador: {
          1: { nombre: nombres[1], puntaje: state.scores[1] },
          2: { nombre: nombres[2], puntaje: state.scores[2] },
        },
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      const ganador =
        state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      showWinnerBanner(bannerGanador, {
        titulo: ganador ? `🎉 ¡Ganó ${nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}`,
        onReiniciar: reiniciar,
      });
    }
  }

  function aplicarReinicio(): void {
    state = createInitialState();
    limpiarSeleccion();
    render();
  }

  function reiniciar(): void {
    aplicarReinicio();
    canal?.enviar({ tipo: 'reiniciar' });
  }

  for (const g of gruposPunto) {
    g.addEventListener('click', () => {
      alTocarPunto({ row: Number(g.dataset.row), col: Number(g.dataset.col) });
    });
  }

  document.addEventListener('canal-remoto-listo', evento => {
    const detalle = (evento as CustomEvent<{ channel: MoveChannel; miNombre: string }>).detail;
    canal = detalle.channel;
    miAsiento = canal.asiento;
    nombres[miAsiento] = detalle.miNombre;

    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        jugar(mensaje.payload as Fence);
      } else if (mensaje.tipo === 'nombre') {
        nombres[miAsiento === 1 ? 2 : 1] = mensaje.nombre;
        render();
      } else if (mensaje.tipo === 'reiniciar') {
        aplicarReinicio();
      }
    });

    canal.alCambiarEstado(estado => {
      if (estado === 'desconectado') {
        ocultarTurnIndicator(indicadorTurno);
        showWinnerBanner(bannerGanador, {
          titulo: '📡 Tu rival se desconectó',
          onReiniciar: () => location.reload(),
        });
        for (const g of gruposPunto) g.dataset.interactivo = 'false';
      }
    });

    render();
  });

  render();
</script>
```

- [ ] **Step 2: Verificar que compila**

Run: `npx astro check`
Expected: sin errores de TypeScript en `Board.astro` (el archivo aún no está registrado en ninguna página, así que no será visitable todavía — esta verificación solo confirma tipos).

- [ ] **Step 3: Commit**

```bash
git add src/games/conquista/Board.astro
git commit -m "feat(conquista): Board.astro — tablero SVG e interacción de tocar-dos-puntos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Contenido, registro en `[slug].astro` y verificación manual

**Files:**
- Create: `src/content/juegos/conquista.md`
- Modify: `src/pages/juegos/[slug].astro`

**Interfaces:**
- Consumes: `Board.astro` (Task 9), el mapa `BOARDS` existente en `src/pages/juegos/[slug].astro`.

- [ ] **Step 1: Crear el contenido del modal de instrucciones**

```markdown
---
title: "Conquista"
description: "Traza líneas entre puntos vecinos y cierra regiones para conquistar territorio."
icono: "🚩"
minJugadores: 2
maxJugadores: 2
---

1. Por turnos, cada jugador traza una línea entre dos puntos de la cuadrícula: toca el punto de origen y luego el punto de destino. Los puntos válidos para tu línea quedan resaltados en cuanto eliges el origen.
2. Las líneas pueden ser horizontales, verticales o diagonales, incluidas diagonales más largas dentro de un bloque de hasta 2×2 cuadros — pero nunca pueden cruzarse entre sí.
3. Si tu línea cierra una o más regiones (triángulos, cuadrados u otras formas), esas regiones son tuyas y **juegas de nuevo**.
4. Una región ya conquistada no se puede volver a dividir con una línea nueva.
5. La partida termina cuando ya no queda ninguna línea legal por trazar.
6. Gana quien haya conquistado más área total (cada cuadro completo vale 1 punto, cada triángulo vale medio punto).
```

- [ ] **Step 2: Registrar el tablero en `[slug].astro`**

```ts
// src/pages/juegos/[slug].astro — añadir el import junto a los otros 3
import ConquistaBoard from '../../games/conquista/Board.astro';

// y añadir la entrada al mapa BOARDS existente:
const BOARDS = {
  'tres-en-raya': TresEnRayaBoard,
  'puntos-y-cajas': PuntosYCajasBoard,
  'agujero-negro': AgujeroNegroBoard,
  conquista: ConquistaBoard,
} as const;
```

- [ ] **Step 3: Verificación de build y tipos**

Run: `npm run build && npx astro check`
Expected: build exitoso, sin errores de tipos. Confirma que la página `/juegos/conquista` queda generada (revisar la lista de rutas que imprime `astro build`).

- [ ] **Step 4: Correr toda la suite de tests una vez más**

Run: `npx vitest run`
Expected: PASS — ningún test existente se rompió por el registro del nuevo juego.

- [ ] **Step 5: Playtest manual con Chrome DevTools MCP**

Levantar el servidor de desarrollo (`npm run dev`), abrir `/juegos/conquista`, y verificar a mano (con las herramientas de `chrome-devtools-mcp`, igual que se hizo para el juego remoto de los otros 3 juegos):
- Modo local (pasar y jugar): tocar un punto resalta sus destinos legales; tocar un destino resaltado dibuja la línea con el color del jugador; cerrar un cuadro simple da turno extra; el marcador muestra el área con un decimal; el banner de fin de partida aparece cuando ya no quedan líneas legales.
- Modo remoto: abrir 2 pestañas/contextos aislados (como en el playtest de los otros 3 juegos), crear sala, unirse por código, confirmar que los movimientos se reflejan en ambos lados y que el gating de turno bloquea tocar puntos fuera de turno.
- Confirmar visualmente que una diagonal larga (2×2) se ve como una sola línea continua que pasa exactamente por el punto medio, y que otra línea puede terminar en ese punto medio sin verse "cortada" ni generar ningún error en consola.

- [ ] **Step 6: Commit**

```bash
git add src/content/juegos/conquista.md src/pages/juegos/[slug].astro
git commit -m "feat(conquista): registrar el juego (contenido + [slug].astro)

Playtest manual verificado con Chrome DevTools MCP: modo local y remoto,
resaltado de destinos legales, turno extra al cerrar regiones, marcador
con decimales, diagonal larga pasando por el punto medio.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Notas para quien ejecute este plan

- **Prerequisito de secuencia** (decidido por el usuario durante el brainstorming, ver spec): antes de fusionar este trabajo a `main`, confirmar si la extracción de `<TableroJuego>` ya se hizo. Si no, este plan sigue siendo válido y produce un juego funcional con el patrón actual (duplicado) — la migración a `<TableroJuego>` queda como tarea de seguimiento separada, no bloquea esta implementación.
- El Task 6 (extracción de caras) es la parte más delicada algorítmicamente. Si el test de propiedad (Task 8) falla de forma intermitente o con partidas largas, usar `superpowers:systematic-debugging` antes de tocar el código — no relajar el test.
- Ningún test de `Board.astro` es automatizado (igual que los otros 3 juegos) — la Task 10 depende de una verificación manual real, no solo de que compile.
