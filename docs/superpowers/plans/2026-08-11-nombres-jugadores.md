# Nombres de Jugadores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pedir los nombres de los dos jugadores una vez en el índice de Pencilgames, guardarlos en `localStorage`, y usarlos en el indicador de turno y el banner de fin de partida de los 3 juegos existentes, en vez de "Jugador 1"/"Jugador 2" genéricos.

**Architecture:** Un módulo nuevo `src/lib/players.ts` (mismo patrón que `turnIndicator.ts`/`winnerBanner.ts`) lee/escribe los nombres en `localStorage`. Un componente `ModalJugadores.astro` (mismo patrón que `ModalInstrucciones.astro`) los pide en el índice. Los 3 `Board.astro` leen los nombres una vez al cargar y los pasan como `etiqueta`/`titulo`/`detalle` a los helpers compartidos ya existentes — cuya firma pública no cambia, pero cuya implementación se corrige para escapar el texto dinámico.

**Tech Stack:** Astro 7.2.0 (sin framework de UI), TypeScript estricto, Vitest, `localStorage` del navegador. Sin dependencias nuevas.

## Global Constraints

- Solo español en toda la UI (textos, labels, mensajes de error).
- Sitio Astro MPA (sin transiciones de página, sin framework de UI) — cualquier estado debe sobrevivir navegación de página completa, por eso `localStorage` y no una variable en memoria.
- Nombres de jugador **opcionales**: campo vacío (o solo espacios) cae al default `"Jugador 1"` / `"Jugador 2"`, nunca bloquea el flujo.
- Clave de `localStorage`: `pencilgames:jugadores`.
- `maxlength="16"` en los inputs de nombre.
- Toda lectura/escritura de `localStorage` va envuelta en `try/catch` — no debe romper el flujo si el storage no está disponible (modo privado, cuota llena).
- Páginas de juego abiertas directo (bookmark, PWA, historial) nunca muestran el modal de nombres; solo leen `getPlayerNames()`, que cae a los defaults si no hay nada guardado.
- Comandos: `npm test` (vitest run), `npm run build` (astro build, también type-checkea `.astro`/`.ts`), `npm run dev` (servidor local en `http://localhost:4321`).
- Spec de referencia: `docs/superpowers/specs/2026-08-11-nombres-jugadores-design.md`.

---

### Task 1: `src/lib/players.ts` — almacenamiento de nombres (TDD)

**Files:**
- Create: `src/lib/players.test.ts`
- Create: `src/lib/players.ts`

**Interfaces:**
- Produces: `export type Player = 1 | 2;`, `export type PlayerNames = Record<Player, string>;`, `export function getPlayerNames(): PlayerNames`, `export function savePlayerNames(nombres: PlayerNames): void`, `export function hasStoredPlayerNames(): boolean`.

- [ ] **Step 1: Escribir los tests (deben fallar — el módulo `players.ts` todavía no existe)**

Crear `src/lib/players.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlayerNames, hasStoredPlayerNames, savePlayerNames } from './players';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

describe('players', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, devuelve los nombres por defecto', () => {
    expect(getPlayerNames()).toEqual({ 1: 'Jugador 1', 2: 'Jugador 2' });
  });

  it('guarda y vuelve a leer los nombres, recortando espacios', () => {
    savePlayerNames({ 1: '  Ana  ', 2: 'Luis' });
    expect(getPlayerNames()).toEqual({ 1: 'Ana', 2: 'Luis' });
  });

  it('si un nombre queda vacío tras recortar espacios, usa el default de ese jugador', () => {
    savePlayerNames({ 1: '   ', 2: 'Luis' });
    expect(getPlayerNames()).toEqual({ 1: 'Jugador 1', 2: 'Luis' });
  });

  it('si el JSON guardado está corrupto, devuelve los defaults sin lanzar', () => {
    localStorage.setItem('pencilgames:jugadores', '{esto no es json');
    expect(() => getPlayerNames()).not.toThrow();
    expect(getPlayerNames()).toEqual({ 1: 'Jugador 1', 2: 'Jugador 2' });
  });

  it('hasStoredPlayerNames refleja si ya se guardó algo', () => {
    expect(hasStoredPlayerNames()).toBe(false);
    savePlayerNames({ 1: 'Ana', 2: 'Luis' });
    expect(hasStoredPlayerNames()).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `npm test -- players`
Expected: FAIL — no se puede resolver el módulo `./players` (todavía no existe `players.ts`).

- [ ] **Step 3: Implementar `players.ts`**

Crear `src/lib/players.ts`:

```ts
export type Player = 1 | 2;
export type PlayerNames = Record<Player, string>;

const STORAGE_KEY = 'pencilgames:jugadores';
const DEFAULTS: PlayerNames = { 1: 'Jugador 1', 2: 'Jugador 2' };

export function getPlayerNames(): PlayerNames {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULTS };
  }

  if (!raw) return { ...DEFAULTS };

  try {
    const parsed = JSON.parse(raw);
    const nombre1 = typeof parsed?.[1] === 'string' ? parsed[1].trim() : '';
    const nombre2 = typeof parsed?.[2] === 'string' ? parsed[2].trim() : '';
    return {
      1: nombre1 || DEFAULTS[1],
      2: nombre2 || DEFAULTS[2],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePlayerNames(nombres: PlayerNames): void {
  const aGuardar: PlayerNames = {
    1: nombres[1].trim() || DEFAULTS[1],
    2: nombres[2].trim() || DEFAULTS[2],
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aGuardar));
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): no
    // persiste, pero no debe romper el flujo de guardado del modal.
  }
}

export function hasStoredPlayerNames(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `npm test -- players`
Expected: PASS — 5 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/players.ts src/lib/players.test.ts
git commit -m "feat: add player name storage (localStorage)"
```

---

### Task 2: Corregir escaping en `turnIndicator.ts` y `winnerBanner.ts`

**Files:**
- Modify: `src/lib/turnIndicator.ts`
- Modify: `src/lib/winnerBanner.ts`

**Interfaces:**
- No cambia la firma pública de `renderTurnIndicator`, `ocultarTurnIndicator`, `showWinnerBanner`, `hideWinnerBanner` — solo la implementación interna. Las Tasks 4-6 siguen llamándolas igual.

Contexto: hoy ambos helpers interpolan `etiqueta`/`titulo`/`detalle` directo dentro de un template string asignado a `innerHTML`. Es seguro solo porque hoy siempre reciben literales del código. En cuanto `etiqueta`/`titulo` puede ser un nombre escrito por un usuario (Task 4-6), cualquier `<` o `&` rompe el render o inyecta HTML. No hay test automatizado posible para esto sin DOM (`vitest.config.ts` usa `environment: 'node'`) — se verifica manualmente en la Task 4.

- [ ] **Step 1: Reescribir `src/lib/turnIndicator.ts`**

Reemplazar todo el archivo:

```ts
export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  etiqueta: string;
  detalle?: string;
}

export function renderTurnIndicator(
  container: HTMLElement,
  { jugador, etiqueta, detalle }: TurnIndicatorOptions
): void {
  container.hidden = false;
  container.dataset.jugador = String(jugador);
  container.innerHTML = `
    <span class="indicador-turno__etiqueta"></span>
    ${detalle ? `<span class="indicador-turno__detalle"></span>` : ''}
  `;

  container.querySelector<HTMLElement>('.indicador-turno__etiqueta')!.textContent =
    `Turno de ${etiqueta}`;
  if (detalle) {
    container.querySelector<HTMLElement>('.indicador-turno__detalle')!.textContent = detalle;
  }
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
```

- [ ] **Step 2: Reescribir `src/lib/winnerBanner.ts`**

Reemplazar todo el archivo:

```ts
export interface WinnerBannerOptions {
  titulo: string;
  detalle?: string;
  onReiniciar: () => void;
}

export function showWinnerBanner(
  container: HTMLElement,
  { titulo, detalle, onReiniciar }: WinnerBannerOptions
): void {
  container.hidden = false;
  container.innerHTML = `
    <div class="banner-ganador__contenido">
      <p class="banner-ganador__titulo"></p>
      ${detalle ? `<p class="banner-ganador__detalle"></p>` : ''}
      <button type="button" class="banner-ganador__reiniciar">Jugar de nuevo</button>
    </div>
  `;

  container.querySelector<HTMLElement>('.banner-ganador__titulo')!.textContent = titulo;
  if (detalle) {
    container.querySelector<HTMLElement>('.banner-ganador__detalle')!.textContent = detalle;
  }

  const boton = container.querySelector<HTMLButtonElement>('.banner-ganador__reiniciar')!;
  boton.addEventListener('click', onReiniciar, { once: true });
}

export function hideWinnerBanner(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
```

- [ ] **Step 3: Correr el build y la suite completa — nada debe romperse**

Run: `npm run build && npm test`
Expected: build sin errores de tipo; los 5 tests de `players.ts` y los tests de los 3 `engine.ts` en verde (estos helpers no tienen tests directos, pero el build type-checkea los `Board.astro` que los consumen).

- [ ] **Step 4: Commit**

```bash
git add src/lib/turnIndicator.ts src/lib/winnerBanner.ts
git commit -m "fix: escape dynamic text in turn indicator and winner banner"
```

---

### Task 3: Modal de jugadores en el índice

**Files:**
- Create: `src/components/ModalJugadores.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `getPlayerNames(): PlayerNames`, `savePlayerNames(nombres: PlayerNames): void`, `hasStoredPlayerNames(): boolean` de `../lib/players` (Task 1).

- [ ] **Step 1: Crear `src/components/ModalJugadores.astro`**

```astro
<div
  id="modal-jugadores"
  class="modal-jugadores"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-jugadores-titulo"
  hidden
>
  <div class="modal-jugadores__contenido">
    <h2 id="modal-jugadores-titulo">¿Quién juega?</h2>
    <label class="modal-jugadores__campo">
      Nombre del jugador 1
      <input type="text" id="input-jugador-1" maxlength="16" placeholder="Jugador 1" />
    </label>
    <label class="modal-jugadores__campo">
      Nombre del jugador 2
      <input type="text" id="input-jugador-2" maxlength="16" placeholder="Jugador 2" />
    </label>
    <button type="button" id="modal-jugadores-guardar" class="modal-jugadores__guardar">
      Guardar
    </button>
  </div>
</div>

<button type="button" id="modal-jugadores-abrir" class="modal-jugadores__abrir">
  👤 Jugadores
</button>

<style>
  .modal-jugadores {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing);
    z-index: 20;
  }

  .modal-jugadores[hidden] {
    display: none;
  }

  .modal-jugadores__contenido {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    max-width: 24rem;
    width: 100%;
  }

  .modal-jugadores__campo {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 1rem;
    font-weight: 700;
  }

  .modal-jugadores__campo input {
    padding: 0.75rem;
    font-size: 1rem;
    border-radius: var(--radius);
    border: 1px solid #ddd;
    min-height: var(--tap-target-min);
    font-weight: 400;
  }

  .modal-jugadores__guardar {
    margin-top: 1.5rem;
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: var(--radius);
    background: var(--color-accent);
    font-size: 1.1rem;
    font-weight: 700;
    min-height: var(--tap-target-min);
    min-width: var(--tap-target-min);
  }

  .modal-jugadores__abrir {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border: 1px solid #ddd;
    border-radius: var(--radius);
    background: var(--color-surface);
    font-weight: 700;
    min-height: var(--tap-target-min);
  }
</style>

<script>
  import { getPlayerNames, hasStoredPlayerNames, savePlayerNames } from '../lib/players';

  const modal = document.getElementById('modal-jugadores')!;
  const abrir = document.getElementById('modal-jugadores-abrir')!;
  const guardar = document.getElementById('modal-jugadores-guardar')!;
  const inputJugador1 = document.getElementById('input-jugador-1') as HTMLInputElement;
  const inputJugador2 = document.getElementById('input-jugador-2') as HTMLInputElement;

  function cargarInputs(): void {
    const nombres = getPlayerNames();
    inputJugador1.value = nombres[1];
    inputJugador2.value = nombres[2];
  }

  cargarInputs();

  if (!hasStoredPlayerNames()) {
    modal.hidden = false;
  }

  abrir.addEventListener('click', () => {
    cargarInputs();
    modal.hidden = false;
  });

  guardar.addEventListener('click', () => {
    savePlayerNames({ 1: inputJugador1.value, 2: inputJugador2.value });
    modal.hidden = true;
  });
</script>
```

- [ ] **Step 2: Agregar el modal al índice**

Modificar `src/pages/index.astro`. Agregar el import junto a los existentes:

```astro
import ModalJugadores from '../components/ModalJugadores.astro';
```

Y agregar `<ModalJugadores />` justo después del párrafo de introducción y antes del buscador:

```astro
    <p>Juegos de lápiz y papel para jugar en familia, en una sola tableta.</p>
    <ModalJugadores />
    <input
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build sin errores de tipo.

- [ ] **Step 4: Verificación manual en el navegador**

Run: `npm run dev`, abrir `http://localhost:4321/` en una ventana de incógnito (sin `localStorage` previo del sitio).

Confirmar:
- El modal "¿Quién juega?" aparece automáticamente al cargar.
- Escribir "Ana" y "Luis", tocar "Guardar" → el modal se cierra.
- Recargar la página → el modal **no** vuelve a aparecer solo.
- Tocar el botón "👤 Jugadores" → el modal reabre con "Ana" y "Luis" precargados.
- Abrir devtools → Application → Local Storage → confirmar la clave `pencilgames:jugadores` con `{"1":"Ana","2":"Luis"}`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModalJugadores.astro src/pages/index.astro
git commit -m "feat: prompt for player names on the index page"
```

---

### Task 4: Tres en raya — usar los nombres

**Files:**
- Modify: `src/games/tres-en-raya/Board.astro` (bloque `<script>`, líneas 75-131)

**Interfaces:**
- Consumes: `getPlayerNames(): PlayerNames` de `../../lib/players` (Task 1); `renderTurnIndicator`/`showWinnerBanner` ya corregidos (Task 2).

- [ ] **Step 1: Reemplazar el bloque `<script>` completo**

```astro
<script>
  import { createInitialState, playMove, type TresEnRayaState } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';
  import { getPlayerNames } from '../../lib/players';

  const tablero = document.getElementById('tablero')!;
  const casillas = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.casilla'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;

  const ETIQUETAS = { X: '✕', O: '●' } as const;
  const nombres = getPlayerNames();

  let state: TresEnRayaState = createInitialState();

  function render(): void {
    casillas.forEach((casilla, i) => {
      const valor = state.board[i];
      casilla.textContent = valor ? ETIQUETAS[valor] : '';
      if (valor) {
        casilla.dataset.valor = valor;
      } else {
        delete casilla.dataset.valor;
      }
      casilla.disabled = valor !== null || state.status !== 'playing';
      casilla.classList.toggle('casilla--ganadora', state.winningLine?.includes(i) ?? false);
    });

    if (state.status === 'playing') {
      const jugador = state.currentPlayer === 'X' ? 1 : 2;
      renderTurnIndicator(indicadorTurno, {
        jugador,
        etiqueta: `${nombres[jugador]} (${ETIQUETAS[state.currentPlayer]})`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      showWinnerBanner(bannerGanador, {
        titulo:
          state.status === 'won'
            ? `🎉 ¡Ganó ${nombres[state.winner === 'X' ? 1 : 2]} (${ETIQUETAS[state.winner!]})!`
            : '🤝 ¡Empate!',
        onReiniciar: reiniciar,
      });
    }
  }

  function reiniciar(): void {
    state = createInitialState();
    render();
  }

  casillas.forEach((casilla, i) => {
    casilla.addEventListener('click', () => {
      state = playMove(state, i);
      render();
    });
  });

  render();
</script>
```

- [ ] **Step 2: Correr la suite de tests — el engine no cambió, deben seguir en verde**

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sin errores de tipo.

- [ ] **Step 4: Verificación manual end-to-end, incluyendo el fix de escaping de la Task 2**

Run: `npm run dev`, abrir `http://localhost:4321/`.

1. Tocar "👤 Jugadores", poner de nombre `<b>Ana</b>` en el jugador 1 y `Luis & Cía` en el jugador 2, guardar.
2. Entrar a "Tres en raya".
3. Confirmar que el indicador de turno muestra literalmente el texto `Turno de <b>Ana</b> (✕)` (las etiquetas `<b>` se ven como texto plano, **no** se renderiza negrita ni se rompe el layout) — esto confirma que el fix de escaping de la Task 2 funciona con datos reales.
4. Jugar hasta ganar → el banner muestra `🎉 ¡Ganó <b>Ana</b> (✕)!` o `Luis & Cía` como texto plano, según quién gane.
5. Volver al índice, reabrir "👤 Jugadores" y guardar nombres normales (ej. "Ana", "Luis") para dejar el storage limpio para las siguientes tasks.

- [ ] **Step 5: Commit**

```bash
git add src/games/tres-en-raya/Board.astro
git commit -m "feat: show player names in tres en raya"
```

---

### Task 5: Puntos y cajas — usar los nombres

**Files:**
- Modify: `src/games/puntos-y-cajas/Board.astro` (bloque `<script>`, líneas 183-253)

**Interfaces:**
- Consumes: `getPlayerNames(): PlayerNames` de `../../lib/players` (Task 1).

- [ ] **Step 1: Agregar el import y leer los nombres**

En el bloque `<script>`, agregar el import junto a los existentes:

```ts
  import { getPlayerNames } from '../../lib/players';
```

Y agregar la lectura de nombres junto a las demás constantes del script, antes de `let state`:

```ts
  const nombres = getPlayerNames();
```

- [ ] **Step 2: Reemplazar el bloque `if (state.status === 'playing') { ... } else { ... }` dentro de `render()`**

Reemplazar:

```ts
    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: `Jugador ${state.currentPlayer}`,
        detalle: `Puntuación: ${state.scores[1]} - ${state.scores[2]}`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      showWinnerBanner(bannerGanador, {
        titulo: ganador ? `🎉 ¡Ganó el Jugador ${ganador}!` : '🤝 ¡Empate!',
        detalle: `Puntuación final: ${state.scores[1]} - ${state.scores[2]}`,
        onReiniciar: reiniciar,
      });
    }
```

Por:

```ts
    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: nombres[state.currentPlayer],
        detalle: `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      showWinnerBanner(bannerGanador, {
        titulo: ganador ? `🎉 ¡Ganó ${nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}`,
        onReiniciar: reiniciar,
      });
    }
```

- [ ] **Step 3: Correr la suite de tests**

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sin errores de tipo.

- [ ] **Step 5: Verificación manual**

Run: `npm run dev` (si no sigue corriendo), abrir "Puntos y cajas" con los nombres guardados en la Task 4.

Confirmar: el indicador de turno dice "Turno de Ana" (sin genérico "Jugador 1"), el detalle de puntaje dice "Ana 0 · Luis 0" y va cambiando al jugar, y el banner final dice "¡Ganó Ana!" o "¡Ganó Luis!"/"🤝 ¡Empate!" según corresponda.

- [ ] **Step 6: Commit**

```bash
git add src/games/puntos-y-cajas/Board.astro
git commit -m "feat: show player names in puntos y cajas"
```

---

### Task 6: Agujero Negro — usar los nombres

**Files:**
- Modify: `src/games/agujero-negro/Board.astro` (bloque `<script>`, líneas 124-184)
- Modify: `README.md` (sección "Cómo agregar un juego nuevo")

**Interfaces:**
- Consumes: `getPlayerNames(): PlayerNames` de `../../lib/players` (Task 1).

- [ ] **Step 1: Agregar el import y leer los nombres**

En el bloque `<script>`, agregar el import junto a los existentes:

```ts
  import { getPlayerNames } from '../../lib/players';
```

Y agregar la lectura de nombres junto a las demás constantes del script, antes de `let state`:

```ts
  const nombres = getPlayerNames();
```

- [ ] **Step 2: Reemplazar el bloque `if (state.status === 'playing') { ... } else { ... }` dentro de `render()`**

Reemplazar:

```ts
    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: `Jugador ${state.currentPlayer}`,
        detalle: `Coloca el número ${state.nextValue[state.currentPlayer]}`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      showWinnerBanner(bannerGanador, {
        titulo: ganador ? `🎉 ¡Ganó el Jugador ${ganador}!` : '🤝 ¡Empate!',
        detalle: `Jugador 1: ${state.scores[1]} puntos · Jugador 2: ${state.scores[2]} puntos`,
        onReiniciar: reiniciar,
      });
    }
```

Por:

```ts
    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: nombres[state.currentPlayer],
        detalle: `Coloca el número ${state.nextValue[state.currentPlayer]}`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      showWinnerBanner(bannerGanador, {
        titulo: ganador ? `🎉 ¡Ganó ${nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${nombres[1]}: ${state.scores[1]} puntos · ${nombres[2]}: ${state.scores[2]} puntos`,
        onReiniciar: reiniciar,
      });
    }
```

- [ ] **Step 3: Actualizar el README para que el patrón de extensibilidad mencione los nombres de jugador**

En `README.md`, en el paso 3 de "Cómo agregar un juego nuevo", reemplazar:

```markdown
3. Crea `src/games/<slug>/Board.astro`: pinta el tablero y conecta los
   taps al engine, usando `renderTurnIndicator`/`ocultarTurnIndicator`
   (`src/lib/turnIndicator.ts`) y `showWinnerBanner`/`hideWinnerBanner`
   (`src/lib/winnerBanner.ts`) para mantener la UI consistente con los
   demás juegos.
```

Por:

```markdown
3. Crea `src/games/<slug>/Board.astro`: pinta el tablero y conecta los
   taps al engine, usando `renderTurnIndicator`/`ocultarTurnIndicator`
   (`src/lib/turnIndicator.ts`) y `showWinnerBanner`/`hideWinnerBanner`
   (`src/lib/winnerBanner.ts`) para mantener la UI consistente con los
   demás juegos. Usa `getPlayerNames()` (`src/lib/players.ts`) para el
   nombre de cada jugador en vez de "Jugador 1"/"Jugador 2" hardcodeado.
```

- [ ] **Step 4: Correr la suite de tests**

Run: `npm test`
Expected: PASS, sin regresiones.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: sin errores de tipo.

- [ ] **Step 6: Verificación manual**

Abrir "Agujero Negro" con los nombres guardados en la Task 4.

Confirmar: el indicador de turno dice "Turno de Ana" con el detalle "Coloca el número N", y el banner final dice "¡Ganó Ana!"/"¡Ganó Luis!"/"🤝 ¡Empate!" con el detalle de puntaje usando los nombres.

- [ ] **Step 7: Commit**

```bash
git add src/games/agujero-negro/Board.astro README.md
git commit -m "feat: show player names in agujero negro"
```

---

### Task 7: Verificación final end-to-end

**Files:** ninguno nuevo — solo verificación.

- [ ] **Step 1: Suite completa y build**

Run: `npm test && npm run build`
Expected: todos los tests en verde (incluidos los 5 nuevos de `players.ts`), build sin errores.

- [ ] **Step 2: Checklist manual en el navegador (`npm run dev`, ventana de incógnito nueva)**

- [ ] Primera visita al índice sin `localStorage` previo → el modal "¿Quién juega?" aparece solo.
- [ ] Dejar ambos campos vacíos y guardar → los 3 juegos muestran "Turno de Jugador 1" / "Turno de Jugador 2" (los defaults, sin romper nada).
- [ ] Volver al índice, poner nombres reales vía "👤 Jugadores", confirmar que un nombre de 20+ caracteres se corta en 16 (`maxlength`).
- [ ] Navegar directo a `/juegos/tres-en-raya` pegando la URL en una pestaña nueva **sin pasar por el índice antes** (simula abrir desde un bookmark o el ícono de la PWA instalada) → el juego carga normal, sin modal, usando los nombres ya guardados (o los defaults si es la primerísima visita).
- [ ] Jugar una partida completa en cada uno de los 3 juegos y confirmar que "Jugar de nuevo" mantiene los mismos nombres.
- [ ] Cerrar el navegador, volver a abrir `http://localhost:4321/` → los nombres siguen guardados (persisten entre sesiones).

- [ ] **Step 3: Confirmar que no quedó nada sin commitear de esta feature**

Run: `git status --short`
Expected: limpio en lo que respecta a los archivos de esta feature (los cambios preexistentes y ajenos en `juegos-lapiz-papel-markdown/` y `abstract-games-by-category/` no se tocan — no son parte de esta tarea).
