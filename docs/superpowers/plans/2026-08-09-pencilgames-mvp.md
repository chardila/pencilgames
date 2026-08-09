# Pencilgames MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship the Pencilgames MVP — a static Astro site with three fully rule-controlled pencil-and-paper games (Tres en raya, Puntos y cajas, Agujero Negro), a searchable index, offline support, and a live deployment on Cloudflare Pages.

**Architecture:** Astro static site, no UI framework. Each game is a vanilla-TypeScript `engine.ts` (pure state machine, unit-tested with Vitest) plus a `Board.astro` component whose inline `<script>` renders the DOM and calls the engine. Shared UI (turn indicator, winner banner, instructions modal, game card) lives in `src/lib/` and `src/components/` and is designed once against all three games' needs. A single dynamic route (`src/pages/juegos/[slug].astro`) renders every game via a static `slug → component` import map.

**Tech Stack:** Astro 5.18.2, TypeScript (strict), Vitest, `@vite-pwa/astro` 1.2.0, no CSS framework (hand-written CSS custom properties), npm, Node 20+ (developed on Node 22.23.2), deployed on Cloudflare Pages.

## Global Constraints

- **Astro version is pinned to `5.18.2`.** Do not upgrade to Astro 6/7 during this plan — `@vite-pwa/astro@1.2.0`'s declared peer range tops out at `astro@^5.0.0`, and Astro 7 was not yet supported by it as of this writing (verified 2026-08-09).
- **`@vite-pwa/astro` is pinned to `1.2.0`.**
- Content collections use the **Astro 5 shape**: `src/content.config.ts` (not `src/content/config.ts`), collections defined with `loader: glob(...)` from `astro/loaders`, and rendering via the standalone `render(entry)` function imported from `astro:content` (not `entry.render()`).
- **Language:** all UI text, game names, and instructions are in Spanish only.
- **Tablet/touch constraints (numeric, not adjectival):**
  - Every interactive element (buttons, including Puntos y Cajas line hit-areas) has a computed size of **at least 44×44 CSS px**.
  - No page ever produces horizontal scroll — `document.documentElement.scrollWidth` must equal `window.innerWidth` at common tablet widths (768px portrait, 1024px landscape).
  - No hover-only affordances — every interactive state must be reachable by tap alone.
  - `touch-action: manipulation` is set globally to remove the 300ms tap delay and prevent double-tap-to-zoom on controls.
- **No persistence, no accounts, no backend, no network multiplayer, no analytics** — confirmed non-goals from the design spec (`docs/superpowers/specs/2026-08-09-pencilgames-design.md`), unchanged here.
- **Agujero Negro rules**: `agujero-negro-reglas.md` (repo root) is the functional specification and prevails over any conflicting description elsewhere. Two clarifications on top of it, made explicit here because the rules file leaves them open:
  - The Instagram post that inspired this game is not accessible/complete (confirmed during brainstorming) — there is no "Instagram variant" to reconcile against. `agujero-negro-reglas.md` governs entirely.
  - Move history and undo (mentioned as optional in the rules file's §16, "si se desea") are **out of MVP scope**. Do not implement them.
- **No move can ever be undone or replayed** in any of the three games — reset-to-start (via the winner banner's "Jugar de nuevo" button) is the only reset mechanism.

---

## Task 1: Scaffold the Astro project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `astro.config.mjs`
- Create: `vitest.config.ts`
- Create: `src/pages/index.astro` (temporary placeholder, replaced in Task 5)
- Create: `.gitignore` (append `node_modules/`, `dist/`, `.astro/`)

**Interfaces:**
- Produces: a working `npm run build`, `npm run dev`, and `npm test` in every later task.

Do not use the interactive `npm create astro@latest` wizard — it prompts for input and will hang in a non-interactive shell. Write the files by hand instead.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pencilgames",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "astro": "5.18.2"
  },
  "devDependencies": {
    "@astrojs/check": "0.9.10",
    "@vite-pwa/astro": "1.2.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`@astrojs/check` type-checks every `.astro` file in the project, including ones no page imports yet — `npm run build` alone does not (Astro/Vite only compile files reachable from a page). Later tasks use `npx astro check` specifically where a file's correctness can't yet be confirmed by grepping build output.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  // TODO(carlos): reemplaza esta URL por tu subdominio real antes del primer
  // despliegue (Task 8). Necesaria para que el sitemap/PWA generen URLs absolutas correctas.
  site: 'https://juegos.tudominio.com',
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create a placeholder `src/pages/index.astro`**

```astro
---
---

<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Pencilgames</title>
  </head>
  <body>
    <p>Scaffold OK — reemplazado en la Tarea 5.</p>
  </body>
</html>
```

- [ ] **Step 6: Add `.gitignore` entries**

```
node_modules/
dist/
.astro/
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: installs without error, creates `package-lock.json`.

- [ ] **Step 8: Verify the scaffold builds**

Run: `npm run build`
Expected: exits 0, creates `dist/index.html` containing the text "Scaffold OK".

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json astro.config.mjs vitest.config.ts src/pages/index.astro .gitignore
git commit -m "chore: scaffold Astro project"
```

---

## Task 2: Base layout, global styles, and favicon

**Files:**
- Create: `src/layouts/BaseLayout.astro`
- Create: `public/favicon.svg`
- Test: none (visual/structural; verified via build)

**Interfaces:**
- Consumes: nothing.
- Produces: `BaseLayout` component with `Props: { title: string }`, wrapping `<slot />`; every later page imports this. Global CSS custom properties (`--color-bg`, `--color-surface`, `--color-text`, `--color-player-1`, `--color-player-2`, `--color-accent`, `--tap-target-min`, `--radius`, `--spacing`) available to every component.

- [ ] **Step 1: Create `public/favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#fdf6ec" />
  <text x="50" y="68" font-size="56" text-anchor="middle">✏️</text>
</svg>
```

- [ ] **Step 2: Create `src/layouts/BaseLayout.astro`**

```astro
---
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>{title} · Pencilgames</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body>
    <slot />
  </body>
</html>

<style is:global>
  :root {
    --color-bg: #fdf6ec;
    --color-surface: #ffffff;
    --color-text: #2b2b2b;
    --color-player-1: #e0532c;
    --color-player-2: #2c6fe0;
    --color-accent: #ffb84c;
    --tap-target-min: 44px;
    --radius: 16px;
    --spacing: 1rem;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    height: 100%;
  }

  body {
    background: var(--color-bg);
    color: var(--color-text);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    overflow-x: hidden;
  }

  h1,
  h2,
  p {
    margin: 0 0 0.5rem;
  }

  button {
    font: inherit;
    min-height: var(--tap-target-min);
    min-width: var(--tap-target-min);
    cursor: pointer;
  }
</style>
```

- [ ] **Step 3: Wire the placeholder page to use the layout, to verify it compiles**

Replace `src/pages/index.astro` content with:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---

<BaseLayout title="Inicio">
  <p>Scaffold OK con layout — reemplazado en la Tarea 5.</p>
</BaseLayout>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: exits 0, `dist/index.html` contains `<title>Inicio · Pencilgames</title>`.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/BaseLayout.astro public/favicon.svg src/pages/index.astro
git commit -m "feat: add base layout and global styles"
```

---

## Task 3: Content collection schema + Tres en raya metadata

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/juegos/tres-en-raya.md`

**Interfaces:**
- Produces: `juegos` collection with schema `{ title: string; description: string; icono: string; minJugadores: number; maxJugadores: number }`, entry body = instructions markdown. Entry `id` for this file is `"tres-en-raya"`.

- [ ] **Step 1: Create `src/content.config.ts`**

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const juegos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/juegos' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icono: z.string(),
    minJugadores: z.number().int().min(1),
    maxJugadores: z.number().int().min(1),
  }),
});

export const collections = { juegos };
```

- [ ] **Step 2: Create `src/content/juegos/tres-en-raya.md`**

```md
---
title: "Tres en raya"
description: "El clásico juego de ✕ y ●. Alinea tres para ganar."
icono: "✕"
minJugadores: 2
maxJugadores: 2
---

## Cómo se juega

1. Los jugadores se turnan para colocar su símbolo (✕ o ●) en una casilla vacía del tablero de 3x3.
2. Gana quien logre alinear tres símbolos iguales en fila, columna o diagonal.
3. Si se llenan las 9 casillas sin que nadie gane, la partida termina en empate.
```

- [ ] **Step 3: Verify the collection is picked up**

Run: `npm run build`
Expected: exits 0 (Astro validates content collections at build time — a schema mismatch would fail the build here).

- [ ] **Step 4: Commit**

```bash
git add src/content.config.ts src/content/juegos/tres-en-raya.md
git commit -m "feat: add juegos content collection with tres en raya metadata"
```

---

## Task 4: Shared UI — GameCard, ModalInstrucciones, turn indicator, winner banner

**Files:**
- Create: `src/components/GameCard.astro`
- Create: `src/components/ModalInstrucciones.astro`
- Create: `src/lib/turnIndicator.ts`
- Create: `src/lib/winnerBanner.ts`

**Interfaces:**
- Produces:
  - `GameCard` — `Props: { href: string; icono: string; title: string; description: string }`. Pure presentational, statically rendered.
  - `ModalInstrucciones` — `Props: { title: string }`, `<slot />` for instructions HTML. Renders open by default, self-contained open/close script (`#modal-instrucciones`, `#modal-instrucciones-cerrar`, `#modal-instrucciones-abrir` — a persistent "?" button that reopens without touching any game state).
  - `renderTurnIndicator(container: HTMLElement, opts: { jugador: 1 | 2; etiqueta: string; detalle?: string }): void` — shows the container and fills it. `detalle` is used by Puntos y Cajas (running score) and Agujero Negro (next number to place); Tres en raya omits it.
  - `ocultarTurnIndicator(container: HTMLElement): void`.
  - `showWinnerBanner(container: HTMLElement, opts: { titulo: string; detalle?: string; onReiniciar: () => void }): void` — every game calls this on `status !== 'playing'`; `detalle` carries the score line for Puntos y Cajas / Agujero Negro and is omitted for Tres en raya.
  - `hideWinnerBanner(container: HTMLElement): void`.
- Consumes: CSS custom properties from `BaseLayout` (Task 2).

Each `Board.astro` (Tasks 7, 9, 10) is responsible for hiding its own turn indicator when the game ends (`status !== 'playing'`) — these helpers only fill/show or hide, they don't know about any engine's `status` field.

- [ ] **Step 1: Create `src/lib/turnIndicator.ts`**

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
    <span class="indicador-turno__etiqueta">Turno de ${etiqueta}</span>
    ${detalle ? `<span class="indicador-turno__detalle">${detalle}</span>` : ''}
  `;
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
```

- [ ] **Step 2: Create `src/lib/winnerBanner.ts`**

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
      <p class="banner-ganador__titulo">${titulo}</p>
      ${detalle ? `<p class="banner-ganador__detalle">${detalle}</p>` : ''}
      <button type="button" class="banner-ganador__reiniciar">Jugar de nuevo</button>
    </div>
  `;
  const boton = container.querySelector<HTMLButtonElement>('.banner-ganador__reiniciar')!;
  boton.addEventListener('click', onReiniciar, { once: true });
}

export function hideWinnerBanner(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
```

- [ ] **Step 3: Create `src/components/GameCard.astro`**

```astro
---
interface Props {
  href: string;
  icono: string;
  title: string;
  description: string;
}

const { href, icono, title, description } = Astro.props;
---

<a class="game-card" href={href}>
  <span class="game-card__icono" aria-hidden="true">{icono}</span>
  <span class="game-card__title">{title}</span>
  <span class="game-card__description">{description}</span>
</a>

<style>
  .game-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.25rem;
    border-radius: var(--radius);
    background: var(--color-surface);
    text-decoration: none;
    color: var(--color-text);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    min-height: var(--tap-target-min);
  }

  .game-card__icono {
    font-size: 2.5rem;
  }

  .game-card__title {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .game-card__description {
    font-size: 0.95rem;
    opacity: 0.8;
  }
</style>
```

- [ ] **Step 4: Create `src/components/ModalInstrucciones.astro`**

```astro
---
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<div
  id="modal-instrucciones"
  class="modal-instrucciones"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-instrucciones-titulo"
>
  <div class="modal-instrucciones__contenido">
    <h2 id="modal-instrucciones-titulo">Cómo se juega {title}</h2>
    <div class="modal-instrucciones__cuerpo">
      <slot />
    </div>
    <button type="button" id="modal-instrucciones-cerrar" class="modal-instrucciones__jugar">
      ¡Jugar!
    </button>
  </div>
</div>

<button
  type="button"
  id="modal-instrucciones-abrir"
  class="modal-instrucciones__reabrir"
  aria-label="Ver instrucciones"
>
  ?
</button>

<style>
  .modal-instrucciones {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing);
    z-index: 20;
  }

  .modal-instrucciones[hidden] {
    display: none;
  }

  .modal-instrucciones__contenido {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    max-width: 32rem;
    max-height: 85vh;
    overflow-y: auto;
  }

  .modal-instrucciones__jugar {
    margin-top: 1rem;
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: var(--radius);
    background: var(--color-accent);
    font-size: 1.1rem;
    font-weight: 700;
  }

  .modal-instrucciones__reabrir {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    border: none;
    background: var(--color-accent);
    font-size: 1.25rem;
    font-weight: 700;
    z-index: 10;
  }
</style>

<script>
  const modal = document.getElementById('modal-instrucciones')!;
  const cerrar = document.getElementById('modal-instrucciones-cerrar')!;
  const abrir = document.getElementById('modal-instrucciones-abrir')!;

  cerrar.addEventListener('click', () => {
    modal.hidden = true;
  });

  abrir.addEventListener('click', () => {
    modal.hidden = false;
  });
</script>
```

- [ ] **Step 5: Type-check the new components**

None of these files are imported by any page yet, so `npm run build` alone would not actually compile them — Astro/Vite only processes files reachable from a page. Use the standalone checker instead:

Run: `npx astro check`
Expected: exits 0, "0 errors" for `GameCard.astro` and `ModalInstrucciones.astro` (it will also report on `src/pages/index.astro` and `BaseLayout.astro`, which should already be clean from Tasks 1–2).

- [ ] **Step 6: Commit**

```bash
git add src/components/GameCard.astro src/components/ModalInstrucciones.astro src/lib/turnIndicator.ts src/lib/winnerBanner.ts
git commit -m "feat: add shared game UI (card, instructions modal, turn indicator, winner banner)"
```

---

## Task 5: Index page with live search

**Files:**
- Modify: `src/pages/index.astro` (replace placeholder from Tasks 1–2)

**Interfaces:**
- Consumes: `BaseLayout` (Task 2), `GameCard` (Task 4), `getCollection('juegos')` (Task 3).

- [ ] **Step 1: Replace `src/pages/index.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import GameCard from '../components/GameCard.astro';
import { getCollection } from 'astro:content';

const juegos = (await getCollection('juegos')).sort((a, b) =>
  a.data.title.localeCompare(b.data.title, 'es')
);
---

<BaseLayout title="Juegos">
  <main class="indice">
    <h1>Pencilgames</h1>
    <p>Juegos de lápiz y papel para jugar en familia, en una sola tableta.</p>
    <input
      type="search"
      id="buscador"
      class="indice__buscador"
      placeholder="Buscar un juego..."
      aria-label="Buscar un juego"
    />
    <div id="grid-juegos" class="indice__grid">
      {
        juegos.map(juego => (
          <div
            class="indice__item"
            data-nombre={juego.data.title.toLowerCase()}
            data-descripcion={juego.data.description.toLowerCase()}
          >
            <GameCard
              href={`/juegos/${juego.id}`}
              icono={juego.data.icono}
              title={juego.data.title}
              description={juego.data.description}
            />
          </div>
        ))
      }
    </div>
    <p id="sin-resultados" hidden>No encontramos ningún juego con ese nombre.</p>
  </main>
</BaseLayout>

<style>
  .indice {
    max-width: 60rem;
    margin: 0 auto;
    padding: var(--spacing);
  }

  .indice__buscador {
    width: 100%;
    padding: 0.75rem 1rem;
    font-size: 1rem;
    border-radius: var(--radius);
    border: 1px solid #ddd;
    margin: 1rem 0;
    min-height: var(--tap-target-min);
  }

  .indice__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 1rem;
  }
</style>

<script>
  const buscador = document.getElementById('buscador') as HTMLInputElement;
  const items = Array.from(document.querySelectorAll<HTMLElement>('.indice__item'));
  const sinResultados = document.getElementById('sin-resultados')!;

  buscador.addEventListener('input', () => {
    const consulta = buscador.value.trim().toLowerCase();
    let visibles = 0;

    for (const item of items) {
      const coincide =
        item.dataset.nombre!.includes(consulta) || item.dataset.descripcion!.includes(consulta);
      item.hidden = !coincide;
      if (coincide) visibles++;
    }

    sinResultados.hidden = visibles > 0;
  });
</script>
```

- [ ] **Step 2: Verify the build and content**

Run: `npm run build && grep -q "Tres en raya" dist/index.html && echo OK`
Expected: prints `OK` (confirms the card for Tres en raya rendered from the content collection).

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: build game index page with live search"
```

---

## Task 6: Tres en raya — engine

**Files:**
- Create: `src/games/tres-en-raya/engine.ts`
- Test: `src/games/tres-en-raya/engine.test.ts`

**Interfaces:**
- Produces:
  - `type Player = 'X' | 'O'`
  - `type CellValue = Player | null`
  - `type GameStatus = 'playing' | 'won' | 'draw'`
  - `interface TresEnRayaState { board: CellValue[]; currentPlayer: Player; status: GameStatus; winner: Player | null; winningLine: number[] | null }`
  - `createInitialState(): TresEnRayaState`
  - `playMove(state: TresEnRayaState, index: number): TresEnRayaState` — pure function, returns a new state; returns `state` unchanged (same values, new or same reference is not guaranteed but content is identical) for any invalid move (out of range, occupied cell, or game already over).

- [ ] **Step 1: Write the failing tests**

Create `src/games/tres-en-raya/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, playMove } from './engine';

describe('tres en raya engine', () => {
  it('empieza con tablero vacío y le toca a X', () => {
    const state = createInitialState();
    expect(state.board).toEqual(Array(9).fill(null));
    expect(state.currentPlayer).toBe('X');
    expect(state.status).toBe('playing');
  });

  it('coloca la ficha del jugador actual y pasa el turno', () => {
    const state = createInitialState();
    const next = playMove(state, 0);
    expect(next.board[0]).toBe('X');
    expect(next.currentPlayer).toBe('O');
    expect(next.status).toBe('playing');
  });

  it('ignora una jugada sobre una casilla ocupada', () => {
    const state = playMove(createInitialState(), 0);
    const next = playMove(state, 0);
    expect(next).toEqual(state);
  });

  it('ignora una jugada fuera de rango', () => {
    const state = createInitialState();
    const next = playMove(state, 9);
    expect(next).toEqual(state);
  });

  it('detecta una fila ganadora', () => {
    let state = createInitialState();
    state = playMove(state, 0); // X
    state = playMove(state, 3); // O
    state = playMove(state, 1); // X
    state = playMove(state, 4); // O
    state = playMove(state, 2); // X gana fila superior
    expect(state.status).toBe('won');
    expect(state.winner).toBe('X');
    expect(state.winningLine).toEqual([0, 1, 2]);
  });

  it('detecta un empate', () => {
    // Resultado final:
    // X O X
    // X O O
    // O X X
    const jugadas = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    let state = createInitialState();
    for (const jugada of jugadas) {
      state = playMove(state, jugada);
    }
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
  });

  it('no permite jugar después de terminada la partida', () => {
    let state = createInitialState();
    state = playMove(state, 0);
    state = playMove(state, 3);
    state = playMove(state, 1);
    state = playMove(state, 4);
    state = playMove(state, 2); // X gana
    const next = playMove(state, 5);
    expect(next).toEqual(state);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/games/tres-en-raya/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/games/tres-en-raya/engine.ts`:

```ts
export type Player = 'X' | 'O';
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won' | 'draw';

export interface TresEnRayaState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningLine: number[] | null;
}

const WINNING_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createInitialState(): TresEnRayaState {
  return {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
  };
}

export function playMove(state: TresEnRayaState, index: number): TresEnRayaState {
  if (state.status !== 'playing') return state;
  if (index < 0 || index > 8) return state;
  if (state.board[index] !== null) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  const winningLine = findWinningLine(board, state.currentPlayer);
  if (winningLine) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      winningLine,
    };
  }

  if (board.every(cell => cell !== null)) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'draw',
      winner: null,
      winningLine: null,
    };
  }

  return {
    board,
    currentPlayer: state.currentPlayer === 'X' ? 'O' : 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
  };
}

function findWinningLine(board: CellValue[], player: Player): number[] | null {
  for (const line of WINNING_LINES) {
    if (line.every(i => board[i] === player)) return line;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/games/tres-en-raya/engine.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/games/tres-en-raya/engine.ts src/games/tres-en-raya/engine.test.ts
git commit -m "feat: add tres en raya engine"
```

---

## Task 7: Tres en raya — board, dynamic route, first vertical slice

**Files:**
- Create: `src/games/tres-en-raya/Board.astro`
- Create: `src/pages/juegos/[slug].astro`
- Create: `README.md`

**Interfaces:**
- Consumes: `TresEnRayaState`, `createInitialState`, `playMove` (Task 6); `ModalInstrucciones` (Task 4); `renderTurnIndicator`, `showWinnerBanner`, `hideWinnerBanner` (Task 4); `getCollection`, `render` from `astro:content`.
- Produces: `/juegos/tres-en-raya` route, playable end to end. `BOARDS` map in `[slug].astro` — the pattern every later game (Tasks 9, 10) extends.

- [ ] **Step 1: Create `src/games/tres-en-raya/Board.astro`**

```astro
<div class="tablero-tres-en-raya">
  <div id="indicador-turno" class="indicador-turno" data-jugador="1"></div>
  <div id="tablero" class="tablero" role="grid" aria-label="Tablero de tres en raya">
    {Array.from({ length: 9 }).map((_, i) => (
      <button type="button" class="casilla" data-indice={i} aria-label={`Casilla ${i + 1}`} />
    ))}
  </div>
  <div id="banner-ganador" class="banner-ganador" hidden></div>
</div>

<style>
  .tablero-tres-en-raya {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: var(--spacing);
  }

  .tablero {
    display: grid;
    grid-template-columns: repeat(3, minmax(4rem, 6rem));
    grid-template-rows: repeat(3, minmax(4rem, 6rem));
    gap: 0.5rem;
  }

  .casilla {
    font-size: 2.5rem;
    font-weight: 700;
    background: var(--color-surface);
    border: 2px solid #ddd;
    border-radius: 12px;
  }

  .casilla[data-valor="X"] {
    color: var(--color-player-1);
  }

  .casilla[data-valor="O"] {
    color: var(--color-player-2);
  }

  .casilla.casilla--ganadora {
    background: var(--color-accent);
  }

  .indicador-turno {
    font-size: 1.1rem;
    font-weight: 700;
    min-height: 2rem;
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
  import { createInitialState, playMove, type TresEnRayaState } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';

  const tablero = document.getElementById('tablero')!;
  const casillas = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.casilla'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;

  const ETIQUETAS = { X: 'X', O: 'O' } as const;

  let state: TresEnRayaState = createInitialState();

  function render(): void {
    casillas.forEach((casilla, i) => {
      const valor = state.board[i];
      casilla.textContent = valor ?? '';
      if (valor) {
        casilla.dataset.valor = valor;
      } else {
        delete casilla.dataset.valor;
      }
      casilla.disabled = valor !== null || state.status !== 'playing';
      casilla.classList.toggle('casilla--ganadora', state.winningLine?.includes(i) ?? false);
    });

    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer === 'X' ? 1 : 2,
        etiqueta: ETIQUETAS[state.currentPlayer],
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      showWinnerBanner(bannerGanador, {
        titulo:
          state.status === 'won' ? `🎉 ¡Ganó ${ETIQUETAS[state.winner!]}!` : '🤝 ¡Empate!',
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

- [ ] **Step 2: Create `src/pages/juegos/[slug].astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import ModalInstrucciones from '../../components/ModalInstrucciones.astro';
import TresEnRayaBoard from '../../games/tres-en-raya/Board.astro';

const BOARDS = {
  'tres-en-raya': TresEnRayaBoard,
} as const;

export async function getStaticPaths() {
  const juegos = await getCollection('juegos');
  return juegos.map(juego => ({
    params: { slug: juego.id },
    props: { juego },
  }));
}

const { juego } = Astro.props;
const { Content } = await render(juego);
const Board = BOARDS[juego.id as keyof typeof BOARDS];
---

<BaseLayout title={juego.data.title}>
  <ModalInstrucciones title={juego.data.title}>
    <Content />
  </ModalInstrucciones>
  <Board />
</BaseLayout>
```

- [ ] **Step 3: Create `README.md` documenting the extensibility pattern**

```md
# Pencilgames

Juegos de lápiz y papel para jugar en familia en una sola tableta (modo
pasar-y-jugar). Ver `docs/superpowers/specs/2026-08-09-pencilgames-design.md`
para el diseño completo.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # tests de los engines
npm run build    # build de producción en dist/
```

## Cómo agregar un juego nuevo

1. Crea `src/content/juegos/<slug>.md` con el frontmatter (`title`,
   `description`, `icono`, `minJugadores`, `maxJugadores`) y las
   instrucciones en el cuerpo del markdown.
2. Crea `src/games/<slug>/engine.ts`: un motor puro (sin DOM) con un
   `createInitialState()` y una función de jugada que valida y devuelve un
   nuevo estado. Escríbelo con TDD — ver `src/games/tres-en-raya/engine.ts`
   y su `engine.test.ts` como referencia.
3. Crea `src/games/<slug>/Board.astro`: pinta el tablero y conecta los
   taps al engine, usando `renderTurnIndicator`/`ocultarTurnIndicator`
   (`src/lib/turnIndicator.ts`) y `showWinnerBanner`/`hideWinnerBanner`
   (`src/lib/winnerBanner.ts`) para mantener la UI consistente con los
   demás juegos.
4. Registra el juego en `src/pages/juegos/[slug].astro`: agrega un
   `import` estático del `Board.astro` y una entrada en el objeto `BOARDS`.
   No uses `import()` dinámico con el slug como variable — rompe el build
   de Astro.
5. No se necesita tocar el índice (`src/pages/index.astro`) ni los
   componentes compartidos — se generan solos desde el content collection.
```

- [ ] **Step 4: Verify the full build**

Run: `npm run build && grep -q "tablero-tres-en-raya" dist/juegos/tres-en-raya/index.html && echo OK`
Expected: prints `OK`.

- [ ] **Step 5: Manual smoke test**

Run: `npm run preview` (in one terminal), then open `http://localhost:4321/juegos/tres-en-raya` in a browser and play a full game to confirm: modal appears, "¡Jugar!" closes it, taps place ✕/●, a win highlights the line and shows the banner, "Jugar de nuevo" resets the board, the "?" button reopens instructions mid-game without losing the board state. Stop the preview server (Ctrl+C) when done.

- [ ] **Step 6: Commit**

```bash
git add src/games/tres-en-raya/Board.astro src/pages/juegos/[slug].astro README.md
git commit -m "feat: add tres en raya board and dynamic game route"
```

---

## Task 8: Deploy to Cloudflare Pages

🧑 **This task is manual — it needs your GitHub/Cloudflare accounts and cannot be run by an agent.** Do it yourself (or ask an agent to walk you through one step at a time, confirming each in the dashboard).

- [ ] **Step 1: Push the repo to GitHub**

Create a new (private or public, your choice) GitHub repository named `pencilgames`, then:

```bash
git remote add origin git@github.com:<tu-usuario>/pencilgames.git
git push -u origin main
```

- [ ] **Step 2: Connect Cloudflare Pages**

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, select the `pencilgames` repo, and configure:
- Build command: `npm run build`
- Build output directory: `dist`
- Framework preset: Astro (if offered — otherwise leave the two settings above as-is)

- [ ] **Step 3: Point your subdomain at it**

In **Custom domains** for the new Pages project, add your chosen subdomain (e.g. `juegos.tudominio.com`). Since the domain is already on Cloudflare, the CNAME is created for you automatically.

- [ ] **Step 4: Update `astro.config.mjs` with the real domain**

Once you know the final subdomain, replace the `site:` value in `astro.config.mjs` (currently a `TODO` placeholder from Task 1) with the real URL, then:

```bash
git add astro.config.mjs
git commit -m "chore: set production site URL"
git push
```

Expected: Cloudflare Pages auto-deploys on push; the site is live at your subdomain within a couple of minutes.

---

## Task 9: Puntos y cajas — content, engine, board

**Files:**
- Create: `src/content/juegos/puntos-y-cajas.md`
- Create: `src/games/puntos-y-cajas/engine.ts`
- Test: `src/games/puntos-y-cajas/engine.test.ts`
- Create: `src/games/puntos-y-cajas/Board.astro`
- Modify: `src/pages/juegos/[slug].astro`

**Interfaces:**
- Produces:
  - `type PuntosPlayer = 1 | 2`
  - `type LineType = 'h' | 'v'`
  - `interface LineId { type: LineType; row: number; col: number }`
  - `interface PuntosYCajasState { size: number; horizontalLines: boolean[][]; verticalLines: boolean[][]; boxOwners: (PuntosPlayer | null)[][]; currentPlayer: PuntosPlayer; scores: Record<PuntosPlayer, number>; status: 'playing' | 'finished' }`
  - `createInitialState(size?: number): PuntosYCajasState` (default `size = 4`, i.e. a 3×3-box board)
  - `playLine(state: PuntosYCajasState, line: LineId): PuntosYCajasState` — pure, rejects out-of-bounds or already-drawn lines by returning the input state unchanged.

- [ ] **Step 1: Create `src/content/juegos/puntos-y-cajas.md`**

```md
---
title: "Puntos y cajas"
description: "Une puntos con líneas y cierra cajas para sumar puntos."
icono: "🔲"
minJugadores: 2
maxJugadores: 2
---

## Cómo se juega

1. Por turnos, cada jugador traza una línea entre dos puntos vecinos (horizontal o vertical).
2. Si al trazar una línea completas los 4 lados de una caja, esa caja es tuya: súmate un punto y **juega de nuevo**.
3. Si no completas ninguna caja, le toca el turno al otro jugador.
4. La partida termina cuando todas las cajas quedan cerradas.
5. Gana quien tenga más cajas.
```

- [ ] **Step 2: Write the failing tests**

Create `src/games/puntos-y-cajas/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, playLine, type PuntosYCajasState } from './engine';

describe('puntos y cajas engine', () => {
  it('empieza sin líneas, sin cajas y le toca al jugador 1', () => {
    const state = createInitialState(2); // 1x1 caja, la más simple posible
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.scores).toEqual({ 1: 0, 2: 0 });
  });

  it('trazar una línea que no completa una caja pasa el turno', () => {
    const state = createInitialState(2);
    const next = playLine(state, { type: 'h', row: 0, col: 0 });
    expect(next.horizontalLines[0][0]).toBe(true);
    expect(next.currentPlayer).toBe(2);
    expect(next.scores).toEqual({ 1: 0, 2: 0 });
  });

  it('completar una caja de 1x1 anota un punto y repite turno', () => {
    let state: PuntosYCajasState = createInitialState(2);
    state = playLine(state, { type: 'h', row: 0, col: 0 }); // jugador 1, pasa a 2
    state = playLine(state, { type: 'h', row: 1, col: 0 }); // jugador 2, pasa a 1
    state = playLine(state, { type: 'v', row: 0, col: 0 }); // jugador 1, pasa a 2
    const next = playLine(state, { type: 'v', row: 0, col: 1 }); // jugador 2 cierra la caja

    expect(next.boxOwners[0][0]).toBe(2);
    expect(next.scores).toEqual({ 1: 0, 2: 1 });
    expect(next.currentPlayer).toBe(2); // turno extra
    expect(next.status).toBe('finished'); // única caja del tablero 1x1
  });

  it('ignora una línea ya trazada', () => {
    const state = playLine(createInitialState(2), { type: 'h', row: 0, col: 0 });
    const next = playLine(state, { type: 'h', row: 0, col: 0 });
    expect(next).toEqual(state);
  });

  it('ignora una línea fuera de rango', () => {
    const state = createInitialState(2);
    const next = playLine(state, { type: 'h', row: 5, col: 5 });
    expect(next).toEqual(state);
  });

  it('una línea interior puede completar dos cajas a la vez', () => {
    // Tablero 3x3 (size=3, cajas en cuadrícula 2x2). La línea horizontal
    // h(1,0) es el lado compartido entre la caja de arriba, (0,0), y la
    // caja de abajo, (1,0): es su "bottom" y su "top" respectivamente.
    // Dejamos ambas cajas con todos sus otros 3 lados trazados, de modo
    // que trazar h(1,0) al final las completa a las dos en la misma jugada.
    let state: PuntosYCajasState = createInitialState(3);
    // Caja superior (0,0): top, left, right ya trazadas; falta bottom = h(1,0)
    state = playLine(state, { type: 'h', row: 0, col: 0 }); // top (0,0)
    state = playLine(state, { type: 'v', row: 0, col: 0 }); // left (0,0)
    state = playLine(state, { type: 'v', row: 0, col: 1 }); // right (0,0)
    // Caja inferior (1,0): left, right, bottom ya trazadas; falta top = h(1,0) (compartida)
    state = playLine(state, { type: 'v', row: 1, col: 0 }); // left (1,0)
    state = playLine(state, { type: 'v', row: 1, col: 1 }); // right (1,0)
    state = playLine(state, { type: 'h', row: 2, col: 0 }); // bottom (1,0)

    const totalAntes = state.scores[1] + state.scores[2];
    const next = playLine(state, { type: 'h', row: 1, col: 0 }); // cierra ambas a la vez

    expect(next.boxOwners[0][0]).not.toBeNull();
    expect(next.boxOwners[1][0]).not.toBeNull();
    expect(next.scores[1] + next.scores[2]).toBe(totalAntes + 2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/games/puntos-y-cajas/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 4: Write the implementation**

Create `src/games/puntos-y-cajas/engine.ts`:

```ts
export type PuntosPlayer = 1 | 2;
export type LineType = 'h' | 'v';

export interface LineId {
  type: LineType;
  row: number;
  col: number;
}

export interface PuntosYCajasState {
  size: number;
  horizontalLines: boolean[][];
  verticalLines: boolean[][];
  boxOwners: (PuntosPlayer | null)[][];
  currentPlayer: PuntosPlayer;
  scores: Record<PuntosPlayer, number>;
  status: 'playing' | 'finished';
}

export function createInitialState(size = 4): PuntosYCajasState {
  const horizontalLines = Array.from({ length: size }, () => Array(size - 1).fill(false));
  const verticalLines = Array.from({ length: size - 1 }, () => Array(size).fill(false));
  const boxOwners: (PuntosPlayer | null)[][] = Array.from({ length: size - 1 }, () =>
    Array(size - 1).fill(null)
  );

  return {
    size,
    horizontalLines,
    verticalLines,
    boxOwners,
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
  };
}

function isLineInBounds(state: PuntosYCajasState, line: LineId): boolean {
  if (line.type === 'h') {
    return line.row >= 0 && line.row < state.size && line.col >= 0 && line.col < state.size - 1;
  }
  return line.row >= 0 && line.row < state.size - 1 && line.col >= 0 && line.col < state.size;
}

function isLineDrawn(state: PuntosYCajasState, line: LineId): boolean {
  if (line.type === 'h') {
    return state.horizontalLines[line.row][line.col];
  }
  return state.verticalLines[line.row][line.col];
}

function boxSides(boxRow: number, boxCol: number) {
  return {
    top: { type: 'h' as const, row: boxRow, col: boxCol },
    bottom: { type: 'h' as const, row: boxRow + 1, col: boxCol },
    left: { type: 'v' as const, row: boxRow, col: boxCol },
    right: { type: 'v' as const, row: boxRow, col: boxCol + 1 },
  };
}

function isBoxComplete(state: PuntosYCajasState, boxRow: number, boxCol: number): boolean {
  const sides = boxSides(boxRow, boxCol);
  return (
    isLineDrawn(state, sides.top) &&
    isLineDrawn(state, sides.bottom) &&
    isLineDrawn(state, sides.left) &&
    isLineDrawn(state, sides.right)
  );
}

function adjacentBoxes(state: PuntosYCajasState, line: LineId): Array<{ row: number; col: number }> {
  const boxCount = state.size - 1;
  const boxes: Array<{ row: number; col: number }> = [];

  if (line.type === 'h') {
    if (line.row - 1 >= 0 && line.row - 1 < boxCount) boxes.push({ row: line.row - 1, col: line.col });
    if (line.row >= 0 && line.row < boxCount) boxes.push({ row: line.row, col: line.col });
  } else {
    if (line.col - 1 >= 0 && line.col - 1 < boxCount) boxes.push({ row: line.row, col: line.col - 1 });
    if (line.col >= 0 && line.col < boxCount) boxes.push({ row: line.row, col: line.col });
  }

  return boxes;
}

export function playLine(state: PuntosYCajasState, line: LineId): PuntosYCajasState {
  if (state.status !== 'playing') return state;
  if (!isLineInBounds(state, line)) return state;
  if (isLineDrawn(state, line)) return state;

  const horizontalLines = state.horizontalLines.map(row => [...row]);
  const verticalLines = state.verticalLines.map(row => [...row]);
  const boxOwners = state.boxOwners.map(row => [...row]);
  const scores = { ...state.scores };

  if (line.type === 'h') {
    horizontalLines[line.row][line.col] = true;
  } else {
    verticalLines[line.row][line.col] = true;
  }

  const nextState: PuntosYCajasState = {
    ...state,
    horizontalLines,
    verticalLines,
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/games/puntos-y-cajas/engine.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Create `src/games/puntos-y-cajas/Board.astro`**

Fixed at `SIZE = 4` (3×3 = 9 boxes). The grid track template below is hand-written for exactly 7 tracks (4 dot-tracks + 3 line-tracks) — if `SIZE` ever changes, the CSS `grid-template-columns`/`grid-template-rows` must be updated to match.

```astro
---
const SIZE = 4;
---

<div class="tablero-puntos-y-cajas">
  <div id="indicador-turno" class="indicador-turno" data-jugador="1"></div>
  <div id="tablero" class="tablero-pyc">
    {Array.from({ length: SIZE }).map((_, r) => (
      <Fragment>
        {Array.from({ length: SIZE }).map((_, c) => (
          <span class="punto" style={`grid-row: ${2 * r + 1}; grid-column: ${2 * c + 1};`} />
        ))}
        {Array.from({ length: SIZE - 1 }).map((_, c) => (
          <button
            type="button"
            class="linea linea--h"
            data-tipo="h"
            data-fila={r}
            data-columna={c}
            style={`grid-row: ${2 * r + 1}; grid-column: ${2 * c + 2};`}
            aria-label={`Línea horizontal, fila ${r + 1}, posición ${c + 1}`}
          />
        ))}
      </Fragment>
    ))}
    {Array.from({ length: SIZE - 1 }).map((_, r) => (
      <Fragment>
        {Array.from({ length: SIZE }).map((_, c) => (
          <button
            type="button"
            class="linea linea--v"
            data-tipo="v"
            data-fila={r}
            data-columna={c}
            style={`grid-row: ${2 * r + 2}; grid-column: ${2 * c + 1};`}
            aria-label={`Línea vertical, fila ${r + 1}, posición ${c + 1}`}
          />
        ))}
        {Array.from({ length: SIZE - 1 }).map((_, c) => (
          <span
            class="caja"
            data-fila={r}
            data-columna={c}
            style={`grid-row: ${2 * r + 2}; grid-column: ${2 * c + 2};`}
          />
        ))}
      </Fragment>
    ))}
  </div>
  <div id="banner-ganador" class="banner-ganador" hidden></div>
</div>

<style>
  .tablero-puntos-y-cajas {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: var(--spacing);
  }

  .tablero-pyc {
    display: grid;
    grid-template-columns: 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px;
    grid-template-rows: 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px;
    width: min(92vw, 26rem);
    aspect-ratio: 1;
    margin: 0 auto;
  }

  .punto {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-text);
    justify-self: center;
    align-self: center;
  }

  .linea {
    border: none;
    background: transparent;
    padding: 0;
  }

  .linea--h {
    align-self: center;
    width: 100%;
    min-height: 2.75rem;
  }

  .linea--h::before {
    content: '';
    display: block;
    height: 6px;
    background: #ddd;
    border-radius: 3px;
    margin: auto 0;
  }

  .linea--h[data-trazada='true']::before {
    background: var(--color-player-1);
  }

  .linea--v {
    justify-self: center;
    height: 100%;
    min-width: 2.75rem;
  }

  .linea--v::before {
    content: '';
    display: block;
    width: 6px;
    height: 100%;
    background: #ddd;
    border-radius: 3px;
    margin: 0 auto;
  }

  .linea--v[data-trazada='true']::before {
    background: var(--color-player-1);
  }

  .caja {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
  }

  .caja[data-jugador='1'] {
    background: color-mix(in srgb, var(--color-player-1) 25%, transparent);
  }

  .caja[data-jugador='2'] {
    background: color-mix(in srgb, var(--color-player-2) 25%, transparent);
  }

  .indicador-turno {
    font-size: 1.1rem;
    font-weight: 700;
    min-height: 2rem;
    text-align: center;
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
  import { createInitialState, playLine, type PuntosYCajasState, type LineId } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';

  const tablero = document.getElementById('tablero')!;
  const lineas = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.linea'));
  const cajas = Array.from(tablero.querySelectorAll<HTMLElement>('.caja'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;

  let state: PuntosYCajasState = createInitialState(4);

  function render(): void {
    for (const linea of lineas) {
      const tipo = linea.dataset.tipo as 'h' | 'v';
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      const trazada = tipo === 'h' ? state.horizontalLines[fila][columna] : state.verticalLines[fila][columna];
      linea.dataset.trazada = String(trazada);
      linea.disabled = trazada || state.status !== 'playing';
    }

    for (const caja of cajas) {
      const fila = Number(caja.dataset.fila);
      const columna = Number(caja.dataset.columna);
      const dueno = state.boxOwners[fila][columna];
      if (dueno) {
        caja.dataset.jugador = String(dueno);
        caja.textContent = dueno === 1 ? '●' : '■';
      } else {
        delete caja.dataset.jugador;
        caja.textContent = '';
      }
    }

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
  }

  function reiniciar(): void {
    state = createInitialState(4);
    render();
  }

  for (const linea of lineas) {
    linea.addEventListener('click', () => {
      const tipo = linea.dataset.tipo as LineId['type'];
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      state = playLine(state, { type: tipo, row: fila, col: columna });
      render();
    });
  }

  render();
</script>
```

- [ ] **Step 7: Register the game in `src/pages/juegos/[slug].astro`**

Modify the file from Task 7: add the import and map entry.

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import ModalInstrucciones from '../../components/ModalInstrucciones.astro';
import TresEnRayaBoard from '../../games/tres-en-raya/Board.astro';
import PuntosYCajasBoard from '../../games/puntos-y-cajas/Board.astro';

const BOARDS = {
  'tres-en-raya': TresEnRayaBoard,
  'puntos-y-cajas': PuntosYCajasBoard,
} as const;

export async function getStaticPaths() {
  const juegos = await getCollection('juegos');
  return juegos.map(juego => ({
    params: { slug: juego.id },
    props: { juego },
  }));
}

const { juego } = Astro.props;
const { Content } = await render(juego);
const Board = BOARDS[juego.id as keyof typeof BOARDS];
---

<BaseLayout title={juego.data.title}>
  <ModalInstrucciones title={juego.data.title}>
    <Content />
  </ModalInstrucciones>
  <Board />
</BaseLayout>
```

- [ ] **Step 8: Verify the full build**

Run: `npm run build && grep -q "tablero-puntos-y-cajas" dist/juegos/puntos-y-cajas/index.html && echo OK`
Expected: prints `OK`.

- [ ] **Step 9: Manual smoke test**

Run: `npm run preview`, open `http://localhost:4321/juegos/puntos-y-cajas`, and play until several boxes are closed to confirm: lines respond to taps, completing a box keeps the same player's turn (score updates, turn label doesn't switch), a non-completing line switches the turn, and finishing all 9 boxes shows the winner banner with the final score. Stop the server when done.

- [ ] **Step 10: Commit**

```bash
git add src/content/juegos/puntos-y-cajas.md src/games/puntos-y-cajas/engine.ts src/games/puntos-y-cajas/engine.test.ts src/games/puntos-y-cajas/Board.astro src/pages/juegos/[slug].astro
git commit -m "feat: add puntos y cajas game"
```

---

## Task 10: Agujero Negro — content, engine, board

**Files:**
- Create: `src/content/juegos/agujero-negro.md`
- Create: `src/games/agujero-negro/engine.ts`
- Test: `src/games/agujero-negro/engine.test.ts`
- Create: `src/games/agujero-negro/Board.astro`
- Modify: `src/pages/juegos/[slug].astro`

**Interfaces:**
- Produces:
  - `interface Cell { id: number; row: number; column: number; player: 1 | 2 | null; value: number | null }`
  - `interface AgujeroNegroState { cells: Cell[]; currentPlayer: 1 | 2; nextValue: Record<1 | 2, number>; status: 'playing' | 'finished'; blackHole: number | null; destroyedCells: number[]; scores: Record<1 | 2, number> }`
  - `getNeighbors(cellId: number): number[]`
  - `createInitialState(): AgujeroNegroState`
  - `placeNumber(state: AgujeroNegroState, positionId: number): AgujeroNegroState`

This engine implements `agujero-negro-reglas.md` exactly — see that file's §9–13 for the data model and invariants this task's tests are built from.

- [ ] **Step 1: Create `src/content/juegos/agujero-negro.md`**

```md
---
title: "Agujero Negro"
description: "Coloca tus números del 1 al 10 y evita quedar junto al agujero negro."
icono: "🕳️"
minJugadores: 2
maxJugadores: 2
---

## Cómo se juega

1. Hay un tablero triangular de 21 posiciones. Cada jugador tiene los números del 1 al 10.
2. Por turnos, cada jugador coloca su siguiente número (empezando por el 1) en cualquier posición vacía.
3. Después de colocar los 20 números, queda **una sola posición vacía**: ese es el Agujero Negro.
4. El Agujero Negro elimina los números que estén justo al lado de él.
5. Cada jugador suma los números que le sobrevivieron. ¡Gana quien tenga más puntos!
```

- [ ] **Step 2: Write the failing tests**

Create `src/games/agujero-negro/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, getNeighbors, placeNumber, type AgujeroNegroState } from './engine';

describe('agujero negro — getNeighbors', () => {
  it('una esquina tiene exactamente 2 vecinos', () => {
    expect(getNeighbors(0)).toHaveLength(2); // vértice superior
    expect(getNeighbors(15)).toHaveLength(2); // vértice inferior izquierdo
    expect(getNeighbors(20)).toHaveLength(2); // vértice inferior derecho
  });

  it('una posición de borde (no esquina) tiene más de 2 y menos de 6 vecinos', () => {
    const vecinos = getNeighbors(1);
    expect(vecinos.length).toBeGreaterThan(2);
    expect(vecinos.length).toBeLessThan(6);
  });

  it('una posición interior tiene hasta 6 vecinos', () => {
    expect(getNeighbors(7)).toHaveLength(6);
  });

  it('la relación de vecindad es simétrica', () => {
    for (let id = 0; id < 21; id++) {
      for (const vecino of getNeighbors(id)) {
        expect(getNeighbors(vecino)).toContain(id);
      }
    }
  });
});

describe('agujero negro — partida', () => {
  it('empieza con 21 celdas vacías y le toca al jugador 1 con el número 1', () => {
    const state = createInitialState();
    expect(state.cells).toHaveLength(21);
    expect(state.cells.every(c => c.value === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.nextValue).toEqual({ 1: 1, 2: 1 });
    expect(state.status).toBe('playing');
  });

  it('colocar un número avanza el siguiente valor del jugador y pasa el turno', () => {
    const state = createInitialState();
    const next = placeNumber(state, 5);
    const celda = next.cells.find(c => c.id === 5)!;
    expect(celda.value).toBe(1);
    expect(celda.player).toBe(1);
    expect(next.currentPlayer).toBe(2);
    expect(next.nextValue[1]).toBe(2);
  });

  it('ignora colocar sobre una posición ya ocupada', () => {
    const state = placeNumber(createInitialState(), 0);
    const next = placeNumber(state, 0);
    expect(next).toEqual(state);
  });

  it('termina la partida exactamente después de colocar el segundo 10, con 20 celdas ocupadas y 1 vacía', () => {
    let state: AgujeroNegroState = createInitialState();
    // Alternamos 1,2,3,...,1,2,3,... en las posiciones 0..19, dejando la 20 vacía.
    for (let posicion = 0; posicion < 20; posicion++) {
      state = placeNumber(state, posicion);
    }

    expect(state.status).toBe('finished');
    expect(state.cells.filter(c => c.value !== null)).toHaveLength(20);
    expect(state.cells.filter(c => c.value === null)).toHaveLength(1);
    expect(state.blackHole).toBe(20);
    expect(state.destroyedCells).toEqual(getNeighbors(20));
  });

  it('la puntuación final solo cuenta los números sobrevivientes y ambas sumas son consistentes', () => {
    let state: AgujeroNegroState = createInitialState();
    for (let posicion = 0; posicion < 20; posicion++) {
      state = placeNumber(state, posicion);
    }

    const sobrevivientes = state.cells.filter(
      c => c.value !== null && !state.destroyedCells.includes(c.id)
    );
    const sumaEsperada = { 1: 0, 2: 0 } as Record<1 | 2, number>;
    for (const c of sobrevivientes) {
      sumaEsperada[c.player as 1 | 2] += c.value as number;
    }

    expect(state.scores).toEqual(sumaEsperada);
  });

  it('no permite jugar después de terminada la partida', () => {
    let state: AgujeroNegroState = createInitialState();
    for (let posicion = 0; posicion < 20; posicion++) {
      state = placeNumber(state, posicion);
    }
    const next = placeNumber(state, 20);
    expect(next).toEqual(state);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/games/agujero-negro/engine.test.ts`
Expected: FAIL — `Cannot find module './engine'`.

- [ ] **Step 4: Write the implementation**

Create `src/games/agujero-negro/engine.ts`:

```ts
export const TOTAL_POSITIONS = 21;
export const TOTAL_ROWS = 6;
export const MAX_VALUE = 10;

export interface Cell {
  id: number;
  row: number;
  column: number;
  player: 1 | 2 | null;
  value: number | null;
}

export type AgujeroNegroStatus = 'playing' | 'finished';

export interface AgujeroNegroState {
  cells: Cell[];
  currentPlayer: 1 | 2;
  nextValue: Record<1 | 2, number>;
  status: AgujeroNegroStatus;
  blackHole: number | null;
  destroyedCells: number[];
  scores: Record<1 | 2, number>;
}

function rowStart(row: number): number {
  return (row * (row + 1)) / 2;
}

export function rowOf(id: number): number {
  let row = 0;
  while (rowStart(row + 1) <= id) row++;
  return row;
}

export function columnOf(id: number): number {
  return id - rowStart(rowOf(id));
}

export function cellId(row: number, column: number): number {
  return rowStart(row) + column;
}

export function getNeighbors(idParaVecinos: number): number[] {
  const row = rowOf(idParaVecinos);
  const col = columnOf(idParaVecinos);
  const neighbors: number[] = [];
  const rowSize = (r: number) => r + 1;

  // misma fila
  if (col - 1 >= 0) neighbors.push(cellId(row, col - 1));
  if (col + 1 < rowSize(row)) neighbors.push(cellId(row, col + 1));

  // fila de arriba
  if (row - 1 >= 0) {
    if (col - 1 >= 0 && col - 1 < rowSize(row - 1)) neighbors.push(cellId(row - 1, col - 1));
    if (col < rowSize(row - 1)) neighbors.push(cellId(row - 1, col));
  }

  // fila de abajo (siempre en rango: rowSize(row+1) = row+2 > col, porque col <= row)
  if (row + 1 < TOTAL_ROWS) {
    neighbors.push(cellId(row + 1, col));
    neighbors.push(cellId(row + 1, col + 1));
  }

  return neighbors;
}

export function createInitialState(): AgujeroNegroState {
  const cells: Cell[] = [];
  for (let row = 0; row < TOTAL_ROWS; row++) {
    for (let column = 0; column <= row; column++) {
      cells.push({ id: cellId(row, column), row, column, player: null, value: null });
    }
  }

  return {
    cells,
    currentPlayer: 1,
    nextValue: { 1: 1, 2: 1 },
    status: 'playing',
    blackHole: null,
    destroyedCells: [],
    scores: { 1: 0, 2: 0 },
  };
}

export function placeNumber(state: AgujeroNegroState, positionId: number): AgujeroNegroState {
  if (state.status !== 'playing') return state;

  const cell = state.cells.find(c => c.id === positionId);
  if (!cell || cell.value !== null) return state;

  const cells = state.cells.map(c =>
    c.id === positionId ? { ...c, player: state.currentPlayer, value: state.nextValue[state.currentPlayer] } : c
  );

  const nextValue = { ...state.nextValue };
  nextValue[state.currentPlayer] += 1;

  const occupiedCount = cells.filter(c => c.value !== null).length;

  if (occupiedCount === TOTAL_POSITIONS - 1) {
    const blackHoleCell = cells.find(c => c.value === null)!;
    const destroyedCells = getNeighbors(blackHoleCell.id);

    const scores: Record<1 | 2, number> = { 1: 0, 2: 0 };
    for (const c of cells) {
      if (c.value !== null && c.player !== null && !destroyedCells.includes(c.id)) {
        scores[c.player] += c.value;
      }
    }

    return {
      cells,
      currentPlayer: state.currentPlayer,
      nextValue,
      status: 'finished',
      blackHole: blackHoleCell.id,
      destroyedCells,
      scores,
    };
  }

  return {
    cells,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    nextValue,
    status: 'playing',
    blackHole: null,
    destroyedCells: [],
    scores: state.scores,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/games/agujero-negro/engine.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Create `src/games/agujero-negro/Board.astro`**

```astro
---
function idsDeFila(row: number): number[] {
  const start = (row * (row + 1)) / 2;
  return Array.from({ length: row + 1 }, (_, i) => start + i);
}
---

<div class="tablero-agujero-negro">
  <div id="indicador-turno" class="indicador-turno" data-jugador="1"></div>
  <div id="tablero" class="tablero-an">
    {[0, 1, 2, 3, 4, 5].map(row => (
      <div class="fila-an">
        {idsDeFila(row).map(id => (
          <button type="button" class="posicion-an" data-id={id} aria-label={`Posición ${id + 1}`} />
        ))}
      </div>
    ))}
  </div>
  <div id="banner-ganador" class="banner-ganador" hidden></div>
</div>

<style>
  .tablero-agujero-negro {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: var(--spacing);
  }

  .tablero-an {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .fila-an {
    display: flex;
    justify-content: center;
    gap: 0.4rem;
    margin-top: -0.5rem;
  }

  .fila-an:first-child {
    margin-top: 0;
  }

  .posicion-an {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    border: 2px solid #ddd;
    background: var(--color-surface);
    font-size: 1rem;
    font-weight: 700;
  }

  .posicion-an[data-jugador='1'] {
    color: var(--color-player-1);
    border-color: var(--color-player-1);
  }

  .posicion-an[data-jugador='2'] {
    color: var(--color-player-2);
    border-color: var(--color-player-2);
  }

  .posicion-an[data-agujero='true'] {
    background: var(--color-text);
    color: var(--color-bg);
  }

  .posicion-an[data-destruida='true'] {
    opacity: 0.35;
    text-decoration: line-through;
  }

  .indicador-turno {
    font-size: 1.1rem;
    font-weight: 700;
    min-height: 2rem;
    text-align: center;
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
  import { createInitialState, placeNumber, type AgujeroNegroState } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';

  const tablero = document.getElementById('tablero')!;
  const posiciones = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.posicion-an'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;

  let state: AgujeroNegroState = createInitialState();

  function render(): void {
    for (const boton of posiciones) {
      const id = Number(boton.dataset.id);
      const celda = state.cells.find(c => c.id === id)!;

      boton.textContent = celda.value !== null ? String(celda.value) : '';
      if (celda.player) {
        boton.dataset.jugador = String(celda.player);
      } else {
        delete boton.dataset.jugador;
      }
      boton.dataset.agujero = String(state.blackHole === id);
      boton.dataset.destruida = String(state.destroyedCells.includes(id));
      boton.disabled = celda.value !== null || state.status !== 'playing';
    }

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
  }

  function reiniciar(): void {
    state = createInitialState();
    render();
  }

  for (const boton of posiciones) {
    boton.addEventListener('click', () => {
      const id = Number(boton.dataset.id);
      state = placeNumber(state, id);
      render();
    });
  }

  render();
</script>
```

- [ ] **Step 7: Register the game in `src/pages/juegos/[slug].astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import ModalInstrucciones from '../../components/ModalInstrucciones.astro';
import TresEnRayaBoard from '../../games/tres-en-raya/Board.astro';
import PuntosYCajasBoard from '../../games/puntos-y-cajas/Board.astro';
import AgujeroNegroBoard from '../../games/agujero-negro/Board.astro';

const BOARDS = {
  'tres-en-raya': TresEnRayaBoard,
  'puntos-y-cajas': PuntosYCajasBoard,
  'agujero-negro': AgujeroNegroBoard,
} as const;

export async function getStaticPaths() {
  const juegos = await getCollection('juegos');
  return juegos.map(juego => ({
    params: { slug: juego.id },
    props: { juego },
  }));
}

const { juego } = Astro.props;
const { Content } = await render(juego);
const Board = BOARDS[juego.id as keyof typeof BOARDS];
---

<BaseLayout title={juego.data.title}>
  <ModalInstrucciones title={juego.data.title}>
    <Content />
  </ModalInstrucciones>
  <Board />
</BaseLayout>
```

- [ ] **Step 8: Verify the full build**

Run: `npm run build && grep -q "tablero-agujero-negro" dist/juegos/agujero-negro/index.html && echo OK`
Expected: prints `OK`.

- [ ] **Step 9: Manual smoke test**

Run: `npm run preview`, open `http://localhost:4321/juegos/agujero-negro`, and play a full game (20 taps) to confirm: the turn indicator shows the correct next number per player, the game stops accepting taps after 20 placements, the black hole position and its destroyed neighbors are visually marked, and the winner banner shows both players' final scores. Stop the server when done.

- [ ] **Step 10: Commit**

```bash
git add src/content/juegos/agujero-negro.md src/games/agujero-negro/engine.ts src/games/agujero-negro/engine.test.ts src/games/agujero-negro/Board.astro src/pages/juegos/[slug].astro
git commit -m "feat: add agujero negro game"
```

---

## Task 11: PWA — offline support

**Files:**
- Create: `scripts/generate-icons.mjs`
- Create: `public/icon-192.png`, `public/icon-512.png` (generated, not hand-written)
- Modify: `astro.config.mjs`
- Modify: `package.json` (add `sharp` devDependency)

**Interfaces:**
- Produces: `dist/sw.js` and `dist/manifest.webmanifest` after build; the site becomes installable and works offline after a first online visit.

- [ ] **Step 1: Install the icon-generation dependency**

Run: `npm install --save-dev sharp`

- [ ] **Step 2: Create `scripts/generate-icons.mjs`**

```js
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#fdf6ec" />
  <text x="256" y="330" font-size="300" text-anchor="middle">✏️</text>
</svg>
`;

await mkdir('public', { recursive: true });

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
}

console.log('Íconos generados en public/icon-192.png y public/icon-512.png');
```

- [ ] **Step 3: Generate the icons**

Run: `node scripts/generate-icons.mjs`
Expected: prints the confirmation message; `public/icon-192.png` and `public/icon-512.png` exist.

- [ ] **Step 4: Add the PWA integration to `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import AstroPWA from '@vite-pwa/astro';

export default defineConfig({
  // TODO(carlos): reemplaza esta URL por tu subdominio real (ver Task 8).
  site: 'https://juegos.tudominio.com',
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pencilgames',
        short_name: 'Pencilgames',
        description: 'Juegos de lápiz y papel para jugar en familia',
        theme_color: '#fdf6ec',
        background_color: '#fdf6ec',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,css,js,svg,png,ico}'],
      },
    }),
  ],
});
```

- [ ] **Step 5: Verify the build produces a service worker and manifest**

Run: `npm run build && test -f dist/sw.js && test -f dist/manifest.webmanifest && echo OK`
Expected: prints `OK`.

- [ ] **Step 6: Manual offline check**

Run: `npm run preview`, open the site in a browser, load every game page once (so the service worker caches them), then use the browser devtools' Network panel to switch to "Offline" and reload each page (`/`, `/juegos/tres-en-raya`, `/juegos/puntos-y-cajas`, `/juegos/agujero-negro`) — confirm they still load and are playable. Switch back online afterward.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-icons.mjs public/icon-192.png public/icon-512.png astro.config.mjs package.json package-lock.json
git commit -m "feat: add PWA support for offline play"
```

---

## Task 12: Final tablet-viewport verification

**Files:** none created — verification only, against the Global Constraints' numeric tablet requirements.

- [ ] **Step 1: Build and preview**

Run: `npm run build && npm run preview`

- [ ] **Step 2: Check for horizontal scroll at common tablet widths**

For each of `/`, `/juegos/tres-en-raya`, `/juegos/puntos-y-cajas`, `/juegos/agujero-negro`, open the page in a browser with the viewport resized (or devtools device toolbar) to 768×1024 (portrait) and 1024×768 (landscape), and in the devtools console run:

```js
document.documentElement.scrollWidth === window.innerWidth
```

Expected: `true` on every page at both sizes. If `false` on any page, find the overflowing element (`document.querySelectorAll('*')` with `getBoundingClientRect().right > window.innerWidth` narrows it down) and fix its width/padding before proceeding.

- [ ] **Step 3: Check tap target sizes**

On each game page, in the devtools console run (adjust the selector per game: `.casilla`, `.linea`, `.posicion-an`):

```js
[...document.querySelectorAll('button')].every(b => {
  const r = b.getBoundingClientRect();
  return r.width >= 44 && r.height >= 44;
})
```

Expected: `true` on every game page. Puntos y Cajas is the one most likely to fail here — its `.linea` buttons rely on `min-height`/`min-width: 2.75rem` (44px) from Task 9; if this check fails there, re-check that CSS didn't get overridden.

- [ ] **Step 4: Full playthrough on each game**

Play one complete game of each of the three games start to finish (through the winner banner and "Jugar de nuevo") to catch any interaction issue the automated checks above wouldn't (e.g., a `disabled` state not clearing after reset).

- [ ] **Step 5: Record the result**

If all checks pass, this task needs no commit — it's a verification gate, not a code change. If any check fails, fix the issue in the relevant task's files, re-run the full Step 2–4 sequence, then commit the fix with a message referencing which check it fixes (e.g. `fix: pad puntos y cajas line hit-areas to meet 44px tap target minimum`).
