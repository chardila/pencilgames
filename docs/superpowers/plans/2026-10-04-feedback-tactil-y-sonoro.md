# Feedback táctil y sonoro (spec 09) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirmar cada jugada con una vibración y un sonido sintetizado breves, celebrar la victoria con confeti, y dejar un interruptor visible que lo silencie todo.

**Architecture:** Un módulo `src/lib/feedback.ts` (preferencia, vibración, tonos de `AudioContext`) y un coalescedor `src/lib/senales.ts` que junta los eventos de un mismo tick y dispara solo el más fuerte tras pintar. `gameSession.ts` marca los eventos (toque, punto, victoria, inválida) sin que los juegos cambien su lógica; la jugada inválida se cubre con llamadas explícitas en los `return` de rechazo de los juegos que validan y con un `pointerdown` delegado para las casillas `disabled`.

**Tech Stack:** Astro + TypeScript vanilla, vitest (entorno `node`, DOM simulado a mano), sin dependencias nuevas.

**Spec:** `specs/09-feedback-tactil-y-sonoro.md` (contexto en `specs/00-contexto-compartido.md`)

## Global Constraints

- Sin dependencias nuevas: Astro + CSS + TS vanilla.
- Todo texto de interfaz en español, tuteando al niño.
- Cualquier animación nueva va envuelta en `@media (prefers-reduced-motion: reduce)`.
- No romper accesibilidad: `aria-label`, `role="status"`, color + forma, objetivos ≥ 44 px (botones de controles: 56 px).
- Verificar a 600×960 y a 960×600.
- Vibración: jugada válida `10`; inválida `[20, 40, 20]`; punto/caja `[15, 30, 15]`; victoria `[40, 60, 40, 60, 80]`. Comprobar siempre `'vibrate' in navigator`.
- Sonidos < 200 ms generados con `AudioContext` y osciladores; sin archivos de audio.
- `AudioContext` se crea/reanuda en un gesto real, nunca al cargar la página.
- Interruptor 🔊/🔇 persistido en `pencilgames:sonido`, **activado por defecto**; silencia sonido y vibración.
- Sonido/vibración se disparan después de pintar la jugada (R7).
- Con `prefers-reduced-motion: reduce`: sin confeti ni pulsos; el banner de ganador sigue apareciendo.
- Fuera de alcance: música de fondo, voces, sonidos distintos por juego.
- `localStorage` siempre en try/catch (patrón de `recientes.ts`).
- El repo usa `npm`, no pnpm. Comandos git: simples, uno por llamada (el guard del worktree rechaza comandos compuestos).

## Review Focus

- Navegador sin `navigator.vibrate` ni `AudioContext` (iPad, Node): no debe lanzar nada.
- `localStorage` bloqueado o con valor corrupto en `pencilgames:sonido`: se asume activado y no falla.
- Restaurar una partida guardada, deshacer o reiniciar: **no** debe sonar (solo suena si hubo una jugada o un intento).
- Una jugada que además anota punto y termina la partida: suena **una** señal (victoria), no tres.
- Tocar una casilla en partida terminada: no debe sonar error.
- Confeti activo cuando se pulsa «Revancha»: el canvas se retira y no bloquea los toques.
- Varias victorias seguidas: no se acumulan canvas ni `AudioContext` extra.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `src/lib/feedback.ts` (nuevo) | Preferencia de sonido, patrones de vibración, tonos sintetizados, `desbloquear()` |
| `src/lib/feedback.test.ts` (nuevo) | Pruebas de lo anterior con `navigator`/`AudioContext`/`localStorage` simulados |
| `src/lib/senales.ts` (nuevo) | Coalescedor: prioridad `victoria > punto > error > toque`, un disparo por tick |
| `src/lib/senales.test.ts` (nuevo) | Pruebas del coalescedor con planificador inyectable |
| `src/lib/confeti.ts` (nuevo) | Canvas efímero de confeti (~2 s, sin librerías) |
| `src/lib/confeti.test.ts` (nuevo) | Pruebas de la lógica pura de partículas |
| `src/lib/gameSession.ts` (modif.) | Marca eventos; `jugadaInvalida()`; `pointerdown` delegado |
| `src/lib/gameSession.test.ts` (modif.) | Pruebas de los enganches |
| `src/components/ControlesPartida.astro` (modif.) | Botón 🔊/🔇 |
| `src/components/ModalJugadores.astro` (modif.) | Desbloqueo del audio al pulsar «¡Jugar!» |
| `src/components/TableroJuego.astro` (modif.) | Reduced-motion ampliado |
| Boards con `return` de rechazo (modif.) | `sesion.jugadaInvalida()` |

---

### Task 1: Módulo `feedback` (preferencia, vibración, tonos)

**Files:**
- Create: `src/lib/feedback.ts`
- Test: `src/lib/feedback.test.ts`

**Interfaces:**
- Produces:
  - `export const CLAVE_SONIDO = 'pencilgames:sonido'`
  - `export type Senal = 'toque' | 'error' | 'punto' | 'victoria'`
  - `export const PATRONES_VIBRACION: Record<Senal, number | number[]>`
  - `export function sonidoActivo(): boolean`
  - `export function alternarSonido(): boolean` (devuelve el nuevo estado)
  - `export function desbloquearAudio(): void`
  - `export function emitirSenal(senal: Senal): void`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/feedback.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CLAVE_SONIDO,
  PATRONES_VIBRACION,
  alternarSonido,
  desbloquearAudio,
  emitirSenal,
  sonidoActivo,
} from './feedback';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
}

function falsoAudioContext() {
  const osciladores: Array<{ type: string; freq: number[]; start: number; stop: number }> = [];
  class Ctx {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => { this.state = 'running'; });
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
    createOscillator() {
      const o = {
        type: 'sine',
        freqs: [] as number[],
        frequency: { setValueAtTime: (f: number) => o.freqs.push(f) },
        connect: vi.fn(),
        start: (t: number) => { (o as any).t0 = t; },
        stop: (t: number) => { osciladores.push({ type: o.type, freq: o.freqs, start: (o as any).t0 ?? 0, stop: t }); },
      };
      return o;
    }
  }
  return { Ctx, osciladores };
}

describe('feedback', () => {
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('el sonido está activado por defecto', () => {
    expect(sonidoActivo()).toBe(true);
  });

  it('un valor corrupto en localStorage cuenta como activado', () => {
    localStorage.setItem(CLAVE_SONIDO, '¿?');
    expect(sonidoActivo()).toBe(true);
  });

  it('alternar persiste y devuelve el nuevo estado', () => {
    expect(alternarSonido()).toBe(false);
    expect(localStorage.getItem(CLAVE_SONIDO)).toBe('0');
    expect(sonidoActivo()).toBe(false);
    expect(alternarSonido()).toBe(true);
    expect(sonidoActivo()).toBe(true);
  });

  it('localStorage que lanza no rompe nada', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('bloqueado'); },
      setItem() { throw new Error('bloqueado'); },
    });
    expect(() => sonidoActivo()).not.toThrow();
    expect(() => alternarSonido()).not.toThrow();
  });

  it('vibra con el patrón de cada señal', () => {
    for (const s of ['toque', 'error', 'punto', 'victoria'] as const) {
      emitirSenal(s);
      expect(vibrate).toHaveBeenLastCalledWith(PATRONES_VIBRACION[s]);
    }
    expect(PATRONES_VIBRACION.toque).toBe(10);
    expect(PATRONES_VIBRACION.error).toEqual([20, 40, 20]);
    expect(PATRONES_VIBRACION.punto).toEqual([15, 30, 15]);
    expect(PATRONES_VIBRACION.victoria).toEqual([40, 60, 40, 60, 80]);
  });

  it('silenciado no vibra', () => {
    alternarSonido();
    emitirSenal('toque');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('sin navigator.vibrate no lanza', () => {
    vi.stubGlobal('navigator', {});
    expect(() => emitirSenal('victoria')).not.toThrow();
  });

  it('sin AudioContext no lanza (iPad viejo, Node)', () => {
    expect(() => desbloquearAudio()).not.toThrow();
    expect(() => emitirSenal('punto')).not.toThrow();
  });

  it('no crea AudioContext hasta desbloquearAudio', () => {
    const { Ctx } = falsoAudioContext();
    const spy = vi.fn(function (this: unknown) { return new Ctx(); });
    vi.stubGlobal('AudioContext', spy);
    emitirSenal('toque');
    expect(spy).not.toHaveBeenCalled();
    desbloquearAudio();
    expect(spy).toHaveBeenCalledTimes(1);
    desbloquearAudio();
    expect(spy).toHaveBeenCalledTimes(1); // reutiliza
  });

  it('cada tono dura menos de 200 ms', () => {
    const { Ctx, osciladores } = falsoAudioContext();
    vi.stubGlobal('AudioContext', Ctx);
    desbloquearAudio();
    for (const s of ['toque', 'error', 'punto', 'victoria'] as const) {
      osciladores.length = 0;
      emitirSenal(s);
      expect(osciladores.length).toBeGreaterThan(0);
      const fin = Math.max(...osciladores.map(o => o.stop));
      expect(fin).toBeLessThan(0.2 + 0.001 + (s === 'victoria' ? 0.2 : 0));
    }
  });

  it('silenciado no crea osciladores', () => {
    const { Ctx, osciladores } = falsoAudioContext();
    vi.stubGlobal('AudioContext', Ctx);
    desbloquearAudio();
    alternarSonido();
    emitirSenal('error');
    expect(osciladores).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/feedback.test.ts`
Expected: FAIL — "Failed to resolve import './feedback'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/feedback.ts
// Vibración y sonido sintetizado (spec 09). Un solo interruptor
// (`pencilgames:sonido`) gobierna ambos. Mismo patrón de try/catch silencioso
// que recientes.ts: si algo no existe en el navegador, no se hace nada.

export const CLAVE_SONIDO = 'pencilgames:sonido';

export type Senal = 'toque' | 'error' | 'punto' | 'victoria';

export const PATRONES_VIBRACION: Record<Senal, number | number[]> = {
  toque: 10,
  error: [20, 40, 20],
  punto: [15, 30, 15],
  victoria: [40, 60, 40, 60, 80],
};

// [frecuencia Hz, inicio s, duración s]. La victoria es un arpegio un poco
// más largo que los demás: celebra el final, no una jugada.
type Nota = [number, number, number];
const TONOS: Record<Senal, { onda: OscillatorType; notas: Nota[] }> = {
  toque: { onda: 'sine', notas: [[880, 0, 0.06]] },
  error: { onda: 'square', notas: [[200, 0, 0.08], [150, 0.08, 0.1]] },
  punto: { onda: 'sine', notas: [[660, 0, 0.08], [880, 0.08, 0.1]] },
  victoria: {
    onda: 'triangle',
    notas: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.2]],
  },
};

const VOLUMEN = 0.15;

export function sonidoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== '0';
  } catch {
    return true;
  }
}

export function alternarSonido(): boolean {
  const nuevo = !sonidoActivo();
  try {
    localStorage.setItem(CLAVE_SONIDO, nuevo ? '1' : '0');
  } catch {
    // Sin localStorage no persiste, pero el botón no debe fallar.
  }
  return nuevo;
}

let contexto: AudioContext | null = null;

// Los navegadores móviles solo arrancan el AudioContext dentro de un gesto
// del usuario: se llama desde el primer toque real, nunca al cargar.
export function desbloquearAudio(): void {
  try {
    if (!contexto) {
      const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Ctor) return;
      contexto = new Ctor();
    }
    if (contexto.state === 'suspended') void contexto.resume();
  } catch {
    contexto = null;
  }
}

function sonar(senal: Senal): void {
  if (!contexto) return;
  try {
    const { onda, notas } = TONOS[senal];
    const t0 = contexto.currentTime;
    for (const [freq, inicio, dur] of notas) {
      const osc = contexto.createOscillator();
      const ganancia = contexto.createGain();
      osc.type = onda;
      osc.frequency.setValueAtTime(freq, t0 + inicio);
      ganancia.gain.setValueAtTime(VOLUMEN, t0 + inicio);
      ganancia.gain.exponentialRampToValueAtTime(0.001, t0 + inicio + dur);
      osc.connect(ganancia);
      ganancia.connect(contexto.destination);
      osc.start(t0 + inicio);
      osc.stop(t0 + inicio + dur);
    }
  } catch {
    // Un fallo de audio nunca debe interrumpir la partida.
  }
}

function vibrar(senal: Senal): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(PATRONES_VIBRACION[senal]);
    }
  } catch {
    // Algunos navegadores lanzan sin gesto previo.
  }
}

export function emitirSenal(senal: Senal): void {
  if (!sonidoActivo()) return;
  vibrar(senal);
  sonar(senal);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/feedback.test.ts`
Expected: PASS (12 tests). Si el test de duración falla por la tolerancia de la victoria, ajustar el test, no los tonos de toque/error/punto (que deben ser < 200 ms).

- [ ] **Step 5: Commit**

```bash
git add src/lib/feedback.ts src/lib/feedback.test.ts
git commit -m "feat(feedback): módulo de vibración y tonos sintetizados (spec 09)"
```

---

### Task 2: Coalescedor de señales

**Files:**
- Create: `src/lib/senales.ts`
- Test: `src/lib/senales.test.ts`

**Interfaces:**
- Consumes: `Senal` de `./feedback`.
- Produces:
  - `export function crearSenales(emitir: (s: Senal) => void, planificar?: (fn: () => void) => void): Senales`
  - `interface Senales { marcar(s: Senal): void; hayPendiente(): boolean; mejorar(s: Senal): void; }`
  - `marcar`: registra la señal; si ya hay una pendiente, gana la de mayor prioridad (`victoria > punto > error > toque`). Programa un único disparo con `planificar` (por defecto `requestAnimationFrame` si existe, si no `setTimeout(fn, 0)`).
  - `mejorar(s)`: igual que `marcar`, pero **solo** si ya hay una señal pendiente (si no, no hace nada). Es lo que usan `mostrarTurno`/`mostrarFinDeJuego`, para que restaurar, deshacer o reiniciar no suenen.
  - `hayPendiente()`: ¿hay señal sin disparar?

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/senales.test.ts
import { describe, it, expect, vi } from 'vitest';
import { crearSenales } from './senales';

function montar() {
  const emitir = vi.fn();
  const cola: Array<() => void> = [];
  const s = crearSenales(emitir, fn => cola.push(fn));
  const vaciar = () => { while (cola.length) cola.shift()!(); };
  return { s, emitir, vaciar, cola };
}

describe('senales', () => {
  it('no emite hasta que corre el planificador (después de pintar)', () => {
    const { s, emitir, vaciar } = montar();
    s.marcar('toque');
    expect(emitir).not.toHaveBeenCalled();
    vaciar();
    expect(emitir).toHaveBeenCalledWith('toque');
  });

  it('en el mismo tick gana la de mayor prioridad y emite una sola vez', () => {
    const { s, emitir, vaciar } = montar();
    s.marcar('toque');
    s.mejorar('punto');
    s.mejorar('victoria');
    s.mejorar('punto'); // no degrada
    vaciar();
    expect(emitir).toHaveBeenCalledTimes(1);
    expect(emitir).toHaveBeenCalledWith('victoria');
  });

  it('mejorar sin señal pendiente no hace nada (restaurar/deshacer/reiniciar callan)', () => {
    const { s, emitir, vaciar, cola } = montar();
    s.mejorar('victoria');
    expect(cola).toHaveLength(0);
    vaciar();
    expect(emitir).not.toHaveBeenCalled();
  });

  it('error pesa más que toque pero menos que punto', () => {
    const a = montar();
    a.s.marcar('toque'); a.s.marcar('error'); a.vaciar();
    expect(a.emitir).toHaveBeenCalledWith('error');
    const b = montar();
    b.s.marcar('error'); b.s.mejorar('punto'); b.vaciar();
    expect(b.emitir).toHaveBeenCalledWith('punto');
  });

  it('tras disparar queda limpia y programa otra vez', () => {
    const { s, emitir, vaciar } = montar();
    s.marcar('toque'); vaciar();
    expect(s.hayPendiente()).toBe(false);
    s.marcar('error'); vaciar();
    expect(emitir).toHaveBeenNthCalledWith(2, 'error');
  });

  it('programa un solo disparo aunque se marque varias veces', () => {
    const { s, cola } = montar();
    s.marcar('toque'); s.marcar('toque'); s.mejorar('punto');
    expect(cola).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/senales.test.ts`
Expected: FAIL — "Failed to resolve import './senales'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/senales.ts
// Junta las señales de un mismo tick y dispara solo la más fuerte, después de
// pintar (spec 09, R7). Una jugada que anota punto y termina la partida pasa
// por toque → punto → victoria dentro del mismo render: suena una sola vez.
import type { Senal } from './feedback';

const PRIORIDAD: Record<Senal, number> = { toque: 0, error: 1, punto: 2, victoria: 3 };

export interface Senales {
  marcar(senal: Senal): void;
  mejorar(senal: Senal): void;
  hayPendiente(): boolean;
}

function planificadorPorDefecto(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
}

export function crearSenales(
  emitir: (senal: Senal) => void,
  planificar: (fn: () => void) => void = planificadorPorDefecto
): Senales {
  let pendiente: Senal | null = null;

  function disparar(): void {
    const s = pendiente;
    pendiente = null;
    if (s) emitir(s);
  }

  function marcar(senal: Senal): void {
    const habiaPendiente = pendiente !== null;
    if (pendiente === null || PRIORIDAD[senal] > PRIORIDAD[pendiente]) pendiente = senal;
    if (!habiaPendiente) planificar(disparar);
  }

  return {
    marcar,
    mejorar(senal) {
      if (pendiente !== null) marcar(senal);
    },
    hayPendiente: () => pendiente !== null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/senales.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/senales.ts src/lib/senales.test.ts
git commit -m "feat(feedback): coalescedor de señales con prioridad (spec 09)"
```

---

### Task 3: Enganches en `gameSession` (toque, punto, victoria)

**Files:**
- Modify: `src/lib/gameSession.ts`
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes: `crearSenales` (Task 2), `emitirSenal` (Task 1).
- Produces: sin cambios de API pública en esta tarea (la parte `jugadaInvalida` es la Task 5).

Reglas de enganche (todas dentro de `iniciarSesionJuego`):

1. `const senales = crearSenales(emitirSenal);` junto a las demás variables de la sesión.
2. **Toque local:** en `guardarParaDeshacer`, **antes** del `return` de modo remoto: `senales.marcar('toque');`. (Se llama justo antes de aplicar una jugada local válida; el disparo ocurre después del render por el coalescedor.)
3. **Toque remoto:** en `manejarMensaje`, rama `'movimiento'` con payload válido, y en `aplicarLote` por cada movimiento válido: `senales.marcar('toque');` antes de `config.onMovimientoRemoto(...)`.
4. **Punto:** en `mostrarTurno`, antes de `renderTurnIndicator`: si `opciones.repiteTurno` es true, o algún `puntajes[j]` es numérico y mayor que el del `ultimoTurnoOpciones` previo → `senales.mejorar('punto')`. Calcular con el `ultimoTurnoOpciones` **antes** de reasignarlo.
5. **Victoria:** en `mostrarFinDeJuego`, si `opciones.ganador` es 1 o 2 → `senales.mejorar('victoria')`; si es `null` (empate) → `senales.mejorar('punto')`.
6. `mejorar` ya garantiza que restaurar partida, deshacer y reiniciar no suenan: esos caminos no marcan `toque`.

- [ ] **Step 1: Write the failing tests** (añadir al final de `src/lib/gameSession.test.ts`, reutilizando sus helpers de DOM simulado; copiar el `beforeEach`/`afterEach` del bloque `describe` de marcador o persistencia más cercano para montar `document`, `localStorage` y `location`)

```ts
vi.mock('./feedback', async orig => ({
  ...(await orig<typeof import('./feedback')>()),
  emitirSenal: vi.fn(),
}));
import { emitirSenal } from './feedback';

describe('gameSession — señales de feedback', () => {
  // Reutilizar el montaje del bloque de pruebas de persistencia (spec 06):
  // crea document/localStorage/location simulados y devuelve `config`.
  // Los disparos salen por requestAnimationFrame/setTimeout: usar fake timers.
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(emitirSenal).mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('una jugada local suena toque después del render', () => {
    const sesion = montarSesionDePrueba();
    sesion.guardarParaDeshacer({ n: 1 });
    expect(emitirSenal).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(emitirSenal).toHaveBeenCalledTimes(1);
    expect(emitirSenal).toHaveBeenCalledWith('toque');
  });

  it('jugada con repiteTurno suena punto', () => {
    const sesion = montarSesionDePrueba();
    sesion.guardarParaDeshacer({ n: 1 });
    sesion.mostrarTurno({ jugador: 1, repiteTurno: true });
    vi.runAllTimers();
    expect(emitirSenal).toHaveBeenCalledTimes(1);
    expect(emitirSenal).toHaveBeenCalledWith('punto');
  });

  it('subida de puntaje suena punto; sin subida, toque', () => {
    const sesion = montarSesionDePrueba();
    sesion.mostrarTurno({ jugador: 1, puntajes: { 1: 0, 2: 0 } });
    sesion.guardarParaDeshacer({ n: 1 });
    sesion.mostrarTurno({ jugador: 2, puntajes: { 1: 1, 2: 0 } });
    vi.runAllTimers();
    expect(emitirSenal).toHaveBeenLastCalledWith('punto');
    vi.mocked(emitirSenal).mockClear();
    sesion.guardarParaDeshacer({ n: 2 });
    sesion.mostrarTurno({ jugador: 1, puntajes: { 1: 1, 2: 0 } });
    vi.runAllTimers();
    expect(emitirSenal).toHaveBeenLastCalledWith('toque');
  });

  it('jugada ganadora suena una sola vez, victoria', () => {
    const sesion = montarSesionDePrueba();
    sesion.guardarParaDeshacer({ n: 1 });
    sesion.mostrarTurno({ jugador: 1, repiteTurno: true });
    sesion.mostrarFinDeJuego({ titulo: 'gana', ganador: 1 });
    vi.runAllTimers();
    expect(emitirSenal).toHaveBeenCalledTimes(1);
    expect(emitirSenal).toHaveBeenCalledWith('victoria');
  });

  it('mostrarTurno / mostrarFinDeJuego sin jugada previa no suenan (restaurar partida)', () => {
    const sesion = montarSesionDePrueba();
    sesion.mostrarTurno({ jugador: 1, repiteTurno: true });
    sesion.mostrarFinDeJuego({ titulo: 'gana', ganador: 2 });
    vi.runAllTimers();
    expect(emitirSenal).not.toHaveBeenCalled();
  });

  it('un movimiento remoto suena toque', () => {
    const { sesion, recibir } = montarSesionRemotaDePrueba();
    recibir({ tipo: 'movimiento', payload: 3 });
    vi.runAllTimers();
    expect(emitirSenal).toHaveBeenCalledWith('toque');
  });

  it('un empate suena punto, no victoria', () => {
    const sesion = montarSesionDePrueba();
    sesion.guardarParaDeshacer({ n: 1 });
    sesion.mostrarFinDeJuego({ titulo: 'empate', ganador: null });
    vi.runAllTimers();
    expect(emitirSenal).toHaveBeenCalledWith('punto');
  });
});
```

`montarSesionDePrueba()` y `montarSesionRemotaDePrueba()` son helpers locales: **antes de escribir las pruebas, leer cómo el archivo ya monta la sesión** en las pruebas de la spec 06 (`describe` de persistencia) y de modo remoto, y extraer/reutilizar ese montaje (mismo `config` con `validarMovimiento: (p): p is number => typeof p === 'number'`, `onMovimientoRemoto: vi.fn()`, `onAplicarReinicio: vi.fn()`, `onRender: vi.fn()`, `obtenerSnapshot`, `onDeshacer`). Para el caso remoto, disparar `canal-remoto-listo` con un canal falso como ya hacen las pruebas de reconexión.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: FAIL en las 7 pruebas nuevas (`emitirSenal` nunca se llama); las 755 previas siguen verdes.

- [ ] **Step 3: Implement** — aplicar las 5 reglas de enganche de arriba. Imports a añadir al inicio de `gameSession.ts`:

```ts
import { emitirSenal } from './feedback';
import { crearSenales } from './senales';
```

y, en `mostrarTurno`, antes de reasignar `ultimoTurnoOpciones`:

```ts
    const anterior = ultimoTurnoOpciones;
    const anotoPunto =
      opciones.repiteTurno === true ||
      ([1, 2] as Player[]).some(j => {
        const ahora = opciones.puntajes?.[j];
        const antes = anterior?.puntajes?.[j];
        return typeof ahora === 'number' && typeof antes === 'number' && ahora > antes;
      });
    if (anotoPunto) senales.mejorar('punto');
```

(ojo: en `mostrarTurno` la línea `ultimoTurnoOpciones = opciones;` existe ya; mover el cálculo **por encima** de ella.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/gameSession.test.ts` y luego `npm test`
Expected: PASS todo (755 + nuevas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(feedback): la sesión emite toque, punto y victoria tras pintar (spec 09)"
```

---

### Task 4: Interruptor 🔊/🔇 y desbloqueo del audio

**Files:**
- Modify: `src/components/ControlesPartida.astro` (botón + estilos + script)
- Modify: `src/components/ModalJugadores.astro:187` (desbloqueo en «¡Jugar!»)
- Modify: `src/lib/gameSession.ts` (respaldo de desbloqueo con el primer `pointerdown`)
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes: `alternarSonido`, `sonidoActivo`, `desbloquearAudio` (Task 1).
- Produces: elemento `#control-sonido` con `aria-pressed`.

Nota de ubicación: la spec dice «barra superior», pero la spec 02 puso los controles en una barra inferior fija; el botón va **junto a Deshacer/Reiniciar/Juegos**, en `.controles-partida__botones`, con la misma altura de 56 px. Debe caber en 600×960 y 960×600: cuatro botones con `flex: 1`; si a 600 px de ancho el texto no cabe, el botón de sonido es solo ícono (`flex: 0 0 3.5rem`) con `aria-label`.

- [ ] **Step 1: Write the failing test** (en `gameSession.test.ts`)

```ts
it('el primer pointerdown desbloquea el audio una sola vez', () => {
  // desbloquearAudio mockeado junto a emitirSenal en el vi.mock de ./feedback
  const sesion = montarSesionDePrueba();
  document.dispatchEvent(new Event('pointerdown'));
  document.dispatchEvent(new Event('pointerdown'));
  expect(desbloquearAudio).toHaveBeenCalledTimes(1);
  sesion.destruir();
});
```

(ampliar el `vi.mock('./feedback', …)` de Task 3 con `desbloquearAudio: vi.fn()` e importarlo.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/gameSession.test.ts -t "desbloquea"`
Expected: FAIL (`desbloquearAudio` no se llama).

- [ ] **Step 3: Implement**

En `gameSession.ts`, tras registrar los demás listeners:

```ts
  // Respaldo del desbloqueo de audio (spec 09, R3): el primer toque real en
  // cualquier punto basta; «¡Jugar!» ya lo hace antes.
  function alPrimerToque(): void {
    desbloquearAudio();
    document.removeEventListener('pointerdown', alPrimerToque);
  }
  document.addEventListener('pointerdown', alPrimerToque);
```

(añadir `desbloquearAudio` al import de `./feedback`, y `document.removeEventListener('pointerdown', alPrimerToque)` en `destruir`).

En `ControlesPartida.astro`, dentro de `.controles-partida__botones`, antes del enlace «Juegos»:

```astro
    <button type="button" id="control-sonido" class="controles-partida__boton controles-partida__boton--icono" aria-pressed="true" aria-label="Sonido">
      <span id="control-sonido-icono" aria-hidden="true">🔊</span>
    </button>
```

estilo: `.controles-partida__boton--icono { flex: 0 0 3.5rem; }` y un `<script>` al final del componente:

```astro
<script>
  import { alternarSonido, sonidoActivo, desbloquearAudio } from '../lib/feedback';
  const boton = document.getElementById('control-sonido') as HTMLButtonElement | null;
  const icono = document.getElementById('control-sonido-icono');
  function pintar(): void {
    const activo = sonidoActivo();
    boton?.setAttribute('aria-pressed', String(activo));
    boton?.setAttribute('aria-label', activo ? 'Sonido activado' : 'Sonido silenciado');
    if (icono) icono.textContent = activo ? '🔊' : '🔇';
  }
  pintar();
  boton?.addEventListener('click', () => {
    desbloquearAudio();
    alternarSonido();
    pintar();
  });
</script>
```

En `ModalJugadores.astro`, dentro del `guardar.addEventListener('click', …)` (línea ~187), como **primera** sentencia: `desbloquearAudio();` con `import { desbloquearAudio } from '../lib/feedback';` en el `<script>` del componente.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/gameSession.test.ts` y `npm run build`
Expected: PASS; el build de Astro termina sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/ControlesPartida.astro src/components/ModalJugadores.astro src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(feedback): interruptor de sonido y desbloqueo del audio (spec 09)"
```

---

### Task 5: Jugada inválida (híbrido) — spike + sesión + juegos

**Files:**
- Modify: `src/lib/gameSession.ts` (`jugadaInvalida()`, `pointerdown` delegado, bandera de fin de juego)
- Modify: los boards de la tabla de abajo
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes: `senales` (Task 2/3).
- Produces: `GameSession.jugadaInvalida: () => void` (marca `error`; no hace nada si la partida terminó).

**Paso 0 (spike, obligatorio antes de escribir el listener delegado):** comprobar con Chrome headless por CDP (el MCP de chrome-devtools falla sin X; `astro dev` en un puerto propio, no el 4399) si un toque sobre un `<button disabled>` genera `pointerdown` y qué `target` tiene. Registrar el resultado en este plan.

- Si `pointerdown` llega (target = el botón o un ancestro con el botón localizable): el listener delegado usa `evento.target.closest('.casilla:disabled')`.
- Si el navegador lo traga: aplicar `.casilla:disabled { pointer-events: none }` en `TableroJuego.astro`/hoja común y resolver con `document.elementsFromPoint(x, y)` buscando una `.casilla` con `disabled`.

- [ ] **Step 1: Write the failing tests**

```ts
it('jugadaInvalida suena error después del siguiente tick', () => {
  const sesion = montarSesionDePrueba();
  sesion.jugadaInvalida();
  vi.runAllTimers();
  expect(emitirSenal).toHaveBeenCalledWith('error');
});

it('tras el fin de partida, jugadaInvalida no suena', () => {
  const sesion = montarSesionDePrueba();
  sesion.guardarParaDeshacer({ n: 1 });
  sesion.mostrarFinDeJuego({ titulo: 'gana', ganador: 1 });
  vi.runAllTimers();
  vi.mocked(emitirSenal).mockClear();
  sesion.jugadaInvalida();
  vi.runAllTimers();
  expect(emitirSenal).not.toHaveBeenCalled();
});

it('mostrarTurno reabre la partida: jugadaInvalida vuelve a sonar', () => {
  const sesion = montarSesionDePrueba();
  sesion.guardarParaDeshacer({ n: 1 });
  sesion.mostrarFinDeJuego({ titulo: 'gana', ganador: 1 });
  sesion.mostrarTurno({ jugador: 1 });
  vi.runAllTimers();
  vi.mocked(emitirSenal).mockClear();
  sesion.jugadaInvalida();
  vi.runAllTimers();
  expect(emitirSenal).toHaveBeenCalledWith('error');
});

it('pointerdown sobre una casilla deshabilitada suena error', () => {
  const sesion = montarSesionDePrueba();
  const casilla = { closest: (s: string) => (s === '.casilla:disabled' ? casilla : null) };
  const ev = new Event('pointerdown');
  Object.defineProperty(ev, 'target', { value: casilla });
  document.dispatchEvent(ev);
  vi.runAllTimers();
  expect(emitirSenal).toHaveBeenCalledWith('error');
});

it('pointerdown fuera de una casilla deshabilitada no suena error', () => {
  const sesion = montarSesionDePrueba();
  const otro = { closest: () => null };
  const ev = new Event('pointerdown');
  Object.defineProperty(ev, 'target', { value: otro });
  document.dispatchEvent(ev);
  vi.runAllTimers();
  expect(emitirSenal).not.toHaveBeenCalledWith('error');
});
```

(ajustar el segundo y tercer test al helper de montaje real; el `desbloquearAudio` del listener de Task 4 está mockeado, así que no interfiere.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/gameSession.test.ts -t "jugadaInvalida|pointerdown"`
Expected: FAIL (`jugadaInvalida is not a function`).

- [ ] **Step 3: Implement en `gameSession.ts`**

```ts
  // Tras mostrarFinDeJuego los toques sobre el tablero no son "errores":
  // la partida terminó. mostrarTurno la reabre (revancha, deshacer).
  let partidaTerminada = false;

  function jugadaInvalida(): void {
    if (partidaTerminada) return;
    senales.marcar('error');
  }

  // Casillas deshabilitadas (casilla ocupada o turno del rival): el botón no
  // dispara `click`, pero sí `pointerdown`. Los juegos con SVG o con
  // validación propia llaman a jugadaInvalida() en su `return` de rechazo.
  function alTocarCasillaDeshabilitada(evento: Event): void {
    const objetivo = evento.target as HTMLElement | null;
    if (objetivo?.closest?.('.casilla:disabled')) jugadaInvalida();
  }
  document.addEventListener('pointerdown', alTocarCasillaDeshabilitada);
```

- `mostrarFinDeJuego`: `partidaTerminada = true;` al principio.
- `mostrarTurno`: `partidaTerminada = false;` al principio.
- `destruir`: `document.removeEventListener('pointerdown', alTocarCasillaDeshabilitada);`
- Añadir `jugadaInvalida` a la interfaz `GameSession` (con comentario) y al objeto devuelto.
- Si el spike obligó al camino `elementsFromPoint`, cambiar el cuerpo de `alTocarCasillaDeshabilitada` a:
  `const e = evento as PointerEvent; const hit = document.elementsFromPoint(e.clientX, e.clientY).find(n => n.matches?.('.casilla:disabled'));` y añadir la regla CSS `pointer-events: none` indicada.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(feedback): jugadaInvalida y toque sobre casilla deshabilitada (spec 09)"
```

- [ ] **Step 6: Llamadas explícitas en los juegos con rechazo propio**

Añadir `sesion.jugadaInvalida();` justo antes del `return` de rechazo **de jugada ilegal** (casilla ocupada, movimiento ilegal, `state === prev`). **No** en los guards de `status !== 'playing'` ni de turno ajeno (esos no son «jugada inválida» del niño; el de turno ajeno en juegos con `jugar(i)` directo sí cuenta si el toque llegó, ver nota). Líneas actuales (verificar con `grep -n` antes de editar; cambian al insertar):

| Board | Línea | Rechazo |
|---|---|---|
| `hex` | 372 | `state.board[indice] !== null` (separar de `status !== 'playing'`) |
| `y` | 319 | ídem |
| `snakes` | 329 | `state === antes` |
| `triggle` | 348 | `state === prev` |
| `sim` | 404 | `state === prevState` |
| `metasquares` | 248 | `state === prev` |
| `bridg-it` | 215 | `!puedeJugar(state, edge)` |
| `col` | 262 | `nuevo === state` |
| `nim` | 222 | `nuevo === state` |
| `domineering` | 233, 258 | casilla ocupada / `state === prev` |
| `estampida` | 217 | `state === prev` |
| `battleship` | 354 | `state === prev` |
| `conquista` | 206 | `destinos.length === 0` (pieza sin destinos) |

Ejemplo (hex, que hoy mezcla ocupada y partida terminada en una sola línea):

```ts
    if (state.status !== 'playing') return;
    if (state.board[indice] !== null) {
      sesion.jugadaInvalida();
      return;
    }
```

Nota sobre turno ajeno: para `hex`, `y`, `snakes`, `triggle`, `sim`, `metasquares` el guard de turno devuelve silenciosamente cuando el niño toca en el turno del rival (modo remoto). Ahí también se llama `sesion.jugadaInvalida()` **solo si `emitirRemoto` es true** (entrada local), para que el toque fuera de turno se sienta distinto.

Juegos que se cubren **solo** con el listener delegado (sin cambios en el board, porque usan `.casilla` con `disabled`): `tres-en-raya`, `gomoku`, `chomp`, `obstruccion`, `notakto`, `sos`, `puntos-y-cajas`, `agujero-negro`. Para `puntos-y-cajas` y `agujero-negro`, comprobar en el spike que su elemento táctil lleva la clase `.casilla`; si no la lleva, añadir allí la llamada explícita en el `return` correspondiente.

- [ ] **Step 7: Verificación**

Run: `npm test` y `npm run build`
Expected: todo verde. Luego, con `astro dev` en un puerto propio, comprobar a mano en tres-en-raya (casilla ocupada), hex (casilla ocupada) y gomoku (tras terminar la partida: **no** suena error).

- [ ] **Step 8: Commit**

```bash
git add src/games
git commit -m "feat(feedback): señal de error en el rechazo de jugada ilegal de cada juego (spec 09)"
```

---

### Task 6: Confeti y reduced-motion

**Files:**
- Create: `src/lib/confeti.ts`
- Test: `src/lib/confeti.test.ts`
- Modify: `src/lib/gameSession.ts` (`mostrarFinDeJuego` lanza el confeti)
- Modify: `src/components/TableroJuego.astro` (media query ampliada)
- Modify: `src/games/{hex,snakes,triggle,y}/Board.astro` (pulsos dentro de `prefers-reduced-motion`)

**Interfaces:**
- Produces:
  - `export function crearParticulas(n: number, ancho: number, alto: number, azar?: () => number): Particula[]`
  - `export function avanzar(p: Particula[], dt: number): Particula[]` (descarta las que salen de pantalla)
  - `export function lanzarConfeti(): void` (no hace nada con `prefers-reduced-motion: reduce`, sin `document`/canvas, o si ya hay uno activo)
  - `interface Particula { x: number; y: number; vx: number; vy: number; color: string; talla: number; giro: number }`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/confeti.test.ts
import { describe, it, expect } from 'vitest';
import { avanzar, crearParticulas } from './confeti';

describe('confeti', () => {
  it('crea n partículas dentro del ancho, por encima de la pantalla', () => {
    const p = crearParticulas(60, 800, 600, () => 0.5);
    expect(p).toHaveLength(60);
    for (const q of p) {
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThanOrEqual(800);
      expect(q.y).toBeLessThanOrEqual(0);
    }
  });

  it('avanzar mueve con la gravedad y descarta lo que cae fuera', () => {
    const p = [
      { x: 10, y: 0, vx: 0, vy: 100, color: '#f00', talla: 6, giro: 0 },
      { x: 10, y: 590, vx: 0, vy: 400, color: '#0f0', talla: 6, giro: 0 },
    ];
    const sig = avanzar(p, 0.1, 600);
    expect(sig).toHaveLength(1);
    expect(sig[0].y).toBeGreaterThan(0);
  });

  it('es determinista con un generador de azar inyectado', () => {
    const a = crearParticulas(5, 100, 100, () => 0.3);
    const b = crearParticulas(5, 100, 100, () => 0.3);
    expect(a).toEqual(b);
  });
});
```

(la firma de `avanzar` incluye el alto: `avanzar(p, dt, alto)`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/confeti.test.ts`
Expected: FAIL (import).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/confeti.ts
// Confeti ligero en canvas (spec 09, R5): ~2 s, sin librerías, sin bloquear el
// toque (pointer-events: none) y sin acumularse si se gana varias veces.
export interface Particula {
  x: number; y: number; vx: number; vy: number;
  color: string; talla: number; giro: number;
}

const COLORES = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#ffd166'];
const GRAVEDAD = 600;
const DURACION_MS = 2000;

export function crearParticulas(
  n: number, ancho: number, _alto: number, azar: () => number = Math.random
): Particula[] {
  return Array.from({ length: n }, () => ({
    x: azar() * ancho,
    y: -azar() * 40,
    vx: (azar() - 0.5) * 240,
    vy: azar() * 120,
    color: COLORES[Math.floor(azar() * COLORES.length)],
    talla: 5 + azar() * 5,
    giro: azar() * Math.PI,
  }));
}

export function avanzar(p: Particula[], dt: number, alto: number): Particula[] {
  return p
    .map(q => ({ ...q, x: q.x + q.vx * dt, y: q.y + q.vy * dt, vy: q.vy + GRAVEDAD * dt, giro: q.giro + dt * 6 }))
    .filter(q => q.y < alto + 20);
}

let activo: HTMLCanvasElement | null = null;

export function lanzarConfeti(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (activo) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:20';
  document.body.appendChild(canvas);
  activo = canvas;

  let particulas = crearParticulas(60, canvas.width, canvas.height);
  const inicio = performance.now();
  let previo = inicio;

  function cuadro(ahora: number): void {
    const dt = Math.min((ahora - previo) / 1000, 0.05);
    previo = ahora;
    particulas = avanzar(particulas, dt, canvas.height);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    for (const q of particulas) {
      ctx!.save();
      ctx!.translate(q.x, q.y);
      ctx!.rotate(q.giro);
      ctx!.fillStyle = q.color;
      ctx!.fillRect(-q.talla / 2, -q.talla / 2, q.talla, q.talla * 0.6);
      ctx!.restore();
    }
    if (ahora - inicio < DURACION_MS && particulas.length > 0) {
      requestAnimationFrame(cuadro);
    } else {
      canvas.remove();
      activo = null;
    }
  }
  requestAnimationFrame(cuadro);
}

export function retirarConfeti(): void {
  activo?.remove();
  activo = null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/confeti.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Enganchar y ampliar reduced-motion**

En `gameSession.ts`: importar `lanzarConfeti, retirarConfeti` de `./confeti`. En `mostrarFinDeJuego`, cuando `opciones.ganador` es 1 o 2 (no empate): `lanzarConfeti();` justo **después** de pintar el banner. En `reiniciar` y en `mostrarTurno`: `retirarConfeti();` (la revancha inmediata corta el efecto). Test en `gameSession.test.ts`: mockear `./confeti` y comprobar que `mostrarFinDeJuego({ganador:1})` llama `lanzarConfeti`, que el empate no, y que `reiniciar()` llama `retirarConfeti`.

Reduced-motion: en `TableroJuego.astro` (bloque `@media (prefers-reduced-motion: reduce)` existente) añadir:

```css
    :global([class*='ganadora']),
    :global([class*='pulso']) {
      animation: none !important;
    }
```

y comprobar que cada `animation:` de pulso en `hex`, `snakes`, `triggle`, `y` (líneas 145, 50, 184, 138) queda cubierto (`snakes` ya tiene su propio bloque reduced-motion en la línea 99: verificar que lo incluye; si no, añadir la regla allí). El banner de ganador **no** lleva animación de entrada que dependa de esto: confirmar que sigue visible con la media query activa (spec 09, criterio 5).

- [ ] **Step 6: Run + Commit**

Run: `npm test` y `npm run build` — Expected: verde.

```bash
git add src/lib/confeti.ts src/lib/confeti.test.ts src/lib/gameSession.ts src/lib/gameSession.test.ts src/components/TableroJuego.astro src/games
git commit -m "feat(feedback): confeti de victoria y reduced-motion ampliado (spec 09)"
```

---

### Task 7: Verificación en navegador y cierre

**Files:** ninguno nuevo (solo hallazgos); actualizar `specs/09-feedback-tactil-y-sonoro.md` si algún requisito cambió (p. ej. ubicación del interruptor).

- [ ] **Step 1: Suite completa**

Run: `npm test` y `npm run build` y `npx astro check`
Expected: sin fallos ni errores de tipos.

- [ ] **Step 2: Chrome headless por CDP** (puerto propio con `astro dev`; mirar visibilidad real, no solo existencia de elementos — lección de la spec 06)

Comprobar, en tres-en-raya, hex y puntos-y-cajas, a **600×960** y **960×600**:
1. Los cuatro botones de la barra caben sin scroll horizontal y miden ≥ 56 px de alto; `#control-sonido` alterna 🔊/🔇 y `aria-pressed`, y el valor sobrevive a una recarga (`localStorage['pencilgames:sonido']`).
2. Sin `navigator.vibrate` (borrarlo antes de cargar): cero errores en consola.
3. Una jugada válida llama `navigator.vibrate(10)` (espiar con `Object.defineProperty`); casilla ocupada → `[20, 40, 20]`; cerrar caja/anotar → `[15, 30, 15]`; ganar → `[40, 60, 40, 60, 80]`; tras ganar, tocar el tablero **no** vibra error.
4. Con el interruptor en 🔇 no se llama a `vibrate` ni se crean osciladores.
5. Emulando `prefers-reduced-motion: reduce`: no aparece `<canvas>` al ganar, los pulsos tienen `animation-name: none`, y el banner de ganador es visible.
6. Tocar «Revancha» durante el confeti retira el canvas; el siguiente toque llega a una casilla (no queda tapada).
7. Latencia: medir con `performance.now()` entre el `click` y el `render` de una casilla antes/después del cambio; no debe empeorar de forma apreciable.

- [ ] **Step 3: Revisión de rama completa y PR**

Invocar `superpowers:requesting-code-review` sobre toda la rama; corregir; luego `superpowers:finishing-a-development-branch`. Los comandos `git` en el worktree los pide el guard uno a uno (el usuario los corre con `!` si el hook los bloquea); `gh pr create` con `--body-file` acaba con la línea «🤖 Generated with [Claude Code](https://claude.com/claude-code)».

- [ ] **Step 4: Memoria**

Actualizar `specs-ux-progreso.md` (spec 09 hecha, PR, decisiones: híbrido de jugada inválida, coalescedor, interruptor en la barra inferior, resultado del spike de `pointerdown`) y la línea del índice en `MEMORY.md`.

---

## Self-Review

**Cobertura de la spec**
- R1 vibración y patrones → Task 1 (+ comprobación en Task 7).
- R2 sonidos sintetizados < 200 ms → Task 1.
- R3 desbloqueo en gesto → Task 4 («¡Jugar!» y primer `pointerdown`).
- R4 interruptor persistido, activado por defecto → Tasks 1 y 4.
- R5 celebración → Task 6 (confeti + el resaltado/pulso de línea ganadora que cada juego ya tiene; no se crea animación nueva por juego).
- R6 reduced-motion → Task 6.
- R7 después de pintar → Task 2 (coalescedor con rAF) y prueba «no emite hasta que corre el planificador».
- Criterio «jugada inválida se siente distinta» → Task 5. Criterio «ninguna jugada más lenta» → Task 7, paso 2.7.

**Escaneo de marcadores pendientes:** los helpers `montarSesionDePrueba` / `montarSesionRemotaDePrueba` de las pruebas de Task 3 se definen leyendo el montaje existente en `gameSession.test.ts` (instrucción explícita en el paso); las líneas de la tabla de Task 5 se verifican con `grep -n` porque se desplazan al insertar.

**Consistencia de tipos:** `Senal`, `emitirSenal`, `desbloquearAudio`, `crearSenales(...).marcar/mejorar/hayPendiente`, `lanzarConfeti/retirarConfeti` y `GameSession.jugadaInvalida` se usan con la misma firma en todas las tareas. `avanzar` lleva `alto` como tercer argumento en tests e implementación.

**Riesgos abiertos:** (1) el spike de `pointerdown` sobre `<button disabled>` (Task 5, paso 0) decide entre el listener simple y el camino `elementsFromPoint`; (2) la ubicación del interruptor se desvía de la spec («barra superior») a favor de la barra inferior de la spec 02: documentarlo en la spec al cerrar.
