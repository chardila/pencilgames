# Persistir la partida en curso — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que recargar o perder la pestaña y volver a abrir un juego en modo local retome la partida, ofreciendo `Continuar` / `Empezar de nuevo` antes de reglas y modo.

**Architecture:** Una librería pura (`partidaGuardada.ts`) lee/escribe `pencilgames:partida:<slug>`. `gameSession` guarda (debounce + volcado en `pagehide`/`visibilitychange`) usando un nuevo callback `obtenerSnapshot` por juego, y restaura con el evento `partida-restaurar` reutilizando `onDeshacer`. Un componente nuevo muestra el diálogo y `ModalInstrucciones` lo antepone al flujo de reglas/modo.

**Tech Stack:** Astro + TypeScript vanilla, vitest (entorno `node` con stubs de `document`/`localStorage`), sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-04-persistir-partida-design.md` (origen: `specs/06-persistir-la-partida.md`, contexto: `specs/00-contexto-compartido.md`).

## Global Constraints

- No introducir dependencias nuevas. Astro + CSS + TS vanilla.
- Todo texto de interfaz en español, tuteando al niño.
- Clave de almacenamiento: `pencilgames:partida:<slug>`; valor `{ v: 1, ts, nombres, snapshot, pila }`; se descarta lo que no sea `v: 1` y lo de más de 24 h.
- Solo modo local: en remoto (`miAsiento !== null`) nunca se guarda ni se restaura; conectar un canal remoto borra la entrada local.
- Zonas tocables ≥ 48 px; botones del diálogo ≥ 56 px. Verificar a 600×960 y 960×600.
- `localStorage` siempre dentro de `try/catch` silencioso (patrón de `marcador.ts` / `entrada.ts`).
- No romper accesibilidad base: `role="dialog"`, `aria-modal`, `aria-labelledby`.
- El marcador acumulado (`pencilgames:marcador:<slug>`) no se toca.
- Cada componente Astro emite su `<script type="module">` aparte: los eventos del flujo de entrada se disparan dentro de `alTerminarDeCargarScripts` (issue #61).
- **Git en este worktree:** el hook de la sesión bloquea los comandos `git` de Claude. Los pasos «Commit» los corre el usuario con `! git add …` y `! git commit …`, uno por uno y sin encadenar. Cada commit termina con `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Entorno para medir: Chrome headless por CDP (el MCP de chrome-devtools falla sin X); usar `astro dev` en un puerto propio (p. ej. `npx astro dev --port 4410`), no `astro preview`.

## Review Focus

Modos de fallo que la spec implica pero que ninguna tarea probaría por defecto; cada uno tiene su test en la tarea indicada:

1. **El render inicial no debe borrar la partida guardada.** Al cargar, el juego renderiza con la pila vacía *antes* de que el niño elija Continuar. Si «pila vacía» borrara la entrada, Continuar nunca tendría nada que restaurar. Solo *deshacer hasta vacío* borra. (Tarea 2)
2. **Una escritura con debounce pendiente no debe resucitar una partida terminada.** Jugada ganadora → `mostrarFinDeJuego` borra → el timer de la jugada anterior dispara y reescribe. Borrar debe cancelar el timer. (Tarea 2)
3. **Pestaña descartada con debounce pendiente.** La última jugada se pierde si solo se escribe por timer; hay que volcar en `pagehide` y `visibilitychange: hidden`. (Tarea 2)
4. **Entrada corrupta, de otra versión, vacía de snapshot o con reloj en el futuro.** Nunca debe lanzar ni ofrecer Continuar; se descarta y borra. (Tarea 1)
5. **Estado no serializable a JSON** (`Map`, `Set`, `undefined`): `structuredClone` lo tolera pero `localStorage` no. Test de ida y vuelta JSON para los 21 motores. (Tarea 4)

---

### Task 1: Librería `partidaGuardada.ts`

**Files:**
- Create: `src/lib/partidaGuardada.ts`
- Test: `src/lib/partidaGuardada.test.ts`

**Interfaces:**
- Consumes: `PlayerNames` de `src/lib/players.ts`.
- Produces (las usan las tareas 2 y 3):
  ```ts
  export const VERSION_PARTIDA = 1;
  export const CADUCIDAD_MS = 24 * 60 * 60 * 1000;
  export interface DatosPartida { nombres: PlayerNames; snapshot: unknown; pila: unknown[]; }
  export interface PartidaGuardada extends DatosPartida { v: 1; ts: number; }
  export function guardarPartida(slug: string, datos: DatosPartida, ahora?: number): void;
  export function leerPartida(slug: string, ahora?: number): PartidaGuardada | null;
  export function borrarPartida(slug: string): void;
  export function hayPartidaGuardada(slug: string, ahora?: number): boolean;
  ```

- [ ] **Step 1: Escribir el test que falla**

Crear `src/lib/partidaGuardada.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CADUCIDAD_MS,
  borrarPartida,
  guardarPartida,
  hayPartidaGuardada,
  leerPartida,
} from './partidaGuardada';

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
}

const CLAVE = 'pencilgames:partida:gomoku';
const NOMBRES = { 1: 'Ana', 2: 'Beto' };
const DATOS = { nombres: NOMBRES, snapshot: { board: [1, null] }, pila: [{ board: [null, null] }] };
const T0 = 1_700_000_000_000;

describe('partidaGuardada', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('guarda con v: 1 y marca de tiempo, y lee lo mismo de vuelta', () => {
    guardarPartida('gomoku', DATOS, T0);
    expect(JSON.parse(storage.getItem(CLAVE)!)).toEqual({ v: 1, ts: T0, ...DATOS });
    expect(leerPartida('gomoku', T0 + 1000)).toEqual({ v: 1, ts: T0, ...DATOS });
    expect(hayPartidaGuardada('gomoku', T0 + 1000)).toBe(true);
  });

  it('sin entrada devuelve null y hayPartidaGuardada es false', () => {
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(hayPartidaGuardada('gomoku', T0)).toBe(false);
  });

  it('descarta y borra una entrada de más de 24 h; justo en el límite la conserva', () => {
    guardarPartida('gomoku', DATOS, T0);
    expect(leerPartida('gomoku', T0 + CADUCIDAD_MS)).not.toBeNull();
    expect(leerPartida('gomoku', T0 + CADUCIDAD_MS + 1)).toBeNull();
    expect(storage.getItem(CLAVE)).toBeNull();
  });

  it('descarta y borra una entrada con v distinta de 1', () => {
    storage.setItem(CLAVE, JSON.stringify({ v: 0, ts: T0, ...DATOS }));
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(storage.getItem(CLAVE)).toBeNull();
  });

  it('descarta y borra JSON corrupto o de forma inválida sin lanzar', () => {
    const invalidas = [
      '{no es json',
      'null',
      '[]',
      JSON.stringify({ v: 1, ts: 'ayer', ...DATOS }),
      JSON.stringify({ v: 1, ts: T0, nombres: { 1: 'Ana' }, snapshot: {}, pila: [] }),
      JSON.stringify({ v: 1, ts: T0, nombres: NOMBRES, snapshot: {}, pila: 'no' }),
      JSON.stringify({ v: 1, ts: T0, nombres: NOMBRES, pila: [] }),
      JSON.stringify({ v: 1, ts: T0, nombres: NOMBRES, snapshot: null, pila: [] }),
    ];
    for (const raw of invalidas) {
      storage.setItem(CLAVE, raw);
      expect(() => leerPartida('gomoku', T0)).not.toThrow();
      expect(leerPartida('gomoku', T0)).toBeNull();
      expect(storage.getItem(CLAVE)).toBeNull();
    }
  });

  it('descarta una entrada con marca de tiempo en el futuro (reloj cambiado)', () => {
    guardarPartida('gomoku', DATOS, T0 + 2 * 60 * 60 * 1000);
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(storage.getItem(CLAVE)).toBeNull();
  });

  it('borrarPartida elimina la entrada y cada juego tiene la suya', () => {
    guardarPartida('gomoku', DATOS, T0);
    guardarPartida('hex', DATOS, T0);
    borrarPartida('gomoku');
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(leerPartida('hex', T0)).not.toBeNull();
  });

  it('si localStorage lanza (modo privado, cuota llena) no rompe nada', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cuota');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    vi.stubGlobal('localStorage', roto as unknown as Storage);
    expect(() => guardarPartida('gomoku', DATOS, T0)).not.toThrow();
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(hayPartidaGuardada('gomoku', T0)).toBe(false);
    expect(() => borrarPartida('gomoku')).not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/partidaGuardada.test.ts`
Expected: FAIL — no se puede resolver `./partidaGuardada`.

- [ ] **Step 3: Implementación mínima**

Crear `src/lib/partidaGuardada.ts`:

```ts
import type { PlayerNames } from './players';

// Persistencia de la partida local en curso (spec 06). Estado serializable,
// nunca DOM. Mismo patrón de try/catch silencioso que marcador.ts: si
// localStorage no está disponible, no persiste pero no rompe la partida.

export const VERSION_PARTIDA = 1;
export const CADUCIDAD_MS = 24 * 60 * 60 * 1000;
// Margen para relojes ligeramente desfasados; más allá, la entrada "del
// futuro" nunca caducaría, así que se descarta.
const TOLERANCIA_FUTURO_MS = 60 * 60 * 1000;

export interface DatosPartida {
  nombres: PlayerNames;
  snapshot: unknown;
  pila: unknown[];
}

export interface PartidaGuardada extends DatosPartida {
  v: 1;
  ts: number;
}

function clave(slug: string): string {
  return `pencilgames:partida:${slug}`;
}

export function guardarPartida(
  slug: string,
  datos: DatosPartida,
  ahora: number = Date.now()
): void {
  const entrada: PartidaGuardada = { v: VERSION_PARTIDA, ts: ahora, ...datos };
  try {
    localStorage.setItem(clave(slug), JSON.stringify(entrada));
  } catch {
    // localStorage no disponible (modo privado, cuota llena): no persiste.
  }
}

export function borrarPartida(slug: string): void {
  try {
    localStorage.removeItem(clave(slug));
  } catch {
    // ignore
  }
}

function esEntradaValida(parsed: unknown): parsed is PartidaGuardada {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const p = parsed as Record<string, unknown>;
  if (p.v !== VERSION_PARTIDA) return false;
  if (typeof p.ts !== 'number' || !Number.isFinite(p.ts)) return false;
  const nombres = p.nombres as Record<string, unknown> | null | undefined;
  if (typeof nombres?.[1] !== 'string' || typeof nombres?.[2] !== 'string') return false;
  if (!Array.isArray(p.pila)) return false;
  return typeof p.snapshot === 'object' && p.snapshot !== null;
}

export function leerPartida(
  slug: string,
  ahora: number = Date.now()
): PartidaGuardada | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(clave(slug));
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    borrarPartida(slug);
    return null;
  }

  const caducada =
    esEntradaValida(parsed) &&
    (ahora - parsed.ts > CADUCIDAD_MS || parsed.ts - ahora > TOLERANCIA_FUTURO_MS);
  if (!esEntradaValida(parsed) || caducada) {
    borrarPartida(slug);
    return null;
  }
  return parsed;
}

export function hayPartidaGuardada(slug: string, ahora: number = Date.now()): boolean {
  return leerPartida(slug, ahora) !== null;
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/partidaGuardada.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit** (lo corre el usuario)

```
! git add src/lib/partidaGuardada.ts src/lib/partidaGuardada.test.ts
! git commit -m "feat(partida): librería de persistencia de la partida en curso (spec 06)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Guardar y restaurar en `gameSession`

**Files:**
- Modify: `src/lib/gameSession.ts` (imports; `GameSessionConfig`; estado interno; `alClicControlDeshacer`; `alCanalRemotoListo`; `reiniciar`; `mostrarTurno`; `mostrarFinDeJuego`; listeners; `destruir`)
- Test: `src/lib/gameSession.test.ts` (nuevo `describe` anidado justo antes de `describe('resincronización tras reconexión'`)

**Interfaces:**
- Consumes (Tarea 1): `guardarPartida`, `leerPartida`, `borrarPartida` de `./partidaGuardada`; `savePlayerNames` de `./players`.
- Produces (las usa la Tarea 4): `GameSessionConfig.obtenerSnapshot?: () => unknown`. Evento de documento `partida-restaurar` (sin `detail`) que la Tarea 3 dispara.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/gameSession.test.ts`, añadir a los imports de arriba:

```ts
import { guardarPartida, leerPartida } from './partidaGuardada';
```

Insertar este bloque justo antes de la línea `  describe('resincronización tras reconexión', () => {` (dentro del `describe('gameSession')` externo, que ya tiene `mockDoc` y `memoryStorage`):

```ts
  describe('persistencia de la partida (spec 06)', () => {
    const CLAVE = 'pencilgames:partida:gomoku';

    function configBase() {
      return {
        validarMovimiento: (p: unknown): p is number => typeof p === 'number',
        onMovimientoRemoto: vi.fn(),
        onAplicarReinicio: vi.fn(),
        onRender: vi.fn(),
      };
    }

    function ventanaFalsa() {
      const ventana = new EventTarget();
      vi.stubGlobal('window', ventana);
      return ventana;
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('location', { reload: vi.fn(), pathname: '/juegos/gomoku/' });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('guarda snapshot, pila y nombres tras una jugada, con debounce', () => {
      let estado = { n: 0 };
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: vi.fn(),
        obtenerSnapshot: () => estado,
      });

      sesion.guardarParaDeshacer(estado);
      estado = { n: 1 };
      sesion.mostrarTurno({ jugador: 1 });
      expect(memoryStorage.getItem(CLAVE)).toBeNull(); // aún dentro del debounce

      vi.advanceTimersByTime(300);
      expect(JSON.parse(memoryStorage.getItem(CLAVE)!)).toMatchObject({
        v: 1,
        snapshot: { n: 1 },
        pila: [{ n: 0 }],
        nombres: { 1: 'Jugador 1', 2: 'Jugador 2' },
      });
      sesion.destruir();
    });

    it('con la pila vacía no guarda y el render inicial NO borra una partida guardada', () => {
      guardarPartida('gomoku', {
        nombres: { 1: 'Ana', 2: 'Beto' },
        snapshot: { n: 5 },
        pila: [{ n: 4 }],
      });
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: vi.fn(),
        obtenerSnapshot: () => ({ n: 0 }),
      });

      sesion.mostrarTurno({ jugador: 1 }); // render inicial del tablero
      vi.advanceTimersByTime(1000);

      expect(leerPartida('gomoku')!.snapshot).toEqual({ n: 5 });
      sesion.destruir();
    });

    it('sin obtenerSnapshot no guarda nada', () => {
      const sesion = iniciarSesionJuego<number>({ ...configBase(), onDeshacer: vi.fn() });
      sesion.guardarParaDeshacer({ n: 0 });
      sesion.mostrarTurno({ jugador: 1 });
      vi.advanceTimersByTime(1000);
      expect(memoryStorage.getItem(CLAVE)).toBeNull();
      sesion.destruir();
    });

    it('deshacer hasta dejar la pila vacía borra la entrada; con jugadas restantes la reescribe', () => {
      let estado = { n: 0 };
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: snapshot => {
          estado = snapshot as { n: number };
          sesion.mostrarTurno({ jugador: 1 });
        },
        obtenerSnapshot: () => estado,
      });
      const deshacer = mockDoc.getElementById('control-deshacer')!;

      for (let i = 0; i < 2; i++) {
        sesion.guardarParaDeshacer(estado);
        estado = { n: estado.n + 1 };
        sesion.mostrarTurno({ jugador: 1 });
      }
      vi.advanceTimersByTime(300);
      expect(leerPartida('gomoku')!.snapshot).toEqual({ n: 2 });

      deshacer.dispatchEvent(new Event('click'));
      vi.advanceTimersByTime(300);
      expect(leerPartida('gomoku')!.snapshot).toEqual({ n: 1 });

      deshacer.dispatchEvent(new Event('click'));
      vi.advanceTimersByTime(300);
      expect(memoryStorage.getItem(CLAVE)).toBeNull();
      sesion.destruir();
    });

    it('terminar la partida borra la entrada y cancela una escritura pendiente', () => {
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: vi.fn(),
        obtenerSnapshot: () => ({ n: 1 }),
      });
      sesion.guardarParaDeshacer({ n: 0 });
      sesion.mostrarTurno({ jugador: 1 });
      vi.advanceTimersByTime(300);
      expect(memoryStorage.getItem(CLAVE)).not.toBeNull();

      // Jugada ganadora: programa escritura y enseguida termina la partida.
      sesion.guardarParaDeshacer({ n: 1 });
      sesion.mostrarTurno({ jugador: 1 });
      sesion.mostrarFinDeJuego({ titulo: 'Ganó', ganador: 1 });
      vi.advanceTimersByTime(1000);

      expect(memoryStorage.getItem(CLAVE)).toBeNull();
      sesion.destruir();
    });

    it('reiniciar borra la entrada', () => {
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: vi.fn(),
        obtenerSnapshot: () => ({ n: 1 }),
      });
      sesion.guardarParaDeshacer({ n: 0 });
      sesion.mostrarTurno({ jugador: 1 });
      vi.advanceTimersByTime(300);
      expect(memoryStorage.getItem(CLAVE)).not.toBeNull();

      sesion.reiniciar();
      vi.advanceTimersByTime(1000);
      expect(memoryStorage.getItem(CLAVE)).toBeNull();
      sesion.destruir();
    });

    it('vuelca la escritura pendiente en pagehide y al ocultarse la pestaña', () => {
      const ventana = ventanaFalsa();
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: vi.fn(),
        obtenerSnapshot: () => ({ n: 1 }),
      });

      sesion.guardarParaDeshacer({ n: 0 });
      sesion.mostrarTurno({ jugador: 1 });
      expect(memoryStorage.getItem(CLAVE)).toBeNull();
      ventana.dispatchEvent(new Event('pagehide'));
      expect(leerPartida('gomoku')!.snapshot).toEqual({ n: 1 });

      memoryStorage.removeItem(CLAVE);
      sesion.guardarParaDeshacer({ n: 1 });
      sesion.mostrarTurno({ jugador: 1 });
      Object.defineProperty(mockDoc, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      mockDoc.dispatchEvent(new Event('visibilitychange'));
      expect(leerPartida('gomoku')!.snapshot).toEqual({ n: 1 });

      sesion.destruir();
    });

    it('pagehide sin escritura pendiente no escribe (p. ej. tras terminar la partida)', () => {
      const ventana = ventanaFalsa();
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: vi.fn(),
        obtenerSnapshot: () => ({ n: 1 }),
      });
      sesion.guardarParaDeshacer({ n: 0 });
      sesion.mostrarTurno({ jugador: 1 });
      sesion.mostrarFinDeJuego({ titulo: 'Ganó', ganador: 1 });
      ventana.dispatchEvent(new Event('pagehide'));
      expect(memoryStorage.getItem(CLAVE)).toBeNull();
      sesion.destruir();
    });

    it('en modo remoto no guarda y conectar el canal borra la entrada local', () => {
      guardarPartida('gomoku', {
        nombres: { 1: 'Ana', 2: 'Beto' },
        snapshot: { n: 5 },
        pila: [{ n: 4 }],
      });
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer: vi.fn(),
        obtenerSnapshot: () => ({ n: 9 }),
      });
      const mockCanal: MoveChannel = {
        asiento: 1,
        estado: 'conectado',
        enviar: vi.fn(),
        alRecibir: vi.fn(),
        alCambiarEstado: vi.fn(),
        cerrar: vi.fn(),
      };
      document.dispatchEvent(
        new CustomEvent('canal-remoto-listo', {
          detail: { channel: mockCanal, miNombre: 'Yo' },
        })
      );
      expect(memoryStorage.getItem(CLAVE)).toBeNull();

      sesion.guardarParaDeshacer({ n: 0 }); // no-op en remoto: pila vacía
      sesion.mostrarTurno({ jugador: 1 });
      vi.advanceTimersByTime(1000);
      expect(memoryStorage.getItem(CLAVE)).toBeNull();
      sesion.destruir();
    });

    it('partida-restaurar repone snapshot, pila, nombres y marcador visible', () => {
      guardarPartida('gomoku', {
        nombres: { 1: 'Ana', 2: 'Beto' },
        snapshot: { n: 2 },
        pila: [{ n: 0 }, { n: 1 }],
      });
      const onDeshacer = vi.fn();
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer,
        obtenerSnapshot: () => ({ n: 0 }),
      });

      document.dispatchEvent(new Event('partida-restaurar'));

      expect(onDeshacer).toHaveBeenCalledWith({ n: 2 });
      expect(sesion.nombres[1]).toBe('Ana');
      expect(sesion.nombres[2]).toBe('Beto');
      expect(JSON.parse(memoryStorage.getItem('pencilgames:jugadores')!)).toEqual({
        1: 'Ana',
        2: 'Beto',
      });
      expect(mockDoc.getElementById('marcador-partida')!.textContent).toBe(
        'Ana 0 · Beto 0'
      );
      // La pila repuesta permite deshacer hasta el principio.
      const deshacer = mockDoc.getElementById('control-deshacer')!;
      expect(deshacer.disabled).toBe(false);
      deshacer.dispatchEvent(new Event('click'));
      expect(onDeshacer).toHaveBeenLastCalledWith({ n: 1 });
      deshacer.dispatchEvent(new Event('click'));
      expect(onDeshacer).toHaveBeenLastCalledWith({ n: 0 });
      expect(deshacer.disabled).toBe(true);
      sesion.destruir();
    });

    it('partida-restaurar sin entrada válida no hace nada ni lanza', () => {
      memoryStorage.setItem(CLAVE, '{corrupto');
      const onDeshacer = vi.fn();
      const sesion = iniciarSesionJuego<number>({ ...configBase(), onDeshacer });
      expect(() => document.dispatchEvent(new Event('partida-restaurar'))).not.toThrow();
      expect(onDeshacer).not.toHaveBeenCalled();
      sesion.destruir();
    });

    it('destruir quita los listeners de persistencia y cancela la escritura pendiente', () => {
      const ventana = ventanaFalsa();
      const onDeshacer = vi.fn();
      const sesion = iniciarSesionJuego<number>({
        ...configBase(),
        onDeshacer,
        obtenerSnapshot: () => ({ n: 1 }),
      });
      sesion.guardarParaDeshacer({ n: 0 });
      sesion.mostrarTurno({ jugador: 1 });
      sesion.destruir();

      vi.advanceTimersByTime(1000);
      ventana.dispatchEvent(new Event('pagehide'));
      expect(memoryStorage.getItem(CLAVE)).toBeNull();

      guardarPartida('gomoku', {
        nombres: { 1: 'A', 2: 'B' },
        snapshot: { n: 1 },
        pila: [],
      });
      document.dispatchEvent(new Event('partida-restaurar'));
      expect(onDeshacer).not.toHaveBeenCalled();
    });
  });

```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/lib/gameSession.test.ts -t "persistencia de la partida"`
Expected: FAIL — `obtenerSnapshot` no existe en la config y no se escribe nada en `localStorage`.

- [ ] **Step 3: Implementar en `src/lib/gameSession.ts`**

3a. Imports (junto a los existentes):

```ts
import { getPlayerNames, savePlayerNames, type Player, type PlayerNames } from './players';
import { borrarPartida, guardarPartida, leerPartida } from './partidaGuardada';
```
(sustituir la línea `import { getPlayerNames, type Player, type PlayerNames } from './players';` por la de arriba y añadir la segunda).

3b. En `GameSessionConfig`, después de `onDeshacer?`:

```ts
  /**
   * Devuelve el snapshot ACTUAL del juego, con la misma forma que recibe
   * `onDeshacer` (spec 06). Sin esta función el juego no persiste la
   * partida en curso. Debe ser serializable a JSON.
   */
  obtenerSnapshot?: () => unknown;
```

3c. Junto a `const PROFUNDIDAD_DESHACER = 10;`:

```ts
const DEBOUNCE_GUARDADO_MS = 300;
```

3d. Dentro de `iniciarSesionJuego`, después de `let anuncioPendiente: string | null = null;` añadir el estado y las funciones de persistencia:

```ts
  // Persistencia de la partida local en curso (spec 06).
  let timeoutGuardado: ReturnType<typeof setTimeout> | null = null;

  function puedePersistir(): boolean {
    return miAsiento === null && !!config.obtenerSnapshot;
  }

  function escribirPartida(): void {
    timeoutGuardado = null;
    if (!puedePersistir() || pilaDeshacer.length === 0) return;
    guardarPartida(slug, {
      nombres: { 1: nombres[1], 2: nombres[2] },
      snapshot: config.obtenerSnapshot!(),
      pila: pilaDeshacer,
    });
  }

  // Con la pila vacía NO se borra: el render inicial del tablero ocurre
  // antes de que el niño elija Continuar y no debe destruir la partida
  // guardada. Solo borran deshacer-hasta-vacío, reiniciar, el fin de la
  // partida y conectar en remoto.
  function programarGuardado(): void {
    if (!puedePersistir() || pilaDeshacer.length === 0) return;
    if (timeoutGuardado !== null) clearTimeout(timeoutGuardado);
    timeoutGuardado = setTimeout(escribirPartida, DEBOUNCE_GUARDADO_MS);
  }

  function cancelarGuardado(): void {
    if (timeoutGuardado !== null) {
      clearTimeout(timeoutGuardado);
      timeoutGuardado = null;
    }
  }

  // Cancelar antes de borrar: un timer pendiente reescribiría una partida
  // que acaba de terminar o reiniciarse.
  function descartarPartida(): void {
    cancelarGuardado();
    borrarPartida(slug);
  }

  // Chrome puede descartar la pestaña con un debounce a medias: se escribe
  // de inmediato lo pendiente al ocultarse la página.
  function volcarGuardadoPendiente(): void {
    if (timeoutGuardado === null) return;
    clearTimeout(timeoutGuardado);
    escribirPartida();
  }

  function alOcultarPagina(): void {
    volcarGuardadoPendiente();
  }

  function alCambiarVisibilidad(): void {
    if (document.visibilityState === 'hidden') volcarGuardadoPendiente();
  }

  function alRestaurarPartida(): void {
    if (miAsiento !== null || !config.onDeshacer) return;
    const guardada = leerPartida(slug);
    if (!guardada) return;
    nombres[1] = guardada.nombres[1];
    nombres[2] = guardada.nombres[2];
    savePlayerNames(nombres);
    pilaDeshacer = guardada.pila;
    actualizarBotonDeshacer();
    actualizarMarcadorUI();
    config.onDeshacer(guardada.snapshot);
  }
```

3e. En `alClicControlDeshacer`, después de `actualizarBotonDeshacer();` (tras el `pop`) y antes de `anuncioPendiente = ...`:

```ts
    if (pilaDeshacer.length === 0) descartarPartida();
```

3f. En `alCanalRemotoListo`, justo después de `limpiarMarcador(slug); marcador = obtenerMarcador(slug);` (el bloque «Toda conexión a canal remoto…»):

```ts
    descartarPartida();
```

3g. En `reiniciar()`, después de `actualizarBotonDeshacer();`:

```ts
    descartarPartida();
```

3h. En `mostrarTurno`, como **primera** línea del cuerpo (antes de `ultimoTurnoOpciones = opciones;`, para que corra aunque no exista el indicador y salga por `if (!ind) return;`):

```ts
    programarGuardado();
```

3i. En `mostrarFinDeJuego`, como primera línea del cuerpo:

```ts
    descartarPartida();
```

3j. Registrar listeners junto a los otros `document.addEventListener(...)`:

```ts
  document.addEventListener('partida-restaurar', alRestaurarPartida);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', alOcultarPagina);
  }
```

3k. En `destruir()`, antes de `liberarWakeLock();`:

```ts
    cancelarGuardado();
    document.removeEventListener('partida-restaurar', alRestaurarPartida);
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', alOcultarPagina);
    }
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS — los 11 tests nuevos y todos los anteriores (el archivo tenía ~48 K de tests de spec 02, remoto y resincronización; ninguno debe romperse porque `obtenerSnapshot` es opcional).

- [ ] **Step 5: Commit** (lo corre el usuario)

```
! git add src/lib/gameSession.ts src/lib/gameSession.test.ts
! git commit -m "feat(partida): gameSession guarda y restaura la partida local (spec 06)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Diálogo Continuar / Empezar de nuevo y entrada

**Files:**
- Create: `src/components/ModalContinuarPartida.astro`
- Modify: `src/components/ModalInstrucciones.astro` (script: bloque `if (!enFlujoSala) {…}`)
- Modify: `src/pages/juegos/[slug].astro` (import + montaje del componente)

**Interfaces:**
- Consumes (Tarea 1): `hayPartidaGuardada(slug)`, `borrarPartida(slug)`; (Tarea 2): evento `partida-restaurar`; de `entrada.ts`: `alTerminarDeCargarScripts`, `guardarModo`.
- Produces: eventos de documento `partida-guardada-encontrada` (lo dispara `ModalInstrucciones`, lo escucha el diálogo) y `partida-descartada` (lo dispara el diálogo, lo escucha `ModalInstrucciones`).

No hay infraestructura de pruebas de DOM (vitest corre en entorno `node`); la verificación de esta tarea es la manual de la Tarea 5.

- [ ] **Step 1: Crear `src/components/ModalContinuarPartida.astro`**

```astro
---
interface Props {
  slug: string;
}
const { slug } = Astro.props;
---
<div
  id="modal-continuar-partida"
  class="modal-continuar"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-continuar-titulo"
  data-slug={slug}
  hidden
>
  <div class="modal-continuar__contenido">
    <h2 id="modal-continuar-titulo">Tienes una partida a medias</h2>
    <p>¿Quieres seguir jugándola?</p>
    <button type="button" id="modal-continuar-si" class="modal-continuar__continuar">
      Continuar
    </button>
    <button type="button" id="modal-continuar-no" class="modal-continuar__nueva">
      Empezar de nuevo
    </button>
  </div>
</div>

<style>
  .modal-continuar {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing);
    z-index: 20;
  }
  .modal-continuar[hidden] {
    display: none;
  }
  .modal-continuar__contenido {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    max-width: 24rem;
    width: 100%;
  }
  .modal-continuar__continuar,
  .modal-continuar__nueva {
    display: block;
    width: 100%;
    margin-top: 0.75rem;
    padding: 0.75rem;
    border-radius: var(--radius);
    font-size: 1.1rem;
    font-weight: 700;
    min-height: 56px;
  }
  .modal-continuar__continuar {
    border: none;
    background: var(--color-accent);
  }
  .modal-continuar__nueva {
    border: 1px solid #ddd;
    background: var(--color-surface);
  }
</style>

<script>
  import { guardarModo } from '../lib/entrada';
  import { borrarPartida } from '../lib/partidaGuardada';

  const modal = document.getElementById('modal-continuar-partida')!;
  const continuar = document.getElementById('modal-continuar-si')!;
  const nueva = document.getElementById('modal-continuar-no')!;
  const slug = modal.dataset.slug!;

  document.addEventListener('partida-guardada-encontrada', () => {
    modal.hidden = false;
    continuar.focus();
  });

  continuar.addEventListener('click', () => {
    modal.hidden = true;
    // Una partida guardada solo existe en modo local: se salta reglas y modo.
    guardarModo('local');
    document.dispatchEvent(new CustomEvent('modo-elegido-local'));
    document.dispatchEvent(new CustomEvent('partida-restaurar'));
  });

  nueva.addEventListener('click', () => {
    modal.hidden = true;
    borrarPartida(slug);
    document.dispatchEvent(new CustomEvent('partida-descartada'));
  });
</script>
```

- [ ] **Step 2: Modificar el arranque de `ModalInstrucciones.astro`**

En el script, importar `hayPartidaGuardada`:

```ts
  import { hayPartidaGuardada } from '../lib/partidaGuardada';
```
(junto a los demás imports del script).

Sustituir el bloque `if (!enFlujoSala) { … }` (el que decide `haVistoReglas`; conservar sus comentarios) por una función y un arranque que antepone el diálogo:

```ts
  function arrancarFlujoNormal(): void {
    if (haVistoReglas(slug)) {
      // (comentario existente sobre issue #61 y DOMContentLoaded, sin cambios)
      alTerminarDeCargarScripts(() => {
        document.dispatchEvent(new CustomEvent('instrucciones-cerradas'));
      });
    } else {
      modal.hidden = false;
    }
  }

  if (!enFlujoSala) {
    if (hayPartidaGuardada(slug)) {
      // Spec 06: lo primero que se ve es Continuar / Empezar de nuevo; las
      // reglas y el modo solo se recorren si se descarta la partida.
      alTerminarDeCargarScripts(() => {
        document.dispatchEvent(new CustomEvent('partida-guardada-encontrada'));
      });
      document.addEventListener('partida-descartada', arrancarFlujoNormal, {
        once: true,
      });
    } else {
      arrancarFlujoNormal();
    }
  }
```

- [ ] **Step 3: Montar el componente en `src/pages/juegos/[slug].astro`**

Añadir el import junto a los otros modales:

```astro
import ModalContinuarPartida from '../../components/ModalContinuarPartida.astro';
```

y montarlo justo después de `<ModalJugadores />`:

```astro
  <ModalContinuarPartida slug={juego.id} />
```

- [ ] **Step 4: Verificar tipos y build**

Run: `npm run check && npm run build`
Expected: 0 errores en `astro check`; build completo (21 páginas de juego).

- [ ] **Step 5: Commit** (lo corre el usuario)

```
! git add src/components/ModalContinuarPartida.astro src/components/ModalInstrucciones.astro "src/pages/juegos/[slug].astro"
! git commit -m "feat(partida): diálogo Continuar / Empezar de nuevo antes de reglas y modo (spec 06)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `obtenerSnapshot` en los 21 juegos + test de ida y vuelta JSON

**Files:**
- Modify (21): `src/games/<juego>/Board.astro` — añadir `obtenerSnapshot` a la llamada `iniciarSesionJuego({...})`, justo después del bloque `onDeshacer: …,`.
- Modify: `src/lib/estadoClonable.test.ts` (nuevo `describe` con el mismo `ENGINES`)

**Interfaces:**
- Consumes (Tarea 2): `GameSessionConfig.obtenerSnapshot?: () => unknown`.
- Produces: persistencia efectiva en los 21 juegos. La forma devuelta es **exactamente** la que ese juego pasa a `guardarParaDeshacer` y recibe `onDeshacer`.

- [ ] **Step 1: Test que falla (JSON)**

Añadir al final de `src/lib/estadoClonable.test.ts`:

```ts
// La partida en curso (spec 06) se guarda como JSON en localStorage.
// `structuredClone` tolera Map, Set y undefined, pero JSON no: si el estado
// inicial de algún juego los usara, la restauración perdería datos sin
// avisar. Este test lo detecta para los 21 motores de una vez.
describe('el estado inicial de cada juego sobrevive a JSON (localStorage)', () => {
  it.each(ENGINES)('%s', async juego => {
    const mod: { createInitialState: (...args: never[]) => unknown } =
      await import(`../games/${juego}/engine.ts`);
    const estado = mod.createInitialState();
    expect(JSON.parse(JSON.stringify(estado))).toEqual(estado);
  });
});
```

- [ ] **Step 2: Ejecutar**

Run: `npx vitest run src/lib/estadoClonable.test.ts`
Expected: PASS en los 21 motores. **Si algún motor falla**, parar: ese juego guarda algo que JSON pierde; hay que decidir con el usuario si se adapta el estado o se excluye el juego de la persistencia (no se resuelve en silencio).

- [ ] **Step 3: Añadir `obtenerSnapshot` a los 16 juegos cuyo snapshot es `state`**

En cada uno de estos `Board.astro`, dentro de `iniciarSesionJuego({ … })`, inmediatamente después del bloque `onDeshacer: snapshot => { … },`, añadir la línea:

```ts
    obtenerSnapshot: () => state,
```

Juegos: `agujero-negro`, `bridg-it`, `chomp`, `col`, `domineering`, `gomoku`, `hex`, `metasquares`, `nim`, `notakto`, `obstruccion`, `sim`, `snakes`, `tres-en-raya`, `triggle`, `y`.

(En todos, `state` es la variable de módulo que `onDeshacer` reasigna: `state = snapshot as <Tipo>;`.)

- [ ] **Step 4: Añadir `obtenerSnapshot` a los 5 juegos con snapshot compuesto**

Mismo sitio (después de `onDeshacer`). Cada forma replica la que ese juego pasa a `guardarParaDeshacer`:

`conquista`, `puntos-y-cajas`, `sos`:
```ts
    obtenerSnapshot: () => ({ state, repiteTurno }),
```

`estampida`:
```ts
    obtenerSnapshot: () => ({ state, rivalSaltado }),
```

`battleship`:
```ts
    obtenerSnapshot: () => ({ state, flotaPrevia, listoParaColocar, handoffPendiente }),
```

- [ ] **Step 5: Verificar que ningún juego se quedó sin el callback y que tipan**

Run: `grep -c "obtenerSnapshot" src/games/agujero-negro/Board.astro src/games/battleship/Board.astro src/games/bridg-it/Board.astro src/games/chomp/Board.astro src/games/col/Board.astro src/games/conquista/Board.astro src/games/domineering/Board.astro src/games/estampida/Board.astro src/games/gomoku/Board.astro src/games/hex/Board.astro src/games/metasquares/Board.astro src/games/nim/Board.astro src/games/notakto/Board.astro src/games/obstruccion/Board.astro src/games/puntos-y-cajas/Board.astro src/games/sim/Board.astro src/games/snakes/Board.astro src/games/sos/Board.astro src/games/tres-en-raya/Board.astro src/games/triggle/Board.astro src/games/y/Board.astro`
Expected: 21 líneas, todas `:1`.

Run: `npm run check && npm test`
Expected: 0 errores de tipos; todos los tests pasan.

- [ ] **Step 6: Commit** (lo corre el usuario)

```
! git add src/games src/lib/estadoClonable.test.ts
! git commit -m "feat(partida): los 21 juegos exponen su snapshot para persistir (spec 06)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificación de extremo a extremo y cierre

**Files:**
- Create (temporal, fuera del repo): `<scratchpad>/e2e-partida.mjs`
- Modify: `specs/06-persistir-la-partida.md` (marcar criterios cumplidos)

**Interfaces:**
- Consumes: todo lo anterior, ya integrado.
- Produces: evidencia de los criterios de aceptación de la spec.

- [ ] **Step 1: Suite completa**

Run: `npm run check && npm test && npm run build`
Expected: todo en verde.

- [ ] **Step 2: Servidor de desarrollo en puerto propio**

Run (en segundo plano): `npx astro dev --port 4410`
Expected: sirve `http://localhost:4410/juegos/gomoku/`.

- [ ] **Step 3: Script CDP (Node ≥ 22 trae `WebSocket` global)**

Lanzar Chrome headless: `google-chrome --headless=new --remote-debugging-port=9333 --window-size=600,960 about:blank &` (o `chromium`). Crear `<scratchpad>/e2e-partida.mjs`:

```js
const base = 'http://localhost:4410/juegos/gomoku/';
const tabs = await (await fetch('http://localhost:9333/json')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0;
const pendientes = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) pendientes.get(m.id)(m.result);
};
const cdp = (method, params = {}) =>
  new Promise(r => {
    pendientes.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async expr =>
  (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))
    .result.value;
const esperar = ms => new Promise(r => setTimeout(r, ms));
const ir = async url => { await cdp('Page.navigate', { url }); await esperar(1500); };
const visible = sel => js(`(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden; })()`);
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`); if (!cond) process.exitCode = 1; };

await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 600, height: 960, deviceScaleFactor: 1.6, mobile: true });

// Partida limpia, modo local, reglas ya vistas.
await ir(base);
await js(`localStorage.clear(); localStorage.setItem('pencilgames:modo','local'); localStorage.setItem('pencilgames:reglas-vistas', JSON.stringify(['gomoku'])); localStorage.setItem('pencilgames:jugadores', JSON.stringify({1:'Ana',2:'Beto'}))`);
await ir(base);

// 5 jugadas.
for (const i of [0, 1, 2, 3, 4]) await js(`document.querySelector('.casilla[data-indice="${i}"]').click()`);
await esperar(500);
const antes = await js(`JSON.stringify({ celdas: [...document.querySelectorAll('.casilla')].map(c => c.textContent), turno: document.querySelector('.indicador-turno__prosa')?.textContent })`);
ok(await js(`localStorage.getItem('pencilgames:partida:gomoku') !== null`), 'se guardó la partida tras 5 jugadas');

// Recargar: debe aparecer el diálogo ANTES que reglas o modo.
await ir(base);
ok(await visible('#modal-continuar-partida'), 'aparece Continuar / Empezar de nuevo');
ok(!(await visible('#modal-instrucciones')), 'las reglas no se muestran antes');
ok(!(await visible('#modal-modo-juego')), 'el modal de modo no se muestra antes');

// Continuar.
await js(`document.getElementById('modal-continuar-si').click()`);
await esperar(500);
const despues = await js(`JSON.stringify({ celdas: [...document.querySelectorAll('.casilla')].map(c => c.textContent), turno: document.querySelector('.indicador-turno__prosa')?.textContent })`);
ok(antes === despues, 'tablero y turno idénticos tras Continuar');
ok(await js(`!document.getElementById('control-deshacer').disabled`), 'deshacer sigue disponible');

// Empezar de nuevo.
await ir(base);
await js(`document.getElementById('modal-continuar-no').click()`);
ok(await js(`localStorage.getItem('pencilgames:partida:gomoku') === null`), 'Empezar de nuevo borra la partida');
await esperar(300);
ok(await js(`[...document.querySelectorAll('.casilla')].every(c => c.textContent === '')`), 'tablero limpio');

// Terminar una partida (X: 0-1-2-3-4 en la fila 0; O: 9-10-11-12).
for (const i of [0, 9, 1, 10, 2, 11, 3, 12, 4]) await js(`document.querySelector('.casilla[data-indice="${i}"]').click()`);
await esperar(500);
await ir(base);
ok(!(await visible('#modal-continuar-partida')), 'tras terminar, recargar no ofrece continuar');

// Entrada de hace 25 h y entrada con v: 0.
for (const [etiqueta, entrada] of [
  ['25 h', { v: 1, ts: Date.now() - 25 * 3600e3, nombres: { 1: 'A', 2: 'B' }, snapshot: {}, pila: [] }],
  ['v: 0', { v: 0, ts: Date.now(), nombres: { 1: 'A', 2: 'B' }, snapshot: {}, pila: [] }],
]) {
  await js(`localStorage.setItem('pencilgames:partida:gomoku', ${JSON.stringify(JSON.stringify(entrada))})`);
  await ir(base);
  ok(!(await visible('#modal-continuar-partida')), `entrada de ${etiqueta} se ignora sin romper`);
}

// 960×600 horizontal: el diálogo cabe y los botones miden ≥ 56 px.
await cdp('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1.6, mobile: true });
await js(`localStorage.clear(); localStorage.setItem('pencilgames:modo','local'); localStorage.setItem('pencilgames:reglas-vistas', JSON.stringify(['gomoku']))`);
await ir(base);
await js(`document.querySelector('.casilla[data-indice="0"]').click()`);
await esperar(500);
await ir(base);
ok(await visible('#modal-continuar-partida'), '960×600: aparece el diálogo');
const medidas = JSON.parse(
  await js(`JSON.stringify(['modal-continuar-si','modal-continuar-no'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, alto: r.height, abajo: r.bottom, alturaVentana: innerHeight }; }))`)
);
for (const m of medidas) {
  ok(m.alto >= 56, `960×600: #${m.id} mide ${m.alto}px (≥ 56)`);
  ok(m.abajo <= m.alturaVentana, `960×600: #${m.id} no desborda la ventana`);
}

ws.close();
process.exit(process.exitCode ?? 0);
```

Run: `node <scratchpad>/e2e-partida.mjs`
Expected: todas las líneas `OK`, salida 0.

- [ ] **Step 4: Comprobar juegos de forma compuesta**

Con el mismo patrón (jugar, recargar, Continuar, comparar), repetir en **Batalla Naval** (tras la colocación y al menos un disparo, con el *handoff* pendiente) y **Puntos y cajas** (cerrando una caja para que `repiteTurno` quede activo). Expected: tras Continuar, el turno y la marca de «repite turno» coinciden con los previos. Anotar cualquier diferencia en vez de ajustarla en silencio.

- [ ] **Step 5: Modo remoto no ofrece nada**

Con una partida local guardada, abrir `…/juegos/gomoku/?sala=ABCDE`. Expected: no aparece el diálogo de Continuar (flujo de sala controla su arranque).

- [ ] **Step 6: Cerrar servidor y Chrome; marcar la spec**

Matar `astro dev` y Chrome headless. Marcar en `specs/06-persistir-la-partida.md` los 5 criterios de aceptación cumplidos (`- [x]`).

- [ ] **Step 7: Commit** (lo corre el usuario)

```
! git add specs/06-persistir-la-partida.md
! git commit -m "docs(spec06): criterios de aceptación verificados" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
