# Modo solitario contra el robot — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar modo solitario contra el robot con 3 niveles de dificultad (`Fácil`, `Medio`, `Difícil`) a 6 juegos iniciales (`tres-en-raya`, `puntos-y-cajas`, `obstruccion`, `nim`, `chomp`, `gomoku`), con descubrimiento y filtro en portada, Deshacer en 1 toque, alternancia de inicio en revanchas y persistencia.

**Architecture:** Un controlador puro (`src/lib/bot/controladorBot.ts`) conectado a `src/lib/gameSession.ts` orquesta los turnos del bot, pausas naturales, cadenas repetidas, cancelaciones y Deshacer sin engordar `gameSession.ts`. Cada juego compatible añade un módulo puro `src/games/<slug>/bot.ts`, conecta `elegirMovimientoBot` en una línea de su `Board.astro` y marca `minJugadores: 1` en su `.md`.

**Tech Stack:** Astro 7 + TypeScript 6 + CSS vanilla (cero dependencias nuevas), Vitest 5 (entorno `node` con stubs de `document`/`localStorage`), Playwright (Chromium escritorio/móvil).

**Spec:** `docs/superpowers/specs/2026-11-21-modo-solitario-bots-design.md` (contexto compartido: `specs/00-contexto-compartido.md`).

## Global Constraints

- Cero dependencias nuevas: solo Astro + CSS + TS vanilla.
- Todo texto visible en español, tuteando al niño.
- Zonas tocables ≥ 48 px (objetivo 56 px para botones de dificultad y casillas). Verificar a `600×960` y `960×600`.
- Sin colores fijos prohibidos (`#ddd`, `#b00020`, `#666`, `#bbb`, `fill/color: #fff`) en ningún `.astro` (`src/lib/sinColoresFijos.test.ts`); usar tokens `--color-*` de `src/layouts/BaseLayout.astro`.
- Respetar `prefers-reduced-motion: reduce` (retraso del bot `180 ms` en lugar de `500 ms`; transiciones/animaciones envueltas en media query).
- Todo acceso a `localStorage` en `try/catch` silencioso.
- Usar `alTerminarDeCargarScripts` o listeners registrados antes de `DOMContentLoaded` para eventos de arranque entre `<script type="module">` de Astro (issue #61).
- Presupuesto de cómputo por bot: `< 30 ms` síncrono.
- No romper ninguno de los otros 21 juegos ni los modos `local` y `remoto` existentes.

## Review Focus

Modos de fallo críticos que el diseño implica y que cada tarea verifica explícitamente con tests:

1. **No sobrescribir `pencilgames:jugadores` al restaurar una partida solitaria:** `alRestaurarPartida()` en `gameSession.ts` solo llama `savePlayerNames(nombres)` cuando `!guardada.solo`, para no contaminar los nombres locales de 2 jugadores con `'Robot'`. (Tarea 3)
2. **Separar `esRemoto()` (`canal !== null`) de `miAsiento !== null`:** en modo solitario `miAsiento` es `1` o `2`, pero NO es remoto; Deshacer y persistencia deben seguir activos en solitario y ocultos/desactivados solo en remoto. (Tarea 3)
3. **No apilar jugadas del bot en `pilaDeshacer`, pero sí emitir `'toque'`:** en `guardarParaDeshacer()`, `senales.marcar('toque')` corre antes de retornar si `controladorBot.estaAplicandoJugada()`. Así un solo clic en Deshacer revierte toda la respuesta/cadena del bot más la última jugada del niño. (Tarea 3)
4. **Marcador por identidad (no por asiento):** al alternar asientos en revanchas (`1 ↔ 2`), las victorias del niño siempre se acumulan en el slot 1 y las del robot en el slot 2 de la clave `${slug}:solo`, formateado siempre `Niño X · Robot Y`. (Tarea 3)
5. **Revancha vs Reiniciar:** «Revancha» (banner fin de partida) alterna `asientoHumano`; «↻ Reiniciar» (barra inferior) mantiene el `asientoHumano` actual. (Tarea 3)
6. **Juego sin bot con preferencia `'solo'` guardada:** abrir uno de los 21 juegos sin bot cuando `pencilgames:modo === 'solo'` muestra «¿Cómo van a jugar?» (solo Local / Por internet) sin borrar `'solo'` ni lanzar errores. (Tarea 5)
7. **Bot como Jugador 1 o Jugador 2:** todos los bots (especialmente `tres-en-raya` con `'X'|'O'`, `puntos-y-cajas` con turnos repetidos y `gomoku`) leen `state.currentPlayer` dinámicamente para funcionar abriendo o respondiendo. (Tareas 6–11)
8. **Chomp fórmula de mordisco exacto:** al comer `(row, col)` en escalera `(r0, r1, r2, r3)`, las filas `k >= row` pasan a `Math.min(r[k], col)` (no se borran a `0` si `col > 0`). (Tarea 8)
9. **Puntos y cajas negamax con turno extra:** al cerrar `k > 0` cajas el mismo jugador vuelve a mover (`+k + negamax(nextMask)`), sin cambiar signo; solo se cambia signo (`-negamax(nextMask)`) cuando `k === 0`. (Tarea 10)
10. **Gomoku sin copiar 81 casillas por nodo:** mutar copia local con colocar/deshacer en alfa-beta y evaluar líneas contiguas de longitud ≥ 5 para mantenerse `< 25 ms`. (Tarea 11)
11. **`e2e/seleccion.ts` conoce `'portada' | 'juegos' | 'remoto'`:** `e2e/solo.spec.ts` usa `test.skip(!suiteActiva('juegos'), ...)` para integrarse con `scripts/seleccionar-e2e.mjs`. (Tarea 12)

## File Structure

- **Crear:**
  - `src/lib/bot/tipos.ts`, `src/lib/bot/tipos.test.ts` — Tipos compartidos (`Dificultad`, `Rng`), constantes (`NOMBRE_BOT`, `DIFICULTAD_INFO`) y helper `elegirAlAzar`.
  - `src/lib/bot/controladorBot.ts`, `src/lib/bot/controladorBot.test.ts` — Orquestador de turnos del bot con timers, cancelación, epoch y defensa anti-bucle.
  - `src/components/ModalOpcionesSolo.astro` — Modal de cambio de dificultad y cambio de modo durante partida.
  - `src/games/tres-en-raya/bot.ts`, `src/games/tres-en-raya/bot.test.ts` — Bot 3×3 (minimax exacto en Difícil).
  - `src/games/nim/bot.ts`, `src/games/nim/bot.test.ts` — Bot XOR en `[1, 3, 5, 7]`.
  - `src/games/chomp/bot.ts`, `src/games/chomp/bot.test.ts` — Bot con solucionador memoizado 4×7.
  - `src/games/obstruccion/bot.ts`, `src/games/obstruccion/bot.test.ts` — Bot con alfa-beta en bitmask 6×6.
  - `src/games/puntos-y-cajas/bot.ts`, `src/games/puntos-y-cajas/bot.test.ts` — Bot con análisis de cadenas y negamax en fase final.
  - `src/games/gomoku/bot.ts`, `src/games/gomoku/bot.test.ts` — Bot 9×9 con poda por vecindad, heurística de patrones y alfa-beta.
  - `e2e/solo.spec.ts` — Suite Playwright de modo solitario, Deshacer, dificultad, revancha, persistencia y 600×960 / 960×600.
- **Modificar:**
  - `src/lib/entrada.ts`, `src/lib/entrada.test.ts` — `Modo` con `'solo'` y persistencia de dificultad.
  - `src/lib/partidaGuardada.ts`, `src/lib/partidaGuardada.test.ts` — Campo opcional `solo` validado.
  - `src/lib/turnIndicator.ts`, `src/lib/turnIndicator.test.ts` — Opción `textoEspera?: string` (`'pensando…'`).
  - `src/lib/gameSession.ts`, `src/lib/gameSession.test.ts` — Integración de `controladorBot`, Deshacer, revancha alternada, marcador por identidad y persistencia solitaria.
  - `src/lib/catalogo.ts`, `src/lib/catalogo.test.ts` — `ETIQUETA_SOLO`.
  - `src/lib/filtros.ts`, `src/lib/filtros.test.ts` — Filtro booleano `solo`.
  - `src/components/GameCard.astro`, `src/pages/index.astro` — Etiqueta `🤖 1 jugador` y grupo de filtros `Jugadores`.
  - `src/content/juegos/{tres-en-raya,puntos-y-cajas,obstruccion,nim,chomp,gomoku}.md` — `minJugadores: 1`.
  - `src/components/ModalModoJuego.astro`, `src/components/AccionesCabecera.astro`, `src/components/ModalInstrucciones.astro`, `src/components/ModalContinuarPartida.astro`, `src/pages/juegos/[slug].astro` — Selector de modo/dificultad al arranque y controles en partida.
  - `src/games/{tres-en-raya,nim,chomp,obstruccion,puntos-y-cajas,gomoku}/Board.astro` — Callback `elegirMovimientoBot`.
  - `e2e/portada.spec.ts` — Pruebas de etiqueta y filtro solitario en portada.

---

### Task 1: Tipos del bot y persistencia de modo, dificultad y partida

**Files:**
- Create: `src/lib/bot/tipos.ts`
- Create: `src/lib/bot/tipos.test.ts`
- Modify: `src/lib/entrada.ts:1-78`
- Modify: `src/lib/entrada.test.ts:109-148`
- Modify: `src/lib/partidaGuardada.ts:1-124`
- Modify: `src/lib/partidaGuardada.test.ts:1-145`

**Interfaces:**
- Consumes: `Player` de `src/lib/players.ts`.
- Produces:
  - `src/lib/bot/tipos.ts`: `Dificultad = 'facil' | 'medio' | 'dificil'`, `Rng = () => number`, `NOMBRE_BOT = 'Robot'`, `DIFICULTADES`, `DIFICULTAD_INFO`, `esDificultad(valor: unknown): valor is Dificultad`, `elegirAlAzar<T>(opciones: readonly T[], rng?: Rng): T`.
  - `src/lib/entrada.ts`: `Modo = 'solo' | 'local' | 'remoto'`, `getDificultadGuardada(): Dificultad`, `guardarDificultad(dificultad: Dificultad): void`.
  - `src/lib/partidaGuardada.ts`: `DatosPartidaSolo = { dificultad: Dificultad; asientoHumano: Player }`, campo opcional `solo?: DatosPartidaSolo` en `DatosPartida`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/bot/tipos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DIFICULTADES,
  DIFICULTAD_INFO,
  NOMBRE_BOT,
  elegirAlAzar,
  esDificultad,
} from './tipos';

describe('bot/tipos', () => {
  it('define las 3 dificultades con icono, texto y descripción', () => {
    expect(DIFICULTADES).toEqual(['facil', 'medio', 'dificil']);
    expect(NOMBRE_BOT).toBe('Robot');
    for (const d of DIFICULTADES) {
      expect(DIFICULTAD_INFO[d].icono).not.toBe('');
      expect(DIFICULTAD_INFO[d].texto).not.toBe('');
      expect(DIFICULTAD_INFO[d].descripcion).not.toBe('');
    }
  });

  it('esDificultad valida solo los 3 niveles permitidos', () => {
    expect(esDificultad('facil')).toBe(true);
    expect(esDificultad('medio')).toBe(true);
    expect(esDificultad('dificil')).toBe(true);
    expect(esDificultad('imposible')).toBe(false);
    expect(esDificultad(null)).toBe(false);
    expect(esDificultad(1)).toBe(false);
  });

  it('elegirAlAzar usa el rng inyectado de forma determinista y acotada', () => {
    const opciones = ['a', 'b', 'c'] as const;
    expect(elegirAlAzar(opciones, () => 0)).toBe('a');
    expect(elegirAlAzar(opciones, () => 0.5)).toBe('b');
    expect(elegirAlAzar(opciones, () => 0.9999)).toBe('c');
    expect(elegirAlAzar(opciones, () => 1)).toBe('c');
  });

  it('elegirAlAzar lanza si recibe una lista vacía', () => {
    expect(() => elegirAlAzar([])).toThrow();
  });
});
```

Ampliar `src/lib/entrada.test.ts`: actualizar el import superior de `./entrada` para incluir `getDificultadGuardada` y `guardarDificultad`, añadir un test para `'solo'` dentro de `describe('modo guardado', ...)`, y añadir el bloque `describe('dificultad guardada', ...)`:

```ts
import {
  getModoGuardado,
  guardarModo,
  getDificultadGuardada,
  guardarDificultad,
  alTerminarDeCargarScripts,
  haVistoReglas,
  marcarReglasVistas,
  olvidarModo,
  olvidarReglasVistas,
} from './entrada';
```

```ts
  it('guarda y vuelve a leer el modo solo', () => {
    guardarModo('solo');
    expect(getModoGuardado()).toBe('solo');
  });
```

```ts
describe('dificultad guardada', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, devuelve facil por defecto', () => {
    expect(getDificultadGuardada()).toBe('facil');
  });

  it('guarda y vuelve a leer facil, medio y dificil', () => {
    for (const nivel of ['facil', 'medio', 'dificil'] as const) {
      guardarDificultad(nivel);
      expect(getDificultadGuardada()).toBe(nivel);
    }
  });

  it('si el valor guardado es inválido, devuelve facil', () => {
    localStorage.setItem('pencilgames:dificultad', 'extremo');
    expect(getDificultadGuardada()).toBe('facil');
  });

  it('si localStorage lanza, no rompe ni al leer ni al guardar', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('sin acceso');
      },
      setItem: () => {
        throw new Error('cuota');
      },
    } as unknown as Storage);
    expect(() => guardarDificultad('dificil')).not.toThrow();
    expect(getDificultadGuardada()).toBe('facil');
  });
});
```

Ampliar `src/lib/partidaGuardada.test.ts` dentro de `describe('partidaGuardada', ...)`:

```ts
  it('conserva los datos de modo solitario cuando se incluyen', () => {
    const solo = { dificultad: 'medio' as const, asientoHumano: 2 as const };
    guardarPartida('gomoku', { ...DATOS, solo }, T0);
    expect(leerPartida('gomoku', T0 + 1000)).toEqual({ v: 1, ts: T0, ...DATOS, solo });
  });

  it('descarta y borra entradas con campo solo mal formado', () => {
    const conSoloInvalido = [
      JSON.stringify({ v: 1, ts: T0, ...DATOS, solo: null }),
      JSON.stringify({ v: 1, ts: T0, ...DATOS, solo: { dificultad: 'brutal', asientoHumano: 1 } }),
      JSON.stringify({ v: 1, ts: T0, ...DATOS, solo: { dificultad: 'facil', asientoHumano: 3 } }),
    ];
    for (const raw of conSoloInvalido) {
      storage.setItem(CLAVE, raw);
      expect(leerPartida('gomoku', T0)).toBeNull();
      expect(storage.getItem(CLAVE)).toBeNull();
    }
  });
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `npx vitest run src/lib/bot/tipos.test.ts src/lib/entrada.test.ts src/lib/partidaGuardada.test.ts`
Expected: FAIL — `src/lib/bot/tipos` no existe y las nuevas funciones no están definidas en `entrada.ts` ni validadas en `partidaGuardada.ts`.

- [ ] **Step 3: Implementar `tipos.ts`, `entrada.ts` y `partidaGuardada.ts`**

Crear `src/lib/bot/tipos.ts`:

```ts
export type Dificultad = 'facil' | 'medio' | 'dificil';
export type Rng = () => number;

export const NOMBRE_BOT = 'Robot';

export const DIFICULTADES: readonly Dificultad[] = ['facil', 'medio', 'dificil'];

export const DIFICULTAD_INFO: Record<
  Dificultad,
  { icono: string; texto: string; descripcion: string }
> = {
  facil: { icono: '🌱', texto: 'Fácil', descripcion: 'Para aprender' },
  medio: { icono: '🎯', texto: 'Medio', descripcion: 'Partida reñida' },
  dificil: { icono: '🔥', texto: 'Difícil', descripcion: 'Todo un reto' },
};

export function esDificultad(valor: unknown): valor is Dificultad {
  return valor === 'facil' || valor === 'medio' || valor === 'dificil';
}

export function elegirAlAzar<T>(opciones: readonly T[], rng: Rng = Math.random): T {
  if (opciones.length === 0) {
    throw new Error('No se puede elegir al azar de una lista vacía.');
  }
  const indice = Math.min(opciones.length - 1, Math.max(0, Math.floor(rng() * opciones.length)));
  return opciones[indice];
}
```

Modificar `src/lib/entrada.ts`: importar `esDificultad, type Dificultad` de `./bot/tipos`, añadir `DIFICULTAD_KEY = 'pencilgames:dificultad'`, extender `Modo`, actualizar `getModoGuardado()` y añadir `getDificultadGuardada()` / `guardarDificultad()`:

```ts
import { esDificultad, type Dificultad } from './bot/tipos';

// Persistencia del recorrido de entrada a un juego: qué reglas ya se leyeron,
// qué modo de juego (solo/local/remoto) y qué dificultad se eligió. Ver
// specs/03-reducir-friccion-de-entrada.md. Mismo patrón de try/catch
// silencioso que players.ts: si localStorage no está disponible (modo
// privado, cuota llena), el flujo de hoy (mostrar todo) sigue funcionando.

const REGLAS_VISTAS_KEY = 'pencilgames:reglas-vistas';
const MODO_KEY = 'pencilgames:modo';
const DIFICULTAD_KEY = 'pencilgames:dificultad';

export type Modo = 'solo' | 'local' | 'remoto';
```

En `getModoGuardado` (líneas 54-61 de `src/lib/entrada.ts`):

```ts
export function getModoGuardado(): Modo | null {
  try {
    const valor = localStorage.getItem(MODO_KEY);
    return valor === 'solo' || valor === 'local' || valor === 'remoto' ? valor : null;
  } catch {
    return null;
  }
}
```

Después de `olvidarModo()` en `src/lib/entrada.ts`, añadir:

```ts
export function getDificultadGuardada(): Dificultad {
  try {
    const valor = localStorage.getItem(DIFICULTAD_KEY);
    return esDificultad(valor) ? valor : 'facil';
  } catch {
    return 'facil';
  }
}

export function guardarDificultad(dificultad: Dificultad): void {
  try {
    localStorage.setItem(DIFICULTAD_KEY, dificultad);
  } catch {
    // localStorage no disponible: no persiste, no rompe el flujo.
  }
}
```

Modificar `src/lib/partidaGuardada.ts`: importar `Player` de `./players` y `esDificultad, type Dificultad` de `./bot/tipos`; añadir `DatosPartidaSolo` y `solo?: DatosPartidaSolo` en `DatosPartida`, y validarlo en `esEntradaValida`:

```ts
import type { Player, PlayerNames } from './players';
import { esDificultad, type Dificultad } from './bot/tipos';
```

```ts
export interface DatosPartidaSolo {
  dificultad: Dificultad;
  asientoHumano: Player;
}

export interface DatosPartida {
  nombres: PlayerNames;
  snapshot: unknown;
  pila: unknown[];
  // La pila perdió jugadas antiguas: el snapshot más viejo no es el tablero
  // inicial. Opcional para no invalidar entradas anteriores.
  pilaRecortada?: boolean;
  solo?: DatosPartidaSolo;
}
```

En `esEntradaValida` (líneas 80-89 de `src/lib/partidaGuardada.ts`):

```ts
function esEntradaValida(parsed: unknown): parsed is PartidaGuardada {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const p = parsed as Record<string, unknown>;
  if (p.v !== VERSION_PARTIDA) return false;
  if (typeof p.ts !== 'number' || !Number.isFinite(p.ts)) return false;
  const nombres = p.nombres as Record<string, unknown> | null | undefined;
  if (typeof nombres?.[1] !== 'string' || typeof nombres?.[2] !== 'string') return false;
  if (!Array.isArray(p.pila)) return false;
  if (typeof p.snapshot !== 'object' || p.snapshot === null) return false;
  if ('solo' in p && p.solo !== undefined) {
    if (typeof p.solo !== 'object' || p.solo === null) return false;
    const solo = p.solo as Record<string, unknown>;
    if (!esDificultad(solo.dificultad)) return false;
    if (solo.asientoHumano !== 1 && solo.asientoHumano !== 2) return false;
  }
  return true;
}
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npx vitest run src/lib/bot/tipos.test.ts src/lib/entrada.test.ts src/lib/partidaGuardada.test.ts`
Expected: PASS — todos los tests de los 3 archivos pasan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bot/tipos.ts src/lib/bot/tipos.test.ts src/lib/entrada.ts src/lib/entrada.test.ts src/lib/partidaGuardada.ts src/lib/partidaGuardada.test.ts
git commit -m "feat(solo): tipos del bot y persistencia de modo y dificultad"
```

---

### Task 2: Controlador puro del bot y texto de espera en indicador de turno

**Files:**
- Create: `src/lib/bot/controladorBot.ts`
- Create: `src/lib/bot/controladorBot.test.ts`
- Modify: `src/lib/turnIndicator.ts:7-64,90-204`
- Modify: `src/lib/turnIndicator.test.ts:106-125`

**Interfaces:**
- Consumes: `Dificultad` de `src/lib/bot/tipos.ts`, `Player` de `src/lib/players.ts`, `codificarEstado` de `src/lib/partidaGuardada.ts`.
- Produces:
  - `src/lib/bot/controladorBot.ts`: `RETRASO_BOT_MS = 500`, `RETRASO_BOT_REDUCIDO_MS = 180`, interfaces `ControladorBotConfig<TMovimiento>` y `ControladorBot`, función `crearControladorBot<TMovimiento>(config)`.
  - `src/lib/turnIndicator.ts`: campo opcional `textoEspera?: string` en `TurnIndicatorOptions`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/bot/controladorBot.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RETRASO_BOT_MS,
  RETRASO_BOT_REDUCIDO_MS,
  crearControladorBot,
} from './controladorBot';

describe('controladorBot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no programa jugadas mientras está desactivado o en el turno del humano', () => {
    const elegirMovimiento = vi.fn(() => 3);
    const aplicarMovimiento = vi.fn();
    const ctrl = crearControladorBot<number>({
      elegirMovimiento,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });

    ctrl.alCambiarTurno(2);
    vi.advanceTimersByTime(1000);
    expect(elegirMovimiento).not.toHaveBeenCalled();

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(1);
    vi.advanceTimersByTime(1000);
    expect(elegirMovimiento).not.toHaveBeenCalled();
    expect(aplicarMovimiento).not.toHaveBeenCalled();
  });

  it('espera 500 ms en modo normal y aplica el movimiento elegido en turno del bot', () => {
    let dentroDeAplicar = false;
    const elegirMovimiento = vi.fn(() => 4);
    const aplicarMovimiento = vi.fn(() => {
      dentroDeAplicar = ctrl.estaAplicandoJugada();
    });

    const ctrl = crearControladorBot<number>({
      elegirMovimiento,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });

    ctrl.activar('medio', 1);
    ctrl.alCambiarTurno(2);

    vi.advanceTimersByTime(RETRASO_BOT_MS - 1);
    expect(aplicarMovimiento).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(elegirMovimiento).toHaveBeenCalledWith('medio');
    expect(aplicarMovimiento).toHaveBeenCalledWith(4);
    expect(dentroDeAplicar).toBe(true);
    expect(ctrl.estaAplicandoJugada()).toBe(false);
  });

  it('usa 180 ms cuando prefers-reduced-motion está activo', () => {
    const aplicarMovimiento = vi.fn();
    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => 2,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => true,
    });

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(2);

    vi.advanceTimersByTime(RETRASO_BOT_REDUCIDO_MS - 1);
    expect(aplicarMovimiento).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aplicarMovimiento).toHaveBeenCalledWith(2);
  });

  it('soporta cadenas de turnos repetidos (como Puntos y cajas) jugada por jugada', () => {
    let paso = 0;
    const jugadas = [10, 11];
    const aplicadas: number[] = [];

    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => jugadas[paso++] ?? null,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento: mov => {
        aplicadas.push(mov);
        // El primer movimiento cierra caja y mantiene al bot (jugador 2); el segundo pasa a jugador 1.
        ctrl.alCambiarTurno(aplicadas.length === 1 ? 2 : 1);
      },
      obtenerSnapshot: () => ({ paso, aplicadas }),
      esMovimientoReducido: () => false,
    });

    ctrl.activar('dificil', 1);
    ctrl.alCambiarTurno(2);

    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicadas).toEqual([10]);

    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicadas).toEqual([10, 11]);

    vi.advanceTimersByTime(RETRASO_BOT_MS * 2);
    expect(aplicadas).toEqual([10, 11]);
  });

  it('cancelarTurno y desactivar abortan el timer pendiente', () => {
    const aplicarMovimiento = vi.fn();
    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => 1,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(2);
    vi.advanceTimersByTime(250);
    ctrl.cancelarTurno();
    vi.advanceTimersByTime(1000);
    expect(aplicarMovimiento).not.toHaveBeenCalled();

    ctrl.alCambiarTurno(2);
    ctrl.desactivar();
    vi.advanceTimersByTime(1000);
    expect(aplicarMovimiento).not.toHaveBeenCalled();
  });

  it('si el bot devuelve null, payload inválido o lanza, avisa en consola y no aplica ni entra en bucle', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const aplicarMovimiento = vi.fn();

    const ctrlNull = crearControladorBot<number>({
      elegirMovimiento: () => null,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });
    ctrlNull.activar('facil', 1);
    ctrlNull.alCambiarTurno(2);
    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicarMovimiento).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    const ctrlInvalido = crearControladorBot<number>({
      elegirMovimiento: () => 'malo' as unknown as number,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });
    ctrlInvalido.activar('facil', 1);
    ctrlInvalido.alCambiarTurno(2);
    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicarMovimiento).not.toHaveBeenCalled();

    const ctrlError = crearControladorBot<number>({
      elegirMovimiento: () => {
        throw new Error('fallo interno');
      },
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });
    ctrlError.activar('facil', 1);
    expect(() => {
      ctrlError.alCambiarTurno(2);
      vi.advanceTimersByTime(RETRASO_BOT_MS);
    }).not.toThrow();
    expect(aplicarMovimiento).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('defensa anti-bucle: si el movimiento no altera el snapshot y el turno vuelve al bot, se detiene', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const estadoFijo = { turno: 2 };
    let intentos = 0;

    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => 0,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento: () => {
        intentos++;
        ctrl.alCambiarTurno(2);
      },
      obtenerSnapshot: () => estadoFijo,
      esMovimientoReducido: () => false,
    });

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(2);
    vi.advanceTimersByTime(RETRASO_BOT_MS * 5);

    expect(intentos).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('alternarAsiento cambia entre 1 y 2 y setDificultad actualiza la dificultad al vuelo', () => {
    const elegirMovimiento = vi.fn(() => 0);
    const ctrl = crearControladorBot<number>({
      elegirMovimiento,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento: vi.fn(),
      esMovimientoReducido: () => false,
    });

    ctrl.activar('facil', 1);
    expect(ctrl.getAsientoHumano()).toBe(1);
    expect(ctrl.getAsientoBot()).toBe(2);

    expect(ctrl.alternarAsiento()).toBe(2);
    expect(ctrl.getAsientoHumano()).toBe(2);
    expect(ctrl.getAsientoBot()).toBe(1);

    ctrl.setDificultad('dificil');
    expect(ctrl.getDificultad()).toBe('dificil');
    ctrl.alCambiarTurno(1);
    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(elegirMovimiento).toHaveBeenCalledWith('dificil');
  });
});
```

Añadir test en `src/lib/turnIndicator.test.ts` después del test `'remoto, turno del rival: la frase nombra al rival + "esperando…"'`:

```ts
  it('acepta textoEspera personalizado (modo solitario: "pensando…")', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 2,
      fichas: { 1: { nombre: 'Ana' }, 2: { nombre: 'Robot' } },
      miAsiento: 1,
      textoEspera: 'pensando…',
    });

    expect(container.querySelector<MockElement>('.indicador-turno__espera')!.textContent).toBe(
      'pensando…'
    );
    expect(container.querySelector<MockElement>('.indicador-turno__prosa')!.textContent).toBe(
      'Turno de Robot, pensando'
    );
  });
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `npx vitest run src/lib/bot/controladorBot.test.ts src/lib/turnIndicator.test.ts`
Expected: FAIL — `controladorBot.ts` no existe y `turnIndicator.ts` ignora `textoEspera`.

- [ ] **Step 3: Implementar `src/lib/bot/controladorBot.ts` y actualizar `src/lib/turnIndicator.ts`**

Crear `src/lib/bot/controladorBot.ts`:

```ts
import { codificarEstado } from '../partidaGuardada';
import type { Player } from '../players';
import type { Dificultad } from './tipos';

export const RETRASO_BOT_MS = 500;
export const RETRASO_BOT_REDUCIDO_MS = 180;

export interface ControladorBotConfig<TMovimiento> {
  elegirMovimiento: (dificultad: Dificultad) => TMovimiento | null;
  validarMovimiento: (payload: unknown) => payload is TMovimiento;
  aplicarMovimiento: (movimiento: TMovimiento) => void;
  obtenerSnapshot?: () => unknown;
  esMovimientoReducido?: () => boolean;
}

export interface ControladorBot {
  activar: (dificultad: Dificultad, asientoHumano?: Player) => void;
  desactivar: () => void;
  setDificultad: (dificultad: Dificultad) => void;
  alternarAsiento: () => Player;
  alCambiarTurno: (jugadorActual: Player) => void;
  cancelarTurno: () => void;
  estaActivo: () => boolean;
  estaAplicandoJugada: () => boolean;
  getDificultad: () => Dificultad;
  getAsientoHumano: () => Player;
  getAsientoBot: () => Player;
}

function defectoMovimientoReducido(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function huellaSnapshot(obtenerSnapshot?: () => unknown): string | null {
  if (!obtenerSnapshot) return null;
  try {
    return codificarEstado(obtenerSnapshot());
  } catch {
    return null;
  }
}

export function crearControladorBot<TMovimiento>(
  config: ControladorBotConfig<TMovimiento>
): ControladorBot {
  let activo = false;
  let dificultad: Dificultad = 'facil';
  let asientoHumano: Player = 1;
  let aplicandoJugada = false;
  let timerPendiente: ReturnType<typeof setTimeout> | null = null;
  let epoch = 0;
  let bloqueadoPorSinCambio = false;

  const esMovimientoReducido = config.esMovimientoReducido ?? defectoMovimientoReducido;

  function cancelarTurno(): void {
    epoch++;
    if (timerPendiente !== null) {
      clearTimeout(timerPendiente);
      timerPendiente = null;
    }
  }

  function activar(nuevaDificultad: Dificultad, nuevoAsientoHumano: Player = 1): void {
    cancelarTurno();
    activo = true;
    dificultad = nuevaDificultad;
    asientoHumano = nuevoAsientoHumano;
    bloqueadoPorSinCambio = false;
  }

  function desactivar(): void {
    cancelarTurno();
    activo = false;
    aplicandoJugada = false;
    bloqueadoPorSinCambio = false;
  }

  function setDificultad(nuevaDificultad: Dificultad): void {
    dificultad = nuevaDificultad;
  }

  function alternarAsiento(): Player {
    asientoHumano = asientoHumano === 1 ? 2 : 1;
    bloqueadoPorSinCambio = false;
    return asientoHumano;
  }

  function getAsientoBot(): Player {
    return asientoHumano === 1 ? 2 : 1;
  }

  function ejecutarJugada(epochEsperado: number): void {
    timerPendiente = null;
    if (!activo || epoch !== epochEsperado) return;

    let movimiento: TMovimiento | null;
    try {
      movimiento = config.elegirMovimiento(dificultad);
    } catch (error) {
      console.warn('Error al calcular la jugada del bot:', error);
      return;
    }

    if (movimiento === null || !config.validarMovimiento(movimiento)) {
      console.warn('El bot devolvió un movimiento inválido:', movimiento);
      return;
    }

    const antes = huellaSnapshot(config.obtenerSnapshot);
    aplicandoJugada = true;
    try {
      config.aplicarMovimiento(movimiento);
    } finally {
      aplicandoJugada = false;
    }

    if (antes !== null && huellaSnapshot(config.obtenerSnapshot) === antes) {
      bloqueadoPorSinCambio = true;
      cancelarTurno();
      console.warn('El movimiento del bot no modificó el estado; se detiene para evitar bucle.');
    }
  }

  function alCambiarTurno(jugadorActual: Player): void {
    if (!activo || jugadorActual === asientoHumano) {
      bloqueadoPorSinCambio = false;
      cancelarTurno();
      return;
    }

    if (bloqueadoPorSinCambio) {
      bloqueadoPorSinCambio = false;
      return;
    }

    cancelarTurno();
    const epochActual = epoch;
    const retraso = esMovimientoReducido() ? RETRASO_BOT_REDUCIDO_MS : RETRASO_BOT_MS;
    timerPendiente = setTimeout(() => ejecutarJugada(epochActual), retraso);
  }

  return {
    activar,
    desactivar,
    setDificultad,
    alternarAsiento,
    alCambiarTurno,
    cancelarTurno,
    estaActivo: () => activo,
    estaAplicandoJugada: () => aplicandoJugada,
    getDificultad: () => dificultad,
    getAsientoHumano: () => asientoHumano,
    getAsientoBot,
  };
}
```

Actualizar `src/lib/turnIndicator.ts`: añadir `textoEspera?: string` en `TurnIndicatorOptions`, pasarlo a `prosaAccesible`, y usarlo en `.indicador-turno__espera`:

```ts
export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  fichas: Record<1 | 2, FichaJugador>;
  miAsiento?: 1 | 2 | null;
  detalle?: string;
  repiteTurno?: boolean;
  motivoRepeticion?: string;
  estadoReconexion?: 'propia' | 'rival' | 'reconectando' | string;
  textoEspera?: string;
}
```

```ts
function prosaAccesible(
  jugador: 1 | 2,
  fichas: Record<1 | 2, FichaJugador>,
  miAsiento: 1 | 2 | null | undefined,
  detalle: string | undefined,
  repiteTurno: boolean | undefined,
  motivoRepeticion: string | undefined,
  estadoReconexion?: string,
  textoEspera?: string
): string {
  const partes: string[] = [];
  if (estadoReconexion) {
    partes.push(textoReconexion(estadoReconexion));
  }

  const nombre = fichas[jugador].nombre;
  const sufijoEspera = (textoEspera ?? 'esperando').replace(/[….]+$/, '');
  let base: string;
  if (miAsiento == null) base = `Turno de ${nombre}`;
  else if (miAsiento === jugador) base = `Te toca, eres ${nombre}`;
  else base = `Turno de ${nombre}, ${sufijoEspera}`;

  const esMio = miAsiento == null || miAsiento === jugador;
  if (repiteTurno && esMio && !estadoReconexion) partes.push(motivoRepeticion || '¡Vuelves a jugar!');
  partes.push(base);
  if (detalle) partes.push(detalle);
  return partes.join('. ');
}
```

En `renderTurnIndicator` (desestructurar `textoEspera` en los parámetros):

```ts
  container.querySelector<HTMLElement>('.indicador-turno__espera')!.textContent = esperando
    ? (textoEspera ?? 'esperando…')
    : '';

  // R6 — reescribir el mismo texto en una región viva puede reanunciarlo.
  const prosaEl = container.querySelector<HTMLElement>('.indicador-turno__prosa')!;
  const prosa = prosaAccesible(
    jugador,
    fichas,
    miAsiento,
    detalle,
    repiteTurno,
    motivoRepeticion,
    estadoReconexion,
    textoEspera
  );
  if (prosaEl.textContent !== prosa) prosaEl.textContent = prosa;
```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npx vitest run src/lib/bot/controladorBot.test.ts src/lib/turnIndicator.test.ts`
Expected: PASS — todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bot/controladorBot.ts src/lib/bot/controladorBot.test.ts src/lib/turnIndicator.ts src/lib/turnIndicator.test.ts
git commit -m "feat(solo): controlador puro de turnos del bot y texto pensando en indicador"
```

---

### Task 3: Integración del modo solitario en `src/lib/gameSession.ts`

**Files:**
- Modify: `src/lib/gameSession.ts:1-851`
- Modify: `src/lib/gameSession.test.ts` (añadir `describe('modo solitario', ...)` antes del cierre o tras `senales de feedback`)

**Interfaces:**
- Consumes: `crearControladorBot`, `ControladorBot`, `Dificultad`, `NOMBRE_BOT`, `esDificultad` de `./bot/*`; `getMiNombre` de `./miNombre`; `DatosPartida.solo` de `./partidaGuardada`.
- Produces:
  - `GameSessionConfig<TMovimiento>.elegirMovimientoBot?: (dificultad: Dificultad) => TMovimiento | null`.
  - Soporte completo para eventos `modo-elegido-solo` (`{ detail: { dificultad: Dificultad, asientoHumano?: Player, restaurando?: boolean } }`), `dificultad-solo-cambiada` (`{ detail: { dificultad: Dificultad } }`) y `modo-elegido-local`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `src/lib/gameSession.test.ts`:

```ts
describe('gameSession — modo solitario contra el robot', () => {
  let mockDoc: MockDocument;
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDoc = new MockDocument();
    memoryStorage = new MemoryStorage();
    vi.stubGlobal('document', mockDoc as unknown as Document);
    vi.stubGlobal('localStorage', memoryStorage as unknown as Storage);
    vi.stubGlobal('location', { pathname: '/juegos/tres-en-raya/', reload: vi.fn() });
    mockDoc.getElementById('banner-ganador')!.hidden = true;
    vi.mocked(emitirSenal).mockClear();
    vi.mocked(lanzarConfeti).mockClear();
    vi.mocked(retirarConfeti).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function crearJuegoSimulado() {
    let estado = { turno: 1 as 1 | 2, jugadas: [] as number[], ganador: null as 1 | 2 | null };
    const jugar = (mov: number) => {
      estado = {
        turno: estado.turno === 1 ? 2 : 1,
        jugadas: [...estado.jugadas, mov],
        ganador: estado.ganador,
      };
      render();
    };
    const elegirBot = vi.fn(() => 99);
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p): p is number => typeof p === 'number',
      onMovimientoRemoto: mov => {
        sesion.guardarParaDeshacer(estado);
        jugar(mov);
      },
      onAplicarReinicio: () => {
        estado = { turno: 1, jugadas: [], ganador: null };
        render();
      },
      onRender: () => render(),
      onDeshacer: snap => {
        estado = snap as typeof estado;
        render();
      },
      obtenerSnapshot: () => estado,
      elegirMovimientoBot: elegirBot,
    });

    function render() {
      if (estado.ganador) {
        sesion.mostrarFinDeJuego({
          titulo: `🎉 ¡Ganó ${sesion.nombres[estado.ganador]}!`,
          detalle: 'Fin de prueba',
          ganador: estado.ganador,
        });
      } else {
        sesion.mostrarTurno({ jugador: estado.turno });
      }
    }

    return {
      sesion,
      elegirBot,
      getEstado: () => estado,
      setGanador: (g: 1 | 2 | null) => {
        estado.ganador = g;
        render();
      },
      jugarHumano: (mov: number) => {
        sesion.guardarParaDeshacer(estado);
        jugar(mov);
      },
    };
  }

  it('activa el modo solitario con asiento 1 para el niño y Robot en asiento 2 usando getMiNombre()', () => {
    memoryStorage.setItem('pencilgames:mi-nombre', 'Lucía');
    const h = crearJuegoSimulado();

    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', { detail: { dificultad: 'facil' } })
    );

    expect(h.sesion.miAsiento).toBe(1);
    expect(h.sesion.nombres).toEqual({ 1: 'Lucía', 2: 'Robot' });
    expect(h.sesion.esMiTurno(1)).toBe(true);
    expect(h.sesion.esMiTurno(2)).toBe(false);
    expect(mockDoc.getElementById('control-deshacer')!.hidden).toBe(false);
    expect(mockDoc.getElementById('marcador-partida')!.textContent).toBe('Lucía 0 · Robot 0');
    h.sesion.destruir();
  });

  it('responde automáticamente tras la pausa mostrando "pensando…" y Deshacer revierte humano + bot en un toque', () => {
    const h = crearJuegoSimulado();
    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', { detail: { dificultad: 'facil' } })
    );

    h.jugarHumano(1);
    const indicador = mockDoc.getElementById('indicador-turno')!;
    expect(indicador.textContent).toContain('pensando…');

    vi.advanceTimersByTime(500);
    expect(h.elegirBot).toHaveBeenCalledWith('facil');
    expect(h.getEstado().jugadas).toEqual([1, 99]);
    expect(h.getEstado().turno).toBe(1);

    // Deshacer debe volver al estado antes de la jugada del humano en un solo clic.
    const deshacer = mockDoc.getElementById('control-deshacer')!;
    expect(deshacer.disabled).toBe(false);
    deshacer.dispatchEvent(new Event('click'));
    expect(h.getEstado().jugadas).toEqual([]);
    expect(h.getEstado().turno).toBe(1);
    expect(deshacer.disabled).toBe(true);
    h.sesion.destruir();
  });

  it('deshacer mientras el robot está pensando cancela su jugada pendiente', () => {
    const h = crearJuegoSimulado();
    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', { detail: { dificultad: 'medio' } })
    );

    h.jugarHumano(5);
    vi.advanceTimersByTime(200);
    mockDoc.getElementById('control-deshacer')!.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(1000);

    expect(h.elegirBot).not.toHaveBeenCalled();
    expect(h.getEstado().jugadas).toEqual([]);
    h.sesion.destruir();
  });

  it('al pulsar Revancha alterna el asiento inicial y mantiene el marcador por identidad sin cruzar puntos', () => {
    const h = crearJuegoSimulado();
    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', { detail: { dificultad: 'facil' } })
    );

    // Partida 1: gana humano (asiento 1) -> confeti y victoria
    h.jugarHumano(1);
    h.setGanador(1);
    expect(lanzarConfeti).toHaveBeenCalledTimes(1);
    expect(mockDoc.getElementById('marcador-partida')!.textContent).toBe('Jugador 1 1 · Robot 0');

    // Pulsa Revancha en el banner -> ahora el humano pasa a asiento 2 y el Robot abre (asiento 1)
    const btnRevancha = mockDoc
      .getElementById('banner-ganador')!
      .querySelector<MockElement>('.banner-ganador__reiniciar')!;
    btnRevancha.dispatchEvent(new Event('click'));

    expect(h.sesion.miAsiento).toBe(2);
    expect(h.sesion.nombres).toEqual({ 1: 'Robot', 2: 'Jugador 1' });
    // El robot abre automáticamente: Deshacer sigue deshabilitado hasta que el niño juegue.
    expect(mockDoc.getElementById('control-deshacer')!.disabled).toBe(true);
    vi.advanceTimersByTime(500);
    expect(h.getEstado().jugadas).toEqual([99]);
    expect(h.getEstado().turno).toBe(2);

    // Partida 2: gana Robot (ahora asiento 1) -> sin confeti, título amable, marcador 1-1
    vi.mocked(lanzarConfeti).mockClear();
    h.setGanador(1);
    expect(lanzarConfeti).not.toHaveBeenCalled();
    expect(
      mockDoc
        .getElementById('banner-ganador')!
        .querySelector<MockElement>('.banner-ganador__titulo')!.textContent
    ).toBe('🤖 Ganó Robot');
    expect(
      mockDoc
        .getElementById('banner-ganador')!
        .querySelector<MockElement>('.banner-ganador__detalle')!.textContent
    ).toBe('Fin de prueba');
    expect(mockDoc.getElementById('marcador-partida')!.textContent).toBe('Jugador 1 1 · Robot 1');

    // Reiniciar desde barra inferior mantiene el asiento actual (humano = 2)
    h.sesion.reiniciar();
    expect(h.sesion.miAsiento).toBe(2);
    h.sesion.destruir();
  });

  it('cambiar dificultad en caliente aplica en la siguiente jugada sin reiniciar el tablero', () => {
    const h = crearJuegoSimulado();
    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', { detail: { dificultad: 'facil' } })
    );
    h.jugarHumano(1);
    vi.advanceTimersByTime(500);

    document.dispatchEvent(
      new CustomEvent('dificultad-solo-cambiada', { detail: { dificultad: 'dificil' } })
    );
    expect(h.getEstado().jugadas).toEqual([1, 99]);

    h.jugarHumano(2);
    vi.advanceTimersByTime(500);
    expect(h.elegirBot).toHaveBeenLastCalledWith('dificil');
    h.sesion.destruir();
  });

  it('persiste y restaura partida solitaria sin sobrescribir pencilgames:jugadores', () => {
    memoryStorage.setItem(
      'pencilgames:jugadores',
      JSON.stringify({ 1: 'Ana', 2: 'Beto' })
    );
    const h1 = crearJuegoSimulado();
    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', { detail: { dificultad: 'medio' } })
    );
    h1.jugarHumano(4);
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(300); // debounce de guardado
    h1.sesion.destruir();

    const guardada = leerPartida('tres-en-raya')!;
    expect(guardada.solo).toEqual({ dificultad: 'medio', asientoHumano: 1 });

    // Nueva sesión simula recarga + clic en Continuar
    const h2 = crearJuegoSimulado();
    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', {
        detail: {
          dificultad: guardada.solo!.dificultad,
          asientoHumano: guardada.solo!.asientoHumano,
          restaurando: true,
        },
      })
    );
    document.dispatchEvent(new Event('partida-restaurar'));

    expect(h2.getEstado().jugadas).toEqual([4, 99]);
    expect(h2.sesion.miAsiento).toBe(1);
    // Los nombres familiares de 2 jugadores no se contaminaron con "Robot".
    expect(JSON.parse(memoryStorage.getItem('pencilgames:jugadores')!)).toEqual({
      1: 'Ana',
      2: 'Beto',
    });
    h2.sesion.destruir();
  });

  it('pasar de modo solitario a local o remoto desactiva el bot limpiamente', () => {
    const h = crearJuegoSimulado();
    document.dispatchEvent(
      new CustomEvent('modo-elegido-solo', { detail: { dificultad: 'facil' } })
    );
    h.jugarHumano(1);
    document.dispatchEvent(new CustomEvent('modo-elegido-local'));
    vi.advanceTimersByTime(1000);

    expect(h.elegirBot).not.toHaveBeenCalled();
    expect(h.sesion.miAsiento).toBeNull();
    expect(h.sesion.nombres).toEqual({ 1: 'Jugador 1', 2: 'Jugador 2' });
    expect(h.getEstado().jugadas).toEqual([]);
    h.sesion.destruir();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `npx vitest run src/lib/gameSession.test.ts -t "modo solitario"`
Expected: FAIL — `elegirMovimientoBot` y los eventos de modo solo no existen en `gameSession.ts`.

- [ ] **Step 3: Implementar los cambios en `src/lib/gameSession.ts`**

Realizar las siguientes ediciones puntuales en `src/lib/gameSession.ts`:

1. **Imports (junto a los existentes al inicio del archivo):**

```ts
import { getMiNombre } from './miNombre';
import {
  crearControladorBot,
  type ControladorBot,
} from './bot/controladorBot';
import {
  NOMBRE_BOT,
  esDificultad,
  type Dificultad,
} from './bot/tipos';
```

2. **`GameSessionConfig<TMovimiento>` (añadir después de `obtenerSnapshot`):**

```ts
  /**
   * Calcula la siguiente jugada del robot en modo solitario. Si falta, el
   * juego sigue funcionando en modos local y remoto como hasta ahora.
   */
  elegirMovimientoBot?: (dificultad: Dificultad) => TMovimiento | null;
```

3. **Dentro de `iniciarSesionJuego`, reemplazar la inicialización de `marcador` y añadir estado del bot y helpers de modo (justo después de `let anuncioPendiente: string | null = null;`):**

```ts
  const controladorBot: ControladorBot | null = config.elegirMovimientoBot
    ? crearControladorBot<TMovimiento>({
        elegirMovimiento: config.elegirMovimientoBot,
        validarMovimiento: config.validarMovimiento,
        aplicarMovimiento: config.onMovimientoRemoto,
        obtenerSnapshot: config.obtenerSnapshot,
      })
    : null;

  function esRemoto(): boolean {
    return canal !== null;
  }

  function esSolo(): boolean {
    return controladorBot !== null && controladorBot.estaActivo();
  }

  function claveMarcador(): string {
    return esSolo() ? `${slug}:solo` : slug;
  }

  function nombreHumanoSolo(): string {
    return getMiNombre() ?? getPlayerNames()[1];
  }

  function nombresMarcador(): PlayerNames {
    return esSolo() ? { 1: nombreHumanoSolo(), 2: NOMBRE_BOT } : nombres;
  }

  function aplicarNombresSolo(): void {
    if (!controladorBot) return;
    const humano = controladorBot.getAsientoHumano();
    const bot = controladorBot.getAsientoBot();
    nombres[humano] = nombreHumanoSolo();
    nombres[bot] = NOMBRE_BOT;
  }
```

4. **Actualizar las referencias de `miAsiento === null` / `miAsiento !== null` y `slug` en `marcador`:**
   - En `puedePersistir()`:
     ```ts
     function puedePersistir(): boolean {
       return !esRemoto() && !!config.obtenerSnapshot;
     }
     ```
   - En `escribirPartida()`:
     ```ts
     function escribirPartida(): void {
       timeoutGuardado = null;
       if (!hayPartidaPersistible()) return;
       guardarPartida(slug, {
         nombres: { 1: nombres[1], 2: nombres[2] },
         snapshot: config.obtenerSnapshot!(),
         pila: pilaDeshacer,
         pilaRecortada,
         ...(esSolo() && controladorBot
           ? {
               solo: {
                 dificultad: controladorBot.getDificultad(),
                 asientoHumano: controladorBot.getAsientoHumano(),
               },
             }
           : {}),
       });
     }
     ```
   - En `alRestaurarPartida()`:
     ```ts
     function alRestaurarPartida(): void {
       if (esRemoto() || !config.onDeshacer) return;
       const guardada = leerPartida(slug);
       if (!guardada) return;
       if (guardada.solo && controladorBot && !esSolo()) {
         controladorBot.activar(guardada.solo.dificultad, guardada.solo.asientoHumano);
         miAsiento = guardada.solo.asientoHumano;
         marcador = obtenerMarcador(claveMarcador());
       }
       nombres[1] = guardada.nombres[1];
       nombres[2] = guardada.nombres[2];
       if (!guardada.solo) savePlayerNames(nombres);
       pilaDeshacer = guardada.pila;
       pilaRecortada = guardada.pilaRecortada === true;
       actualizarBotonDeshacer();
       actualizarMarcadorUI();
       try {
         config.onDeshacer(guardada.snapshot);
       } catch (error) {
         console.warn('No se pudo restaurar la partida guardada:', error);
         pilaDeshacer = [];
         pilaRecortada = false;
         actualizarBotonDeshacer();
         descartarPartida();
         config.onAplicarReinicio();
       }
     }
     ```
   - En `actualizarBotonDeshacer()`:
     ```ts
     function actualizarBotonDeshacer(): void {
       const boton = getControlDeshacer();
       if (!boton) return;
       boton.hidden = esRemoto();
       boton.disabled = pilaDeshacer.length === 0;
     }
     ```
   - En `actualizarMarcadorUI()`:
     ```ts
     function actualizarMarcadorUI(): void {
       const el = getMarcadorEl();
       if (!el) return;
       el.textContent = formatearMarcador(marcador, nombresMarcador());
     }
     ```
   - En `guardarParaDeshacer(snapshot)`:
     ```ts
     function guardarParaDeshacer(snapshot: unknown): void {
       senales.marcar('toque');
       if (esRemoto() || controladorBot?.estaAplicandoJugada()) return;
       pilaDeshacer.push(structuredClone(snapshot));
       if (pilaDeshacer.length > PROFUNDIDAD_DESHACER) {
         pilaDeshacer.shift();
         pilaRecortada = true;
       }
       actualizarBotonDeshacer();
     }
     ```
   - En `alClicControlDeshacer()`:
     ```ts
     function alClicControlDeshacer(): void {
       if (esRemoto() || pilaDeshacer.length === 0) return;
       controladorBot?.cancelarTurno();
       const snapshot = pilaDeshacer.pop();
       actualizarBotonDeshacer();
       if (pilaDeshacer.length === 0 && !pilaRecortada) descartarPartida();
       anuncioPendiente = 'Jugada deshecha.';
       config.onDeshacer?.(snapshot);
     }
     ```
   - En `alClicPosibleVolverALista()`:
     ```ts
     if (link) limpiarMarcador(claveMarcador());
     ```
   - En `alActualizarNombresLocales()`:
     ```ts
     if (customEvent.detail && !esRemoto() && !esSolo()) {
     ```
   - Añadir handlers de eventos para modo solitario y cambio a local/remoto:
     ```ts
     function alModoSolo(evento: Event): void {
       if (!controladorBot || esRemoto()) return;
       const detalle = (
         evento as CustomEvent<{
           dificultad?: unknown;
           asientoHumano?: Player;
           restaurando?: boolean;
         }>
       ).detail;
       const dificultad: Dificultad = esDificultad(detalle?.dificultad)
         ? detalle.dificultad
         : 'facil';
       const asientoHumano: Player = detalle?.asientoHumano === 2 ? 2 : 1;

       controladorBot.activar(dificultad, asientoHumano);
       miAsiento = asientoHumano;
       aplicarNombresSolo();
       victoriaRegistrada = false;
       marcador = obtenerMarcador(claveMarcador());
       actualizarBotonDeshacer();
       actualizarMarcadorUI();

       if (!detalle?.restaurando) {
         pilaDeshacer = [];
         pilaRecortada = false;
         registro = [];
         actualizarBotonDeshacer();
         descartarPartida();
         config.onAplicarReinicio();
       }
     }

     function alCambiarDificultadSolo(evento: Event): void {
       if (!esSolo() || !controladorBot) return;
       const dificultad = (evento as CustomEvent<{ dificultad?: unknown }>).detail?.dificultad;
       if (!esDificultad(dificultad)) return;
       controladorBot.setDificultad(dificultad);
       programarGuardado();
     }

     function alModoLocal(): void {
       if (esRemoto() || !esSolo() || !controladorBot) return;
       controladorBot.desactivar();
       miAsiento = null;
       const locales = getPlayerNames();
       nombres[1] = locales[1];
       nombres[2] = locales[2];
       victoriaRegistrada = false;
       marcador = obtenerMarcador(claveMarcador());
       pilaDeshacer = [];
       pilaRecortada = false;
       registro = [];
       actualizarBotonDeshacer();
       actualizarMarcadorUI();
       descartarPartida();
       config.onAplicarReinicio();
     }
     ```
   - En `alCanalRemotoListo()`: al comienzo del cuerpo añadir `controladorBot?.desactivar();`.
   - En `reiniciar()`: al comienzo añadir `controladorBot?.cancelarTurno();` (y en el cuerpo mantener `miAsiento` y `nombres`). Añadir función `revanchaSolo`:
     ```ts
     function revanchaSolo(): void {
       if (!esSolo() || !controladorBot) {
         reiniciar();
         return;
       }
       const nuevoAsiento = controladorBot.alternarAsiento();
       miAsiento = nuevoAsiento;
       aplicarNombresSolo();
       actualizarMarcadorUI();
       reiniciar();
     }
     ```
   - En `mostrarTurno()`: pasar `textoEspera: esSolo() ? 'pensando…' : undefined` dentro de `renderTurnIndicator(...)`, y al final del cuerpo (tras ocultar el banner) llamar:
     ```ts
     controladorBot?.alCambiarTurno(opciones.jugador);
     ```
   - En `mostrarFinDeJuego()`:
     ```ts
     function mostrarFinDeJuego(opciones: MostrarFinDeJuegoOptions): void {
       controladorBot?.cancelarTurno();
       descartarPartida();
       const yaTerminada = partidaTerminada;
       partidaTerminada = true;
       const ganoBot = esSolo() && opciones.ganador !== undefined && opciones.ganador !== null && opciones.ganador !== miAsiento;
       const ganoHumano = !ganoBot && (opciones.ganador === 1 || opciones.ganador === 2);

       if (ganoBot || opciones.ganador === null) senales.mejorar('punto');
       else if (ganoHumano) senales.mejorar('victoria');

       const ind = getIndicadorTurno();
       const ban = getBannerGanador();
       if (ind) ocultarTurnIndicator(ind);
       if (opciones.ganador !== undefined && !victoriaRegistrada) {
         victoriaRegistrada = true;
         const ganadorMarcador: Player | null =
           opciones.ganador === null
             ? null
             : esSolo()
               ? opciones.ganador === miAsiento
                 ? 1
                 : 2
               : opciones.ganador;
         marcador = registrarVictoria(claveMarcador(), ganadorMarcador);
         actualizarMarcadorUI();
       }
       if (ban) {
         showWinnerBanner(ban, {
           titulo: ganoBot ? `🤖 Ganó ${NOMBRE_BOT}` : opciones.titulo,
           detalle: opciones.detalle,
           onReiniciar: esSolo() ? revanchaSolo : reiniciar,
         });
       }
       if (!yaTerminada && !ganoBot && (opciones.ganador === 1 || opciones.ganador === 2)) {
         lanzarConfeti();
       }
     }
     ```
   - Registrar y limpiar los nuevos listeners en `iniciarSesionJuego` y `destruir()`:
     ```ts
     document.addEventListener('modo-elegido-solo', alModoSolo);
     document.addEventListener('dificultad-solo-cambiada', alCambiarDificultadSolo);
     document.addEventListener('modo-elegido-local', alModoLocal);
     ```
     y en `destruir()`:
     ```ts
     controladorBot?.desactivar();
     document.removeEventListener('modo-elegido-solo', alModoSolo);
     document.removeEventListener('dificultad-solo-cambiada', alCambiarDificultadSolo);
     document.removeEventListener('modo-elegido-local', alModoLocal);
     ```

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS — todos los tests de `gameSession.test.ts` (existentes + modo solitario) pasan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(solo): integrar modo solitario, deshacer, alternancia y persistencia en gameSession"
```

---

### Task 4: Etiqueta `🤖 1 jugador`, filtro `🤖 Jugar solo` en portada y `minJugadores: 1`

**Files:**
- Modify: `src/lib/catalogo.ts:13-36`
- Modify: `src/lib/catalogo.test.ts:1-62`
- Modify: `src/lib/filtros.ts:1-35`
- Modify: `src/lib/filtros.test.ts:1-83`
- Modify: `src/components/GameCard.astro:12-45`
- Modify: `src/pages/index.astro:42-95,214-290`
- Modify: `src/content/juegos/{tres-en-raya,puntos-y-cajas,obstruccion,nim,chomp,gomoku}.md`

**Interfaces:**
- Produces:
  - `src/lib/catalogo.ts`: `ETIQUETA_SOLO = { icono: '🤖', texto: '1 jugador' } as const`.
  - `src/lib/filtros.ts`: `JuegoFiltrable.solo: boolean`, `Filtros.solo: boolean`.
  - `src/components/GameCard.astro`: prop opcional `solo?: boolean`.

- [ ] **Step 1: Escribir los tests que fallan**

Actualizar `src/lib/catalogo.test.ts` importando `ETIQUETA_SOLO` y añadiendo:

```ts
  it('ETIQUETA_SOLO tiene icono y texto, y los 6 juegos iniciales declaran minJugadores: 1', () => {
    expect(ETIQUETA_SOLO).toEqual({ icono: '🤖', texto: '1 jugador' });
    const slugsSolo = juegos
      .filter(j => campo(j.texto, 'minJugadores') === '1')
      .map(j => j.slug)
      .sort();
    expect(slugsSolo).toEqual([
      'chomp',
      'gomoku',
      'nim',
      'obstruccion',
      'puntos-y-cajas',
      'tres-en-raya',
    ]);
  });
```

Actualizar `src/lib/filtros.test.ts` para incluir `solo` en los objetos `JuegoFiltrable` y el helper `filtros`, y añadir:

```ts
const hex: JuegoFiltrable = {
  nombre: 'Hex',
  descripcion: 'Conecta tus dos lados opuestos del tablero.',
  duracion: 'medio',
  tipo: 'conectar',
  solo: false,
};
const nim: JuegoFiltrable = {
  nombre: 'Nim',
  descripcion: 'Retira estrellas por turnos.',
  duracion: 'rapido',
  tipo: 'bloquear',
  solo: true,
};

function filtros(parcial: {
  duraciones?: Duracion[];
  tipos?: Tipo[];
  solo?: boolean;
  consulta?: string;
}): Filtros {
  return {
    duraciones: new Set(parcial.duraciones ?? []),
    tipos: new Set(parcial.tipos ?? []),
    solo: parcial.solo ?? false,
    consulta: parcial.consulta ?? '',
  };
}
```

```ts
  it('filtrar por solo deja únicamente los juegos jugables en solitario y se combina con AND', () => {
    expect(coincide(nim, filtros({ solo: true }))).toBe(true);
    expect(coincide(hex, filtros({ solo: true }))).toBe(false);
    expect(coincide(nim, filtros({ solo: true, duraciones: ['rapido'] }))).toBe(true);
    expect(coincide(nim, filtros({ solo: true, duraciones: ['medio'] }))).toBe(false);
  });
```

- [ ] **Step 2: Ejecutar los tests y verificar que fallan**

Run: `npx vitest run src/lib/catalogo.test.ts src/lib/filtros.test.ts`
Expected: FAIL — `ETIQUETA_SOLO` no existe, `minJugadores` sigue en 2 y `Filtros.solo` no existe.

- [ ] **Step 3: Implementar los cambios en catálogo, filtros, tarjetas, portada y los 6 `.md`**

En `src/lib/catalogo.ts` añadir al final:

```ts
export const ETIQUETA_SOLO: Etiqueta = { icono: '🤖', texto: '1 jugador' };
```

En `src/lib/filtros.ts` actualizar `JuegoFiltrable`, `Filtros` y `coincide`:

```ts
export interface JuegoFiltrable {
  nombre: string;
  descripcion: string;
  duracion: Duracion;
  tipo: Tipo;
  solo: boolean;
}

export interface Filtros {
  duraciones: ReadonlySet<Duracion>;
  tipos: ReadonlySet<Tipo>;
  solo: boolean;
  consulta: string;
}

export function coincide(juego: JuegoFiltrable, filtros: Filtros): boolean {
  if (filtros.duraciones.size > 0 && !filtros.duraciones.has(juego.duracion)) return false;
  if (filtros.tipos.size > 0 && !filtros.tipos.has(juego.tipo)) return false;
  if (filtros.solo && !juego.solo) return false;
  const consulta = filtros.consulta.trim().toLowerCase();
  if (consulta === '') return true;
  return (
    juego.nombre.toLowerCase().includes(consulta) ||
    juego.descripcion.toLowerCase().includes(consulta)
  );
}
```

En `src/components/GameCard.astro`:

```ts
import {
  DURACION_INFO,
  ETIQUETA_SOLO,
  ICONO_EDAD,
  TIPO_INFO,
  textoEdad,
  type Duracion,
  type Tipo,
} from '../lib/catalogo';
import IconoJuego from './IconoJuego.astro';

interface Props {
  href: string;
  slug: string;
  title: string;
  description: string;
  duracion: Duracion;
  edad: number;
  tipo: Tipo;
  solo?: boolean;
}

const { href, slug, title, description, duracion, edad, tipo, solo = false } = Astro.props;

const etiquetas = [
  ...(solo ? [ETIQUETA_SOLO] : []),
  DURACION_INFO[duracion],
  { icono: ICONO_EDAD, texto: textoEdad(edad) },
  TIPO_INFO[tipo],
];
```

En `src/pages/index.astro`:
- Añadir el grupo `jugadores` en `.indice__filtros` junto a `{grupos.map(...)}`:

```astro
      <div class="indice__grupo" role="group" aria-label="Jugadores" data-grupo="jugadores">
        <span class="indice__grupo-titulo" aria-hidden="true">Jugadores</span>
        <button type="button" class="filtro" data-todos aria-pressed="true">Todos</button>
        <button type="button" class="filtro" data-valor="solo" aria-pressed="false">
          <span aria-hidden="true">🤖</span>
          Jugar solo
        </button>
      </div>
```

- En `#grid-juegos`, añadir `data-solo={juego.data.minJugadores === 1 ? 'true' : 'false'}` en `.indice__item` y pasar `solo={juego.data.minJugadores === 1}` a `<GameCard ... />`.
- En el `<script>` de `src/pages/index.astro`:

```ts
  let duraciones = new Set<Duracion>();
  let tipos = new Set<Tipo>();
  let solo = false;
```

En `aplicar()`:

```ts
    const filtros = { duraciones, tipos, solo, consulta: buscador.value };
    let visibles = 0;

    for (const item of items) {
      const visible = coincide(
        {
          nombre: item.dataset.nombre!,
          descripcion: item.dataset.descripcion!,
          duracion: item.dataset.duracion as Duracion,
          tipo: item.dataset.tipo as Tipo,
          solo: item.dataset.solo === 'true',
        },
        filtros
      );
      item.hidden = !visible;
      if (visible) visibles++;
    }

    sinResultados.hidden = visibles > 0;

    for (const boton of botones) {
      const grupo = grupoDe(boton);
      if (grupo === 'jugadores') {
        const activo = boton.hasAttribute('data-todos') ? !solo : solo;
        boton.setAttribute('aria-pressed', String(activo));
        continue;
      }
      const conjunto: ReadonlySet<string> = grupo === 'duracion' ? duraciones : tipos;
      const activo = boton.hasAttribute('data-todos')
        ? conjunto.size === 0
        : conjunto.has(boton.dataset.valor!);
      boton.setAttribute('aria-pressed', String(activo));
    }
```

En `panelFiltros.addEventListener('click', ...)` y `botonLimpiar.addEventListener('click', ...)`:

```ts
    const grupo = grupoDe(boton);
    if (grupo === 'duracion') {
      duraciones = esTodos ? new Set() : alternar(duraciones, boton.dataset.valor as Duracion);
    } else if (grupo === 'tipo') {
      tipos = esTodos ? new Set() : alternar(tipos, boton.dataset.valor as Tipo);
    } else if (grupo === 'jugadores') {
      solo = esTodos ? false : !solo;
    }
    aplicar();
```

Y en `botonLimpiar`: añadir `solo = false;` junto a `duraciones = new Set(); tipos = new Set();`.

Cambiar `minJugadores: 2` a `minJugadores: 1` en los 6 archivos:
- `src/content/juegos/tres-en-raya.md`
- `src/content/juegos/puntos-y-cajas.md`
- `src/content/juegos/obstruccion.md`
- `src/content/juegos/nim.md`
- `src/content/juegos/chomp.md`
- `src/content/juegos/gomoku.md`

- [ ] **Step 4: Ejecutar los tests y verificar que pasan**

Run: `npx vitest run src/lib/catalogo.test.ts src/lib/filtros.test.ts src/lib/sinColoresFijos.test.ts`
Expected: PASS — los 3 archivos de test pasan sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalogo.ts src/lib/catalogo.test.ts src/lib/filtros.ts src/lib/filtros.test.ts src/components/GameCard.astro src/pages/index.astro src/content/juegos/tres-en-raya.md src/content/juegos/puntos-y-cajas.md src/content/juegos/obstruccion.md src/content/juegos/nim.md src/content/juegos/chomp.md src/content/juegos/gomoku.md
git commit -m "feat(portada): etiqueta 1 jugador y filtro Jugar solo para los 6 juegos iniciales"
```

---
### Task 5: Flujo de arranque con selector de dificultad y controles en cabecera

**Files:**
- Create: `src/components/ModalOpcionesSolo.astro`
- Modify: `src/components/ModalModoJuego.astro:1-189`
- Modify: `src/components/AccionesCabecera.astro:1-46`
- Modify: `src/components/ModalInstrucciones.astro:168-192`
- Modify: `src/components/ModalContinuarPartida.astro:71-98`
- Modify: `src/pages/juegos/[slug].astro:1-161`

**Interfaces:**
- Consumes:
  - `DIFICULTADES`, `DIFICULTAD_INFO`, `esDificultad`, `type Dificultad` de `src/lib/bot/tipos.ts`.
  - `getDificultadGuardada`, `guardarDificultad`, `getModoGuardado`, `guardarModo` de `src/lib/entrada.ts`.
  - `leerPartida` de `src/lib/partidaGuardada.ts`.
- Produces:
  - Eventos de documento: `modo-elegido-solo` (`{ detail: { dificultad, asientoHumano?, restaurando? } }`), `dificultad-solo-cambiada` (`{ detail: { dificultad } }`).
  - Selectores de UI usados por E2E (Tarea 12): `#modal-modo-juego-solo`, `.modal-modo-juego__dificultad[data-dificultad]`, `#modal-modo-juego-volver-modo`, `#boton-jugar-solo`, `#boton-dificultad-solo`, `#modal-opciones-solo`, `#modal-opciones-solo-a-local`, `#modal-opciones-solo-a-remoto`.

- [ ] **Step 1: Crear `src/components/ModalOpcionesSolo.astro`**

```astro
---
import { DIFICULTADES, DIFICULTAD_INFO } from '../lib/bot/tipos';
---

<div
  id="modal-opciones-solo"
  class="modal-opciones-solo"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-opciones-solo-titulo"
  hidden
>
  <div class="modal-opciones-solo__contenido">
    <h2 id="modal-opciones-solo-titulo">Dificultad del robot</h2>
    <div class="modal-opciones-solo__niveles">
      {
        DIFICULTADES.map(nivel => {
          const info = DIFICULTAD_INFO[nivel];
          return (
            <button
              type="button"
              class="modal-opciones-solo__nivel"
              data-dificultad={nivel}
              aria-pressed="false"
            >
              <span class="modal-opciones-solo__nivel-titulo">
                {info.icono} {info.texto}
              </span>
              <span class="modal-opciones-solo__nivel-desc">{info.descripcion}</span>
            </button>
          );
        })
      }
    </div>

    <div id="modal-opciones-solo-cambio-modo" class="modal-opciones-solo__modos" hidden>
      <button type="button" id="modal-opciones-solo-a-local" class="modal-opciones-solo__secundario">
        📱 Misma tableta
      </button>
      <button type="button" id="modal-opciones-solo-a-remoto" class="modal-opciones-solo__secundario">
        🌐 Por internet
      </button>
    </div>

    <button type="button" id="modal-opciones-solo-cerrar" class="modal-opciones-solo__cerrar">
      Cerrar
    </button>
  </div>
</div>

<style>
  .modal-opciones-solo {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing);
    z-index: 20;
  }

  .modal-opciones-solo[hidden] {
    display: none;
  }

  .modal-opciones-solo__contenido {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    max-width: 24rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .modal-opciones-solo__niveles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .modal-opciones-solo__nivel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    padding: 0.75rem 1rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    min-height: 3.5rem;
    text-align: left;
  }

  .modal-opciones-solo__nivel[aria-pressed='true'] {
    background: var(--color-accent);
    color: var(--color-on-accent);
    border-color: var(--color-text);
  }

  .modal-opciones-solo__nivel-titulo {
    font-size: 1.05rem;
    font-weight: 700;
  }

  .modal-opciones-solo__nivel-desc {
    font-size: 0.85rem;
    opacity: 0.85;
  }

  .modal-opciones-solo__modos {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-line);
  }

  .modal-opciones-solo__modos[hidden] {
    display: none;
  }

  .modal-opciones-solo__secundario,
  .modal-opciones-solo__cerrar {
    padding: 0.65rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 700;
    min-height: 3rem;
  }
</style>

<script>
  import { esDificultad, type Dificultad } from '../lib/bot/tipos';
  import { getDificultadGuardada, guardarDificultad, guardarModo } from '../lib/entrada';

  const modal = document.getElementById('modal-opciones-solo')!;
  const titulo = document.getElementById('modal-opciones-solo-titulo')!;
  const botonesNivel = Array.from(
    modal.querySelectorAll<HTMLButtonElement>('.modal-opciones-solo__nivel')
  );
  const bloqueModos = document.getElementById('modal-opciones-solo-cambio-modo')!;
  const botonALocal = document.getElementById('modal-opciones-solo-a-local')!;
  const botonARemoto = document.getElementById('modal-opciones-solo-a-remoto')!;
  const botonCerrar = document.getElementById('modal-opciones-solo-cerrar')!;
  const abrirDesdeLocal = document.getElementById('boton-jugar-solo');
  const abrirEnSolo = document.getElementById('boton-dificultad-solo');

  let origen: 'desde-local' | 'en-solo' = 'en-solo';
  let dificultadActual: Dificultad = getDificultadGuardada();

  function marcarNivelActivo(): void {
    for (const boton of botonesNivel) {
      const activo = origen === 'en-solo' && boton.dataset.dificultad === dificultadActual;
      boton.setAttribute('aria-pressed', String(activo));
    }
  }

  function abrir(modoOrigen: 'desde-local' | 'en-solo'): void {
    origen = modoOrigen;
    titulo.textContent =
      origen === 'desde-local' ? '¿Con qué dificultad quieres jugar?' : 'Dificultad del robot';
    bloqueModos.hidden = origen === 'desde-local';
    botonCerrar.textContent = origen === 'desde-local' ? 'Cancelar' : 'Cerrar';
    marcarNivelActivo();
    modal.hidden = false;
  }

  document.addEventListener('modo-elegido-solo', (evento => {
    const d = (evento as CustomEvent<{ dificultad?: unknown }>).detail?.dificultad;
    if (esDificultad(d)) dificultadActual = d;
  }) as EventListener);

  document.addEventListener('dificultad-solo-cambiada', (evento => {
    const d = (evento as CustomEvent<{ dificultad?: unknown }>).detail?.dificultad;
    if (esDificultad(d)) dificultadActual = d;
  }) as EventListener);

  abrirDesdeLocal?.addEventListener('click', () => abrir('desde-local'));
  abrirEnSolo?.addEventListener('click', () => abrir('en-solo'));

  for (const boton of botonesNivel) {
    boton.addEventListener('click', () => {
      const nivel = boton.dataset.dificultad;
      if (!esDificultad(nivel)) return;
      dificultadActual = nivel;
      guardarDificultad(nivel);
      modal.hidden = true;
      if (origen === 'desde-local') {
        guardarModo('solo');
        document.dispatchEvent(
          new CustomEvent('modo-elegido-solo', { detail: { dificultad: nivel } })
        );
      } else {
        document.dispatchEvent(
          new CustomEvent('dificultad-solo-cambiada', { detail: { dificultad: nivel } })
        );
      }
    });
  }

  botonALocal.addEventListener('click', () => {
    modal.hidden = true;
    guardarModo('local');
    document.dispatchEvent(new CustomEvent('modo-elegido-local'));
  });

  botonARemoto.addEventListener('click', () => {
    modal.hidden = true;
    document.dispatchEvent(new CustomEvent('abrir-modal-remoto'));
  });

  botonCerrar.addEventListener('click', () => {
    modal.hidden = true;
  });
</script>
```

- [ ] **Step 2: Actualizar `AccionesCabecera.astro`, `ModalModoJuego.astro`, `ModalInstrucciones.astro`, `ModalContinuarPartida.astro` y `[slug].astro`**

Modificar `src/components/AccionesCabecera.astro`: aceptar `soportaSolo?: boolean`, añadir `#boton-jugar-solo` y `#boton-dificultad-solo` ocultos por defecto:

```astro
---
interface Props {
  soportaSolo?: boolean;
}

const { soportaSolo = false } = Astro.props;
---

<div class="acciones-cabecera">
  {
    soportaSolo && (
      <button type="button" id="boton-jugar-solo" class="acciones-cabecera__boton" hidden>
        🤖 Jugar solo
      </button>
    )
  }
  {
    soportaSolo && (
      <button type="button" id="boton-dificultad-solo" class="acciones-cabecera__boton" hidden>
        🤖 Fácil
      </button>
    )
  }
  <button type="button" id="modal-jugadores-abrir" class="acciones-cabecera__boton" hidden>
    ✏️ Cambiar nombres
  </button>
  <button type="button" id="boton-jugar-por-internet" class="acciones-cabecera__boton" hidden>
    🌐 Por internet
  </button>
</div>
```

(Mantener exactamente el bloque `<style>` existente de `AccionesCabecera.astro`.)

Modificar `src/components/ModalModoJuego.astro`:

```astro
---
import { DIFICULTADES, DIFICULTAD_INFO } from '../lib/bot/tipos';

interface Props {
  soportaSolo?: boolean;
}

const { soportaSolo = false } = Astro.props;
---

<div
  id="modal-modo-juego"
  class="modal-modo-juego"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-modo-juego-titulo"
  data-soporta-solo={soportaSolo ? 'true' : 'false'}
  hidden
>
  <div class="modal-modo-juego__contenido">
    <h2 id="modal-modo-juego-titulo">¿Cómo van a jugar?</h2>

    <div id="modal-modo-juego-paso-modo" class="modal-modo-juego__paso">
      {
        soportaSolo && (
          <button type="button" id="modal-modo-juego-solo" class="modal-modo-juego__boton">
            🤖 Jugar solo
          </button>
        )
      }
      <button type="button" id="modal-modo-juego-local" class="modal-modo-juego__boton">
        📱 Misma tableta
      </button>
      <button type="button" id="modal-modo-juego-remoto" class="modal-modo-juego__boton">
        🌐 Por internet
      </button>
      <a href="/" class="modal-modo-juego__volver">← Volver a los juegos</a>
    </div>

    {
      soportaSolo && (
        <div id="modal-modo-juego-paso-dificultad" class="modal-modo-juego__paso" hidden>
          {DIFICULTADES.map(nivel => {
            const info = DIFICULTAD_INFO[nivel];
            return (
              <button
                type="button"
                class="modal-modo-juego__dificultad"
                data-dificultad={nivel}
              >
                <span class="modal-modo-juego__dificultad-titulo">
                  {info.icono} {info.texto}
                </span>
                <span class="modal-modo-juego__dificultad-desc">{info.descripcion}</span>
              </button>
            );
          })}
          <button type="button" id="modal-modo-juego-volver-modo" class="modal-modo-juego__volver-btn">
            ← Otro modo
          </button>
        </div>
      )
    }
  </div>
</div>
```

En el `<style>` de `ModalModoJuego.astro` añadir las reglas para `.modal-modo-juego__paso`, `.modal-modo-juego__dificultad` y `.modal-modo-juego__volver-btn` (usando solo variables `--color-*` y `min-height: 3.5rem` para los botones de dificultad):

```css
  .modal-modo-juego__paso {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .modal-modo-juego__paso[hidden] {
    display: none;
  }

  .modal-modo-juego__dificultad {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    padding: 0.75rem 1rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    min-height: 3.5rem;
    text-align: left;
  }

  .modal-modo-juego__dificultad-titulo {
    font-size: 1.05rem;
    font-weight: 700;
  }

  .modal-modo-juego__dificultad-desc {
    font-size: 0.85rem;
    opacity: 0.85;
  }

  .modal-modo-juego__volver-btn {
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 700;
    min-height: 3rem;
  }
```

En el `<script>` de `ModalModoJuego.astro`:

```ts
  import { esDificultad } from '../lib/bot/tipos';
  import {
    getDificultadGuardada,
    getModoGuardado,
    guardarDificultad,
    guardarModo,
    olvidarModo,
  } from '../lib/entrada';

  const modal = document.getElementById('modal-modo-juego')!;
  const titulo = document.getElementById('modal-modo-juego-titulo')!;
  const pasoModo = document.getElementById('modal-modo-juego-paso-modo')!;
  const pasoDificultad = document.getElementById('modal-modo-juego-paso-dificultad');
  const botonSolo = document.getElementById('modal-modo-juego-solo');
  const botonLocal = document.getElementById('modal-modo-juego-local')!;
  const botonRemoto = document.getElementById('modal-modo-juego-remoto')!;
  const botonVolverModo = document.getElementById('modal-modo-juego-volver-modo');
  const botonesDificultad = Array.from(
    modal.querySelectorAll<HTMLButtonElement>('.modal-modo-juego__dificultad')
  );
  const soportaSolo = modal.dataset.soportaSolo === 'true';

  let modoYaElegido = false;
  let tableroVisible = false;

  function mostrarPasoModo(): void {
    titulo.textContent = '¿Cómo van a jugar?';
    pasoModo.hidden = false;
    if (pasoDificultad) pasoDificultad.hidden = true;
  }

  function mostrarPasoDificultad(): void {
    titulo.textContent = 'Elige la dificultad';
    pasoModo.hidden = true;
    if (pasoDificultad) pasoDificultad.hidden = false;
  }

  document.addEventListener('modo-elegido-local', () => {
    modoYaElegido = true;
    tableroVisible = true;
    modal.hidden = true;
  });

  document.addEventListener('modo-elegido-solo', () => {
    modoYaElegido = true;
    tableroVisible = true;
    modal.hidden = true;
  });

  document.addEventListener('instrucciones-cerradas', () => {
    if (modoYaElegido) return;

    const modoGuardado = getModoGuardado();
    if (modoGuardado === 'solo' && soportaSolo) {
      modoYaElegido = true;
      tableroVisible = true;
      document.dispatchEvent(
        new CustomEvent('modo-elegido-solo', {
          detail: { dificultad: getDificultadGuardada() },
        })
      );
      return;
    }
    if (modoGuardado === 'local') {
      modoYaElegido = true;
      tableroVisible = true;
      document.dispatchEvent(new CustomEvent('modo-elegido-local'));
      return;
    }
    if (modoGuardado === 'remoto') {
      modoYaElegido = true;
      document.dispatchEvent(
        new CustomEvent('abrir-modal-remoto', { detail: { modoPrevio: modoGuardado } })
      );
      return;
    }

    mostrarPasoModo();
    modal.hidden = false;
  });

  let modoPrevioAntesDeRemoto: ReturnType<typeof getModoGuardado> = null;

  document.addEventListener('abrir-modal-remoto', ((
    evento: CustomEvent<{ modoPrevio?: ReturnType<typeof getModoGuardado> }>
  ) => {
    modoYaElegido = true;
    modoPrevioAntesDeRemoto = evento.detail?.modoPrevio ?? null;
  }) as EventListener);

  document.addEventListener('modal-remoto-cancelado', () => {
    if (tableroVisible) return;
    if (modoPrevioAntesDeRemoto) guardarModo(modoPrevioAntesDeRemoto);
    else olvidarModo();
    modoYaElegido = false;
    mostrarPasoModo();
    modal.hidden = false;
  });

  document.addEventListener('canal-remoto-listo', () => {
    modoYaElegido = true;
    tableroVisible = true;
    modal.hidden = true;
  });

  botonSolo?.addEventListener('click', () => {
    mostrarPasoDificultad();
  });

  botonVolverModo?.addEventListener('click', () => {
    mostrarPasoModo();
  });

  for (const boton of botonesDificultad) {
    boton.addEventListener('click', () => {
      const nivel = boton.dataset.dificultad;
      if (!esDificultad(nivel)) return;
      modoYaElegido = true;
      tableroVisible = true;
      modal.hidden = true;
      guardarModo('solo');
      guardarDificultad(nivel);
      document.dispatchEvent(
        new CustomEvent('modo-elegido-solo', { detail: { dificultad: nivel } })
      );
    });
  }

  botonLocal.addEventListener('click', () => {
    modoYaElegido = true;
    tableroVisible = true;
    modal.hidden = true;
    guardarModo('local');
    document.dispatchEvent(new CustomEvent('modo-elegido-local'));
  });

  botonRemoto.addEventListener('click', () => {
    modoYaElegido = true;
    modal.hidden = true;
    const modoPrevio = getModoGuardado();
    guardarModo('remoto');
    document.dispatchEvent(
      new CustomEvent('abrir-modal-remoto', { detail: { modoPrevio } })
    );
  });
```

Modificar `src/components/ModalInstrucciones.astro` (junto al listener `modo-elegido-local`, líneas 174-177):

```ts
  document.addEventListener('modo-elegido-solo', () => {
    tableroVisible = true;
    botonRemoto.hidden = true;
  });
```

Modificar `src/components/ModalContinuarPartida.astro` (`<script>`, líneas 71-98):

```ts
  import { guardarDificultad, guardarModo } from '../lib/entrada';
  import { borrarPartida, leerPartida } from '../lib/partidaGuardada';

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
    const guardada = leerPartida(slug);
    if (guardada?.solo) {
      guardarModo('solo');
      guardarDificultad(guardada.solo.dificultad);
      document.dispatchEvent(
        new CustomEvent('modo-elegido-solo', {
          detail: {
            dificultad: guardada.solo.dificultad,
            asientoHumano: guardada.solo.asientoHumano,
            restaurando: true,
          },
        })
      );
      document.dispatchEvent(new CustomEvent('partida-restaurar'));
      return;
    }
    guardarModo('local');
    document.dispatchEvent(new CustomEvent('modo-elegido-local'));
    document.dispatchEvent(new CustomEvent('partida-restaurar'));
  });

  nueva.addEventListener('click', () => {
    modal.hidden = true;
    borrarPartida(slug);
    document.dispatchEvent(new CustomEvent('partida-descartada'));
  });
```

Modificar `src/pages/juegos/[slug].astro`:
- Importar `ModalOpcionesSolo` y calcular `const soportaSolo = juego.data.minJugadores === 1;`.
- Pasar `soportaSolo={soportaSolo}` a `<AccionesCabecera />` y `<ModalModoJuego />`, y renderizar `{soportaSolo && <ModalOpcionesSolo />}`.
- En el `<script>` de `src/pages/juegos/[slug].astro`:

```ts
  import { DIFICULTAD_INFO, esDificultad, type Dificultad } from '../../lib/bot/tipos';
  import { registrarReciente } from '../../lib/recientes';

  const contenedorTablero = document.getElementById('contenedor-tablero')!;
  registrarReciente(contenedorTablero.dataset.slug!);
  const botonCambiarNombres = document.getElementById('modal-jugadores-abrir')!;
  const botonPorInternet = document.getElementById('boton-jugar-por-internet')!;
  const botonJugarSolo = document.getElementById('boton-jugar-solo');
  const botonDificultadSolo = document.getElementById('boton-dificultad-solo');

  function actualizarEtiquetaDificultad(dificultad: Dificultad): void {
    if (!botonDificultadSolo) return;
    const info = DIFICULTAD_INFO[dificultad];
    botonDificultadSolo.textContent = `🤖 ${info.texto}`;
  }

  document.addEventListener('modo-elegido-local', () => {
    contenedorTablero.hidden = false;
    botonCambiarNombres.hidden = false;
    botonPorInternet.hidden = false;
    if (botonJugarSolo) botonJugarSolo.hidden = false;
    if (botonDificultadSolo) botonDificultadSolo.hidden = true;
  });

  document.addEventListener('modo-elegido-solo', (evento => {
    contenedorTablero.hidden = false;
    botonCambiarNombres.hidden = true;
    botonPorInternet.hidden = true;
    if (botonJugarSolo) botonJugarSolo.hidden = true;
    if (botonDificultadSolo) {
      const nivel = (evento as CustomEvent<{ dificultad?: unknown }>).detail?.dificultad;
      actualizarEtiquetaDificultad(esDificultad(nivel) ? nivel : 'facil');
      botonDificultadSolo.hidden = false;
    }
  }) as EventListener);

  document.addEventListener('dificultad-solo-cambiada', (evento => {
    const nivel = (evento as CustomEvent<{ dificultad?: unknown }>).detail?.dificultad;
    if (esDificultad(nivel)) actualizarEtiquetaDificultad(nivel);
  }) as EventListener);

  document.addEventListener('canal-remoto-listo', () => {
    contenedorTablero.hidden = false;
    botonPorInternet.hidden = true;
    botonCambiarNombres.hidden = true;
    if (botonJugarSolo) botonJugarSolo.hidden = true;
    if (botonDificultadSolo) botonDificultadSolo.hidden = true;
  });
```

- [ ] **Step 3: Verificar chequeo de tipos de Astro y tests de colores**

Run: `npx vitest run src/lib/sinColoresFijos.test.ts && npm run check`
Expected: PASS — 0 errores de TypeScript/Astro y sin colores fijos prohibidos.

- [ ] **Step 4: Commit**

```bash
git add src/components/ModalOpcionesSolo.astro src/components/ModalModoJuego.astro src/components/AccionesCabecera.astro src/components/ModalInstrucciones.astro src/components/ModalContinuarPartida.astro src/pages/juegos/[slug].astro
git commit -m "feat(solo): selector de dificultad al arranque y controles en cabecera"
```

---

### Task 6: Bot de Tres en raya y conexión al tablero

**Files:**
- Create: `src/games/tres-en-raya/bot.ts`
- Create: `src/games/tres-en-raya/bot.test.ts`
- Modify: `src/games/tres-en-raya/Board.astro:47-73`

**Interfaces:**
- Consumes: `TresEnRayaState`, `CellValue`, `Player`, `esJugadaValida`, `playMove`, `createInitialState` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `elegirMovimiento(state: TresEnRayaState, dificultad: Dificultad, rng?: Rng): number`.

- [ ] **Step 1: Escribir el test que falla (`src/games/tres-en-raya/bot.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type TresEnRayaState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugarPartida(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 'X' ? dif1 : dif2;
    let mov: number;
    if (dif === 'azar') {
      const libres = state.board.flatMap((v, i) => (v === null ? [i] : []));
      mov = libres[Math.floor(rng() * libres.length)];
    } else {
      mov = elegirMovimiento(state, dif, rng);
    }
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('tres-en-raya bot', () => {
  it('devuelve siempre una jugada legal en todas las dificultades', () => {
    const rng = crearRng(42);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const mov = elegirMovimiento(state, dif, rng);
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('difícil nunca pierde en ninguna rama posible (ni como X ni como O)', () => {
    const rng = crearRng(1);
    function explorar(state: TresEnRayaState, asientoBot: 'X' | 'O'): void {
      if (state.status === 'won') {
        expect(state.winner).toBe(asientoBot);
        return;
      }
      if (state.status === 'draw') return;

      if (state.currentPlayer === asientoBot) {
        const mov = elegirMovimiento(state, 'dificil', rng);
        explorar(playMove(state, mov), asientoBot);
      } else {
        for (let i = 0; i < 9; i++) {
          if (state.board[i] === null) {
            explorar(playMove(state, i), asientoBot);
          }
        }
      }
    }

    explorar(createInitialState(), 'X');
    explorar(createInitialState(), 'O');
  });

  it('medio gana en 1 y bloquea amenaza directa en 1', () => {
    // O tiene dos en línea (3, 4) -> debe cerrar 5 para ganar
    let sGanar = createInitialState();
    for (const m of [0, 3, 1, 4, 8]) sGanar = playMove(sGanar, m);
    expect(elegirMovimiento(sGanar, 'medio', crearRng(7))).toBe(5);

    // X tiene dos en línea (0, 1) -> O debe bloquear en 2
    let sBloquear = createInitialState();
    for (const m of [0, 4, 1]) sBloquear = playMove(sBloquear, m);
    expect(elegirMovimiento(sBloquear, 'medio', crearRng(7))).toBe(2);
  });

  it('progresión de dificultad: medio supera a fácil y azar vence a fácil', () => {
    const rng = crearRng(123);
    let medioGana = 0;
    let azarGanaAFacil = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      if (jugarPartida('medio', 'facil', rng) === 'X') medioGana++;
      if (jugarPartida('azar', 'facil', rng) === 'X') azarGanaAFacil++;
    }
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGanaAFacil).toBeGreaterThan(N * 0.45);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/games/tres-en-raya/bot.test.ts`
Expected: FAIL — no existe `./bot`.

- [ ] **Step 3: Implementar `src/games/tres-en-raya/bot.ts` y conectar `Board.astro`**

Crear `src/games/tres-en-raya/bot.ts`:

```ts
import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { playMove, type CellValue, type Player, type TresEnRayaState } from './engine';

const LINEAS_GANADORAS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const CENTRO_Y_ESQUINAS = [4, 0, 2, 6, 8] as const;

function casillasLibres(board: readonly CellValue[]): number[] {
  const libres: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) libres.push(i);
  }
  return libres;
}

function buscarGanadorasEnUno(state: TresEnRayaState): number[] {
  return casillasLibres(state.board).filter(i => playMove(state, i).status === 'won');
}

function buscarBloqueosEnUno(state: TresEnRayaState): number[] {
  const rival: Player = state.currentPlayer === 'X' ? 'O' : 'X';
  const comoRival: TresEnRayaState = { ...state, currentPlayer: rival };
  return buscarGanadorasEnUno(comoRival);
}

function evaluarTerminal(board: readonly CellValue[], ia: Player): number | null {
  for (const [a, b, c] of LINEAS_GANADORAS) {
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) {
      return v === ia ? 1 : -1;
    }
  }
  return board.every(c => c !== null) ? 0 : null;
}

function minimax(
  board: CellValue[],
  turno: Player,
  ia: Player,
  profundidad: number,
  memo: Map<string, number>
): number {
  const terminal = evaluarTerminal(board, ia);
  if (terminal !== null) {
    if (terminal === 0) return 0;
    return terminal > 0 ? 10 - profundidad : profundidad - 10;
  }

  const clave = `${turno}:${board.map(c => c ?? '.').join('')}`;
  const cacheado = memo.get(clave);
  if (cacheado !== undefined) return cacheado;

  const esMax = turno === ia;
  let mejor = esMax ? -Infinity : Infinity;
  const siguiente: Player = turno === 'X' ? 'O' : 'X';

  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;
    board[i] = turno;
    const valor = minimax(board, siguiente, ia, profundidad + 1, memo);
    board[i] = null;
    mejor = esMax ? Math.max(mejor, valor) : Math.min(mejor, valor);
  }

  memo.set(clave, mejor);
  return mejor;
}

function elegirDificil(state: TresEnRayaState, rng: Rng): number {
  const libres = casillasLibres(state.board);
  if (libres.length === 9) {
    return elegirAlAzar([0, 2, 4, 6, 8], rng);
  }
  const board = [...state.board];
  const ia = state.currentPlayer;
  const rival: Player = ia === 'X' ? 'O' : 'X';
  const memo = new Map<string, number>();

  let mejorPuntaje = -Infinity;
  let mejores: number[] = [];

  for (const i of libres) {
    board[i] = ia;
    const puntaje = minimax(board, rival, ia, 0, memo);
    board[i] = null;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejores = [i];
    } else if (puntaje === mejorPuntaje) {
      mejores.push(i);
    }
  }

  return elegirAlAzar(mejores, rng);
}

export function elegirMovimiento(
  state: TresEnRayaState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const libres = casillasLibres(state.board);
  if (libres.length === 0) return -1;

  if (dificultad === 'facil') {
    const ganadoras = buscarGanadorasEnUno(state);
    if (ganadoras.length > 0 && (libres.length === ganadoras.length || rng() < 0.3)) {
      return elegirAlAzar(ganadoras, rng);
    }
    return elegirAlAzar(libres, rng);
  }

  if (dificultad === 'medio') {
    const ganadoras = buscarGanadorasEnUno(state);
    if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);

    const bloqueos = buscarBloqueosEnUno(state);
    if (bloqueos.length > 0) return elegirAlAzar(bloqueos, rng);

    const tacticas = CENTRO_Y_ESQUINAS.filter(i => state.board[i] === null);
    if (tacticas.length > 0 && rng() < 0.5) {
      return elegirAlAzar(tacticas, rng);
    }
    return elegirAlAzar(libres, rng);
  }

  return elegirDificil(state, rng);
}
```

Conectar en `src/games/tres-en-raya/Board.astro` (importar `elegirMovimiento` y añadir `elegirMovimientoBot`):

```ts
  import { createInitialState, esJugadaValida, playMove, type TresEnRayaState } from './engine';
  import { elegirMovimiento } from './bot';
  import { iniciarSesionJuego } from '../../lib/gameSession';
```

y dentro de `iniciarSesionJuego<number>({ ... })`:

```ts
    obtenerSnapshot: () => state,
    elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

- [ ] **Step 4: Ejecutar tests y chequeo de tipos**

Run: `npx vitest run src/games/tres-en-raya/ && npm run check`
Expected: PASS — todos los tests de Tres en raya (engine + bot) y `astro check` pasan.

- [ ] **Step 5: Commit**

```bash
git add src/games/tres-en-raya/bot.ts src/games/tres-en-raya/bot.test.ts src/games/tres-en-raya/Board.astro
git commit -m "feat(tres-en-raya): bot con 3 dificultades y conexión al modo solitario"
```

---

### Task 7: Bot de Nim y conexión al tablero

**Files:**
- Create: `src/games/nim/bot.ts`
- Create: `src/games/nim/bot.test.ts`
- Modify: `src/games/nim/Board.astro:127-170`

**Interfaces:**
- Consumes: `NimState`, `NimMove`, `esJugadaValida`, `playMove`, `createInitialState` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `elegirMovimiento(state: NimState, dificultad: Dificultad, rng?: Rng): NimMove`.

- [ ] **Step 1: Escribir el test que falla (`src/games/nim/bot.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type NimMove, type NimState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function nimSum(montones: readonly number[]): number {
  return montones.reduce((acc, n) => acc ^ n, 0);
}

function jugadaAzar(state: NimState, rng: () => number): NimMove {
  const filas = state.montones.flatMap((n, fila) => (n > 0 ? [fila] : []));
  const fila = filas[Math.floor(rng() * filas.length)];
  const dejar = Math.floor(rng() * state.montones[fila]);
  return { fila, dejar };
}

function simular(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('nim bot', () => {
  it('genera jugadas legales en los 3 niveles desde cualquier estado', () => {
    const rng = crearRng(17);
    const estados: NimState[] = [
      createInitialState(),
      { montones: [0, 2, 0, 5], currentPlayer: 2, status: 'playing', winner: null, lastMove: null },
      { montones: [0, 0, 3, 0], currentPlayer: 1, status: 'playing', winner: null, lastMove: null },
    ];
    for (const est of estados) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const mov = elegirMovimiento(est, dif, rng);
        expect(esJugadaValida(mov)).toBe(true);
        expect(playMove(est, mov)).not.toBe(est);
      }
    }
  });

  it('difícil deja siempre nim-sum = 0 cuando la posición es ganadora', () => {
    const rng = crearRng(99);
    const ganadores = [
      [1, 3, 5, 6],
      [0, 2, 4, 5],
      [1, 0, 0, 7],
      [0, 3, 0, 0],
    ];
    for (const montones of ganadores) {
      expect(nimSum(montones)).not.toBe(0);
      const state: NimState = {
        montones,
        currentPlayer: 2,
        status: 'playing',
        winner: null,
        lastMove: null,
      };
      const mov = elegirMovimiento(state, 'dificil', rng);
      const next = playMove(state, mov);
      expect(nimSum(next.montones)).toBe(0);
    }
  });

  it('medio iguala dos montones distintos y cierra con 1 montón', () => {
    const rng = crearRng(5);
    const dosMontones: NimState = {
      montones: [0, 3, 0, 5],
      currentPlayer: 2,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const next = playMove(dosMontones, elegirMovimiento(dosMontones, 'medio', rng));
    expect(next.montones).toEqual([0, 3, 0, 3]);

    const unMonton: NimState = {
      montones: [0, 0, 4, 0],
      currentPlayer: 2,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    expect(playMove(unMonton, elegirMovimiento(unMonton, 'medio', rng)).status).toBe('won');
  });

  it('calibración: dificil > medio > facil y azar gana a facil con frecuencia', () => {
    const rng = crearRng(2026);
    let dificilVsMedio = 0;
    let medioVsFacil = 0;
    let azarVsFacil = 0;
    const N = 80;

    for (let i = 0; i < N; i++) {
      // Nota: desde [1, 3, 5, 7] (nim-sum = 0), quien va 2.º tiene ventaja teórica si juega óptimo;
      // alternamos o medimos en el asiento favorable/simétrico.
      if (simular('medio', 'dificil', rng) === 2) dificilVsMedio++;
      if (simular('medio', 'facil', rng) === 1) medioVsFacil++;
      if (simular('azar', 'facil', rng) === 1) azarVsFacil++;
    }

    expect(dificilVsMedio).toBeGreaterThan(N * 0.75);
    expect(medioVsFacil).toBeGreaterThan(N * 0.65);
    expect(azarVsFacil).toBeGreaterThan(N * 0.45);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/games/nim/bot.test.ts`
Expected: FAIL — no existe `./bot`.

- [ ] **Step 3: Implementar `src/games/nim/bot.ts` y conectar `Board.astro`**

Crear `src/games/nim/bot.ts`:

```ts
import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import type { NimMove, NimState } from './engine';

function jugadasOptimasXor(montones: readonly number[]): NimMove[] {
  const nimSum = montones.reduce((acc, n) => acc ^ n, 0);
  if (nimSum === 0) return [];

  const optimas: NimMove[] = [];
  for (let fila = 0; fila < montones.length; fila++) {
    const actual = montones[fila];
    const dejar = actual ^ nimSum;
    if (dejar < actual) {
      optimas.push({ fila, dejar });
    }
  }
  return optimas;
}

function filasActivas(montones: readonly number[]): number[] {
  const filas: number[] = [];
  for (let i = 0; i < montones.length; i++) {
    if (montones[i] > 0) filas.push(i);
  }
  return filas;
}

function jugadaSuave(montones: readonly number[], rng: Rng): NimMove {
  const activas = filasActivas(montones);
  const fila = elegirAlAzar(activas, rng);
  const maxQuitar = Math.min(2, montones[fila]);
  const quitar = Math.floor(rng() * maxQuitar) + 1;
  return { fila, dejar: montones[fila] - quitar };
}

export function elegirMovimiento(
  state: NimState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): NimMove {
  const activas = filasActivas(state.montones);
  if (activas.length === 0) return { fila: 0, dejar: 0 };

  if (dificultad === 'facil') {
    if (activas.length === 1) {
      const fila = activas[0];
      const n = state.montones[fila];
      if (n === 1 || rng() < 0.4) return { fila, dejar: 0 };
      const dejar = Math.min(2, Math.floor(rng() * (n - 1)) + 1);
      return { fila, dejar };
    }
    const fila = elegirAlAzar(activas, rng);
    const dejar = Math.floor(rng() * state.montones[fila]);
    return { fila, dejar };
  }

  if (dificultad === 'medio') {
    if (activas.length === 1) {
      return { fila: activas[0], dejar: 0 };
    }
    if (activas.length === 2) {
      const [f0, f1] = activas;
      const n0 = state.montones[f0];
      const n1 = state.montones[f1];
      if (n0 !== n1) {
        return n0 > n1 ? { fila: f0, dejar: n1 } : { fila: f1, dejar: n0 };
      }
    }
    const optimas = jugadasOptimasXor(state.montones);
    if (optimas.length > 0 && rng() < 0.45) {
      return elegirAlAzar(optimas, rng);
    }
    return jugadaSuave(state.montones, rng);
  }

  const optimas = jugadasOptimasXor(state.montones);
  if (optimas.length > 0) {
    return elegirAlAzar(optimas, rng);
  }
  const fila = elegirAlAzar(activas, rng);
  return { fila, dejar: state.montones[fila] - 1 };
}
```

Conectar en `src/games/nim/Board.astro` (importar `elegirMovimiento` y añadir `elegirMovimientoBot`):

```ts
  import { elegirMovimiento } from './bot';
```

y dentro de `iniciarSesionJuego<NimMove>({ ... })`:

```ts
    obtenerSnapshot: () => state,
    elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

- [ ] **Step 4: Ejecutar tests y chequeo de tipos**

Run: `npx vitest run src/games/nim/ && npm run check`
Expected: PASS — todos los tests de Nim y `astro check` pasan.

- [ ] **Step 5: Commit**

```bash
git add src/games/nim/bot.ts src/games/nim/bot.test.ts src/games/nim/Board.astro
git commit -m "feat(nim): bot con estrategia XOR en 3 dificultades y conexión solitaria"
```

---

### Task 8: Bot de Chomp y conexión al tablero

**Files:**
- Create: `src/games/chomp/bot.ts`
- Create: `src/games/chomp/bot.test.ts`
- Modify: `src/games/chomp/Board.astro:91-126`

**Interfaces:**
- Consumes: `ChompState`, `FILAS`, `COLUMNAS`, `INDICE_VENENO`, `esJugadaValida`, `playMove`, `createInitialState` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `elegirMovimiento(state: ChompState, dificultad: Dificultad, rng?: Rng): number`.

- [ ] **Step 1: Escribir el test que falla (`src/games/chomp/bot.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type ChompState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: ChompState, rng: () => number): number {
  const legales = state.board.flatMap((viva, i) => (viva && i !== 0 ? [i] : []));
  return legales[Math.floor(rng() * legales.length)];
}

function simular(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('chomp bot', () => {
  it('genera jugadas legales en los 3 niveles', () => {
    const rng = crearRng(8);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const mov = elegirMovimiento(state, dif, rng);
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('difícil como Jugador 1 desde inicio siempre gana en Chomp 4x7 y resuelve en < 5 ms', () => {
    const inicio = performance.now();
    const rng = crearRng(42);
    for (let i = 0; i < 40; i++) {
      expect(simular('dificil', 'medio', rng)).toBe(1);
    }
    const movInicio = elegirMovimiento(createInitialState(), 'dificil', crearRng(1));
    expect(esJugadaValida(movInicio)).toBe(true);
    expect(performance.now() - inicio).toBeLessThan(200);
  });

  it('medio gana en 1 y evita dejar una sola fila o columna cuando hay alternativa', () => {
    const rng = crearRng(3);
    // Solo fila 0 con 3 onzas vivas -> debe comer índice 1 y ganar
    let sGanaEn1 = createInitialState();
    sGanaEn1 = playMove(sGanaEn1, 7); // come filas 1..3
    sGanaEn1 = playMove(sGanaEn1, 3); // deja fila 0 de largo 3
    expect(elegirMovimiento(sGanaEn1, 'medio', rng)).toBe(1);

    // Tablero con 2x2 vivas: comer (1,0)=7 deja solo fila 0 (victoria en 1 rival),
    // comer (0,1)=1 deja solo col 0 (victoria en 1 rival). Debe elegir (1,1)=8.
    let s2x2 = createInitialState();
    s2x2 = playMove(s2x2, 2);
    s2x2 = playMove(s2x2, 14);
    expect(elegirMovimiento(s2x2, 'medio', rng)).toBe(8);
  });

  it('calibración: dificil > medio > facil y azar gana a facil con frecuencia', () => {
    const rng = crearRng(777);
    let medioGana = 0;
    let azarGana = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('azar', 'facil', rng) === 1) azarGana++;
    }
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(N * 0.4);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/games/chomp/bot.test.ts`
Expected: FAIL — no existe `./bot`.

- [ ] **Step 3: Implementar `src/games/chomp/bot.ts` y conectar `Board.astro`**

Crear `src/games/chomp/bot.ts`:

```ts
import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  COLUMNAS,
  FILAS,
  INDICE_VENENO,
  TOTAL_CASILLAS,
  type ChompState,
} from './engine';

type Filas = readonly [number, number, number, number];

const memoGanadora = new Map<number, boolean>();

function empaquetar(r: Filas): number {
  return (r[0] << 9) | (r[1] << 6) | (r[2] << 3) | r[3];
}

function morderFilas(r: Filas, row: number, col: number): [number, number, number, number] {
  return [
    row <= 0 ? Math.min(r[0], col) : r[0],
    row <= 1 ? Math.min(r[1], col) : r[1],
    row <= 2 ? Math.min(r[2], col) : r[2],
    row <= 3 ? Math.min(r[3], col) : r[3],
  ];
}

function esPosicionGanadora(r: Filas): boolean {
  if (r[0] === 1 && r[1] === 0 && r[2] === 0 && r[3] === 0) {
    return false;
  }
  const clave = empaquetar(r);
  const cacheado = memoGanadora.get(clave);
  if (cacheado !== undefined) return cacheado;

  for (let row = 0; row < FILAS; row++) {
    for (let col = 0; col < r[row]; col++) {
      if (row === 0 && col === 0) continue;
      const siguiente = morderFilas(r, row, col);
      if (!esPosicionGanadora(siguiente)) {
        memoGanadora.set(clave, true);
        return true;
      }
    }
  }

  memoGanadora.set(clave, false);
  return false;
}

function extraerFilas(board: readonly boolean[]): [number, number, number, number] {
  const filas: [number, number, number, number] = [0, 0, 0, 0];
  for (let r = 0; r < FILAS; r++) {
    let largo = 0;
    for (let c = 0; c < COLUMNAS; c++) {
      if (board[r * COLUMNAS + c]) largo++;
    }
    filas[r] = largo;
  }
  return filas;
}

function jugadasLegales(state: ChompState): number[] {
  const legales: number[] = [];
  for (let i = 1; i < TOTAL_CASILLAS; i++) {
    if (i !== INDICE_VENENO && state.board[i]) legales.push(i);
  }
  return legales;
}

function esVictoriaInmediata(filas: Filas, indice: number): boolean {
  const row = Math.floor(indice / COLUMNAS);
  const col = indice % COLUMNAS;
  const s = morderFilas(filas, row, col);
  return s[0] === 1 && s[1] === 0 && s[2] === 0 && s[3] === 0;
}

function regalaVictoriaEnUno(filas: Filas, indice: number): boolean {
  const row = Math.floor(indice / COLUMNAS);
  const col = indice % COLUMNAS;
  const s = morderFilas(filas, row, col);
  if (s[0] === 1 && s[1] === 0) return false; // ya ganó quien mueve
  return s[1] === 0 || s[0] === 1;
}

export function elegirMovimiento(
  state: ChompState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const legales = jugadasLegales(state);
  if (legales.length === 0) return 1;

  const filas = extraerFilas(state.board);
  const inmediatas = legales.filter(i => esVictoriaInmediata(filas, i));

  if (dificultad === 'facil') {
    if (inmediatas.length > 0 && (legales.length === inmediatas.length || rng() < 0.35)) {
      return elegirAlAzar(inmediatas, rng);
    }
    return elegirAlAzar(legales, rng);
  }

  if (dificultad === 'medio') {
    if (inmediatas.length > 0) return elegirAlAzar(inmediatas, rng);
    const seguras = legales.filter(i => !regalaVictoriaEnUno(filas, i));
    const pool = seguras.length > 0 ? seguras : legales;
    const ganadoras = pool.filter(i => {
      const row = Math.floor(i / COLUMNAS);
      const col = i % COLUMNAS;
      return !esPosicionGanadora(morderFilas(filas, row, col));
    });
    if (ganadoras.length > 0 && rng() < 0.4) {
      return elegirAlAzar(ganadoras, rng);
    }
    return elegirAlAzar(pool, rng);
  }

  const ganadorasExactas: number[] = [];
  let maxVivas = -1;
  let perdedorasLargas: number[] = [];

  for (const i of legales) {
    const row = Math.floor(i / COLUMNAS);
    const col = i % COLUMNAS;
    const siguiente = morderFilas(filas, row, col);
    if (!esPosicionGanadora(siguiente)) {
      ganadorasExactas.push(i);
    } else {
      const vivas = siguiente[0] + siguiente[1] + siguiente[2] + siguiente[3];
      if (vivas > maxVivas) {
        maxVivas = vivas;
        perdedorasLargas = [i];
      } else if (vivas === maxVivas) {
        perdedorasLargas.push(i);
      }
    }
  }

  if (ganadorasExactas.length > 0) {
    return elegirAlAzar(ganadorasExactas, rng);
  }
  return elegirAlAzar(perdedorasLargas, rng);
}
```

Conectar en `src/games/chomp/Board.astro` (importar `elegirMovimiento` y añadir `elegirMovimientoBot`):

```ts
  import { elegirMovimiento } from './bot';
```

y dentro de `iniciarSesionJuego<number>({ ... })`:

```ts
    obtenerSnapshot: () => state,
    elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

- [ ] **Step 4: Ejecutar tests y chequeo de tipos**

Run: `npx vitest run src/games/chomp/ && npm run check`
Expected: PASS — todos los tests de Chomp y `astro check` pasan.

- [ ] **Step 5: Commit**

```bash
git add src/games/chomp/bot.ts src/games/chomp/bot.test.ts src/games/chomp/Board.astro
git commit -m "feat(chomp): bot con solucionador exacto memoizado y conexión solitaria"
```

---
### Task 9: Bot de Obstrucción y conexión al tablero

**Files:**
- Create: `src/games/obstruccion/bot.ts`
- Create: `src/games/obstruccion/bot.test.ts`
- Modify: `src/games/obstruccion/Board.astro:64-100`

**Interfaces:**
- Consumes: `ObstruccionState`, `TAMANO`, `casillaLegal`, `esJugadaValida`, `playMove`, `createInitialState` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `elegirMovimiento(state: ObstruccionState, dificultad: Dificultad, rng?: Rng): number`.

- [ ] **Step 1: Escribir el test que falla (`src/games/obstruccion/bot.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import {
  casillaLegal,
  createInitialState,
  esJugadaValida,
  playMove,
  type ObstruccionState,
} from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: ObstruccionState, rng: () => number): number {
  const legales: number[] = [];
  for (let i = 0; i < 36; i++) {
    if (casillaLegal(state.board, i)) legales.push(i);
  }
  return legales[Math.floor(rng() * legales.length)];
}

function simular(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('obstruccion bot', () => {
  it('devuelve jugadas legales en los 3 niveles en menos de 30 ms por jugada', () => {
    const rng = crearRng(11);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('medio y difícil toman una victoria inmediata', () => {
    const rng = crearRng(5);
    let s = createInitialState();
    let verificado = false;
    while (s.status === 'playing') {
      const ganadoras: number[] = [];
      for (let i = 0; i < 36; i++) {
        if (casillaLegal(s.board, i) && playMove(s, i).status === 'won') ganadoras.push(i);
      }
      if (ganadoras.length > 0) {
        expect(ganadoras).toContain(elegirMovimiento(s, 'medio', rng));
        expect(ganadoras).toContain(elegirMovimiento(s, 'dificil', rng));
        verificado = true;
        break;
      }
      s = playMove(s, jugadaAzar(s, rng));
    }
    expect(verificado).toBe(true);
  });

  it('calibración: dificil > medio > facil y azar gana a facil', () => {
    const rng = crearRng(555);
    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('azar', 'facil', rng) === 1) azarGana++;
    }
    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(N * 0.35);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/games/obstruccion/bot.test.ts`
Expected: FAIL — no existe `./bot`.

- [ ] **Step 3: Implementar `src/games/obstruccion/bot.ts` y conectar `Board.astro`**

Crear `src/games/obstruccion/bot.ts`:

```ts
import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, casillaLegal, type ObstruccionState } from './engine';

const TOTAL = TAMANO * TAMANO;

const VECINOS_MASK: bigint[] = Array.from({ length: TOTAL }, (_, idx) => {
  const fila = Math.floor(idx / TAMANO);
  const col = idx % TAMANO;
  let mask = 0n;
  for (let df = -1; df <= 1; df++) {
    for (let dc = -1; dc <= 1; dc++) {
      const f = fila + df;
      const c = col + dc;
      if (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO) {
        mask |= 1n << BigInt(f * TAMANO + c);
      }
    }
  }
  return mask;
});

const CENTRO_PESO: number[] = Array.from({ length: TOTAL }, (_, idx) => {
  const fila = Math.floor(idx / TAMANO);
  const col = idx % TAMANO;
  const dist = Math.abs(fila - 2.5) + Math.abs(col - 2.5);
  return Math.round(6 - dist);
});

function construirMascaraLegal(state: ObstruccionState): bigint {
  let mask = 0n;
  for (let i = 0; i < TOTAL; i++) {
    if (casillaLegal(state.board, i)) mask |= 1n << BigInt(i);
  }
  return mask;
}

function listarIndices(mask: bigint): number[] {
  const indices: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if ((mask & (1n << BigInt(i))) !== 0n) indices.push(i);
  }
  return indices;
}

function popcount(mask: bigint): number {
  let count = 0;
  let m = mask;
  while (m !== 0n) {
    m &= m - 1n;
    count++;
  }
  return count;
}

function esGanadoraExacta(mask: bigint, memoExacto: Map<bigint, boolean>): boolean {
  if (mask === 0n) return false;
  const cacheado = memoExacto.get(mask);
  if (cacheado !== undefined) return cacheado;

  const libres = listarIndices(mask);
  libres.sort((a, b) => popcount(mask & ~VECINOS_MASK[a]) - popcount(mask & ~VECINOS_MASK[b]));

  for (const m of libres) {
    const siguiente = mask & ~VECINOS_MASK[m];
    if (!esGanadoraExacta(siguiente, memoExacto)) {
      memoExacto.set(mask, true);
      return true;
    }
  }

  memoExacto.set(mask, false);
  return false;
}

function negamax(
  mask: bigint,
  profundidad: number,
  alpha: number,
  beta: number,
  memoExacto: Map<bigint, boolean>
): number {
  if (mask === 0n) return -1000;
  const n = popcount(mask);
  if (n <= 14) {
    return esGanadoraExacta(mask, memoExacto) ? 1000 + profundidad : -1000 - profundidad;
  }

  const libres = listarIndices(mask);
  if (profundidad === 0) {
    // Heurística ligera: número impar de casillas restantes y movilidad acotada.
    return (n % 2 === 1 ? 8 : -8) + Math.min(libres.length, 20);
  }

  libres.sort((a, b) => {
    const remA = popcount(mask & ~VECINOS_MASK[a]);
    const remB = popcount(mask & ~VECINOS_MASK[b]);
    if (remA !== remB) return remA - remB;
    return CENTRO_PESO[b] - CENTRO_PESO[a];
  });

  const limite = libres.slice(0, 12);
  let mejor = -Infinity;
  for (const m of limite) {
    const siguiente = mask & ~VECINOS_MASK[m];
    const valor = -negamax(siguiente, profundidad - 1, -beta, -alpha, memoExacto);
    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }
  return mejor;
}

export function elegirMovimiento(
  state: ObstruccionState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const mask = construirMascaraLegal(state);
  const legales = listarIndices(mask);
  if (legales.length === 0) return 0;

  const inmediatas = legales.filter(i => (mask & ~VECINOS_MASK[i]) === 0n);

  if (dificultad === 'facil') {
    if (inmediatas.length > 0 && (legales.length === inmediatas.length || rng() < 0.4)) {
      return elegirAlAzar(inmediatas, rng);
    }
    return elegirAlAzar(legales, rng);
  }

  if (inmediatas.length > 0) return elegirAlAzar(inmediatas, rng);

  if (dificultad === 'medio') {
    const seguras = legales.filter(i => {
      const sig = mask & ~VECINOS_MASK[i];
      for (const j of listarIndices(sig)) {
        if ((sig & ~VECINOS_MASK[j]) === 0n) return false;
      }
      return true;
    });
    return elegirAlAzar(seguras.length > 0 ? seguras : legales, rng);
  }

  const memoExacto = new Map<bigint, boolean>();
  let mejorPuntaje = -Infinity;
  let mejores: number[] = [];

  for (const m of legales) {
    const siguiente = mask & ~VECINOS_MASK[m];
    const valor = -negamax(siguiente, 5, -Infinity, Infinity, memoExacto);
    if (valor > mejorPuntaje) {
      mejorPuntaje = valor;
      mejores = [m];
    } else if (valor === mejorPuntaje) {
      mejores.push(m);
    }
  }

  return elegirAlAzar(mejores, rng);
}
```

Conectar en `src/games/obstruccion/Board.astro` (importar `elegirMovimiento` y añadir `elegirMovimientoBot`):

```ts
  import { elegirMovimiento } from './bot';
```

y dentro de `iniciarSesionJuego<number>({ ... })`:

```ts
    obtenerSnapshot: () => state,
    elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

- [ ] **Step 4: Ejecutar tests y chequeo de tipos**

Run: `npx vitest run src/games/obstruccion/ && npm run check`
Expected: PASS — todos los tests de Obstrucción y `astro check` pasan.

- [ ] **Step 5: Commit**

```bash
git add src/games/obstruccion/bot.ts src/games/obstruccion/bot.test.ts src/games/obstruccion/Board.astro
git commit -m "feat(obstruccion): bot con búsqueda alfa-beta en bitmask y conexión solitaria"
```

---

### Task 10: Bot de Puntos y cajas y conexión al tablero

**Files:**
- Create: `src/games/puntos-y-cajas/bot.ts`
- Create: `src/games/puntos-y-cajas/bot.test.ts`
- Modify: `src/games/puntos-y-cajas/Board.astro:152-183`

**Interfaces:**
- Consumes: `PuntosYCajasState`, `LineId`, `esLineId`, `playLine`, `createInitialState` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `elegirMovimiento(state: PuntosYCajasState, dificultad: Dificultad, rng?: Rng): LineId`.

- [ ] **Step 1: Escribir el test que falla (`src/games/puntos-y-cajas/bot.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esLineId,
  playLine,
  type LineId,
  type PuntosYCajasState,
} from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function lineasLibres(state: PuntosYCajasState): LineId[] {
  const res: LineId[] = [];
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size - 1; c++) {
      if (!state.horizontalLines[r][c]) res.push({ type: 'h', row: r, col: c });
    }
  }
  for (let r = 0; r < state.size - 1; r++) {
    for (let c = 0; c < state.size; c++) {
      if (!state.verticalLines[r][c]) res.push({ type: 'v', row: r, col: c });
    }
  }
  return res;
}

function simular(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState(4);
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    let mov: LineId;
    if (dif === 'azar') {
      const libres = lineasLibres(state);
      mov = libres[Math.floor(rng() * libres.length)];
    } else {
      mov = elegirMovimiento(state, dif, rng);
    }
    expect(esLineId(mov)).toBe(true);
    const next = playLine(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.scores;
}

describe('puntos-y-cajas bot', () => {
  it('genera jugadas legales en los 3 niveles en menos de 30 ms por jugada', () => {
    const rng = crearRng(31);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState(4);
      while (state.status === 'playing') {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esLineId(mov)).toBe(true);
        const next = playLine(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('medio y difícil cierran caja disponible y evitan regalar el 3.er lado si hay línea segura', () => {
    const rng = crearRng(9);
    // Caja (0,0) con 3 lados puestos -> el 4.º cierra la caja.
    let sCerrar = createInitialState(4);
    sCerrar = playLine(sCerrar, { type: 'h', row: 0, col: 0 });
    sCerrar = playLine(sCerrar, { type: 'h', row: 1, col: 0 });
    sCerrar = playLine(sCerrar, { type: 'v', row: 0, col: 0 });
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sCerrar, dif, rng)).toEqual({ type: 'v', row: 0, col: 1 });
    }

    // Caja (0,0) con 2 lados puestos -> no regalar el 3.º mientras queden seguras.
    let sSegura = createInitialState(4);
    sSegura = playLine(sSegura, { type: 'h', row: 0, col: 0 });
    sSegura = playLine(sSegura, { type: 'v', row: 0, col: 0 });
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(sSegura, dif, rng);
      expect(mov).not.toEqual({ type: 'h', row: 1, col: 0 });
      expect(mov).not.toEqual({ type: 'v', row: 0, col: 1 });
    }
  });

  it('difícil sacrifica la cadena más corta cuando solo quedan sacrificios', () => {
    const rng = crearRng(14);
    // Preparar tablero de 4x4 donde quedan solo 2 cadenas por sacrificar:
    // una cadena de longitud 1 (caja (0,0)) y una cadena de longitud 2 (cajas (2,1)-(2,2)),
    // dejando el resto de líneas seguras ya trazadas (sin ninguna caja con 3 lados).
    let s = createInitialState(4);
    // Llenar bordes exteriores y líneas seguras para dejar aislada caja (0,0) de 2 lados
    // y el par (2,1)+(2,2) como cadena de 2 cajas.
    const trazos: LineId[] = [
      // Caja (0,0): tiene 2 lados (top + left) -> cualquier otro lado regala 1 caja.
      { type: 'h', row: 0, col: 0 },
      { type: 'v', row: 0, col: 0 },
      // Cerrar (0,1), (0,2), (1,0), (1,1), (1,2), (2,0) con líneas que dejen 2 lados en (2,1)+(2,2)
      { type: 'h', row: 0, col: 1 },
      { type: 'v', row: 0, col: 2 },
      { type: 'h', row: 0, col: 2 },
      { type: 'v', row: 0, col: 3 },
      { type: 'h', row: 1, col: 1 },
      { type: 'h', row: 1, col: 2 },
      { type: 'v', row: 1, col: 0 },
      { type: 'v', row: 1, col: 1 },
      { type: 'h', row: 2, col: 0 },
      { type: 'v', row: 2, col: 0 },
      { type: 'h', row: 3, col: 0 },
      // Par (2,1) y (2,2): falta la divisoria v(2,2) y los bordes; ponemos 2 lados en cada una
      // para que cualquier jugada allí regale la cadena de 2 cajas:
      { type: 'h', row: 2, col: 1 },
      { type: 'h', row: 2, col: 2 },
      { type: 'v', row: 2, col: 1 },
      { type: 'v', row: 2, col: 3 },
    ];
    for (const l of trazos) s = playLine(s, l);
    // Verificar que la caja (0,0) solo tiene 2 lados y es un sacrificio de 1 caja,
    // mientras jugar en (2,1)/(2,2) entrega 2 cajas o resuelve igual.
    const mov = elegirMovimiento(s, 'dificil', rng);
    expect(esLineId(mov)).toBe(true);
    const tras = playLine(s, mov);
    expect(tras).not.toBe(s);
  });

  it('calibración: dificil >= medio > facil y azar gana a facil', () => {
    const rng = crearRng(404);
    let medioGana = 0;
    let dificilGana = 0;
    let azarGana = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const dm = simular('dificil', 'medio', rng);
      if (dm[1] >= dm[2]) dificilGana++;
      const mf = simular('medio', 'facil', rng);
      if (mf[1] > mf[2]) medioGana++;
      const af = simular('azar', 'facil', rng);
      if (af[1] > af[2]) azarGana++;
    }
    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(N * 0.4);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/games/puntos-y-cajas/bot.test.ts`
Expected: FAIL — no existe `./bot`.

- [ ] **Step 3: Implementar `src/games/puntos-y-cajas/bot.ts` y conectar `Board.astro`**

Crear `src/games/puntos-y-cajas/bot.ts`:

```ts
import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { playLine, type LineId, type PuntosYCajasState } from './engine';

const TOTAL_LINEAS_4 = 24;
const UMBRAL_FIN_EXACTO = 12;

// Para size=4 (9 cajas, 24 líneas): índice 0..11 = H(r*3+c), 12..23 = V(12+r*4+c).
const LINEAS_4: LineId[] = (() => {
  const lista: LineId[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) lista.push({ type: 'h', row: r, col: c });
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) lista.push({ type: 'v', row: r, col: c });
  }
  return lista;
})();

const CAJAS_DE_LINEA_4: number[][] = LINEAS_4.map(l => {
  const cajas: number[] = [];
  if (l.type === 'h') {
    if (l.row > 0) cajas.push((l.row - 1) * 3 + l.col);
    if (l.row < 3) cajas.push(l.row * 3 + l.col);
  } else {
    if (l.col > 0) cajas.push(l.row * 3 + (l.col - 1));
    if (l.col < 3) cajas.push(l.row * 3 + l.col);
  }
  return cajas;
});

const LINEAS_DE_CAJA_4: number[][] = Array.from({ length: 9 }, (_, boxIdx) => {
  const r = Math.floor(boxIdx / 3);
  const c = boxIdx % 3;
  return [
    r * 3 + c, // top
    (r + 1) * 3 + c, // bottom
    12 + r * 4 + c, // left
    12 + r * 4 + (c + 1), // right
  ];
});

function obtenerLineasLibres(state: PuntosYCajasState): LineId[] {
  const libres: LineId[] = [];
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size - 1; c++) {
      if (!state.horizontalLines[r][c]) libres.push({ type: 'h', row: r, col: c });
    }
  }
  for (let r = 0; r < state.size - 1; r++) {
    for (let c = 0; c < state.size; c++) {
      if (!state.verticalLines[r][c]) libres.push({ type: 'v', row: r, col: c });
    }
  }
  return libres;
}

function ladosTrazadosCaja(state: PuntosYCajasState, row: number, col: number): number {
  let lados = 0;
  if (state.horizontalLines[row][col]) lados++;
  if (state.horizontalLines[row + 1][col]) lados++;
  if (state.verticalLines[row][col]) lados++;
  if (state.verticalLines[row][col + 1]) lados++;
  return lados;
}

function cajasAdyacentes(state: PuntosYCajasState, line: LineId): Array<[number, number]> {
  const maxCaja = state.size - 1;
  const cajas: Array<[number, number]> = [];
  if (line.type === 'h') {
    if (line.row - 1 >= 0) cajas.push([line.row - 1, line.col]);
    if (line.row < maxCaja) cajas.push([line.row, line.col]);
  } else {
    if (line.col - 1 >= 0) cajas.push([line.row, line.col - 1]);
    if (line.col < maxCaja) cajas.push([line.row, line.col]);
  }
  return cajas;
}

function clasificarLineas(state: PuntosYCajasState, libres: readonly LineId[]) {
  const cierran: LineId[] = [];
  const seguras: LineId[] = [];
  const sacrificios: LineId[] = [];

  for (const l of libres) {
    const grados = cajasAdyacentes(state, l).map(([r, c]) => ladosTrazadosCaja(state, r, c));
    if (grados.some(g => g === 3)) {
      cierran.push(l);
    } else if (grados.some(g => g === 2)) {
      sacrificios.push(l);
    } else {
      seguras.push(l);
    }
  }

  return { cierran, seguras, sacrificios };
}

function tamanoCadenaRegalada(state: PuntosYCajasState, sacrificio: LineId): number {
  let s = playLine(state, sacrificio);
  const jugadorInicial = state.currentPlayer;
  if (s.status !== 'playing' || s.currentPlayer === jugadorInicial) return 0;

  let regaladas = 0;
  while (s.status === 'playing' && s.currentPlayer !== jugadorInicial) {
    const { cierran } = clasificarLineas(s, obtenerLineasLibres(s));
    if (cierran.length === 0) break;
    const prev = s.scores[1] + s.scores[2];
    s = playLine(s, cierran[0]);
    regaladas += s.scores[1] + s.scores[2] - prev;
  }
  return regaladas;
}

function maskDeEstado4(state: PuntosYCajasState): number {
  let mask = 0;
  let i = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.horizontalLines[r][c]) mask |= 1 << i;
      i++;
    }
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (state.verticalLines[r][c]) mask |= 1 << i;
      i++;
    }
  }
  return mask;
}

function ladosMaskCaja(mask: number, boxIdx: number): number {
  let lados = 0;
  for (const lineIdx of LINEAS_DE_CAJA_4[boxIdx]) {
    if ((mask & (1 << lineIdx)) !== 0) lados++;
  }
  return lados;
}

function cajasCompletadasAlTrazar(mask: number, lineIdx: number): number {
  let cerradas = 0;
  for (const boxIdx of CAJAS_DE_LINEA_4[lineIdx]) {
    if (ladosMaskCaja(mask, boxIdx) === 3) cerradas++;
  }
  return cerradas;
}

interface EntradaMemo {
  valor: number;
  tipo: 'EXACT' | 'LOWER' | 'UPPER';
}

function negamax4(
  mask: number,
  alpha: number,
  beta: number,
  memo: Map<number, EntradaMemo>
): number {
  if (mask === (1 << TOTAL_LINEAS_4) - 1) return 0;

  const alphaOrig = alpha;
  const hit = memo.get(mask);
  if (hit) {
    if (hit.tipo === 'EXACT') return hit.valor;
    if (hit.tipo === 'LOWER' && hit.valor > alpha) alpha = hit.valor;
    else if (hit.tipo === 'UPPER' && hit.valor < beta) beta = hit.valor;
    if (alpha >= beta) return hit.valor;
  }

  // Ordenar: primero las que cierran caja, luego seguras, al final sacrificios.
  const cierres: number[] = [];
  const otras: number[] = [];
  for (let i = 0; i < TOTAL_LINEAS_4; i++) {
    if ((mask & (1 << i)) !== 0) continue;
    if (cajasCompletadasAlTrazar(mask, i) > 0) cierres.push(i);
    else otras.push(i);
  }
  const ordenadas = cierres.length > 0 ? [...cierres, ...otras] : otras;

  let mejor = -Infinity;
  for (const i of ordenadas) {
    const cerradas = cajasCompletadasAlTrazar(mask, i);
    const nextMask = mask | (1 << i);
    const valor =
      cerradas > 0
        ? cerradas + negamax4(nextMask, alpha - cerradas, beta - cerradas, memo)
        : -negamax4(nextMask, -beta, -alpha, memo);

    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }

  memo.set(mask, {
    valor: mejor,
    tipo: mejor <= alphaOrig ? 'UPPER' : mejor >= beta ? 'LOWER' : 'EXACT',
  });
  return mejor;
}

function elegirEndgame4(mask: number, rng: Rng): LineId {
  const memo = new Map<number, EntradaMemo>();
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < TOTAL_LINEAS_4; i++) {
    if ((mask & (1 << i)) !== 0) continue;
    const cerradas = cajasCompletadasAlTrazar(mask, i);
    const nextMask = mask | (1 << i);
    const valor =
      cerradas > 0
        ? cerradas + negamax4(nextMask, -100, 100, memo)
        : -negamax4(nextMask, -100, 100, memo);

    if (valor > mejor) {
      mejor = valor;
      mejores = [i];
    } else if (valor === mejor) {
      mejores.push(i);
    }
  }

  return LINEAS_4[elegirAlAzar(mejores, rng)];
}

export function elegirMovimiento(
  state: PuntosYCajasState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): LineId {
  const libres = obtenerLineasLibres(state);
  if (libres.length === 0) return { type: 'h', row: 0, col: 0 };

  const { cierran, seguras, sacrificios } = clasificarLineas(state, libres);

  if (dificultad === 'facil') {
    if (cierran.length > 0 && rng() < 0.5) {
      return elegirAlAzar(cierran, rng);
    }
    return elegirAlAzar(libres, rng);
  }

  if (dificultad === 'medio') {
    if (cierran.length > 0) return elegirAlAzar(cierran, rng);
    if (seguras.length > 0) return elegirAlAzar(seguras, rng);
    return elegirAlAzar(sacrificios, rng);
  }

  if (state.size === 4 && libres.length <= UMBRAL_FIN_EXACTO) {
    return elegirEndgame4(maskDeEstado4(state), rng);
  }

  if (cierran.length > 0) return elegirAlAzar(cierran, rng);

  if (seguras.length > 0) {
    // Preferir líneas seguras que menos cajas dejan con 1 lado previo (para no construir cadenas).
    let mejorSuma = Infinity;
    let candidatas: LineId[] = [];
    for (const l of seguras) {
      const suma = cajasAdyacentes(state, l).reduce(
        (acc, [r, c]) => acc + ladosTrazadosCaja(state, r, c),
        0
      );
      if (suma < mejorSuma) {
        mejorSuma = suma;
        candidatas = [l];
      } else if (suma === mejorSuma) {
        candidatas.push(l);
      }
    }
    return elegirAlAzar(candidatas, rng);
  }

  let menorRegalo = Infinity;
  let mejoresSacrificios: LineId[] = [];
  for (const s of sacrificios) {
    const regalo = tamanoCadenaRegalada(state, s);
    if (regalo < menorRegalo) {
      menorRegalo = regalo;
      mejoresSacrificios = [s];
    } else if (regalo === menorRegalo) {
      mejoresSacrificios.push(s);
    }
  }
  return elegirAlAzar(mejoresSacrificios, rng);
}
```

Conectar en `src/games/puntos-y-cajas/Board.astro` (importar `elegirMovimiento` y añadir `elegirMovimientoBot`):

```ts
  import { elegirMovimiento } from './bot';
```

y dentro de `iniciarSesionJuego<LineId>({ ... })`:

```ts
    obtenerSnapshot: () => ({ state, repiteTurno }),
    elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

- [ ] **Step 4: Ejecutar tests y chequeo de tipos**

Run: `npx vitest run src/games/puntos-y-cajas/ && npm run check`
Expected: PASS — todos los tests de Puntos y cajas y `astro check` pasan.

- [ ] **Step 5: Commit**

```bash
git add src/games/puntos-y-cajas/bot.ts src/games/puntos-y-cajas/bot.test.ts src/games/puntos-y-cajas/Board.astro
git commit -m "feat(puntos-y-cajas): bot con análisis de cadenas, negamax y conexión solitaria"
```

---

### Task 11: Bot de Gomoku y conexión al tablero

**Files:**
- Create: `src/games/gomoku/bot.ts`
- Create: `src/games/gomoku/bot.test.ts`
- Modify: `src/games/gomoku/Board.astro:64-100`

**Interfaces:**
- Consumes: `GomokuState`, `CellValue`, `Player`, `TAMANO`, `PARA_GANAR`, `esJugadaValida`, `playMove`, `createInitialState` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `elegirMovimiento(state: GomokuState, dificultad: Dificultad, rng?: Rng): number`.

- [ ] **Step 1: Escribir el test que falla (`src/games/gomoku/bot.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type GomokuState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function simular(dif1: Dificultad, dif2: Dificultad, rng: () => number) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('gomoku bot', () => {
  it('genera jugadas legales en menos de 30 ms por turno en los 3 niveles', () => {
    const rng = crearRng(12);
    let state = createInitialState();
    // Avanzar una partida medio llena con difícil y medir cada respuesta.
    for (let turno = 0; turno < 24 && state.status === 'playing'; turno++) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(state.board[mov]).toBeNull();
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }
  });

  it('medio y difícil completan 5 en línea y bloquean 4 en línea del rival', () => {
    const rng = crearRng(7);
    // J1 alinea 4 en fila 4: cols 1,2,3,4 -> índices 37,38,39,40. Turno de J1: debe ganar en 36 o 41.
    let sGanar = createInitialState();
    for (const [m1, m2] of [
      [37, 0],
      [38, 1],
      [39, 2],
      [40, 3],
    ]) {
      sGanar = playMove(sGanar, m1);
      sGanar = playMove(sGanar, m2);
    }
    for (const dif of ['medio', 'dificil'] as const) {
      expect([36, 41]).toContain(elegirMovimiento(sGanar, dif, rng));
    }

    // J1 tiene 4 en fila (37..40); tras su jugada 40 le toca a J2 -> debe bloquear en 36 o 41.
    let sBloquear4 = createInitialState();
    sBloquear4 = playMove(sBloquear4, 37); // J1
    sBloquear4 = playMove(sBloquear4, 0); // J2
    sBloquear4 = playMove(sBloquear4, 38); // J1
    sBloquear4 = playMove(sBloquear4, 1); // J2
    sBloquear4 = playMove(sBloquear4, 39); // J1
    sBloquear4 = playMove(sBloquear4, 2); // J2
    sBloquear4 = playMove(sBloquear4, 40); // J1 -> ahora J2 debe bloquear en 36 o 41
    for (const dif of ['medio', 'dificil'] as const) {
      expect([36, 41]).toContain(elegirMovimiento(sBloquear4, dif, rng));
    }
  });

  it('calibración: dificil > medio > facil', () => {
    const rng = crearRng(909);
    let dificilGana = 0;
    let medioGana = 0;
    const N = 20;
    for (let i = 0; i < N; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'facil', rng) === 1) medioGana++;
    }
    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/games/gomoku/bot.test.ts`
Expected: FAIL — no existe `./bot`.

- [ ] **Step 3: Implementar `src/games/gomoku/bot.ts` y conectar `Board.astro`**

Crear `src/games/gomoku/bot.ts`:

```ts
import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { PARA_GANAR, TAMANO, type CellValue, type GomokuState, type Player } from './engine';

const TOTAL = TAMANO * TAMANO;
const CENTRO = Math.floor(TAMANO / 2) * TAMANO + Math.floor(TAMANO / 2);

const DIRECCIONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Precomputar las 36 líneas de longitud >= 5 para evaluación rápida sin asignaciones.
const LINEAS: number[][] = (() => {
  const res: number[][] = [];
  // Filas y columnas
  for (let i = 0; i < TAMANO; i++) {
    res.push(Array.from({ length: TAMANO }, (_, c) => i * TAMANO + c));
    res.push(Array.from({ length: TAMANO }, (_, f) => f * TAMANO + i));
  }
  // Diagonales ↘
  for (let start = 0; start <= TAMANO - PARA_GANAR; start++) {
    const d1: number[] = [];
    for (let k = 0; start + k < TAMANO; k++) d1.push(k * TAMANO + (start + k));
    res.push(d1);
    if (start > 0) {
      const d2: number[] = [];
      for (let k = 0; start + k < TAMANO; k++) d2.push((start + k) * TAMANO + k);
      res.push(d2);
    }
  }
  // Diagonales ↗
  for (let start = PARA_GANAR - 1; start < TAMANO; start++) {
    const d1: number[] = [];
    for (let k = 0; start - k >= 0; k++) d1.push(k * TAMANO + (start - k));
    res.push(d1);
    if (start < TAMANO - 1) {
      const baseF = TAMANO - 1 - start;
      const d2: number[] = [];
      for (let k = 0; baseF + k < TAMANO; k++) {
        d2.push((baseF + k) * TAMANO + (TAMANO - 1 - k));
      }
      res.push(d2);
    }
  }
  return res;
})();

function obtenerCandidatas(board: readonly CellValue[]): number[] {
  const marcadas: boolean[] = Array(TOTAL).fill(false);
  let hayFichas = false;

  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === null) continue;
    hayFichas = true;
    const f0 = Math.floor(i / TAMANO);
    const c0 = i % TAMANO;
    for (let df = -2; df <= 2; df++) {
      const f = f0 + df;
      if (f < 0 || f >= TAMANO) continue;
      for (let dc = -2; dc <= 2; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= TAMANO) continue;
        const idx = f * TAMANO + c;
        if (board[idx] === null) marcadas[idx] = true;
      }
    }
  }

  if (!hayFichas) return [CENTRO];

  const candidatas: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (marcadas[i]) candidatas.push(i);
  }
  if (candidatas.length > 0) return candidatas;

  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === null) candidatas.push(i);
  }
  return candidatas;
}

function esVictoriaEn(board: readonly CellValue[], idx: number, player: Player): boolean {
  const f0 = Math.floor(idx / TAMANO);
  const c0 = idx % TAMANO;
  for (const [df, dc] of DIRECCIONES) {
    let cuenta = 1;
    let f = f0 - df;
    let c = c0 - dc;
    while (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO && board[f * TAMANO + c] === player) {
      cuenta++;
      f -= df;
      c -= dc;
    }
    f = f0 + df;
    c = c0 + dc;
    while (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO && board[f * TAMANO + c] === player) {
      cuenta++;
      f += df;
      c += dc;
    }
    if (cuenta >= PARA_GANAR) return true;
  }
  return false;
}

function puntuarRacha(largo: number, abiertos: number): number {
  if (largo >= 5) return 100_000;
  if (abiertos === 0) return 0;
  if (largo === 4) return abiertos === 2 ? 15_000 : 2_500;
  if (largo === 3) return abiertos === 2 ? 1_200 : 180;
  if (largo === 2) return abiertos === 2 ? 90 : 18;
  return abiertos === 2 ? 6 : 1;
}

function evaluarTablero(board: readonly CellValue[], jugadorTurno: Player): number {
  const rival: Player = jugadorTurno === 1 ? 2 : 1;
  let score = 0;

  for (const linea of LINEAS) {
    let i = 0;
    const n = linea.length;
    while (i < n) {
      const ficha = board[linea[i]];
      if (ficha === null) {
        i++;
        continue;
      }
      const izqLibre = i > 0 && board[linea[i - 1]] === null;
      let j = i + 1;
      while (j < n && board[linea[j]] === ficha) j++;
      const derLibre = j < n && board[linea[j]] === null;
      const abiertos = (izqLibre ? 1 : 0) + (derLibre ? 1 : 0);
      const pts = puntuarRacha(j - i, abiertos);
      if (ficha === jugadorTurno) {
        score += pts;
      } else {
        // Ponderar ligeramente al rival en amenazas altas porque ya le toca pronto.
        score -= pts >= 1_200 ? Math.round(pts * 1.15) : pts;
      }
      i = j;
    }
  }
  return score;
}

function ordenarCandidatas(
  board: CellValue[],
  candidatas: number[],
  jugador: Player
): Array<{ idx: number; score: number }> {
  const rival: Player = jugador === 1 ? 2 : 1;
  const evaluadas = candidatas.map(idx => {
    board[idx] = jugador;
    const ataque = evaluarTablero(board, jugador);
    board[idx] = rival;
    const defensa = evaluarTablero(board, rival);
    board[idx] = null;
    const distCentro =
      Math.abs(Math.floor(idx / TAMANO) - 4) + Math.abs((idx % TAMANO) - 4);
    return { idx, score: ataque + Math.round(defensa * 0.9) - distCentro };
  });
  evaluadas.sort((a, b) => b.score - a.score);
  return evaluadas;
}

function negamax(
  board: CellValue[],
  profundidad: number,
  alpha: number,
  beta: number,
  turno: Player
): number {
  const candidatas = obtenerCandidatas(board);
  if (candidatas.length === 0) return 0;

  for (const idx of candidatas) {
    if (esVictoriaEn(board, idx, turno)) {
      return 100_000 + profundidad;
    }
  }

  if (profundidad === 0) {
    return evaluarTablero(board, turno);
  }

  const rival: Player = turno === 1 ? 2 : 1;
  const ordenadas = ordenarCandidatas(board, candidatas, turno).slice(0, 10);

  let mejor = -Infinity;
  for (const { idx } of ordenadas) {
    board[idx] = turno;
    const valor = -negamax(board, profundidad - 1, -beta, -alpha, rival);
    board[idx] = null;
    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }
  return mejor;
}

export function elegirMovimiento(
  state: GomokuState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const board = [...state.board];
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const candidatas = obtenerCandidatas(board);
  if (candidatas.length === 0) return CENTRO;

  // Tablero vacío: en Fácil variar alrededor del centro; en Medio/Difícil ir al centro.
  if (candidatas.length === 1 && candidatas[0] === CENTRO && board.every(c => c === null)) {
    if (dificultad === 'facil') {
      const vecindadCentro = [30, 31, 32, 39, 40, 41, 48, 49, 50];
      return elegirAlAzar(vecindadCentro, rng);
    }
    return CENTRO;
  }

  const ganadoras = candidatas.filter(i => esVictoriaEn(board, i, yo));

  if (dificultad === 'facil') {
    if (ganadoras.length > 0 && (candidatas.length === ganadoras.length || rng() < 0.4)) {
      return elegirAlAzar(ganadoras, rng);
    }
    const ordenadas = ordenarCandidatas(board, candidatas, yo);
    const conRuido = ordenadas.map(c => ({
      idx: c.idx,
      puntaje: c.score * 0.2 + rng() * 600,
    }));
    conRuido.sort((a, b) => b.puntaje - a.puntaje);
    return conRuido[0].idx;
  }

  if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);

  const bloqueos4 = candidatas.filter(i => esVictoriaEn(board, i, rival));
  if (bloqueos4.length > 0) return elegirAlAzar(bloqueos4, rng);

  const ordenadas = ordenarCandidatas(board, candidatas, yo);

  if (dificultad === 'medio') {
    const top = ordenadas.slice(0, Math.min(3, ordenadas.length)).map(c => c.idx);
    return elegirAlAzar(top, rng);
  }

  const top = ordenadas.slice(0, Math.min(10, ordenadas.length));
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (const { idx } of top) {
    board[idx] = yo;
    const valor = -negamax(board, 2, -Infinity, Infinity, rival);
    board[idx] = null;
    if (valor > mejor) {
      mejor = valor;
      mejores = [idx];
    } else if (valor === mejor) {
      mejores.push(idx);
    }
  }

  return elegirAlAzar(mejores, rng);
}
```

Conectar en `src/games/gomoku/Board.astro` (importar `elegirMovimiento` y añadir `elegirMovimientoBot`):

```ts
  import { elegirMovimiento } from './bot';
```

y dentro de `iniciarSesionJuego<number>({ ... })`:

```ts
    obtenerSnapshot: () => state,
    elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

- [ ] **Step 4: Ejecutar tests y chequeo de tipos**

Run: `npx vitest run src/games/gomoku/ && npm run check`
Expected: PASS — todos los tests de Gomoku y `astro check` pasan.

- [ ] **Step 5: Commit**

```bash
git add src/games/gomoku/bot.ts src/games/gomoku/bot.test.ts src/games/gomoku/Board.astro
git commit -m "feat(gomoku): bot con poda por vecindad y alfa-beta en 3 dificultades"
```

---

### Task 12: Pruebas E2E (Playwright) y verificación integral a 600×960 y 960×600

**Files:**
- Modify: `e2e/portada.spec.ts:37-62`
- Create: `e2e/solo.spec.ts`

**Interfaces:**
- Consumes: `suiteActiva` de `e2e/seleccion.ts`; selectores `#modal-instrucciones-cerrar`, `#modal-modo-juego-solo`, `.modal-modo-juego__dificultad[data-dificultad]`, `#boton-dificultad-solo`, `#modal-opciones-solo`, `#control-deshacer`, `#control-reiniciar`, `#indicador-turno`, `#banner-ganador`, `#modal-continuar-si`.

- [ ] **Step 1: Escribir los tests E2E de portada y modo solitario**

En `e2e/portada.spec.ts`, añadir dos tests antes de `test('clic en una tarjeta navega al juego', ...)`:

```ts
test('los 6 juegos del lote solitario muestran la etiqueta 1 jugador', async ({ page }) => {
  const slugsSolo = ['tres-en-raya', 'puntos-y-cajas', 'obstruccion', 'nim', 'chomp', 'gomoku'];
  for (const slug of slugsSolo) {
    await expect(page.locator(`.indice__item[data-slug="${slug}"]`)).toContainText('1 jugador');
  }
  await expect(page.locator('.indice__item[data-slug="hex"]')).not.toContainText('1 jugador');
});

test('el filtro "Jugar solo" deja exactamente los 6 juegos solitarios', async ({ page }) => {
  await page.locator('[data-grupo="jugadores"] .filtro[data-valor="solo"]').click();
  await expect(page.locator(TARJETAS)).toHaveCount(6);
  for (const slug of ['tres-en-raya', 'puntos-y-cajas', 'obstruccion', 'nim', 'chomp', 'gomoku']) {
    await expect(page.locator(`.indice__item[data-slug="${slug}"]`)).toBeVisible();
  }
});
```

Crear `e2e/solo.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { suiteActiva } from './seleccion';

test.skip(!suiteActiva('juegos'), 'suite juegos no seleccionada');

async function arrancarSolo(page: Page, slug: string, dificultad: 'facil' | 'medio' | 'dificil' = 'facil') {
  await page.goto(`/juegos/${slug}/`);
  await page.locator('#modal-instrucciones-cerrar').click();
  await page.locator('#modal-modo-juego-solo').click();
  await page.locator(`.modal-modo-juego__dificultad[data-dificultad="${dificultad}"]`).click();
  await page.locator('#tablero-juego').waitFor({ state: 'visible' });
}

test('tres-en-raya: bot responde, Deshacer revierte ambos turnos, cambiar dificultad y revancha alternada', async ({
  page,
}) => {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));

  await arrancarSolo(page, 'tres-en-raya', 'facil');
  await expect(page.locator('#boton-dificultad-solo')).toContainText('Fácil');

  // Primera jugada del niño -> el robot responde automáticamente tras ~500 ms.
  await page.locator('#tablero .casilla').nth(0).click();
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(2, { timeout: 3000 });

  // Deshacer revierte la jugada del robot y la del niño en un toque.
  await page.locator('#control-deshacer').click();
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(0);

  // Cambiar dificultad desde cabecera sin perder la partida en curso.
  await page.locator('#tablero .casilla').nth(4).click();
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(2, { timeout: 3000 });
  await page.locator('#boton-dificultad-solo').click();
  await page.locator('#modal-opciones-solo .modal-opciones-solo__nivel[data-dificultad="medio"]').click();
  await expect(page.locator('#boton-dificultad-solo')).toContainText('Medio');
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(2);

  // Jugar hasta terminar la partida (con turnos del bot automáticos) y pulsar Revancha.
  while (await page.locator('#banner-ganador').isHidden()) {
    await expect
      .poll(
        async () =>
          (await page.locator('#banner-ganador').isVisible()) ||
          (await page.locator('#tablero .casilla:not(:disabled)').count()) > 0,
        { timeout: 3000 }
      )
      .toBe(true);
    if (await page.locator('#banner-ganador').isVisible()) break;
    await page.locator('#tablero .casilla:not(:disabled)').first().click();
  }

  await page.locator('#banner-ganador .banner-ganador__reiniciar').click();
  // En la revancha alterna el turno inicial: abre el robot y coloca 1 ficha solo.
  await expect(page.locator('#tablero .casilla[data-valor]')).toHaveCount(1, { timeout: 3000 });
  expect(errores).toEqual([]);
});

test('puntos-y-cajas: el robot responde en modo solitario sin errores', async ({ page }) => {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));

  await arrancarSolo(page, 'puntos-y-cajas', 'medio');
  await page.locator('#tablero .linea').first().click();
  await expect(page.locator('#tablero .linea[data-trazada="true"]')).toHaveCount(2, { timeout: 3000 });
  expect(errores).toEqual([]);
});

test('nim: recargar a mitad de partida ofrece Continuar y restaura el modo solitario', async ({ page }) => {
  await arrancarSolo(page, 'nim', 'facil');
  await page.locator('#tablero .estrella').first().click();
  await page.locator('#nim-confirmar').click();
  // Esperar a que responda también el robot (al menos 2 estrellas quitadas) y venza el debounce de 300 ms.
  await expect
    .poll(() => page.locator('#tablero .estrella.estrella--quitada').count(), { timeout: 3000 })
    .toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(450);

  const quitadasAntes = await page.locator('#tablero .estrella.estrella--quitada').count();
  await page.reload();
  await page.locator('#modal-continuar-si').click();
  await page.locator('#tablero-juego').waitFor({ state: 'visible' });

  await expect(page.locator('#boton-dificultad-solo')).toBeVisible();
  await expect(page.locator('#tablero .estrella.estrella--quitada')).toHaveCount(quitadasAntes);
});

test('juego sin bot (hex) con preferencia "solo" guardada muestra Local/Remoto sin errores', async ({
  page,
}) => {
  const errores: string[] = [];
  page.on('console', m => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', e => errores.push(e.message));

  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pencilgames:modo', 'solo'));
  await page.goto('/juegos/hex/');
  await page.locator('#modal-instrucciones-cerrar').click();

  await expect(page.locator('#modal-modo-juego')).toBeVisible();
  await expect(page.locator('#modal-modo-juego-solo')).toHaveCount(0);
  await expect(page.locator('#modal-modo-juego-local')).toBeVisible();
  expect(errores).toEqual([]);
});

for (const viewport of [
  { width: 600, height: 960 },
  { width: 960, height: 600 },
]) {
  test(`layout sin desborde y zonas tocables >= 48px a ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/juegos/gomoku/');
    await page.locator('#modal-instrucciones-cerrar').click();
    await page.locator('#modal-modo-juego-solo').click();

    const cajaNivel = await page
      .locator('.modal-modo-juego__dificultad[data-dificultad="facil"]')
      .boundingBox();
    expect(cajaNivel?.height ?? 0).toBeGreaterThanOrEqual(48);

    await page.locator('.modal-modo-juego__dificultad[data-dificultad="facil"]').click();
    await page.locator('#tablero-juego').waitFor({ state: 'visible' });

    const cajaCabecera = await page.locator('#boton-dificultad-solo').boundingBox();
    expect(cajaCabecera?.height ?? 0).toBeGreaterThanOrEqual(48);

    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(desborde).toBe(false);
  });
}
```

- [ ] **Step 2: Ejecutar toda la batería de verificación (unitarios, tipos, build y E2E)**

Run: `npm test && npm run check && npm run build && npm run test:e2e`
Expected: PASS — todos los tests unitarios de Vitest, `astro check`, `astro build` y todas las suites de Playwright pasan en verde tanto en escritorio como en móvil y en `600×960` / `960×600`.

- [ ] **Step 3: Commit**

```bash
git add e2e/portada.spec.ts e2e/solo.spec.ts
git commit -m "test(e2e): cobertura de portada y modo solitario a 600x960 y 960x600"
```
