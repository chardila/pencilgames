# Identidad visual de jugadores y claridad de turno — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que en los 5 juegos, en cualquier modo, sea evidente de un vistazo quién es cada jugador, de quién es el turno y (en remoto) cuál jugador soy yo.

**Architecture:** El indicador de turno compartido (`turnIndicator.ts` + CSS en `TableroJuego.astro`) pasa de una línea de texto a una fila de dos "fichas de jugador" con color y forma fijos por asiento (asiento 1 → naranja `●`, asiento 2 → azul `▲`). `gameSession.mostrarTurno` deja de recibir etiquetas ya formateadas: recibe solo lo que el juego sabe (jugador del turno, puntajes, símbolos, detalle) y la sesión inyecta los nombres y `miAsiento`. Los 5 `Board.astro` se ajustan a la nueva llamada. Sin cambios de almacenamiento ni del protocolo remoto.

**Tech Stack:** Astro 7 (sin framework UI), TypeScript estricto, Vitest (`environment: 'node'`, mocks de DOM hechos a mano — no hay jsdom), CSS scoped en componentes `.astro`.

**Spec:** `docs/superpowers/specs/2026-08-30-identidad-jugadores-design.md`

## Global Constraints

- Español en todo el texto visible al usuario.
- TypeScript estricto: sin `any` nuevos, sin `@ts-ignore`.
- Los tests corren con `environment: 'node'`; el DOM se simula con clases `MockElement` en cada archivo de test. `querySelector` de esos mocks devuelve un elemento nuevo por cada string de selector distinto y **no** soporta `querySelectorAll` ni interpreta selectores de verdad — la implementación debe fijar cada dato con un `querySelector(...).textContent` / `.dataset` / `.hidden` explícito.
- Colores y formas por asiento son fijos, no configurables: asiento 1 = `--color-player-1` (`#e0532c`) + `●`; asiento 2 = `--color-player-2` (`#2c6fe0`) + `▲`.
- Nombres de jugador: máximo 16 caracteres (ya lo impone `ModalJugadores.astro`).
- Commits frecuentes, uno por tarea como mínimo. Mensajes de commit en español, estilo Conventional Commits, terminando con:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LqZ2mT4ujf78Ccjdmxd5c2
  ```
- Verificación de cierre de cada tarea: `npm test` verde, `npm run build` limpio, `npx astro check` sin errores nuevos.
- Usar `rtk` como prefijo en los comandos de shell (ver `CLAUDE.md`).

---

## File Structure

| Archivo | Responsabilidad | Cambio |
|---|---|---|
| `src/lib/turnIndicator.ts` | Render del indicador de turno en el DOM | Reescritura de `renderTurnIndicator` a la fila de fichas; nueva API |
| `src/lib/turnIndicator.test.ts` | Tests del render | Reescritura completa |
| `src/components/TableroJuego.astro` | Marcado + CSS del "chrome" del tablero | CSS de `.fichas-turno` / `.ficha-turno`; `hidden` inicial en el contenedor |
| `src/lib/gameSession.ts` | Orquesta sesión local/remota; puente a `turnIndicator` y `winnerBanner` | `mostrarTurno` arma `fichas` desde `nombres` + inyecta `miAsiento`; nueva firma |
| `src/lib/gameSession.test.ts` | Tests de la sesión | Ajustar los 2 casos que llaman `mostrarTurno`; añadir caso de `miAsiento` |
| `src/games/tres-en-raya/Board.astro` | Juego | Ajustar la llamada a `mostrarTurno` |
| `src/games/notakto/Board.astro` | Juego | Ajustar la llamada a `mostrarTurno` |
| `src/games/agujero-negro/Board.astro` | Juego | Ajustar la llamada a `mostrarTurno` |
| `src/games/puntos-y-cajas/Board.astro` | Juego | Ajustar la llamada a `mostrarTurno` |
| `src/games/conquista/Board.astro` | Juego | Ajustar la llamada a `mostrarTurno` |

`winnerBanner.ts` y los banners de fin de juego **no se tocan**.

---

## Task 1: Indicador de turno — fila de fichas de jugador

**Files:**
- Modify: `src/lib/turnIndicator.ts` (reescritura de `renderTurnIndicator` y `ocultarTurnIndicator`)
- Test: `src/lib/turnIndicator.test.ts` (reescritura completa)
- Modify: `src/components/TableroJuego.astro` (CSS + `hidden` inicial)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  ```ts
  export interface FichaJugador {
    nombre: string;
    puntaje?: number | string;
    simbolo?: string;
  }
  export interface TurnIndicatorOptions {
    jugador: 1 | 2;
    fichas: Record<1 | 2, FichaJugador>;
    miAsiento?: 1 | 2 | null;
    detalle?: string;
    repiteTurno?: boolean;
    motivoRepeticion?: string;
  }
  export function renderTurnIndicator(container: HTMLElement, opciones: TurnIndicatorOptions): void;
  export function ocultarTurnIndicator(container: HTMLElement): void;
  ```
  DOM que emite `renderTurnIndicator` dentro del contenedor:
  - `container.dataset.jugador` = `"1"` | `"2"` (asiento del turno)
  - `container.dataset.miAsiento` = `"1"` | `"2"` si hay asiento; ausente si `null`/`undefined`
  - `container.dataset.repite` = `"true"` si `repiteTurno`; ausente si no
  - `.indicador-turno__badge` (solo si `repiteTurno`) con `motivoRepeticion` o `'¡Vuelves a jugar!'`
  - `.fichas-turno` con dos `.ficha-turno[data-jugador="1"|"2"]`; cada una con `data-activo="true"|"false"` y spans hijos: `.ficha-turno__forma`, `.ficha-turno__nombre`, `.ficha-turno__tu` (visible solo si es mi asiento), `.ficha-turno__puntaje` (visible solo si la ficha trae `puntaje`), `.ficha-turno__estado` (visible solo en la ficha activa; texto `← VA` | `← TE TOCA` | `← su turno`)
  - `.indicador-turno__detalle` (solo si `detalle`)
  - `.indicador-turno__espera` con texto `esperando…` (solo si `miAsiento != null && miAsiento !== jugador`)
  - `.indicador-turno__prosa` (siempre) con el resumen en prosa para lector de pantalla

- [ ] **Step 1: Escribir el test que falla — `turnIndicator.test.ts` completo**

Reemplazar TODO el contenido de `src/lib/turnIndicator.test.ts` por:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderTurnIndicator, ocultarTurnIndicator } from './turnIndicator';

class MockElement {
  hidden = true;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  private _innerHTML = '';
  private _textContent = '';
  private subElements = new Map<string, MockElement>();

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = val;
    this.subElements.clear();
  }
  get textContent(): string {
    const childTexts = Array.from(this.subElements.values())
      .map(el => el.textContent)
      .filter(Boolean);
    if (childTexts.length > 0) {
      return (this._textContent ? this._textContent + ' ' : '') + childTexts.join(' ');
    }
    return this._textContent;
  }
  set textContent(val: string) {
    this._textContent = val;
  }
  querySelector<T = MockElement>(selector: string): T | null {
    if (!this.subElements.has(selector)) {
      this.subElements.set(selector, new MockElement());
    }
    return this.subElements.get(selector) as unknown as T;
  }
}

const fichasBase = {
  1: { nombre: 'Ana' },
  2: { nombre: 'Beto' },
} as const;

describe('turnIndicator', () => {
  let container: MockElement;
  beforeEach(() => {
    container = new MockElement();
  });

  it('pasar-la-tableta: ficha activa muestra "← VA" y ninguna ficha muestra "(tú)"', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
    });

    expect(container.hidden).toBe(false);
    expect(container.dataset.jugador).toBe('1');
    expect(container.dataset.miAsiento).toBeUndefined();

    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    const f2 = container.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f1.dataset.activo).toBe('true');
    expect(f2.dataset.activo).toBe('false');
    expect(f1.querySelector<MockElement>('.ficha-turno__nombre')!.textContent).toBe('Ana');
    expect(f1.querySelector<MockElement>('.ficha-turno__forma')!.textContent).toBe('●');
    expect(f2.querySelector<MockElement>('.ficha-turno__forma')!.textContent).toBe('▲');
    expect(f1.querySelector<MockElement>('.ficha-turno__estado')!.textContent).toBe('← VA');
    expect(f1.querySelector<MockElement>('.ficha-turno__estado')!.hidden).toBe(false);
    expect(f2.querySelector<MockElement>('.ficha-turno__estado')!.hidden).toBe(true);
    expect(f1.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(true);
    expect(f2.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(true);
    expect(container.querySelector<MockElement>('.indicador-turno__prosa')!.textContent).toBe(
      'Turno de Ana'
    );
  });

  it('remoto, es mi asiento: ficha activa muestra "← TE TOCA" y "(tú)" en mi ficha', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 2,
      fichas: fichasBase,
      miAsiento: 2,
    });

    expect(container.dataset.jugador).toBe('2');
    expect(container.dataset.miAsiento).toBe('2');
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    const f2 = container.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f2.querySelector<MockElement>('.ficha-turno__estado')!.textContent).toBe('← TE TOCA');
    expect(f2.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(false);
    expect(f1.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(true);
    expect(container.querySelector<MockElement>('.indicador-turno__espera')).toBeTruthy();
    // sin "esperando…" cuando es mi turno
    expect(container.querySelector<MockElement>('.indicador-turno__espera')!.textContent).toBe('');
    expect(container.querySelector<MockElement>('.indicador-turno__prosa')!.textContent).toBe(
      'Te toca, eres Beto'
    );
  });

  it('remoto, turno del rival: ficha activa muestra "← su turno" + "esperando…"', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: 2,
    });

    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__estado')!.textContent).toBe('← su turno');
    expect(container.querySelector<MockElement>('.indicador-turno__espera')!.textContent).toBe(
      'esperando…'
    );
    expect(container.querySelector<MockElement>('.indicador-turno__prosa')!.textContent).toBe(
      'Turno de Ana, esperando'
    );
  });

  it('renderiza puntaje solo en las fichas que lo traen', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: { 1: { nombre: 'Ana', puntaje: '12.5' }, 2: { nombre: 'Beto', puntaje: 9 } },
      miAsiento: null,
    });
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    const f2 = container.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__puntaje')!.hidden).toBe(false);
    expect(f1.querySelector<MockElement>('.ficha-turno__puntaje')!.textContent).toBe('12.5');
    expect(f2.querySelector<MockElement>('.ficha-turno__puntaje')!.textContent).toBe('9');
  });

  it('oculta el puntaje cuando la ficha no lo trae', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
    });
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__puntaje')!.hidden).toBe(true);
  });

  it('añade el símbolo del juego al nombre cuando se pasa', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: { 1: { nombre: 'Ana', simbolo: 'X' }, 2: { nombre: 'Beto', simbolo: 'O' } },
      miAsiento: null,
    });
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__nombre')!.textContent).toBe('Ana (X)');
  });

  it('renderiza detalle cuando se pasa', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
      detalle: 'Coloca el número 3',
    });
    expect(container.querySelector<MockElement>('.indicador-turno__detalle')!.textContent).toBe(
      'Coloca el número 3'
    );
  });

  it('renderiza badge y data-repite cuando repiteTurno es true', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
      repiteTurno: true,
      motivoRepeticion: '✨ ¡Área conquistada! Vuelves a jugar',
    });
    expect(container.dataset.repite).toBe('true');
    expect(container.querySelector<MockElement>('.indicador-turno__badge')!.textContent).toContain(
      '✨ ¡Área conquistada! Vuelves a jugar'
    );
  });

  it('usa texto por defecto si repiteTurno es true sin motivoRepeticion', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 2,
      fichas: fichasBase,
      miAsiento: null,
      repiteTurno: true,
    });
    expect(container.querySelector<MockElement>('.indicador-turno__badge')!.textContent).toContain(
      '¡Vuelves a jugar!'
    );
  });

  it('ocultarTurnIndicator limpia contenedor y datasets', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: 1,
      repiteTurno: true,
    });
    ocultarTurnIndicator(container as unknown as HTMLElement);
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe('');
    expect(container.dataset.repite).toBeUndefined();
    expect(container.dataset.miAsiento).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `rtk npx vitest run src/lib/turnIndicator.test.ts`
Expected: FAIL — la firma vieja de `renderTurnIndicator` no acepta `fichas`; errores de tipo / assertions rojas.

- [ ] **Step 3: Reescribir `src/lib/turnIndicator.ts`**

Reemplazar TODO el contenido por:

```ts
export interface FichaJugador {
  nombre: string;
  puntaje?: number | string;
  simbolo?: string;
}

export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  fichas: Record<1 | 2, FichaJugador>;
  miAsiento?: 1 | 2 | null;
  detalle?: string;
  repiteTurno?: boolean;
  motivoRepeticion?: string;
}

const FORMA: Record<1 | 2, string> = { 1: '●', 2: '▲' };

function textoEstado(jugador: 1 | 2, miAsiento: 1 | 2 | null | undefined): string {
  if (miAsiento == null) return '← VA';
  if (miAsiento === jugador) return '← TE TOCA';
  return '← su turno';
}

function prosaAccesible(
  jugador: 1 | 2,
  fichas: Record<1 | 2, FichaJugador>,
  miAsiento: 1 | 2 | null | undefined
): string {
  const nombre = fichas[jugador].nombre;
  if (miAsiento == null) return `Turno de ${nombre}`;
  if (miAsiento === jugador) return `Te toca, eres ${nombre}`;
  return `Turno de ${nombre}, esperando`;
}

export function renderTurnIndicator(
  container: HTMLElement,
  { jugador, fichas, miAsiento, detalle, repiteTurno, motivoRepeticion }: TurnIndicatorOptions
): void {
  container.hidden = false;
  container.dataset.jugador = String(jugador);

  if (miAsiento != null) {
    container.dataset.miAsiento = String(miAsiento);
  } else {
    delete container.dataset.miAsiento;
  }

  if (repiteTurno) {
    container.dataset.repite = 'true';
  } else {
    delete container.dataset.repite;
  }

  const esperando = miAsiento != null && miAsiento !== jugador;

  container.innerHTML = `
    ${
      repiteTurno
        ? `<div class="indicador-turno__badge" role="status" aria-live="polite"></div>`
        : ''
    }
    <div class="fichas-turno">
      ${[1, 2]
        .map(
          n => `
        <div class="ficha-turno" data-jugador="${n}">
          <span class="ficha-turno__forma" aria-hidden="true"></span>
          <span class="ficha-turno__nombre"></span>
          <span class="ficha-turno__tu"></span>
          <span class="ficha-turno__puntaje"></span>
          <span class="ficha-turno__estado"></span>
        </div>`
        )
        .join('')}
    </div>
    ${detalle ? `<span class="indicador-turno__detalle"></span>` : ''}
    <span class="indicador-turno__espera"></span>
    <span class="indicador-turno__prosa"></span>
  `;

  if (repiteTurno) {
    const badgeEl = container.querySelector<HTMLElement>('.indicador-turno__badge');
    if (badgeEl) badgeEl.textContent = motivoRepeticion || '¡Vuelves a jugar!';
  }

  for (const n of [1, 2] as const) {
    const ficha = fichas[n];
    const fichaEl = container.querySelector<HTMLElement>(
      `.ficha-turno[data-jugador="${n}"]`
    )!;
    fichaEl.dataset.activo = n === jugador ? 'true' : 'false';

    fichaEl.querySelector<HTMLElement>('.ficha-turno__forma')!.textContent = FORMA[n];

    fichaEl.querySelector<HTMLElement>('.ficha-turno__nombre')!.textContent = ficha.simbolo
      ? `${ficha.nombre} (${ficha.simbolo})`
      : ficha.nombre;

    const tuEl = fichaEl.querySelector<HTMLElement>('.ficha-turno__tu')!;
    const soyYo = miAsiento != null && miAsiento === n;
    tuEl.hidden = !soyYo;
    tuEl.textContent = soyYo ? '(tú)' : '';

    const puntajeEl = fichaEl.querySelector<HTMLElement>('.ficha-turno__puntaje')!;
    if (ficha.puntaje !== undefined) {
      puntajeEl.hidden = false;
      puntajeEl.textContent = String(ficha.puntaje);
    } else {
      puntajeEl.hidden = true;
      puntajeEl.textContent = '';
    }

    const estadoEl = fichaEl.querySelector<HTMLElement>('.ficha-turno__estado')!;
    if (n === jugador) {
      estadoEl.hidden = false;
      estadoEl.textContent = textoEstado(jugador, miAsiento);
    } else {
      estadoEl.hidden = true;
      estadoEl.textContent = '';
    }
  }

  if (detalle) {
    container.querySelector<HTMLElement>('.indicador-turno__detalle')!.textContent = detalle;
  }

  container.querySelector<HTMLElement>('.indicador-turno__espera')!.textContent = esperando
    ? 'esperando…'
    : '';

  container.querySelector<HTMLElement>('.indicador-turno__prosa')!.textContent = prosaAccesible(
    jugador,
    fichas,
    miAsiento
  );
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  delete container.dataset.repite;
  delete container.dataset.miAsiento;
  container.innerHTML = '';
}
```

- [ ] **Step 4: Correr el test para verlo pasar**

Run: `rtk npx vitest run src/lib/turnIndicator.test.ts`
Expected: PASS (11 casos).

- [ ] **Step 5: Actualizar el CSS y el marcado en `src/components/TableroJuego.astro`**

En el marcado, añadir `hidden` al contenedor del indicador para que no muestre una caja vacía antes del primer render:

```astro
  <div id="indicador-turno" class="indicador-turno" data-jugador="1" hidden></div>
```

En el `<style>`, borrar todas las reglas actuales que apuntan a
`.indicador-turno__badge`, `.indicador-turno__jugador` y
`.indicador-turno[data-repite]` **excepto** conservar `.indicador-turno`
base y `@keyframes badgePopIn` / `@keyframes turnoPulse`. Reemplazar el
bloque del indicador por:

```css
  .indicador-turno {
    min-height: 2rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .indicador-turno[hidden] {
    display: none;
  }

  .indicador-turno :global(.indicador-turno__badge) {
    font-size: 0.85rem;
    font-weight: 800;
    padding: 0.25rem 0.85rem;
    border-radius: 9999px;
    background: var(--color-accent);
    color: var(--color-text);
    animation: badgePopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    letter-spacing: 0.02em;
  }

  .indicador-turno :global(.fichas-turno) {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .indicador-turno :global(.ficha-turno) {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    border-radius: 9999px;
    font-weight: 700;
    background: var(--color-surface);
    transition: background-color 0.3s ease, transform 0.3s ease;
  }

  .indicador-turno :global(.ficha-turno[data-jugador='1']) {
    border: 2px dashed color-mix(in srgb, var(--color-player-1) 55%, transparent);
    color: var(--color-player-1);
  }

  .indicador-turno :global(.ficha-turno[data-jugador='2']) {
    border: 2px dashed color-mix(in srgb, var(--color-player-2) 55%, transparent);
    color: var(--color-player-2);
  }

  .indicador-turno :global(.ficha-turno[data-jugador='1'][data-activo='true']) {
    background: var(--color-player-1);
    border-color: var(--color-player-1);
    color: #ffffff;
    transform: scale(1.03);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-player-1) 40%, transparent);
  }

  .indicador-turno :global(.ficha-turno[data-jugador='2'][data-activo='true']) {
    background: var(--color-player-2);
    border-color: var(--color-player-2);
    color: #ffffff;
    transform: scale(1.03);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--color-player-2) 40%, transparent);
  }

  .indicador-turno :global(.ficha-turno__nombre) {
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .indicador-turno :global(.ficha-turno__puntaje) {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .indicador-turno :global(.ficha-turno__estado) {
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .indicador-turno :global(.ficha-turno__tu) {
    font-size: 0.75rem;
    font-weight: 600;
    opacity: 0.85;
  }

  .indicador-turno :global([hidden]) {
    display: none;
  }

  .indicador-turno :global(.indicador-turno__detalle) {
    font-size: 0.95rem;
    font-weight: 600;
  }

  .indicador-turno :global(.indicador-turno__espera) {
    font-size: 0.85rem;
    opacity: 0.7;
  }

  .indicador-turno :global(.indicador-turno__espera:empty) {
    display: none;
  }

  .indicador-turno :global(.indicador-turno__prosa) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 28rem) {
    .indicador-turno :global(.fichas-turno) {
      flex-direction: column;
      align-items: center;
    }
  }
```

Además, añadir `role="status"` y `aria-live="polite"` al contenedor
`#indicador-turno` en el marcado si no los tiene, para que el cambio de
turno se anuncie:

```astro
  <div
    id="indicador-turno"
    class="indicador-turno"
    data-jugador="1"
    role="status"
    aria-live="polite"
    hidden
  ></div>
```

- [ ] **Step 6: Verificar build y tipos**

Run: `rtk npm run build && rtk npx astro check`
Expected: build limpio; `astro check` sin errores nuevos (los `Board.astro` seguirán compilando porque `gameSession.mostrarTurno` aún acepta la firma vieja hasta la Task 2 — si `astro check` reporta que `TurnIndicatorOptions` ya no tiene `etiqueta`, es esperado y lo arregla la Task 2; anotarlo y seguir).

> Nota para el revisor: al terminar esta tarea el indicador puede verse a
> medias en el navegador porque `gameSession` todavía llama a la API vieja.
> Eso se cierra en la Task 2. El criterio de aceptación de esta tarea es:
> `turnIndicator.test.ts` verde + `npm run build` limpio.

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/turnIndicator.ts src/lib/turnIndicator.test.ts src/components/TableroJuego.astro
rtk git commit -m "feat(ui): indicador de turno como fila de fichas de jugador con color y forma por asiento"
```

---

## Task 2: `gameSession.mostrarTurno` arma las fichas e inyecta `miAsiento`

**Files:**
- Modify: `src/lib/gameSession.ts` (imports; tipo de `mostrarTurno` en `GameSession<T>`; cuerpo de `mostrarTurno`)
- Test: `src/lib/gameSession.test.ts` (2 casos existentes + 1 nuevo)

**Interfaces:**
- Consumes: de Task 1 — `renderTurnIndicator`, `type FichaJugador`, `type TurnIndicatorOptions` desde `./turnIndicator`.
- Produces:
  ```ts
  mostrarTurno(opciones: {
    jugador: Player;
    detalle?: string;
    repiteTurno?: boolean;
    motivoRepeticion?: string;
    puntajes?: Record<Player, number | string>;
    simbolos?: Record<Player, string>;
  }): void
  ```
  Comportamiento: arma `fichas[n] = { nombre: nombres[n], puntaje: puntajes?.[n], simbolo: simbolos?.[n] }` y llama a `renderTurnIndicator(ind, { jugador, fichas, miAsiento, detalle, repiteTurno, motivoRepeticion })`. `miAsiento` es `null` en modo local y el asiento real tras `canal-remoto-listo`.

- [ ] **Step 1: Ajustar los tests que fallan — `gameSession.test.ts`**

En `src/lib/gameSession.test.ts`, reemplazar el caso `'mostrarTurno y mostrarFinDeJuego interactúan con turnIndicator y winnerBanner'` (aprox. líneas 231-251) por:

```ts
  it('mostrarTurno y mostrarFinDeJuego interactúan con turnIndicator y winnerBanner', () => {
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });

    sesion.mostrarTurno({ jugador: 1 });
    const ind = document.getElementById('indicador-turno')!;
    expect(ind.hidden).toBe(false);
    expect(ind.dataset.jugador).toBe('1');
    expect(
      ind.querySelector<MockElement>('.indicador-turno__prosa')!.textContent
    ).toBe('Turno de Jugador 1');

    sesion.mostrarFinDeJuego({ titulo: '¡Ganó Jugador 1!' });
    const ban = document.getElementById('banner-ganador')!;
    expect(ban.hidden).toBe(false);
    expect(ban.textContent).toContain('¡Ganó Jugador 1!');
    expect(ind.hidden).toBe(true);

    sesion.destruir();
  });
```

En el caso `'soporta elementos DOM explícitos pasados en la configuración'` (aprox. línea 321), cambiar:

```ts
    sesion.mostrarTurno({ jugador: 2, etiqueta: 'Personalizado' });
    expect(customIndicador.hidden).toBe(false);
    expect(customIndicador.textContent).toContain('Turno de Personalizado');
```

por:

```ts
    sesion.mostrarTurno({ jugador: 2 });
    expect(customIndicador.hidden).toBe(false);
    expect(
      customIndicador.querySelector<MockElement>('.indicador-turno__prosa')!.textContent
    ).toBe('Turno de Jugador 2');
```

Añadir este caso nuevo al final del `describe`:

```ts
  it('mostrarTurno inyecta miAsiento null en local y el asiento real tras canal-remoto-listo', () => {
    const mockCanal: MoveChannel = {
      asiento: 2,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(),
      cerrar: vi.fn(),
    };
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });
    const ind = document.getElementById('indicador-turno')!;

    sesion.mostrarTurno({ jugador: 1 });
    expect(ind.dataset.miAsiento).toBeUndefined();

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Yo' },
      })
    );

    sesion.mostrarTurno({ jugador: 1, puntajes: { 1: 3, 2: 5 } });
    expect(ind.dataset.miAsiento).toBe('2');
    const f2 = ind.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f2.querySelector<MockElement>('.ficha-turno__puntaje')!.textContent).toBe('5');
    expect(
      ind.querySelector<MockElement>('.indicador-turno__prosa')!.textContent
    ).toBe('Turno de Jugador 1, esperando');

    sesion.destruir();
  });
```

- [ ] **Step 2: Correr los tests para verlos fallar**

Run: `rtk npx vitest run src/lib/gameSession.test.ts`
Expected: FAIL — `mostrarTurno` aún pasa `etiqueta` a `renderTurnIndicator` y no arma `fichas`; assertions sobre `.indicador-turno__prosa` y `dataset.miAsiento` rojas.

- [ ] **Step 3: Modificar `src/lib/gameSession.ts`**

Cambiar el bloque de imports de `./turnIndicator` (líneas ~3-7) por:

```ts
import {
  renderTurnIndicator,
  ocultarTurnIndicator,
  type FichaJugador,
} from './turnIndicator';
```

En la interfaz `GameSession<TMovimiento>`, reemplazar la firma de `mostrarTurno` (líneas ~30-32) por:

```ts
  mostrarTurno: (opciones: {
    jugador: Player;
    detalle?: string;
    repiteTurno?: boolean;
    motivoRepeticion?: string;
    puntajes?: Record<Player, number | string>;
    simbolos?: Record<Player, string>;
  }) => void;
```

Reemplazar la función `mostrarTurno` (líneas ~123-135) por:

```ts
  function mostrarTurno(opciones: {
    jugador: Player;
    detalle?: string;
    repiteTurno?: boolean;
    motivoRepeticion?: string;
    puntajes?: Record<Player, number | string>;
    simbolos?: Record<Player, string>;
  }): void {
    const ind = getIndicadorTurno();
    const ban = getBannerGanador();
    if (!ind) return;

    const fichas: Record<Player, FichaJugador> = {
      1: {
        nombre: nombres[1],
        puntaje: opciones.puntajes?.[1],
        simbolo: opciones.simbolos?.[1],
      },
      2: {
        nombre: nombres[2],
        puntaje: opciones.puntajes?.[2],
        simbolo: opciones.simbolos?.[2],
      },
    };

    renderTurnIndicator(ind, {
      jugador: opciones.jugador,
      fichas,
      miAsiento,
      detalle: opciones.detalle,
      repiteTurno: opciones.repiteTurno,
      motivoRepeticion: opciones.motivoRepeticion,
    });

    if (ban) hideWinnerBanner(ban);
  }
```

Verificar que ya no quede ninguna referencia a `TurnIndicatorOptions` en el archivo (se quitó del import). Si `astro check` la sigue pidiendo en algún punto, es que quedó un uso — eliminarlo.

- [ ] **Step 4: Correr los tests para verlos pasar**

Run: `rtk npx vitest run src/lib/gameSession.test.ts src/lib/turnIndicator.test.ts`
Expected: PASS ambos archivos.

- [ ] **Step 5: Verificar tipos y build**

Run: `rtk npx astro check && rtk npm run build`
Expected: `astro check` reporta errores SOLO en los 5 `Board.astro` (llaman a `mostrarTurno` con `etiqueta` / `detalle` / `marcador` en la forma vieja). Eso lo cierra la Task 3. Anotar los errores exactos y seguir.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/gameSession.ts src/lib/gameSession.test.ts
rtk git commit -m "feat(ui): gameSession arma las fichas de turno desde los nombres e inyecta miAsiento"
```

---

## Task 3: Conectar los 5 `Board.astro` a la nueva API

**Files:**
- Modify: `src/games/tres-en-raya/Board.astro` (llamada a `mostrarTurno`, ~línea 82)
- Modify: `src/games/notakto/Board.astro` (~línea 150)
- Modify: `src/games/agujero-negro/Board.astro` (~línea 114)
- Modify: `src/games/puntos-y-cajas/Board.astro` (~línea 199)
- Modify: `src/games/conquista/Board.astro` (~línea 278)

**Interfaces:**
- Consumes: de Task 2 — `sesion.mostrarTurno({ jugador, detalle?, repiteTurno?, motivoRepeticion?, puntajes?, simbolos? })`.
- Produces: nada para tareas posteriores.

No hay tests unitarios de `Board.astro` (son componentes con `<script>` de navegador; la cobertura de reglas vive en `engine.test.ts`, que no se toca). La verificación es `astro check` + `npm run build` + playtest (Task 4).

- [ ] **Step 1: Tres en raya**

En `src/games/tres-en-raya/Board.astro`, reemplazar:

```ts
      sesion.mostrarTurno({
        jugador: jugadorDelTurno,
        etiqueta: `${sesion.nombres[jugadorDelTurno]} (${ETIQUETAS[state.currentPlayer]})`,
      });
```

por:

```ts
      sesion.mostrarTurno({
        jugador: jugadorDelTurno,
        simbolos: { 1: ETIQUETAS.X, 2: ETIQUETAS.O },
      });
```

- [ ] **Step 2: Notakto**

En `src/games/notakto/Board.astro`, reemplazar:

```ts
      sesion.mostrarTurno({
        jugador: jugadorDelTurno,
        etiqueta: `${sesion.nombres[jugadorDelTurno]} (pone ✕)`,
      });
```

por:

```ts
      sesion.mostrarTurno({ jugador: jugadorDelTurno });
```

- [ ] **Step 3: Agujero Negro**

En `src/games/agujero-negro/Board.astro`, reemplazar:

```ts
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        etiqueta: sesion.nombres[state.currentPlayer],
        detalle: `Coloca el número ${state.nextValue[state.currentPlayer]}`,
      });
```

por:

```ts
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        detalle: `Coloca el número ${state.nextValue[state.currentPlayer]}`,
      });
```

- [ ] **Step 4: Puntos y Cajas**

En `src/games/puntos-y-cajas/Board.astro`, reemplazar:

```ts
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        etiqueta: sesion.nombres[state.currentPlayer],
        repiteTurno,
        motivoRepeticion: '✨ ¡Caja completada! Vuelves a jugar',
        marcador: {
          1: { nombre: sesion.nombres[1], puntaje: state.scores[1] },
          2: { nombre: sesion.nombres[2], puntaje: state.scores[2] },
        },
      });
```

por:

```ts
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        repiteTurno,
        motivoRepeticion: '✨ ¡Caja completada! Vuelves a jugar',
        puntajes: { 1: state.scores[1], 2: state.scores[2] },
      });
```

- [ ] **Step 5: Conquista**

En `src/games/conquista/Board.astro`, reemplazar:

```ts
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        etiqueta: sesion.nombres[state.currentPlayer],
        repiteTurno,
        motivoRepeticion: '✨ ¡Área conquistada! Vuelves a jugar',
        marcador: {
          1: { nombre: sesion.nombres[1], puntaje: state.scores[1].toFixed(1) },
          2: { nombre: sesion.nombres[2], puntaje: state.scores[2].toFixed(1) },
        },
      });
```

por:

```ts
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        repiteTurno,
        motivoRepeticion: '✨ ¡Área conquistada! Vuelves a jugar',
        puntajes: { 1: state.scores[1].toFixed(1), 2: state.scores[2].toFixed(1) },
      });
```

- [ ] **Step 6: Verificar tipos, tests y build**

Run: `rtk npx astro check && rtk npm test && rtk npm run build`
Expected: `astro check` sin errores; `npm test` 100% verde (todos los `engine.test.ts` + `turnIndicator` + `gameSession`); build limpio.

- [ ] **Step 7: Commit**

```bash
rtk git add src/games/*/Board.astro
rtk git commit -m "feat(ui): conectar los 5 juegos al nuevo indicador de turno con fichas"
```

---

## Task 4: Verificación integral y playtest manual

**Files:** ninguno (solo verificación; si algo falla, se corrige en la tarea correspondiente y se re-revisa).

**Interfaces:** N/A.

- [ ] **Step 1: Suite completa**

Run: `rtk npm test`
Expected: PASS, 0 fallos. Anotar el conteo (`N passed`).

- [ ] **Step 2: Build + tipos**

Run: `rtk npm run build && rtk npx astro check`
Expected: ambos limpios.

- [ ] **Step 3: Playtest manual — pasar-la-tableta**

Levantar el sitio: `rtk npm run dev` y abrir cada juego en el navegador.
Para los 5 juegos (Tres en raya, Notakto, Agujero Negro, Puntos y Cajas, Conquista):
- Las dos fichas se ven lado a lado; la del jugador del turno está rellena de su color, la otra tenue con borde punteado.
- Al hacer una jugada, la ficha activa cambia de jugador con la transición.
- Ninguna ficha muestra "(tú)".
- La ficha activa muestra `← VA`.
- Conquista / Puntos y Cajas: el puntaje aparece dentro de cada ficha; el badge "Vuelves a jugar" sigue apareciendo cuando corresponde.
- Agujero Negro: "Coloca el número N" sigue visible.
- Tres en raya: el nombre muestra `(X)` / `(O)`.
- En una ventana angosta (< 448px) las fichas se apilan verticalmente.

- [ ] **Step 4: Playtest manual — remoto**

Con dos contextos de navegador aislados (dos ventanas de incógnito o
`chrome-devtools-mcp` con storage separado), crear sala en uno y unirse
con el código desde el otro, en Tres en raya:
- Cada lado marca su propia ficha con `(tú)`.
- En el lado al que le toca: la ficha activa dice `← TE TOCA`, sin "esperando…".
- En el lado que espera: la ficha activa (la del rival) dice `← su turno` y aparece `esperando…` bajo las fichas.
- Al alternar turnos, los textos cambian de lado correctamente en ambas ventanas.
- El banner de fin de juego y "jugar de nuevo" siguen funcionando.

- [ ] **Step 5: Revisión de accesibilidad rápida**

Con el lector de pantalla del SO o el árbol de accesibilidad de DevTools,
confirmar que el contenedor `#indicador-turno` anuncia el cambio de turno
(tiene `role="status"` / `aria-live="polite"`) y que el texto anunciado es
la prosa de `.indicador-turno__prosa` ("Turno de Ana" / "Te toca, eres
Beto" / "Turno de Ana, esperando"), no la sopa de símbolos de las fichas.

- [ ] **Step 6: Commit de cierre (si hubo ajustes de playtest)**

Si el playtest obligó a tocar CSS/markup, commitear:

```bash
rtk git add -A
rtk git commit -m "fix(ui): ajustes de indicador de turno tras playtest"
```

Si no hubo cambios, no hay commit — la feature queda lista para
`superpowers:finishing-a-development-branch`.

---

## Self-Review (hecho por el autor del plan)

**1. Cobertura del spec:**
- Identidad por asiento (color + forma) → Task 1 (`FORMA`, CSS `[data-jugador]`).
- Fila de fichas siempre visible en los 5 juegos → Task 1 (DOM) + Task 3 (llamadas).
- Palabra clave según `miAsiento` (`VA` / `TE TOCA` / `su turno` + `esperando…`) → Task 1 (`textoEstado`, `esperando`), Task 2 (inyección de `miAsiento`).
- `(tú)` en modo remoto → Task 1 (`soyYo`), test en Task 1 y Task 2.
- Marcador integrado en la ficha → Task 1 (`.ficha-turno__puntaje`), Task 3 (Conquista, Puntos y Cajas).
- `detalle` conservado (Agujero Negro) → Task 1 (API + render), Task 3 (Step 3).
- Badge "vuelves a jugar" sin cambios → Task 1 (se conserva la rama `repiteTurno`).
- Accesibilidad (`role=status`, `aria-live`, prosa oculta) → Task 1 (Step 5 markup + `.indicador-turno__prosa`), Task 4 Step 5.
- Responsive / apilado en móvil → Task 1 (media query), Task 4 Step 3.
- Sin cambios de almacenamiento ni protocolo → ningún task toca `players.ts` ni `remoto/`.
- Nombres iguales en remoto resueltos por identidad visual → estructural (color+forma distintos siempre); no requiere código.

**2. Placeholders:** ninguno — todo el código de cada step está escrito.

**3. Consistencia de tipos:** `FichaJugador` / `TurnIndicatorOptions` definidos en Task 1 y consumidos textualmente en Task 2. `mostrarTurno` tiene la misma firma en la interfaz `GameSession<T>` y en la función (Task 2 Step 3). Los `Board.astro` (Task 3) usan exactamente las claves de esa firma (`jugador`, `detalle`, `repiteTurno`, `motivoRepeticion`, `puntajes`, `simbolos`). `ETIQUETAS.X` / `ETIQUETAS.O` coinciden con el uso existente `ETIQUETAS[state.winner]` (claves `'X'`/`'O'`).
