# Tema oscuro y acabado (spec 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir tema oscuro con conmutador manual, zonas seguras, la barra superior de la partida reordenada, manifiesto con orientación y una invitación a instalar la PWA.

**Architecture:** Los colores viven en variables CSS en `BaseLayout.astro` (única fuente). El oscuro redefine esas variables bajo `prefers-color-scheme` y bajo `data-tema="oscuro"`; un script inline en `<head>` aplica la preferencia guardada antes de pintar. La lógica de tema e instalación vive en módulos `src/lib/` puros y con pruebas; los componentes solo los enlazan al DOM. Un test lee `BaseLayout.astro` y calcula el contraste WCAG de la paleta, para que la AA no dependa del ojo.

**Tech Stack:** Astro 7, CSS, TypeScript vanilla, Vitest (entorno `node`, sin DOM: los módulos reciben sus dependencias del DOM por parámetro).

**Spec:** `specs/10-tema-oscuro-y-acabado.md` (+ `specs/00-contexto-compartido.md`)

## Global Constraints

- No introducir dependencias nuevas. Astro + CSS + TS vanilla.
- Todo texto de interfaz en español, tuteando al niño.
- Cualquier animación nueva va envuelta en `@media (prefers-reduced-motion: reduce)`.
- No romper accesibilidad: `aria-label`, `role="status"`, color + forma, objetivos ≥ 44 px (piso táctil 48 px, casillas 56 px).
- Preferir variables CSS en un único sitio compartido sobre valores repetidos juego por juego.
- Verificar todo a **600×960** y a **960×600**.
- Claves de `localStorage`: `pencilgames:tema` y `pencilgames:instalar-visto`. Todo acceso envuelto en `try/catch` silencioso (patrón de `src/lib/recientes.ts`).
- Contraste: texto ≥ 4.5:1 (AA) en los dos temas; los dos colores de jugador también ≥ 4.5:1 contra fondo y superficie.
- Fuera de alcance: temas personalizados por niño, alto contraste.
- Entorno: el repo usa `npm` (no pnpm). En un worktree el guard bloquea los `git` del asistente: si falla, pedirle al usuario que los corra con `!`, uno por uno. Para medir en navegador, Chrome headless por CDP y `astro dev` en un puerto propio (no `astro preview`; el 4399 suele estar ocupado).

## Review Focus

1. `pencilgames:tema` con valor corrupto o ausente, o `localStorage` bloqueado → se comporta como «auto», nunca lanza. (Task 1)
2. Tema forzado contrario al del sistema (claro forzado con SO oscuro y viceversa): `data-tema` gana, el `theme-color` sigue al forzado. (Tasks 1, 3)
3. Texto sobre fichas rellenas de color de jugador (hoy `#fff` fijo): al subir la luminosidad en oscuro, el blanco dejaría de leerse → `--color-on-player`. Igual con texto sobre `--color-accent` (botones activos), que hereda el texto claro del tema oscuro → `--color-on-accent`. (Tasks 2, 4)
4. Los colores de jugador **actuales** en claro no pasan AA (`#e0532c` = 3.60:1, `#2c6fe0` = 4.39:1 sobre `#fdf6ec`): hay que oscurecerlos ligeramente. (Task 2)
5. Aviso de instalar: ya instalada (`display-mode: standalone` o `navigator.standalone`) no se muestra; `localStorage` bloqueado no se muestra (no insistir); descartar el diálogo nativo de instalación también lo marca como visto. (Task 6)
6. Las zonas seguras valen 0 en escritorio y en la mayoría de tabletas: el layout a 600×960 y 960×600 no puede cambiar ni un píxel respecto a hoy. (Task 5)

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/lib/contraste.ts` (nuevo) | `luminancia`, `contraste` WCAG sobre colores `#rrggbb`. |
| `src/lib/tema.ts` (nuevo) | Tipo `Tema`, persistencia, ciclo, `aplicarTema` sobre un `<html>` y metas inyectados. |
| `src/lib/instalar.ts` (nuevo) | Clave, `instalarVisto`, `marcarInstalarVisto`, `debeMostrarAviso`. |
| `src/layouts/BaseLayout.astro` | Variables claro/oscuro, `color-scheme`, metas `theme-color` por esquema, script inline anti-destello. |
| `src/components/ConmutadorTema.astro` (nuevo) | Botón de tres estados, solo en la portada. |
| `src/components/AvisoInstalar.astro` (nuevo) | Aviso descartable en la portada. |
| `src/components/AccionesCabecera.astro` (nuevo) | `Cambiar nombres` y `Por internet` (movidos desde `ModalJugadores.astro`). |
| `src/pages/juegos/[slug].astro` | Cabecera con acciones a la derecha; zonas seguras. |
| `src/components/ModalJugadores.astro`, `TableroJuego.astro`, `ControlesPartida.astro`, otros modales, `src/games/*/Board.astro` | Sustituir colores fijos por variables; zonas seguras. |
| `public/manifest.webmanifest` | `orientation: any`. |
| Tests: `contraste.test.ts`, `paleta.test.ts`, `tema.test.ts`, `instalar.test.ts`, `manifiesto.test.ts`, `sinColoresFijos.test.ts` | Ver cada task. |

Orden: 1 (lógica) → 2 (paleta) → 3 (layout) → 4 (migrar colores y verificar los 21 juegos) → 5 (cabecera y zonas seguras) → 6 (conmutador, instalar, manifiesto) → 7 (cierre).

---

### Task 0: Worktree

- [ ] Invocar `superpowers:using-git-worktrees` y crear el worktree `spec10-tema` desde `main` (796d631). Instalar con `npm install` si hace falta y comprobar `npm test` verde de partida (796 pruebas).

---

### Task 1: Lógica de tema y de contraste

**Files:**
- Create: `src/lib/contraste.ts`, `src/lib/contraste.test.ts`, `src/lib/tema.ts`, `src/lib/tema.test.ts`

**Interfaces:**
- Produces (`contraste.ts`): `luminancia(hex: string): number`, `contraste(a: string, b: string): number`
- Produces (`tema.ts`):
  ```ts
  export type Tema = 'auto' | 'claro' | 'oscuro';
  export const CLAVE_TEMA = 'pencilgames:tema';
  export const TEMAS: readonly Tema[];            // ['auto','claro','oscuro']
  export const COLOR_BARRA: { readonly claro: string; readonly oscuro: string };
  export function esTema(v: unknown): v is Tema;
  export function obtenerTema(): Tema;
  export function guardarTema(t: Tema): void;
  export function siguienteTema(t: Tema): Tema;
  export interface RaizTema { setAttribute(n: string, v: string): void; removeAttribute(n: string): void }
  export interface MetaColor { content: string; dataset: { esquema?: string } }
  export function aplicarTema(t: Tema, raiz: RaizTema, metas: Iterable<MetaColor>): void;
  ```

- [ ] **Step 1: Test de contraste** — `src/lib/contraste.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contraste, luminancia } from './contraste';

describe('contraste', () => {
  it('negro sobre blanco es 21:1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('es simétrico', () => {
    expect(contraste('#e0532c', '#fdf6ec')).toBeCloseTo(contraste('#fdf6ec', '#e0532c'), 5);
  });
  it('mismo color es 1:1', () => {
    expect(contraste('#2b2b2b', '#2b2b2b')).toBeCloseTo(1, 5);
  });
  it('luminancia de blanco es 1 y de negro es 0', () => {
    expect(luminancia('#ffffff')).toBeCloseTo(1, 5);
    expect(luminancia('#000000')).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/contraste.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** `src/lib/contraste.ts`:

```ts
// Contraste WCAG 2.x entre dos colores #rrggbb. Solo lo usan las pruebas de
// paleta; vive en lib/ para poder reutilizarlo si se añade otro tema.

function canal(hex: string, inicio: number): number {
  const v = parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function luminancia(hex: string): number {
  return 0.2126 * canal(hex, 1) + 0.7152 * canal(hex, 3) + 0.0722 * canal(hex, 5);
}

export function contraste(a: string, b: string): number {
  const x = luminancia(a);
  const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
```

- [ ] **Step 4:** el test pasa.

- [ ] **Step 5: Test de tema** — `src/lib/tema.test.ts`. Copiar el patrón de stub de `localStorage` de `src/lib/recientes.test.ts` (leerlo primero; usa `vi.stubGlobal`). Casos:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_TEMA, COLOR_BARRA, aplicarTema, guardarTema, obtenerTema, siguienteTema,
  type MetaColor,
} from './tema';

function stubStorage(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  });
  return datos;
}

afterEach(() => vi.unstubAllGlobals());

describe('obtenerTema', () => {
  it('sin valor guardado es auto', () => {
    stubStorage();
    expect(obtenerTema()).toBe('auto');
  });
  it('devuelve claro y oscuro guardados', () => {
    stubStorage({ [CLAVE_TEMA]: 'oscuro' });
    expect(obtenerTema()).toBe('oscuro');
    stubStorage({ [CLAVE_TEMA]: 'claro' });
    expect(obtenerTema()).toBe('claro');
  });
  it('un valor corrupto cae a auto', () => {
    stubStorage({ [CLAVE_TEMA]: 'violeta' });
    expect(obtenerTema()).toBe('auto');
  });
  it('si localStorage lanza, es auto', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado'); } });
    expect(obtenerTema()).toBe('auto');
  });
});

describe('guardarTema', () => {
  it('guarda claro/oscuro y borra la clave en auto', () => {
    const datos = stubStorage();
    guardarTema('oscuro');
    expect(datos.get(CLAVE_TEMA)).toBe('oscuro');
    guardarTema('auto');
    expect(datos.has(CLAVE_TEMA)).toBe(false);
  });
  it('no lanza si localStorage falla', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('cuota'); },
      removeItem: () => { throw new Error('cuota'); },
    });
    expect(() => guardarTema('claro')).not.toThrow();
    expect(() => guardarTema('auto')).not.toThrow();
  });
});

describe('siguienteTema', () => {
  it('cicla auto → claro → oscuro → auto', () => {
    expect(siguienteTema('auto')).toBe('claro');
    expect(siguienteTema('claro')).toBe('oscuro');
    expect(siguienteTema('oscuro')).toBe('auto');
  });
});

describe('aplicarTema', () => {
  function raizFalsa() {
    const attrs = new Map<string, string>();
    return {
      attrs,
      setAttribute: (n: string, v: string) => void attrs.set(n, v),
      removeAttribute: (n: string) => void attrs.delete(n),
    };
  }
  const metas = (): MetaColor[] => [
    { content: COLOR_BARRA.claro, dataset: { esquema: 'claro' } },
    { content: COLOR_BARRA.oscuro, dataset: { esquema: 'oscuro' } },
  ];

  it('claro/oscuro fijan data-tema y fuerzan el theme-color en ambas metas', () => {
    const raiz = raizFalsa();
    const m = metas();
    aplicarTema('oscuro', raiz, m);
    expect(raiz.attrs.get('data-tema')).toBe('oscuro');
    expect(m.map(x => x.content)).toEqual([COLOR_BARRA.oscuro, COLOR_BARRA.oscuro]);
    aplicarTema('claro', raiz, m);
    expect(raiz.attrs.get('data-tema')).toBe('claro');
    expect(m.map(x => x.content)).toEqual([COLOR_BARRA.claro, COLOR_BARRA.claro]);
  });
  it('auto quita data-tema y restaura el color propio de cada meta', () => {
    const raiz = raizFalsa();
    const m = metas();
    aplicarTema('oscuro', raiz, m);
    aplicarTema('auto', raiz, m);
    expect(raiz.attrs.has('data-tema')).toBe(false);
    expect(m.map(x => x.content)).toEqual([COLOR_BARRA.claro, COLOR_BARRA.oscuro]);
  });
});
```

- [ ] **Step 6:** `npx vitest run src/lib/tema.test.ts` → FAIL.

- [ ] **Step 7: Implementar** `src/lib/tema.ts`:

```ts
// Tema claro/oscuro (spec 10). 'auto' sigue al sistema (prefers-color-scheme)
// y es el valor por omisión: se guarda borrando la clave. Mismo patrón de
// try/catch silencioso que recientes.ts: sin localStorage no persiste, no rompe.
//
// BaseLayout.astro tiene un script inline que repite la lectura de la clave y
// los dos colores de la barra para evitar el destello antes de que cargue este
// módulo; paleta.test.ts comprueba que no se desincronicen.

export type Tema = 'auto' | 'claro' | 'oscuro';

export const CLAVE_TEMA = 'pencilgames:tema';
export const TEMAS: readonly Tema[] = ['auto', 'claro', 'oscuro'];
export const COLOR_BARRA = { claro: '#fdf6ec', oscuro: '#1b1814' } as const;

export function esTema(v: unknown): v is Tema {
  return v === 'auto' || v === 'claro' || v === 'oscuro';
}

export function obtenerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE_TEMA);
    return esTema(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function guardarTema(t: Tema): void {
  try {
    if (t === 'auto') localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, t);
  } catch {
    // Sin almacenamiento: el tema se aplica en esta visita pero no se recuerda.
  }
}

export function siguienteTema(t: Tema): Tema {
  return TEMAS[(TEMAS.indexOf(t) + 1) % TEMAS.length];
}

export interface RaizTema {
  setAttribute(nombre: string, valor: string): void;
  removeAttribute(nombre: string): void;
}

export interface MetaColor {
  content: string;
  dataset: { esquema?: string };
}

// Cada <meta name="theme-color"> lleva data-esquema="claro|oscuro" y un media
// que la activa según el sistema. Con tema forzado se igualan las dos al color
// forzado; en auto cada una recupera el suyo.
export function aplicarTema(t: Tema, raiz: RaizTema, metas: Iterable<MetaColor>): void {
  if (t === 'auto') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', t);
  for (const meta of metas) {
    const esquema = t === 'auto' ? meta.dataset.esquema : t;
    if (esquema === 'claro' || esquema === 'oscuro') meta.content = COLOR_BARRA[esquema];
  }
}
```

- [ ] **Step 8:** `npx vitest run src/lib/tema.test.ts src/lib/contraste.test.ts` → PASS.
- [ ] **Step 9: Commit** — `feat(tema): lógica de tema y de contraste (spec 10)`.

---

### Task 2: Paleta clara/oscura con prueba de contraste

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (bloque `<style is:global>`)
- Create: `src/lib/paleta.test.ts`

**Interfaces:**
- Consumes: `contraste` (Task 1), `COLOR_BARRA`, `CLAVE_TEMA` (Task 1).
- Produces: variables CSS globales usadas por todas las tasks siguientes: `--color-bg`, `--color-surface`, `--color-text`, `--color-player-1`, `--color-player-2`, `--color-accent`, y nuevas `--color-on-accent`, `--color-on-player`, `--color-muted`, `--color-border`, `--color-error`, `--color-line` (divisores finos), `--color-shade` (relleno de sombreado sutil).

Valores ya calculados (WCAG):

| Variable | Claro | Oscuro |
|---|---|---|
| `--color-bg` | `#fdf6ec` | `#1b1814` |
| `--color-surface` | `#ffffff` | `#27231e` |
| `--color-text` | `#2b2b2b` | `#f3ebdd` |
| `--color-player-1` | `#c4401c` (4.78 bg / 5.13 sf; antes `#e0532c`, 3.60) | `#ff8a65` (7.64 / 6.75) |
| `--color-player-2` | `#2560c8` (5.46 / 5.86; antes `#2c6fe0`, 4.39) | `#6ea8ff` (7.33 / 6.47) |
| `--color-accent` | `#ffb84c` | `#ffb84c` |
| `--color-on-accent` | `#2b2b2b` (8.23) | `#2b2b2b` (8.23) |
| `--color-on-player` | `#ffffff` (5.13 / 5.86) | `#1b1814` (≈7.6 / ≈7.3) |
| `--color-muted` | `#666666` (5.35 / 5.74) | `#b5ab9c` (7.81 / 6.89) |
| `--color-error` | `#b00020` (6.83 / 7.33) | `#ff8a80` (7.75 / 6.84) |
| `--color-border` | `#dddddd` | `#4a443b` |
| `--color-line` | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.12)` |
| `--color-shade` | `rgba(0, 0, 0, 0.06)` | `rgba(255, 255, 255, 0.08)` |

- [ ] **Step 1: Test** — `src/lib/paleta.test.ts`. Lee el CSS real de `BaseLayout.astro`; así el test es la red de seguridad contra desajustes:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contraste } from './contraste';
import { CLAVE_TEMA, COLOR_BARRA } from './tema';

const fuente = readFileSync(new URL('../layouts/BaseLayout.astro', import.meta.url), 'utf8');

function variables(bloque: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of bloque.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
function bloque(re: RegExp): string {
  const m = fuente.match(re);
  if (!m) throw new Error(`bloque no encontrado: ${re}`);
  return m[1];
}

const claro = variables(bloque(/:root\s*\{([^}]*)\}/));
const oscuroSistema = variables(
  bloque(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-tema="claro"\]\)\s*\{([^}]*)\}/)
);
const oscuroForzado = variables(bloque(/:root\[data-tema="oscuro"\]\s*\{([^}]*)\}/));

const temas = { claro, oscuro: oscuroSistema } as const;

describe('paleta', () => {
  it('el oscuro del sistema y el oscuro forzado son idénticos', () => {
    expect(oscuroForzado).toEqual(oscuroSistema);
  });

  for (const [nombre, t] of Object.entries(temas)) {
    describe(`tema ${nombre}`, () => {
      const pares: [string, string][] = [
        ['text', 'bg'], ['text', 'surface'],
        ['muted', 'bg'], ['muted', 'surface'],
        ['error', 'bg'], ['error', 'surface'],
        ['player-1', 'bg'], ['player-1', 'surface'],
        ['player-2', 'bg'], ['player-2', 'surface'],
        ['on-accent', 'accent'],
        ['on-player', 'player-1'], ['on-player', 'player-2'],
      ];
      for (const [fg, bg] of pares) {
        it(`${fg} sobre ${bg} cumple AA (≥ 4.5:1)`, () => {
          expect(t[`color-${fg}`], `falta --color-${fg}`).toBeDefined();
          expect(t[`color-${bg}`], `falta --color-${bg}`).toBeDefined();
          expect(contraste(t[`color-${fg}`], t[`color-${bg}`])).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }

  it('las metas theme-color y el script inline usan los colores de COLOR_BARRA y la clave de tema', () => {
    expect(fuente).toContain(COLOR_BARRA.claro);
    expect(fuente).toContain(COLOR_BARRA.oscuro);
    expect(fuente).toContain(CLAVE_TEMA);
    expect(claro['color-bg']).toBe(COLOR_BARRA.claro);
    expect(oscuroSistema['color-bg']).toBe(COLOR_BARRA.oscuro);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/paleta.test.ts` → FAIL (faltan bloques/variables).

- [ ] **Step 3: Implementar** — reemplazar el bloque `:root { … }` de `BaseLayout.astro` (mantener `--tap-target-min`, `--radius`, `--spacing`) por:

```css
  :root {
    color-scheme: light;
    --color-bg: #fdf6ec;
    --color-surface: #ffffff;
    --color-text: #2b2b2b;
    --color-player-1: #c4401c;
    --color-player-2: #2560c8;
    --color-accent: #ffb84c;
    --color-on-accent: #2b2b2b;
    --color-on-player: #ffffff;
    --color-muted: #666666;
    --color-error: #b00020;
    --color-border: #dddddd;
    --color-line: rgba(0, 0, 0, 0.08);
    --color-shade: rgba(0, 0, 0, 0.06);
    --tap-target-min: 44px;
    --radius: 16px;
    --spacing: 1rem;
  }

  /* Oscuro: el mismo juego de variables, dos veces (sistema y forzado). Mantenerlos
     idénticos: paleta.test.ts lo comprueba. */
  @media (prefers-color-scheme: dark) {
    :root:not([data-tema="claro"]) {
      color-scheme: dark;
      --color-bg: #1b1814;
      --color-surface: #27231e;
      --color-text: #f3ebdd;
      --color-player-1: #ff8a65;
      --color-player-2: #6ea8ff;
      --color-accent: #ffb84c;
      --color-on-accent: #2b2b2b;
      --color-on-player: #1b1814;
      --color-muted: #b5ab9c;
      --color-error: #ff8a80;
      --color-border: #4a443b;
      --color-line: rgba(255, 255, 255, 0.12);
      --color-shade: rgba(255, 255, 255, 0.08);
    }
  }

  :root[data-tema="oscuro"] {
    color-scheme: dark;
    --color-bg: #1b1814;
    --color-surface: #27231e;
    --color-text: #f3ebdd;
    --color-player-1: #ff8a65;
    --color-player-2: #6ea8ff;
    --color-accent: #ffb84c;
    --color-on-accent: #2b2b2b;
    --color-on-player: #1b1814;
    --color-muted: #b5ab9c;
    --color-error: #ff8a80;
    --color-border: #4a443b;
    --color-line: rgba(255, 255, 255, 0.12);
    --color-shade: rgba(255, 255, 255, 0.08);
  }
```

  El orden importa: el bloque claro primero (el test toma el primer `:root {`).

- [ ] **Step 4:** `npx vitest run src/lib/paleta.test.ts` → el test del último `it` (metas/script) sigue fallando hasta la Task 3; los demás PASS. Anotarlo, no es un error.
- [ ] **Step 5: Commit** — `feat(tema): paleta clara y oscura con variables nuevas (spec 10)`.

---

### Task 3: Layout — metas por esquema y script anti-destello

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (`<head>`)

**Interfaces:**
- Consumes: `COLOR_BARRA`, `CLAVE_TEMA` (Task 1).
- Produces: metas `theme-color` con `data-esquema`, consumidas por `aplicarTema` (Task 6).

- [ ] **Step 1: Implementar** — en el `<head>`, sustituir `<meta name="theme-color" content="#fdf6ec" />` por:

```astro
    <meta name="theme-color" content="#fdf6ec" media="(prefers-color-scheme: light)" data-esquema="claro" />
    <meta name="theme-color" content="#1b1814" media="(prefers-color-scheme: dark)" data-esquema="oscuro" />
    <script is:inline>
      // Aplica el tema guardado antes de pintar (evita el destello claro).
      // Repite la lectura de src/lib/tema.ts; paleta.test.ts vigila la clave y los colores.
      try {
        var t = localStorage.getItem('pencilgames:tema');
        if (t === 'claro' || t === 'oscuro') {
          document.documentElement.setAttribute('data-tema', t);
          var c = t === 'claro' ? '#fdf6ec' : '#1b1814';
          document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
            m.setAttribute('content', c);
          });
        }
      } catch (e) {}
    </script>
```

  El script va **después** de las metas, para que existan al ejecutarse.

- [ ] **Step 2:** `npx vitest run src/lib/paleta.test.ts` → todo PASS.
- [ ] **Step 3:** `npm run check` sin errores nuevos.
- [ ] **Step 4: Commit** — `feat(tema): theme-color por esquema y script anti-destello (spec 10)`.

---

### Task 4: Migrar los colores fijos a variables y verificar los 21 juegos

**Files:**
- Modify: `src/components/{ModalInstrucciones,ModalJugadores,ModalContinuarPartida,ModalJuegoRemoto,ControlesPartida,GameCard,TableroJuego}.astro`, `src/pages/index.astro`, `src/pages/juegos/[slug].astro`, `src/games/{agujero-negro,gomoku,estampida,notakto,domineering,tres-en-raya,battleship,y,hex,snakes,nim,sos,triggle,chomp,…}/Board.astro` según resulte del barrido.
- Create: `src/lib/sinColoresFijos.test.ts`

**Interfaces:**
- Consumes: las variables de la Task 2.

Mapa de sustitución (aplicar tal cual en los `.astro`):

| Valor fijo | Sustituir por |
|---|---|
| `#ddd` (bordes) | `var(--color-border)` |
| `#b00020` | `var(--color-error)` |
| `#666`, `#bbb`, `#9aa0a6`, `#c9c9c9` (texto/trazos secundarios) | `var(--color-muted)` (si es un trazo SVG decorativo, comprobar visualmente) |
| `rgba(0, 0, 0, 0.06–0.1)` como divisor/borde fino | `var(--color-line)` |
| `rgba(0, 0, 0, 0.04–0.08)` como relleno de sombreado | `var(--color-shade)` |
| `color: #fff` / `#ffffff` **sobre fichas de color de jugador** (`TableroJuego.astro:219,227`, `hex`, `y`) | `var(--color-on-player)` |
| texto sobre `background: var(--color-accent)` (botones activos, «Guardar», filtros pulsados) | `color: var(--color-on-accent)` |
| `var(--color-text, #222)` y `var(--color-surface, #fff)` en `triggle` | quitar el valor de reserva (`var(--color-text)`) |

No tocar: `rgba(0, 0, 0, 0.5)` de los fondos de modal (velo; vale en ambos temas), sombras `box-shadow`/`drop-shadow` negras, los marrones de Chomp (el tablero ya es oscuro por diseño), los destellos dorados/blancos de Hex y Y (`rgba(255, 215, 0, …)`, `#fff` de resaltado de línea ganadora sobre fondo de color), `confeti.ts`, `IconoJuego.astro` (miniaturas con su propio fondo).

- [ ] **Step 1: Test que impide la regresión** — `src/lib/sinColoresFijos.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = new URL('..', import.meta.url).pathname;

function astros(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return astros(ruta);
    return ruta.endsWith('.astro') ? [ruta] : [];
  });
}

// Colores que ya tienen variable: usarlos fijos rompe el tema oscuro.
const PROHIBIDOS = [/#ddd\b/i, /#b00020\b/i, /#666\b/, /#bbb\b/i];

describe('colores neutros sin variable', () => {
  for (const archivo of astros(RAIZ)) {
    it(archivo.replace(RAIZ, 'src/'), () => {
      const fuente = readFileSync(archivo, 'utf8');
      for (const patron of PROHIBIDOS) {
        expect(fuente, `${patron} fijo: usa una variable --color-*`).not.toMatch(patron);
      }
    });
  }
});
```

  Excepción esperada: `BaseLayout.astro` define `#dddddd`/`#666666` (6 dígitos, no casan con los patrones de 3). Si el test marcara `IconoJuego.astro`, añadir una lista `EXCLUIDOS` explícita con el motivo.

- [ ] **Step 2:** `npx vitest run src/lib/sinColoresFijos.test.ts` → FAIL listando los archivos pendientes (≈10).

- [ ] **Step 3:** Aplicar el mapa de sustitución archivo por archivo hasta que el test pase. Después, barrer lo que el test no cubre:
  `grep -rnE "rgba\(0, 0, 0, 0\.(0[4-9]|1)\)" src` y decidir caso a caso entre `--color-line` / `--color-shade`.
  `grep -rn "color: #fff\|color: #ffffff" src` y asignar `--color-on-player` solo donde el fondo sea `--color-player-*`.

- [ ] **Step 4:** `npx vitest run` completo → PASS (796 + nuevas).

- [ ] **Step 5: Verificación visual de los 21 juegos en los dos temas.** Levantar `npm run dev -- --port 4412` y, por CDP (Chrome headless), para cada slug de `src/content/juegos/`:
  1. Fijar `localStorage['pencilgames:tema']='oscuro'`, recargar, cargar `/juegos/<slug>`, elegir modo local, hacer 2–3 jugadas (una por cada jugador) y capturar a **600×960** y a **960×600**.
  2. Repetir con `claro`, y una vez con `emulate prefers-color-scheme: dark` sin clave guardada (debe abrir oscuro).
  3. Revisar cada captura: fichas de los dos jugadores distinguibles (color **y** forma), casillas con borde visible, texto del indicador de turno, banner de ganador, modales (reglas, nombres, modo, continuar, reinicio), controles inferiores, estados deshabilitados.
  4. Guardar las capturas en el directorio scratchpad, no en el repo. Anotar en el PR qué juegos se miraron y cualquier hallazgo.
  Comprobar también que **no hay destello**: con `data-tema="oscuro"` guardado, `getComputedStyle(document.body).backgroundColor` es oscuro desde el primer `DOMContentLoaded`.

- [ ] **Step 6: Commit** — `feat(tema): migrar colores fijos a variables (spec 10)`.

---

### Task 5: Barra superior de la partida (R4) y zonas seguras (R3)

**Files:**
- Create: `src/components/AccionesCabecera.astro`
- Modify: `src/components/ModalJugadores.astro` (quitar `.barra-superior-juego` y los estilos `.modal-jugadores__abrir`), `src/pages/juegos/[slug].astro`, `src/components/ControlesPartida.astro`, `src/components/TableroJuego.astro`, `src/pages/index.astro`

**Interfaces:**
- Produces: los ids `modal-jugadores-abrir` y `boton-jugar-por-internet` **no cambian** (los usan los scripts de `ModalJugadores.astro` y `[slug].astro`). `AccionesCabecera` se renderiza dentro de `.cabecera-juego`.

- [ ] **Step 1: `AccionesCabecera.astro`** — mover aquí el markup de los dos botones y sus estilos, con la clase renombrada:

```astro
---
---

<div class="acciones-cabecera">
  <button type="button" id="modal-jugadores-abrir" class="acciones-cabecera__boton" hidden>
    ✏️ Cambiar nombres
  </button>
  <button type="button" id="boton-jugar-por-internet" class="acciones-cabecera__boton" hidden>
    🌐 Por internet
  </button>
</div>

<style>
  .acciones-cabecera {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-left: auto;
  }

  .acciones-cabecera__boton {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 700;
    min-height: var(--tap-target-min);
  }

  .acciones-cabecera__boton[hidden] {
    display: none;
  }

  /* En horizontal con poca altura se compactan para que quepan en la misma fila. */
  @media (orientation: landscape) and (height <= 46rem) {
    .acciones-cabecera__boton {
      padding: 0.35rem 0.6rem;
      font-size: 0.85rem;
    }
  }
</style>
```

- [ ] **Step 2: `[slug].astro`** — importar el componente y reescribir la cabecera:

```astro
  <header class="cabecera-juego">
    <a href="/" class="cabecera-juego__volver">← Juegos</a>
    <h1 class="cabecera-juego__titulo">{juego.data.title}</h1>
    <AccionesCabecera />
  </header>
```

  CSS de `.cabecera-juego`: `flex-wrap: wrap`; `.cabecera-juego__titulo { flex: 1 1 6rem; min-width: 0; }`; eliminar el bloque `@media (orientation: landscape) … padding-right: 14.5rem` (ya no hay barra fija superpuesta). Resultado: si cabe, una sola fila (`← Juegos` · título · acciones a la derecha); si no cabe (retrato estrecho), las acciones bajan a su fila, alineadas a la derecha, como hoy. Misma altura mínima (44 px) y `align-items: center` para compartir línea base.

- [ ] **Step 3: `ModalJugadores.astro`** — borrar el `<div class="barra-superior-juego">…</div>` y las reglas `.barra-superior-juego`, `.modal-jugadores__abrir` (incluido el bloque landscape). Reemplazar también `border: 1px solid #ddd` si quedara alguno (Task 4). `grep -rn "barra-superior-juego\|modal-jugadores__abrir" src` debe quedar vacío.

- [ ] **Step 4: Zonas seguras (R3)** — `env()` vale 0 sin muesca ni barra de gestos, así que no cambia nada en escritorio:
  - `.cabecera-juego`: `padding: env(safe-area-inset-top, 0px) max(var(--spacing), env(safe-area-inset-right, 0px)) 0 max(var(--spacing), env(safe-area-inset-left, 0px));`
  - `.controles-partida` (ya tiene `env(safe-area-inset-bottom)` abajo): añadir `padding-inline: max(var(--spacing), env(safe-area-inset-left, 0px)) max(var(--spacing), env(safe-area-inset-right, 0px));`
  - `.tablero-juego` en `TableroJuego.astro`: `--reserva-barra: calc(6.5rem + env(safe-area-inset-bottom, 0px));` (también el redefinido en horizontal si lo hubiera) y `padding-inline` con `max(var(--spacing), env(safe-area-inset-left/right, 0px))`.
  - `.indice` en `index.astro`: `padding` lateral con el mismo `max(...)`, y `padding-top` sumando `env(safe-area-inset-top, 0px)`.

- [ ] **Step 5: Verificar** (CDP, `npm run dev -- --port 4412`):
  1. 600×960 y 960×600 en 3 juegos (Hex, Gomoku, Batalla Naval): captura **antes/después** de esta task; las medidas del tablero (`getBoundingClientRect` de `.tablero-juego`) deben ser idénticas. Si el `--cromo` ya no refleja la cabecera cuando las acciones caben en una fila, no se ajusta: el tablero solo gana margen.
  2. Con acciones visibles, `← Juegos`, título y botones sin solaparse a 600 px, 960 px y 390 px de ancho; botones ≥ 44 px de alto.
  3. Forzar insets con CDP `Emulation.setSafeAreaInsetsOverride` (`{top: 24, bottom: 34, left: 0, right: 0}`; en horizontal `left/right: 34`): comprobar que la cabecera baja 24 px, que la barra de controles tiene 34 px extra abajo y que la última fila del tablero sigue sin quedar tapada. Si ese método no está disponible en el Chrome local, dejarlo anotado como **no verificado en dispositivo** (la barra de gestos de la tableta real tampoco se puede comprobar aquí).
  4. `npx vitest run` y `npm run check`.

- [ ] **Step 6: Commit** — `feat(cabecera): acciones a la derecha y zonas seguras (spec 10)`.

---

### Task 6: Conmutador de tema, aviso de instalar y manifiesto

**Files:**
- Create: `src/lib/instalar.ts`, `src/lib/instalar.test.ts`, `src/lib/manifiesto.test.ts`, `src/components/ConmutadorTema.astro`, `src/components/AvisoInstalar.astro`
- Modify: `src/pages/index.astro`, `public/manifest.webmanifest`

**Interfaces:**
- Consumes: `obtenerTema`, `guardarTema`, `siguienteTema`, `aplicarTema`, `Tema` (Task 1).
- Produces (`instalar.ts`):
  ```ts
  export const CLAVE_INSTALAR_VISTO = 'pencilgames:instalar-visto';
  export function instalarVisto(): boolean;          // true si está marcado, o si localStorage no responde
  export function marcarInstalarVisto(): void;
  export function debeMostrarAviso(o: { visto: boolean; standalone: boolean }): boolean;
  ```

- [ ] **Step 1: Test de instalar** — `src/lib/instalar.test.ts` (mismo `stubStorage` que en `tema.test.ts`):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_INSTALAR_VISTO, debeMostrarAviso, instalarVisto, marcarInstalarVisto,
} from './instalar';

afterEach(() => vi.unstubAllGlobals());

function stubStorage(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
  });
  return datos;
}

describe('instalarVisto / marcarInstalarVisto', () => {
  it('al principio no está visto; tras marcar, sí', () => {
    stubStorage();
    expect(instalarVisto()).toBe(false);
    marcarInstalarVisto();
    expect(instalarVisto()).toBe(true);
  });
  it('si localStorage lanza al leer cuenta como visto (no insistir)', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado'); } });
    expect(instalarVisto()).toBe(true);
  });
  it('marcar no lanza si falla el guardado', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('cuota'); } });
    expect(() => marcarInstalarVisto()).not.toThrow();
  });
  it('usa la clave documentada', () => {
    const datos = stubStorage();
    marcarInstalarVisto();
    expect(datos.get(CLAVE_INSTALAR_VISTO)).toBe('1');
  });
});

describe('debeMostrarAviso', () => {
  it('solo si no se vio y no está instalada', () => {
    expect(debeMostrarAviso({ visto: false, standalone: false })).toBe(true);
    expect(debeMostrarAviso({ visto: true, standalone: false })).toBe(false);
    expect(debeMostrarAviso({ visto: false, standalone: true })).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/instalar.test.ts` → FAIL.

- [ ] **Step 3: Implementar** `src/lib/instalar.ts`:

```ts
// Invitación a instalar la PWA (spec 10 R6). Se muestra una sola vez: la
// clave se marca al descartar, al aceptar o al instalarse. Si localStorage no
// responde (modo privado) se cuenta como visto: sin poder recordar, el aviso
// reaparecería en cada visita.

export const CLAVE_INSTALAR_VISTO = 'pencilgames:instalar-visto';

export function instalarVisto(): boolean {
  try {
    return localStorage.getItem(CLAVE_INSTALAR_VISTO) === '1';
  } catch {
    return true;
  }
}

export function marcarInstalarVisto(): void {
  try {
    localStorage.setItem(CLAVE_INSTALAR_VISTO, '1');
  } catch {
    // Sin almacenamiento: no persiste, no rompe.
  }
}

export function debeMostrarAviso(o: { visto: boolean; standalone: boolean }): boolean {
  return !o.visto && !o.standalone;
}
```

- [ ] **Step 4:** el test pasa.

- [ ] **Step 5: Test del manifiesto** — `src/lib/manifiesto.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLOR_BARRA } from './tema';

const manifiesto = JSON.parse(
  readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8')
);

describe('manifest.webmanifest', () => {
  it('no fija la orientación (los juegos funcionan en las dos)', () => {
    expect(manifiesto.orientation).toBe('any');
  });
  it('conserva display standalone y los iconos 192/512', () => {
    expect(manifiesto.display).toBe('standalone');
    expect(manifiesto.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
  });
  it('theme_color y background_color son el crema del tema claro', () => {
    expect(manifiesto.theme_color).toBe(COLOR_BARRA.claro);
    expect(manifiesto.background_color).toBe(COLOR_BARRA.claro);
  });
});
```

- [ ] **Step 6:** FAIL → editar `public/manifest.webmanifest` añadiendo `"orientation": "any",` tras `"display": "standalone",` → PASS. Se mantienen `theme_color`/`background_color` en crema: el manifiesto admite un solo valor y no puede seguir al sistema. Consecuencia conocida (documentar en el PR): una PWA instalada con el SO en oscuro tiene barra y pantalla de arranque crema hasta que carga la página, y entonces las metas `theme-color` por esquema pasan a oscuro en los navegadores que las respetan en modo instalado. Los iconos 192/512 ya siguen la familia visual del favicon de la spec 08 (lápiz naranja sobre crema, comprobado a ojo); no regenerarlos.

- [ ] **Step 7: `ConmutadorTema.astro`**:

```astro
---
---

<button type="button" id="conmutador-tema" class="conmutador-tema">
  <span id="conmutador-tema-icono" aria-hidden="true">🌗</span>
  <span id="conmutador-tema-texto">Tema: Auto</span>
</button>

<style>
  .conmutador-tema {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 48px;
    padding: 0 1rem;
    border: 2px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-weight: 600;
  }

  .conmutador-tema:focus-visible {
    outline: 3px solid var(--color-text);
    outline-offset: 2px;
  }
</style>

<script>
  import { aplicarTema, guardarTema, obtenerTema, siguienteTema, type Tema } from '../lib/tema';

  const ROTULOS: Record<Tema, { icono: string; texto: string }> = {
    auto: { icono: '🌗', texto: 'Tema: Auto' },
    claro: { icono: '☀️', texto: 'Tema: Claro' },
    oscuro: { icono: '🌙', texto: 'Tema: Oscuro' },
  };

  const boton = document.getElementById('conmutador-tema')!;
  const icono = document.getElementById('conmutador-tema-icono')!;
  const texto = document.getElementById('conmutador-tema-texto')!;

  function pintar(t: Tema) {
    icono.textContent = ROTULOS[t].icono;
    texto.textContent = ROTULOS[t].texto;
  }

  function metas() {
    return Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  }

  pintar(obtenerTema());

  boton.addEventListener('click', () => {
    const t = siguienteTema(obtenerTema());
    guardarTema(t);
    aplicarTema(t, document.documentElement, metas());
    pintar(t);
  });
</script>
```

  El texto visible es el nombre accesible (no hay `aria-label` distinto, para no repetir el desajuste ya anotado en el botón de sonido).

- [ ] **Step 8: `AvisoInstalar.astro`**:

```astro
---
---

<section id="aviso-instalar" class="aviso-instalar" aria-label="Instalar Pencilgames" hidden>
  <p class="aviso-instalar__texto">
    Añade Pencilgames a la pantalla de inicio para abrirlo como una app, sin la barra del
    navegador.
    <span id="aviso-instalar-ayuda">
      Abre el menú del navegador y elige «Añadir a pantalla de inicio».
    </span>
  </p>
  <div class="aviso-instalar__acciones">
    <button type="button" id="aviso-instalar-si" class="aviso-instalar__boton aviso-instalar__boton--primario" hidden>
      Instalar
    </button>
    <button type="button" id="aviso-instalar-no" class="aviso-instalar__boton">Ahora no</button>
  </div>
</section>

<style>
  .aviso-instalar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem 1rem;
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border: 2px solid var(--color-accent);
    border-radius: var(--radius);
    background: var(--color-surface);
  }

  .aviso-instalar[hidden],
  .aviso-instalar__boton[hidden],
  #aviso-instalar-ayuda[hidden] {
    display: none;
  }

  .aviso-instalar__texto {
    flex: 1 1 16rem;
    margin: 0;
  }

  .aviso-instalar__acciones {
    display: flex;
    gap: 0.5rem;
  }

  .aviso-instalar__boton {
    min-height: 48px;
    padding: 0 1rem;
    border: 2px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-weight: 700;
  }

  .aviso-instalar__boton--primario {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }
</style>

<script>
  import { debeMostrarAviso, instalarVisto, marcarInstalarVisto } from '../lib/instalar';

  // Evento no estándar (Chrome/Android): solo describimos lo que usamos.
  interface PeticionInstalar extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  const aviso = document.getElementById('aviso-instalar')!;
  const botonSi = document.getElementById('aviso-instalar-si')!;
  const botonNo = document.getElementById('aviso-instalar-no')!;
  const ayuda = document.getElementById('aviso-instalar-ayuda')!;

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  function cerrar() {
    marcarInstalarVisto();
    aviso.hidden = true;
  }

  if (debeMostrarAviso({ visto: instalarVisto(), standalone })) {
    aviso.hidden = false;
  }

  let peticion: PeticionInstalar | null = null;

  window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault();
    peticion = evento as PeticionInstalar;
    // Hay instalación nativa: botón real y sin las instrucciones manuales.
    botonSi.hidden = false;
    ayuda.hidden = true;
  });

  window.addEventListener('appinstalled', cerrar);

  botonSi.addEventListener('click', async () => {
    if (!peticion) return;
    const p = peticion;
    peticion = null;
    await p.prompt();
    await p.userChoice;
    // Aceptada o rechazada, no se vuelve a insistir.
    cerrar();
  });

  botonNo.addEventListener('click', cerrar);
</script>
```

- [ ] **Step 9: Montar en `index.astro`** — importar ambos componentes; sustituir `<h1>Pencilgames</h1>` por una cabecera flexible y colocar el aviso tras el párrafo de introducción:

```astro
    <div class="indice__cabecera">
      <h1>Pencilgames</h1>
      <ConmutadorTema />
    </div>
    <p>Juegos de lápiz y papel para jugar en familia, en una sola tableta.</p>
    <AvisoInstalar />
```

  Estilos: `.indice__cabecera { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }`. En `index.astro` también `border: 2px solid rgba(0,0,0,0.15)` del `.filtro` → `var(--color-border)`, `.filtro[aria-pressed='true']` añade `color: var(--color-on-accent)`, y el buscador usa `background: var(--color-surface); color: var(--color-text)`.

- [ ] **Step 10: Verificar** (CDP, `astro dev` en puerto propio, 600×960 y 960×600):
  1. Portada con el SO claro: el conmutador dice «Tema: Auto»; clic → Claro → Oscuro → Auto; la página cambia al instante, `data-tema` y las metas `theme-color` cambian como en `aplicarTema`.
  2. **Sobrescribe al sistema**: con `emulate prefers-color-scheme: dark` y «Claro» forzado, la página es clara; con SO claro y «Oscuro», oscura.
  3. **Aguanta la recarga**: recargar mantiene el tema y no hay destello (fondo oscuro desde el primer pintado).
  4. El aviso de instalar aparece en una visita limpia; «Ahora no» lo oculta y tras recargar no vuelve. Con `display-mode: standalone` emulado no aparece. Con la clave `pencilgames:instalar-visto` borrada reaparece. Emitir `beforeinstallprompt` sintético (`window.dispatchEvent(new Event('beforeinstallprompt'))` con `prompt`/`userChoice` simulados) muestra el botón «Instalar» y oculta las instrucciones manuales.
  5. Se ven bien (contraste, bordes) conmutador, aviso, filtros y buscador en ambos temas.
  6. **No verificable aquí:** instalación real en la tableta Android (barra de navegador ausente, color de tema al abrir). Dejarlo anotado en el PR.

- [ ] **Step 11:** `npx vitest run` y `npm run check` limpios.
- [ ] **Step 12: Commit** — `feat(tema): conmutador, invitación a instalar y orientación del manifiesto (spec 10)`.

---

### Task 7: Cierre

- [ ] **Step 1:** `npm run test:all`, `npm run check`, `npm run build` — todo verde, con el recuento de pruebas anotado (796 + nuevas).
- [ ] **Step 2:** Repasar los criterios de aceptación de `specs/10-tema-oscuro-y-acabado.md` uno por uno y marcar en el PR cuáles se verificaron y cuáles no (instalación real y barra de gestos de la tableta quedan como no verificados).
- [ ] **Step 3:** Pasar `superpowers:verification-before-completion` y `superpowers:requesting-code-review` sobre la rama completa.
- [ ] **Step 4:** Abrir el PR (`gh pr create --body-file`, con la atribución del sistema). Mencionar en la descripción el cambio de los dos colores de jugador del tema claro (más oscuros, AA) y la limitación del `theme_color` del manifiesto.
- [ ] **Step 5:** Tras la fusión: eliminar rama y worktree y actualizar la memoria `specs-ux-progreso` (spec 10 fusionada; con ella queda cerrada la serie 01–10).
