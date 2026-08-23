# Endurecimiento de payloads remotos (A2) y validación en CI (A3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger los 4 juegos contra payloads remotos malformados mediante guardas de tipo puras y estructuradas en cada motor, e incorporar una puerta de calidad estricta (tests y typecheck de Astro y Workers) previa al despliegue en GitHub Actions.

**Architecture:** Cada `engine.ts` exporta una guarda de tipos TypeScript (`payload is T`) determinista y pura que valida la estructura e integridad de cualquier mensaje de movimiento recibido por WebRTC (`unknown`). En los 4 `Board.astro`, el listener `canal.alRecibir` valida el payload antes de invocar a `jugar()`. En el pipeline de CI (`.github/workflows/deploy.yml`), se introduce un job inicial `test-and-check` que corre `astro check`, tests de raíz y tests del worker antes de autorizar cualquier despliegue.

**Tech Stack:** TypeScript, Astro 7, Vitest 3/4, Cloudflare Workers & Pages, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-seguridad-payload-y-ci-design.md`

## Global Constraints

- Todos los validadores de payload son funciones puras sin dependencias del DOM ni efectos secundarios.
- En caso de payload inválido, el cliente receptor no debe lanzar excepciones no capturadas; debe ignorar el movimiento y registrar una advertencia con `console.warn`.
- El typecheck (`npm run check`) debe finalizar con 0 errores y 0 warnings.
- Todas las suites de prueba existentes y nuevas deben pasar al 100%.

---

### Task 1: Tres en Raya — Guarda de payload y consumo seguro

**Files:**
- Modify: `src/games/tres-en-raya/engine.ts`
- Modify: `src/games/tres-en-raya/Board.astro`
- Test: `src/games/tres-en-raya/engine.test.ts`

**Interfaces:**
- Produces: `export function esJugadaValida(payload: unknown): payload is number` en `src/games/tres-en-raya/engine.ts`.
- Consumes: `esJugadaValida` en `src/games/tres-en-raya/Board.astro`.

- [ ] **Step 1: Escribir tests de guarda de payload que fallen**

En `src/games/tres-en-raya/engine.test.ts`, importar `esJugadaValida` y agregar la suite:

```ts
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  playMove,
  isBoardFull,
  esJugadaValida,
} from './engine';

// ... tests existentes ...

describe('tres-en-raya - guarda de payload (esJugadaValida)', () => {
  it('acepta números enteros válidos entre 0 y 8', () => {
    for (let i = 0; i <= 8; i++) {
      expect(esJugadaValida(i)).toBe(true);
    }
  });

  it('rechaza índices fuera de rango', () => {
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(9)).toBe(false);
    expect(esJugadaValida(100)).toBe(false);
  });

  it('rechaza números no enteros', () => {
    expect(esJugadaValida(1.5)).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
    expect(esJugadaValida(Infinity)).toBe(false);
  });

  it('rechaza tipos no numéricos', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(undefined)).toBe(false);
    expect(esJugadaValida('0')).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida([0])).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run src/games/tres-en-raya/engine.test.ts`
Expected: FAIL con error de importación o `esJugadaValida is not a function`.

- [ ] **Step 3: Implementar `esJugadaValida` en el motor y consumirlo en el Board**

En `src/games/tres-en-raya/engine.ts`:
```ts
export function esJugadaValida(payload: unknown): payload is number {
  return typeof payload === 'number' && Number.isInteger(payload) && payload >= 0 && payload <= 8;
}
```

En `src/games/tres-en-raya/Board.astro`, importar `esJugadaValida` de `'./engine'` y actualizar el listener `canal.alRecibir`:
```ts
    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        if (esJugadaValida(mensaje.payload)) {
          jugar(mensaje.payload);
        } else {
          console.warn('Mensaje de movimiento ignorado por payload inválido:', mensaje.payload);
        }
      } else if (mensaje.tipo === 'nombre') {
```

- [ ] **Step 4: Ejecutar tests para verificar que pasan**

Run: `npx vitest run src/games/tres-en-raya/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/tres-en-raya/engine.ts src/games/tres-en-raya/engine.test.ts src/games/tres-en-raya/Board.astro
git commit -m "fix(tres-en-raya): validar payload de movimiento remoto antes de jugar"
```

---

### Task 2: Agujero Negro — Guarda de payload y consumo seguro

**Files:**
- Modify: `src/games/agujero-negro/engine.ts`
- Modify: `src/games/agujero-negro/Board.astro`
- Test: `src/games/agujero-negro/engine.test.ts`

**Interfaces:**
- Produces: `export function esJugadaValida(payload: unknown): payload is number` en `src/games/agujero-negro/engine.ts`.
- Consumes: `esJugadaValida` en `src/games/agujero-negro/Board.astro`.

- [ ] **Step 1: Escribir tests de guarda de payload que fallen**

En `src/games/agujero-negro/engine.test.ts`, importar `esJugadaValida` y agregar la suite:

```ts
import {
  TOTAL_POSITIONS,
  TOTAL_ROWS,
  createInitialState,
  playMove,
  rowOf,
  columnOf,
  cellId,
  getNeighbors,
  esJugadaValida,
} from './engine';

// ... tests existentes ...

describe('agujero-negro - guarda de payload (esJugadaValida)', () => {
  it('acepta números enteros válidos entre 0 y TOTAL_POSITIONS - 1', () => {
    for (let i = 0; i < TOTAL_POSITIONS; i++) {
      expect(esJugadaValida(i)).toBe(true);
    }
  });

  it('rechaza índices fuera de rango', () => {
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(TOTAL_POSITIONS)).toBe(false);
    expect(esJugadaValida(100)).toBe(false);
  });

  it('rechaza números no enteros o especiales', () => {
    expect(esJugadaValida(3.14)).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
    expect(esJugadaValida(Infinity)).toBe(false);
  });

  it('rechaza tipos no numéricos', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(undefined)).toBe(false);
    expect(esJugadaValida('10')).toBe(false);
    expect(esJugadaValida({ id: 5 })).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run src/games/agujero-negro/engine.test.ts`
Expected: FAIL con error de importación o `esJugadaValida is not a function`.

- [ ] **Step 3: Implementar `esJugadaValida` en el motor y consumirlo en el Board**

En `src/games/agujero-negro/engine.ts`:
```ts
export function esJugadaValida(payload: unknown): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < TOTAL_POSITIONS
  );
}
```

En `src/games/agujero-negro/Board.astro`, importar `esJugadaValida` de `'./engine'` y actualizar el listener `canal.alRecibir`:
```ts
    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        if (esJugadaValida(mensaje.payload)) {
          jugar(mensaje.payload);
        } else {
          console.warn('Mensaje de movimiento ignorado por payload inválido:', mensaje.payload);
        }
      } else if (mensaje.tipo === 'nombre') {
```

- [ ] **Step 4: Ejecutar tests para verificar que pasan**

Run: `npx vitest run src/games/agujero-negro/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/agujero-negro/engine.ts src/games/agujero-negro/engine.test.ts src/games/agujero-negro/Board.astro
git commit -m "fix(agujero-negro): validar payload de movimiento remoto antes de jugar"
```

---

### Task 3: Puntos y Cajas — Guarda de payload y consumo seguro

**Files:**
- Modify: `src/games/puntos-y-cajas/engine.ts`
- Modify: `src/games/puntos-y-cajas/Board.astro`
- Test: `src/games/puntos-y-cajas/engine.test.ts`

**Interfaces:**
- Produces: `export function esLineId(payload: unknown): payload is LineId` en `src/games/puntos-y-cajas/engine.ts`.
- Consumes: `esLineId` en `src/games/puntos-y-cajas/Board.astro`.

- [ ] **Step 1: Escribir tests de guarda de payload que fallen**

En `src/games/puntos-y-cajas/engine.test.ts`, importar `esLineId` y agregar la suite:

```ts
import {
  createInitialState,
  playLine,
  isGameOver,
  esLineId,
  type LineId,
  type PuntosYCajasState,
} from './engine';

// ... tests existentes ...

describe('puntos-y-cajas - guarda de payload (esLineId)', () => {
  it('acepta objetos LineId válidos tanto horizontales como verticales', () => {
    expect(esLineId({ type: 'h', row: 0, col: 1 })).toBe(true);
    expect(esLineId({ type: 'v', row: 2, col: 3 })).toBe(true);
  });

  it('rechaza tipos de línea distintos de "h" y "v"', () => {
    expect(esLineId({ type: 'x', row: 0, col: 1 })).toBe(false);
    expect(esLineId({ type: '', row: 0, col: 1 })).toBe(false);
  });

  it('rechaza coordenadas no enteras o no numéricas', () => {
    expect(esLineId({ type: 'h', row: 1.5, col: 0 })).toBe(false);
    expect(esLineId({ type: 'h', row: '0', col: 1 })).toBe(false);
    expect(esLineId({ type: 'h', row: null, col: 1 })).toBe(false);
  });

  it('rechaza objetos malformados o tipos primitivos', () => {
    expect(esLineId(null)).toBe(false);
    expect(esLineId(undefined)).toBe(false);
    expect(esLineId(42)).toBe(false);
    expect(esLineId('h-0-1')).toBe(false);
    expect(esLineId({})).toBe(false);
    expect(esLineId({ type: 'h' })).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run src/games/puntos-y-cajas/engine.test.ts`
Expected: FAIL con error de importación o `esLineId is not a function`.

- [ ] **Step 3: Implementar `esLineId` en el motor y consumirlo en el Board**

En `src/games/puntos-y-cajas/engine.ts`:
```ts
export function esLineId(payload: unknown): payload is LineId {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidato = payload as Record<string, unknown>;
  return (
    (candidato.type === 'h' || candidato.type === 'v') &&
    typeof candidato.row === 'number' &&
    Number.isInteger(candidato.row) &&
    typeof candidato.col === 'number' &&
    Number.isInteger(candidato.col)
  );
}
```

En `src/games/puntos-y-cajas/Board.astro`, importar `esLineId` de `'./engine'` y actualizar el listener `canal.alRecibir`:
```ts
    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        if (esLineId(mensaje.payload)) {
          jugar(mensaje.payload);
        } else {
          console.warn('Mensaje de movimiento ignorado por payload inválido:', mensaje.payload);
        }
      } else if (mensaje.tipo === 'nombre') {
```

- [ ] **Step 4: Ejecutar tests para verificar que pasan**

Run: `npx vitest run src/games/puntos-y-cajas/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/puntos-y-cajas/engine.ts src/games/puntos-y-cajas/engine.test.ts src/games/puntos-y-cajas/Board.astro
git commit -m "fix(puntos-y-cajas): validar payload de movimiento remoto antes de jugar"
```

---

### Task 4: Conquista — Guarda de payload y consumo seguro

**Files:**
- Modify: `src/games/conquista/engine.ts`
- Modify: `src/games/conquista/Board.astro`
- Test: `src/games/conquista/engine.test.ts`

**Interfaces:**
- Produces: `export function esFence(payload: unknown): payload is Fence` en `src/games/conquista/engine.ts`.
- Consumes: `esFence` en `src/games/conquista/Board.astro`.

- [ ] **Step 1: Escribir tests de guarda de payload que fallen**

En `src/games/conquista/engine.test.ts`, importar `esFence` y agregar la suite:

```ts
import {
  GRID_SIZE,
  createInitialState,
  jugarFence,
  esFenceLegal,
  obtenerLineasValidas,
  fenceKey,
  esFence,
  type Point,
  type Fence,
} from './engine';

// ... tests existentes ...

describe('conquista - guarda de payload (esFence)', () => {
  it('acepta objetos Fence con puntos enteros válidos dentro del tablero', () => {
    const fence: Fence = {
      a: { row: 0, col: 0 },
      b: { row: 0, col: 1 },
    };
    expect(esFence(fence)).toBe(true);
  });

  it('rechaza fences con puntos fuera de rango', () => {
    expect(esFence({ a: { row: -1, col: 0 }, b: { row: 0, col: 0 } })).toBe(false);
    expect(esFence({ a: { row: 0, col: 0 }, b: { row: GRID_SIZE, col: 0 } })).toBe(false);
  });

  it('rechaza fences con el mismo punto de origen y destino', () => {
    expect(esFence({ a: { row: 2, col: 2 }, b: { row: 2, col: 2 } })).toBe(false);
  });

  it('rechaza coordenadas no numéricas o flotantes', () => {
    expect(esFence({ a: { row: 1.5, col: 0 }, b: { row: 0, col: 0 } })).toBe(false);
    expect(esFence({ a: { row: '0', col: 0 }, b: { row: 0, col: 1 } })).toBe(false);
  });

  it('rechaza estructuras malformadas o primitivos', () => {
    expect(esFence(null)).toBe(false);
    expect(esFence(undefined)).toBe(false);
    expect(esFence('0,0-0,1')).toBe(false);
    expect(esFence({})).toBe(false);
    expect(esFence({ a: { row: 0, col: 0 } })).toBe(false);
    expect(esFence({ a: null, b: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: FAIL con error de importación o `esFence is not a function`.

- [ ] **Step 3: Implementar `esFence` en el motor y consumirlo en el Board**

En `src/games/conquista/engine.ts`:
```ts
function esPointValido(p: unknown): p is Point {
  if (typeof p !== 'object' || p === null) return false;
  const point = p as Record<string, unknown>;
  return (
    typeof point.row === 'number' &&
    Number.isInteger(point.row) &&
    point.row >= 0 &&
    point.row < GRID_SIZE &&
    typeof point.col === 'number' &&
    Number.isInteger(point.col) &&
    point.col >= 0 &&
    point.col < GRID_SIZE
  );
}

export function esFence(payload: unknown): payload is Fence {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidato = payload as Record<string, unknown>;
  if (!esPointValido(candidato.a) || !esPointValido(candidato.b)) return false;
  return candidato.a.row !== candidato.b.row || candidato.a.col !== candidato.b.col;
}
```

En `src/games/conquista/Board.astro`, importar `esFence` de `'./engine'` y actualizar el listener `canal.alRecibir`:
```ts
    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        if (esFence(mensaje.payload)) {
          jugar(mensaje.payload);
        } else {
          console.warn('Mensaje de movimiento ignorado por payload inválido:', mensaje.payload);
        }
      } else if (mensaje.tipo === 'nombre') {
```

- [ ] **Step 4: Ejecutar tests para verificar que pasan**

Run: `npx vitest run src/games/conquista/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/games/conquista/engine.ts src/games/conquista/engine.test.ts src/games/conquista/Board.astro
git commit -m "fix(conquista): validar payload de movimiento remoto antes de jugar"
```

---

### Task 5: Scripts de calidad y pipeline de CI (A3)

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: scripts `"check": "astro check"` y `"test:all": "npm test && npm test --prefix worker"` en `package.json`.
- Produces: job `test-and-check` en `.github/workflows/deploy.yml`.

- [ ] **Step 1: Añadir scripts en `package.json`**

En `package.json`, actualizar la sección de `scripts`:
```json
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:all": "npm test && npm test --prefix worker"
  },
```

- [ ] **Step 2: Actualizar `.github/workflows/deploy.yml` con el job `test-and-check`**

Reemplazar el contenido de `.github/workflows/deploy.yml` por:
```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  test-and-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: ".node-version"
          cache: "npm"

      - name: Install dependencies (root)
        run: npm ci

      - name: Typecheck Astro & TypeScript
        run: npm run check

      - name: Run root unit tests
        run: npm test

      - name: Install dependencies (worker)
        run: npm ci
        working-directory: worker

      - name: Run worker unit tests
        run: npm test
        working-directory: worker

  deploy:
    needs: [test-and-check]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: ".node-version"
          cache: "npm"

      - run: npm ci
      - run: npm run build
        env:
          PUBLIC_SIGNAL_WORKER_URL: https://signal.games.cardila.com

      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: 965f487aac0b6ed5c91bf7c0a829d0ca
          command: pages deploy dist --project-name=pencilgames --branch=main

  deploy-worker:
    needs: [test-and-check]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: ".node-version"
          cache: "npm"
          cache-dependency-path: worker/package-lock.json

      - run: npm ci
        working-directory: worker

      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: 965f487aac0b6ed5c91bf7c0a829d0ca
          workingDirectory: worker
          command: deploy
```

- [ ] **Step 3: Ejecutar suite de verificación local completa**

Run: `npm run check`
Expected: 0 errors

Run: `npm run test:all`
Expected: PASS en raíz y en worker (todos los tests pasan)

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/deploy.yml
git commit -m "ci: agregar validación de tests y typecheck antes del despliegue"
```
