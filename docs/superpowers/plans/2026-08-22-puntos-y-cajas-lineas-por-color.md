# Puntos y cajas: líneas coloreadas por jugador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada línea del tablero de "Puntos y Cajas" se pinta con el color del jugador que la trazó (no siempre con el color del jugador 1), y el indicador de turno colorea los nombres de los jugadores para reforzar esa asociación.

**Architecture:** El engine (`engine.ts`) gana dos arrays paralelos que registran quién trazó cada línea, siguiendo el mismo patrón que ya usa `boxOwners`. `Board.astro` lee esos arrays y setea `data-jugador` en cada botón de línea (mismo mecanismo que ya usan las cajas), y el CSS colorea por ese atributo. El indicador de turno compartido (`turnIndicator.ts`) gana un campo opcional y retrocompatible (`marcador`) que solo usa `puntos-y-cajas`, dejando `tres-en-raya` y `agujero-negro` sin cambios.

**Tech Stack:** TypeScript, Astro (componentes `.astro` con `<script>` de cliente), Vitest (`environment: 'node'`, sin DOM — por eso los módulos que manipulan `HTMLElement` no tienen tests automatizados en este repo, solo verificación manual).

## Global Constraints

- Los colores de jugador ya existen y no cambian: `--color-player-1` (naranja, `#e0532c`) y `--color-player-2` (azul, `#2c6fe0`), definidos en `src/layouts/BaseLayout.astro`.
- `horizontalLines`/`verticalLines` (arrays de `boolean[][]`) no cambian de tipo — los arrays nuevos son adicionales, no reemplazos.
- `src/lib/winnerBanner.ts` no se modifica.
- `tres-en-raya/Board.astro` y `agujero-negro/Board.astro` no cambian de comportamiento ni de estilos.
- Spec de referencia: `docs/superpowers/specs/2026-08-22-puntos-y-cajas-lineas-por-color.md`.

---

### Task 1: Engine — registrar quién trazó cada línea

**Files:**
- Modify: `src/games/puntos-y-cajas/engine.ts`
- Test: `src/games/puntos-y-cajas/engine.test.ts`

**Interfaces:**
- Produces: `PuntosYCajasState.horizontalLineOwners: (PuntosPlayer | null)[][]` y `PuntosYCajasState.verticalLineOwners: (PuntosPlayer | null)[][]`, misma forma que `horizontalLines`/`verticalLines` respectivamente. `createInitialState(size)` los inicializa en `null`. `playLine(state, line)` escribe `state.currentPlayer` en la posición trazada antes de devolver el nuevo estado.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar estos tres tests al final del `describe('puntos y cajas engine', ...)` en `src/games/puntos-y-cajas/engine.test.ts` (antes del `});` de cierre del describe):

```ts
  it('arranca sin dueños de línea (todas null)', () => {
    const state = createInitialState(2); // 1x1 caja: h es 2x1, v es 1x2
    expect(state.horizontalLineOwners).toEqual([[null], [null]]);
    expect(state.verticalLineOwners).toEqual([[null, null]]);
  });

  it('trazar una línea registra qué jugador la trazó', () => {
    const state = createInitialState(2);
    const next = playLine(state, { type: 'h', row: 0, col: 0 }); // jugador 1
    expect(next.horizontalLineOwners[0][0]).toBe(1);
    expect(next.horizontalLineOwners[1][0]).toBeNull();
  });

  it('la línea que completa una caja también queda registrada con quien la trazó', () => {
    let state: PuntosYCajasState = createInitialState(2);
    state = playLine(state, { type: 'h', row: 0, col: 0 }); // jugador 1, pasa a 2
    state = playLine(state, { type: 'h', row: 1, col: 0 }); // jugador 2, pasa a 1
    state = playLine(state, { type: 'v', row: 0, col: 0 }); // jugador 1, pasa a 2
    const next = playLine(state, { type: 'v', row: 0, col: 1 }); // jugador 2 cierra la caja

    expect(next.verticalLineOwners[0][1]).toBe(2);
    expect(next.boxOwners[0][0]).toBe(2);
  });
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `npm test -- src/games/puntos-y-cajas/engine.test.ts`
Expected: FAIL en los tres tests nuevos (`horizontalLineOwners`/`verticalLineOwners` son `undefined`, así que `.toEqual`/`[0][0]` truena o no matchea).

- [ ] **Step 3: Implementar el cambio mínimo en el engine**

En `src/games/puntos-y-cajas/engine.ts`, modificar la interfaz de estado (líneas 10-18 del archivo actual):

```ts
export interface PuntosYCajasState {
  size: number;
  horizontalLines: boolean[][];
  verticalLines: boolean[][];
  horizontalLineOwners: (PuntosPlayer | null)[][];
  verticalLineOwners: (PuntosPlayer | null)[][];
  boxOwners: (PuntosPlayer | null)[][];
  currentPlayer: PuntosPlayer;
  scores: Record<PuntosPlayer, number>;
  status: 'playing' | 'finished';
}
```

Modificar `createInitialState` (líneas 20-36 del archivo actual):

```ts
export function createInitialState(size = 4): PuntosYCajasState {
  const horizontalLines = Array.from({ length: size }, () => Array(size - 1).fill(false));
  const verticalLines = Array.from({ length: size - 1 }, () => Array(size).fill(false));
  const horizontalLineOwners: (PuntosPlayer | null)[][] = Array.from({ length: size }, () =>
    Array(size - 1).fill(null)
  );
  const verticalLineOwners: (PuntosPlayer | null)[][] = Array.from({ length: size - 1 }, () =>
    Array(size).fill(null)
  );
  const boxOwners: (PuntosPlayer | null)[][] = Array.from({ length: size - 1 }, () =>
    Array(size - 1).fill(null)
  );

  return {
    size,
    horizontalLines,
    verticalLines,
    horizontalLineOwners,
    verticalLineOwners,
    boxOwners,
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
  };
}
```

Modificar `playLine` (líneas 86-135 del archivo actual) — solo cambian las líneas señaladas, el resto de la función (cálculo de cajas completadas, `status`, `currentPlayer`) queda igual:

```ts
export function playLine(state: PuntosYCajasState, line: LineId): PuntosYCajasState {
  if (state.status !== 'playing') return state;
  if (!isLineInBounds(state, line)) return state;
  if (isLineDrawn(state, line)) return state;

  const horizontalLines = state.horizontalLines.map(row => [...row]);
  const verticalLines = state.verticalLines.map(row => [...row]);
  const horizontalLineOwners = state.horizontalLineOwners.map(row => [...row]);
  const verticalLineOwners = state.verticalLineOwners.map(row => [...row]);
  const boxOwners = state.boxOwners.map(row => [...row]);
  const scores = { ...state.scores };

  if (line.type === 'h') {
    horizontalLines[line.row][line.col] = true;
    horizontalLineOwners[line.row][line.col] = state.currentPlayer;
  } else {
    verticalLines[line.row][line.col] = true;
    verticalLineOwners[line.row][line.col] = state.currentPlayer;
  }

  const nextState: PuntosYCajasState = {
    ...state,
    horizontalLines,
    verticalLines,
    horizontalLineOwners,
    verticalLineOwners,
    boxOwners,
    scores,
  };

  let completedABox = false;
  for (const box of adjacentBoxes(nextState, line)) {
    if (boxOwners[box.row][box.col] === null && isBoxComplete(nextState, box.row, box.col)) {
      boxOwners[box.row][box.col] = state.currentPlayer;
      scores[state.currentPlayer] += 1;
      completedABox = true;
    }
  }

  const totalBoxes = (state.size - 1) * (state.size - 1);
  const boxesFilled = scores[1] + scores[2];

  if (boxesFilled === totalBoxes) {
    nextState.status = 'finished';
    nextState.currentPlayer = state.currentPlayer;
  } else {
    nextState.status = 'playing';
    nextState.currentPlayer = completedABox
      ? state.currentPlayer
      : state.currentPlayer === 1
      ? 2
      : 1;
  }

  return nextState;
}
```

- [ ] **Step 4: Correr los tests para confirmar que pasan**

Run: `npm test -- src/games/puntos-y-cajas/engine.test.ts`
Expected: PASS (los 9 tests del archivo, incluyendo los 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/games/puntos-y-cajas/engine.ts src/games/puntos-y-cajas/engine.test.ts
git commit -m "feat: registrar en el engine de puntos y cajas quién trazó cada línea"
```

---

### Task 2: `turnIndicator.ts` — soporte opcional de marcador coloreado

**Files:**
- Modify: `src/lib/turnIndicator.ts`

**Interfaces:**
- Consumes: nada de tareas previas (módulo independiente).
- Produces: `TurnIndicatorOptions.marcador?: Marcador` donde `Marcador = { 1: { nombre: string; puntaje: number }; 2: { nombre: string; puntaje: number } }`. Cuando se pasa, `renderTurnIndicator` agrega un `<span class="indicador-turno__marcador">` con dos `<span class="indicador-turno__jugador" data-jugador="1|2">` (Task 4 los usa para colorear con CSS). `detalle` y `etiqueta` siguen funcionando exactamente igual que antes (retrocompatible con `agujero-negro` y `tres-en-raya`).

No hay test automatizado para este módulo (el repo corre Vitest con `environment: 'node'`, sin DOM — por eso ni `turnIndicator.ts` ni `winnerBanner.ts` tienen tests hoy). La verificación es visual y se hace en la Task 4, una vez que `puntos-y-cajas/Board.astro` lo consume.

- [ ] **Step 1: Reemplazar el contenido de `src/lib/turnIndicator.ts`**

```ts
export interface Marcador {
  1: { nombre: string; puntaje: number };
  2: { nombre: string; puntaje: number };
}

export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  etiqueta: string;
  detalle?: string;
  marcador?: Marcador;
}

export function renderTurnIndicator(
  container: HTMLElement,
  { jugador, etiqueta, detalle, marcador }: TurnIndicatorOptions
): void {
  container.hidden = false;
  container.dataset.jugador = String(jugador);
  container.innerHTML = `
    <span class="indicador-turno__etiqueta"></span>
    ${detalle ? `<span class="indicador-turno__detalle"></span>` : ''}
    ${
      marcador
        ? `<span class="indicador-turno__marcador">
             <span class="indicador-turno__jugador" data-jugador="1"></span>
             ·
             <span class="indicador-turno__jugador" data-jugador="2"></span>
           </span>`
        : ''
    }
  `;

  container.querySelector<HTMLElement>('.indicador-turno__etiqueta')!.textContent =
    `Turno de ${etiqueta}`;

  if (detalle) {
    const detalleEl = container.querySelector<HTMLElement>('.indicador-turno__detalle')!;
    detalleEl.textContent = detalle;
    detalleEl.style.display = 'block';
  }

  if (marcador) {
    container.querySelector<HTMLElement>('.indicador-turno__jugador[data-jugador="1"]')!.textContent =
      `${marcador[1].nombre} ${marcador[1].puntaje}`;
    container.querySelector<HTMLElement>('.indicador-turno__jugador[data-jugador="2"]')!.textContent =
      `${marcador[2].nombre} ${marcador[2].puntaje}`;
  }
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
```

- [ ] **Step 2: Verificar que el build de tipos sigue limpio**

Run: `npx astro check`
Expected: sin errores nuevos (los usos existentes en `agujero-negro/Board.astro` y `tres-en-raya/Board.astro` no pasan `marcador`, siguen siendo válidos porque el campo es opcional).

- [ ] **Step 3: Commit**

```bash
git add src/lib/turnIndicator.ts
git commit -m "feat: soporte opcional de marcador coloreado en el indicador de turno"
```

---

### Task 3: `Board.astro` — colorear cada línea por quien la trazó

**Files:**
- Modify: `src/games/puntos-y-cajas/Board.astro`

**Interfaces:**
- Consumes: `state.horizontalLineOwners`, `state.verticalLineOwners` (de Task 1).
- Produces: cada botón `.linea` con `data-jugador="1"` o `"2"` cuando está trazada (o sin el atributo si no lo está), consumido por el CSS de este mismo task.

- [ ] **Step 1: Actualizar el bucle de render de líneas en el `<script>`**

En el `<script>` de `src/games/puntos-y-cajas/Board.astro`, dentro de `render()`, reemplazar el bucle de líneas:

```js
    for (const linea of lineas) {
      const tipo = linea.dataset.tipo as 'h' | 'v';
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      const trazada = tipo === 'h' ? state.horizontalLines[fila][columna] : state.verticalLines[fila][columna];
      linea.dataset.trazada = String(trazada);
      linea.disabled = trazada || state.status !== 'playing' || noEsMiTurno;
    }
```

por:

```js
    for (const linea of lineas) {
      const tipo = linea.dataset.tipo as 'h' | 'v';
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      const trazada = tipo === 'h' ? state.horizontalLines[fila][columna] : state.verticalLines[fila][columna];
      const dueno = tipo === 'h' ? state.horizontalLineOwners[fila][columna] : state.verticalLineOwners[fila][columna];
      linea.dataset.trazada = String(trazada);
      if (dueno) linea.dataset.jugador = String(dueno);
      else delete linea.dataset.jugador;
      linea.disabled = trazada || state.status !== 'playing' || noEsMiTurno;
    }
```

- [ ] **Step 2: Actualizar el CSS de `.linea--h` para colorear por jugador**

Reemplazar:

```css
  .linea--h[data-trazada='true']::before {
    background: var(--color-player-1);
  }
```

por:

```css
  .linea--h[data-jugador='1']::before {
    background: var(--color-player-1);
  }

  .linea--h[data-jugador='2']::before {
    background: var(--color-player-2);
  }
```

- [ ] **Step 3: Actualizar el CSS de `.linea--v` para colorear por jugador**

Reemplazar:

```css
  .linea--v[data-trazada='true']::before {
    background: var(--color-player-1);
  }
```

por:

```css
  .linea--v[data-jugador='1']::before {
    background: var(--color-player-1);
  }

  .linea--v[data-jugador='2']::before {
    background: var(--color-player-2);
  }
```

- [ ] **Step 4: Correr la suite completa para confirmar que nada se rompió**

Run: `npm test`
Expected: PASS (este cambio no toca lógica cubierta por tests; confirma que no se rompió nada en el resto del repo).

- [ ] **Step 5: Verificación manual**

Run: `npm run dev`, abrir `http://localhost:4321/juegos/puntos-y-cajas`.

Trazar al menos una línea como jugador 1 y otra como jugador 2 (alternando turnos) y confirmar visualmente:
- La primera línea trazada se ve naranja (`--color-player-1`).
- La segunda línea trazada se ve azul (`--color-player-2`).
- Las líneas sin trazar siguen grises.

- [ ] **Step 6: Commit**

```bash
git add src/games/puntos-y-cajas/Board.astro
git commit -m "feat: colorear cada línea de puntos y cajas según quién la trazó"
```

---

### Task 4: `Board.astro` — nombres coloreados en el indicador de turno

**Files:**
- Modify: `src/games/puntos-y-cajas/Board.astro`

**Interfaces:**
- Consumes: `renderTurnIndicator`'s `marcador?: Marcador` (de Task 2).
- Produces: ninguna (último eslabón visual de la cadena).

- [ ] **Step 1: Reemplazar el `detalle` por `marcador` en la llamada a `renderTurnIndicator`**

Reemplazar:

```js
    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: nombres[state.currentPlayer],
        detalle: `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}`,
      });
      hideWinnerBanner(bannerGanador);
```

por:

```js
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
```

- [ ] **Step 2: Agregar el CSS que colorea los nombres del marcador**

En el `<style>` de `src/games/puntos-y-cajas/Board.astro`, justo después del bloque `.indicador-turno { ... }`, agregar:

```css
  .indicador-turno__jugador[data-jugador='1'] {
    color: var(--color-player-1);
    font-weight: 700;
  }

  .indicador-turno__jugador[data-jugador='2'] {
    color: var(--color-player-2);
    font-weight: 700;
  }
```

- [ ] **Step 3: Correr la suite completa para confirmar que nada se rompió**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Verificación manual**

Run: `npm run dev` (si no sigue corriendo de la Task 3), abrir `http://localhost:4321/juegos/puntos-y-cajas`.

Confirmar visualmente:
- El indicador de turno muestra "Nombre1 puntaje · Nombre2 puntaje" con "Nombre1 puntaje" en naranja y "Nombre2 puntaje" en azul.
- El texto "Turno de {nombre}" arriba sigue sin colorear (no cambia en este plan).
- Al ganar una caja o terminar la partida, el banner de fin de partida sigue mostrando el marcador en texto plano, sin color (fuera de alcance, confirmado en el spec).

- [ ] **Step 5: Commit**

```bash
git add src/games/puntos-y-cajas/Board.astro
git commit -m "feat: colorear los nombres del marcador en el indicador de turno de puntos y cajas"
```
